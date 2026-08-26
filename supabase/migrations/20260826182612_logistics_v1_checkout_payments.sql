-- ============================================================================
-- KUCHI'S LOGISTICO V1
-- Transactional checkout payment confirmation
-- ============================================================================
--
-- V1 scope:
--   * One payment and one payment method per service session.
--   * CARD charges an exact 5% POS fee to the customer.
--   * Business sales remain separate from the POS fee.
--   * Payment, session closure and audit are one PostgreSQL transaction.
-- ============================================================================


-- ============================================================================
-- 1. ONE PAYMENT PER SERVICE SESSION
-- ============================================================================

alter table public.payments
  add constraint payments_service_session_unique
  unique (service_session_id);

-- The UNIQUE constraint creates its own index with service_session_id as its
-- leading and only column, so the previous non-unique index is redundant.
drop index public.idx_payments_service_session_id;


-- Confirmed payments must always represent a positive business sale. A zero
-- consumption session must be released through a different explicit workflow.
alter table public.payments
  drop constraint payments_business_amount_non_negative,
  add constraint payments_business_amount_positive
    check (business_amount > 0);


-- ============================================================================
-- 2. PAYMENT METHOD FEE RATE
-- ============================================================================
--
-- The existing constraints continue to guarantee:
--   fee_amount = round(business_amount * fee_rate, 2)
--   customer_total = business_amount + fee_amount
--   CASH/YAPE have no fee
--
-- This constraint freezes the V1 CARD fee at exactly 5%.
-- ============================================================================

alter table public.payments
  add constraint payments_method_fee_rate_consistent
  check (
    (
      method = 'CARD'::public.payment_method
      and fee_rate = 0.0500
    )
    or
    (
      method in (
        'CASH'::public.payment_method,
        'YAPE'::public.payment_method
      )
      and fee_rate = 0
    )
  );


-- ============================================================================
-- 3. RPC: PAY SERVICE SESSION
-- ============================================================================
--
-- Locking strategy:
--   * The service session is locked FOR UPDATE before financial reads/writes.
--   * No order-item row lock is acquired here. Existing order-item mutations
--     must obtain a lock on the owning service session before they write, so
--     the session lock is the serialization barrier without introducing the
--     inverse session -> item lock order that could deadlock with them.
--   * Amounts are then calculated with a normal SELECT from immutable price
--     snapshots and the current item ownership/status visible to this call.
--
-- PostgreSQL runs one function invocation as one statement/transaction. Any
-- unhandled exception rolls back the payment, session closure and audit event.
-- ============================================================================

create or replace function public.logistics_pay_service_session(
  p_service_session_id uuid,
  p_method public.payment_method,
  p_actor_id uuid,
  p_actor_role public.user_role
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();

  v_session_status public.session_status;
  v_shift_id uuid;
  v_shift_status public.shift_status;

  v_business_amount numeric;
  v_fee_rate numeric(5, 4);
  v_fee_amount numeric;
  v_customer_total numeric;

  v_payment_id uuid;
  v_updated_count integer;
begin
  -- --------------------------------------------------------------------------
  -- Actor
  -- --------------------------------------------------------------------------

  if p_actor_id is null or p_actor_role is null then
    raise exception using
      errcode = 'P0001',
      message = 'ACTOR_INVALID';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_actor_id
    and profile.role = p_actor_role
    and profile.is_active = true
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ACTOR_INVALID';
  end if;


  -- --------------------------------------------------------------------------
  -- Input
  -- --------------------------------------------------------------------------

  if p_service_session_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_FOUND';
  end if;

  if p_method is null then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_METHOD_REQUIRED';
  end if;


  -- --------------------------------------------------------------------------
  -- Session serialization barrier
  -- --------------------------------------------------------------------------

  select
    session.status,
    session.shift_id,
    shift.status
  into
    v_session_status,
    v_shift_id,
    v_shift_status
  from public.service_sessions as session
  join public.shifts as shift
    on shift.id = session.shift_id
  where session.id = p_service_session_id
  for update of session;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_FOUND';
  end if;

  if v_session_status <> 'AWAITING_PAYMENT'::public.session_status then
    if exists (
      select 1
      from public.payments as existing_payment
      where existing_payment.service_session_id = p_service_session_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_ALREADY_EXISTS';
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_AWAITING_PAYMENT';
  end if;

  if v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_OPEN';
  end if;

  if exists (
    select 1
    from public.payments as existing_payment
    where existing_payment.service_session_id = p_service_session_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_ALREADY_EXISTS';
  end if;


  -- --------------------------------------------------------------------------
  -- Operational completion
  --
  -- A paid session is no longer active, so preparation RPCs cannot advance its
  -- items afterwards. Only delivered items (and cancelled items, which are not
  -- charged) may therefore pass this financial boundary.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.order_items as order_item
    where order_item.current_service_session_id = p_service_session_id
      and order_item.status not in (
        'DELIVERED'::public.order_item_status,
        'CANCELLED'::public.order_item_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEMS_NOT_DELIVERED';
  end if;


  -- --------------------------------------------------------------------------
  -- Current consumption from historical snapshots
  --
  -- order_id intentionally does not determine who pays. Transfers preserve the
  -- original order while current_service_session_id identifies current economic
  -- ownership.
  -- --------------------------------------------------------------------------

  select pg_catalog.coalesce(
    pg_catalog.round(
      pg_catalog.sum(
        (
          order_item.unit_price
          + pg_catalog.coalesce(additions.unit_total, 0)
        )
        * order_item.quantity
      ),
      2
    ),
    0
  )
  into v_business_amount
  from public.order_items as order_item
  left join lateral (
    select pg_catalog.sum(
      addition.unit_price * addition.quantity_per_item
    ) as unit_total
    from public.order_item_additions as addition
    where addition.order_item_id = order_item.id
  ) as additions on true
  where order_item.current_service_session_id = p_service_session_id
    and order_item.status <> 'CANCELLED'::public.order_item_status;

  if v_business_amount <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'NOTHING_TO_PAY';
  end if;

  if v_business_amount > 99999999.99 then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_INVALID';
  end if;


  -- --------------------------------------------------------------------------
  -- V1 financial rules
  -- --------------------------------------------------------------------------

  if p_method = 'CARD'::public.payment_method then
    v_fee_rate := 0.0500;
  else
    v_fee_rate := 0;
  end if;

  v_fee_amount := pg_catalog.round(v_business_amount * v_fee_rate, 2);
  v_customer_total := v_business_amount + v_fee_amount;

  if v_customer_total > 99999999.99 then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_INVALID';
  end if;


  -- --------------------------------------------------------------------------
  -- Payment
  -- --------------------------------------------------------------------------

  begin
    insert into public.payments (
      service_session_id,
      shift_id,
      received_by,
      received_by_role,
      method,
      business_amount,
      fee_rate,
      fee_amount,
      customer_total,
      paid_at
    )
    values (
      p_service_session_id,
      v_shift_id,
      p_actor_id,
      p_actor_role,
      p_method,
      v_business_amount,
      v_fee_rate,
      v_fee_amount,
      v_customer_total,
      v_now
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_ALREADY_EXISTS';
  end;


  -- --------------------------------------------------------------------------
  -- Session closure
  -- --------------------------------------------------------------------------

  update public.service_sessions as session
  set
    status = 'PAID'::public.session_status,
    closed_at = v_now,
    closed_by = p_actor_id,
    closed_by_role = p_actor_role
  where session.id = p_service_session_id
    and session.status = 'AWAITING_PAYMENT'::public.session_status;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_CHANGED';
  end if;


  -- --------------------------------------------------------------------------
  -- Audit
  -- --------------------------------------------------------------------------

  insert into public.audit_logs (
    user_id,
    actor_role,
    action,
    entity,
    entity_id,
    shift_id,
    service_session_id,
    details,
    created_at
  )
  values (
    p_actor_id,
    p_actor_role,
    'PAYMENT_CONFIRMED',
    'PAYMENT',
    v_payment_id,
    v_shift_id,
    p_service_session_id,
    pg_catalog.jsonb_build_object(
      'method', p_method,
      'businessAmount', v_business_amount,
      'feeRate', v_fee_rate,
      'feeAmount', v_fee_amount,
      'customerTotal', v_customer_total
    ),
    v_now
  );


  return pg_catalog.jsonb_build_object(
    'paymentId', v_payment_id,
    'serviceSessionId', p_service_session_id,
    'shiftId', v_shift_id,
    'method', p_method,
    'businessAmount', v_business_amount,
    'feeRate', v_fee_rate,
    'feeAmount', v_fee_amount,
    'customerTotal', v_customer_total,
    'paidAt', v_now,
    'sessionStatus', 'PAID'
  );
end;
$function$;


-- ============================================================================
-- 4. RPC PRIVILEGES
-- ============================================================================

revoke execute on function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  uuid,
  public.user_role
) from public, anon, authenticated;

grant execute on function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  uuid,
  public.user_role
) to service_role;


comment on function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  uuid,
  public.user_role
) is
  'Atomically calculates snapshot consumption, records one payment, closes the service session as PAID and writes its audit event.';


-- ============================================================================
-- END
-- ============================================================================
