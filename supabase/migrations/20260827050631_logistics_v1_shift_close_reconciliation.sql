-- ============================================================================
-- KUCHI'S LOGISTICO V1
-- Empty-session release, transactional shift closing and cash reconciliation
-- ============================================================================
--
-- This migration keeps three boundaries atomic inside PostgreSQL:
--   * release an active service session that has no remaining consumption;
--   * close one shift and persist its executive snapshot;
--   * reconcile a closed shift against physical/payment-channel totals.
--
-- Detailed history remains normalized. shift_closures.summary stores only
-- small exceptional snapshot metadata.
-- ============================================================================


-- ============================================================================
-- 1. ACTIVE SERVICE SESSION -> OPEN SHIFT
-- ============================================================================
--
-- The trigger takes a SHARE row lock on the owning shift whenever an active
-- session is inserted or moved into an active state/shift. Shift closing takes
-- the conflicting UPDATE lock on that same row. This closes the race between
-- Node resolving the current shift and later inserting the service session.
-- ============================================================================

create or replace function public.logistics_assert_active_session_shift_open()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_shift_status public.shift_status;
begin
  select shift.status
  into v_shift_status
  from public.shifts as shift
  where shift.id = new.shift_id
  for share;

  if not found
     or v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_OPEN';
  end if;

  return new;
end;
$function$;

comment on function public.logistics_assert_active_session_shift_open() is
  'Serializes active service-session writes against shift closing and rejects active sessions outside an OPEN shift.';

create trigger trg_service_sessions_active_shift_open
before insert or update of shift_id, status
on public.service_sessions
for each row
when (
  new.status in (
    'OPEN'::public.session_status,
    'AWAITING_PAYMENT'::public.session_status
  )
)
execute function public.logistics_assert_active_session_shift_open();


-- ============================================================================
-- 2. CASH RECONCILIATION INTEGRITY AND IMMUTABILITY
-- ============================================================================

alter table public.cash_reconciliations
  add constraint cash_reconciliations_expected_cash_non_negative
  check (expected_cash >= 0);

-- A confirmed V1 reconciliation is immutable financial history. Runtime keeps
-- only the privileges needed to read it and insert it through the RPC below.
revoke update, delete
on table public.cash_reconciliations
from service_role;

grant select, insert
on table public.cash_reconciliations
to service_role;

revoke update, delete
on table public.shift_closures
from service_role;

grant select, insert
on table public.shift_closures
to service_role;


-- ============================================================================
-- 3. RPC: RELEASE AN EMPTY SERVICE SESSION
-- ============================================================================

create or replace function public.logistics_release_empty_service_session(
  p_service_session_id uuid,
  p_reason text,
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
  v_reason text := pg_catalog.nullif(pg_catalog.btrim(p_reason), '');

  v_session_status public.session_status;
  v_shift_id uuid;
  v_shift_status public.shift_status;
  v_business_amount numeric;
  v_updated_count integer;
begin
  -- Actor identity is revalidated even though capability authorization lives
  -- in Node.
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

  if p_service_session_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_FOUND';
  end if;

  if v_reason is null then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_RELEASE_REASON_REQUIRED';
  end if;

  -- Session is the serialization barrier shared with payment and transfers.
  select
    session.status,
    session.shift_id
  into
    v_session_status,
    v_shift_id
  from public.service_sessions as session
  where session.id = p_service_session_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_FOUND';
  end if;

  if v_session_status not in (
    'OPEN'::public.session_status,
    'AWAITING_PAYMENT'::public.session_status
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_ACTIVE';
  end if;

  -- This lock conflicts with shift closing and stabilizes the OPEN state until
  -- the session release commits.
  select shift.status
  into v_shift_status
  from public.shifts as shift
  where shift.id = v_shift_id
  for share;

  if not found
     or v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_OPEN';
  end if;

  if exists (
    select 1
    from public.payments as payment
    where payment.service_session_id = p_service_session_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_ALREADY_EXISTS';
  end if;

  -- Use current economic ownership and the same immutable price snapshots as
  -- checkout/payment. No order-item row lock is acquired.
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

  if v_business_amount <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_HAS_BILLABLE_ITEMS';
  end if;

  -- A zero-priced, non-cancelled item is still consumption and cannot be
  -- silently represented as a cancelled/empty session in V1.
  if exists (
    select 1
    from public.order_items as order_item
    where order_item.current_service_session_id = p_service_session_id
      and order_item.status <> 'CANCELLED'::public.order_item_status
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_HAS_UNCANCELLED_ITEMS';
  end if;

  update public.service_sessions as session
  set
    status = 'CANCELLED'::public.session_status,
    cancellation_reason = v_reason,
    closed_at = v_now,
    closed_by = p_actor_id,
    closed_by_role = p_actor_role
  where session.id = p_service_session_id
    and session.status = v_session_status;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_CHANGED';
  end if;

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
    'SERVICE_SESSION_RELEASED',
    'SERVICE_SESSION',
    p_service_session_id,
    v_shift_id,
    p_service_session_id,
    pg_catalog.jsonb_build_object(
      'reason', v_reason,
      'previousStatus', v_session_status,
      'businessAmount', v_business_amount
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'serviceSessionId', p_service_session_id,
    'shiftId', v_shift_id,
    'sessionStatus', 'CANCELLED',
    'reason', v_reason,
    'businessAmount', v_business_amount,
    'releasedAt', v_now,
    'releasedBy', p_actor_id,
    'releasedByRole', p_actor_role
  );
end;
$function$;

comment on function public.logistics_release_empty_service_session(
  uuid,
  text,
  uuid,
  public.user_role
) is
  'Closes an active service session as CANCELLED only when it has no payment and no currently owned non-cancelled consumption.';


-- ============================================================================
-- 4. RPC: TRANSACTIONAL SHIFT CLOSING
-- ============================================================================

create or replace function public.logistics_close_shift(
  p_shift_id uuid,
  p_closing_notes text,
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
  v_closing_notes text := pg_catalog.nullif(
    pg_catalog.btrim(p_closing_notes),
    ''
  );

  v_shift_status public.shift_status;
  v_opening_cash numeric;
  v_closure_id uuid;
  v_updated_count integer;

  v_cash_total numeric := 0;
  v_yape_total numeric := 0;
  v_card_total numeric := 0;
  v_card_fee_total numeric := 0;
  v_customer_card_total numeric := 0;
  v_business_sales_total numeric := 0;

  v_operational_expenses_count bigint := 0;
  v_operational_expenses_total numeric := 0;
  v_expected_cash_at_close numeric := 0;

  v_service_sessions_count bigint := 0;
  v_cancelled_sessions_count bigint := 0;
  v_orders_count bigint := 0;
  v_order_items_count bigint := 0;
  v_product_units_count bigint := 0;
  v_cancelled_order_items_count bigint := 0;
  v_cancelled_pending_count bigint := 0;
  v_cancelled_preparing_count bigint := 0;
  v_cancelled_ready_count bigint := 0;
  v_cancelled_delivered_count bigint := 0;
  v_service_session_transfers_count bigint := 0;
  v_order_item_transfers_count bigint := 0;
  v_released_sessions_count bigint := 0;

  v_summary jsonb;
begin
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

  if p_shift_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_FOUND';
  end if;

  if p_closing_notes is not null and v_closing_notes is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_NOTES_INVALID';
  end if;

  -- Main serialization barrier. The active-session trigger and expense/item
  -- mutations take a conflicting SHARE lock on this row.
  select
    shift.status,
    shift.opening_cash
  into
    v_shift_status,
    v_opening_cash
  from public.shifts as shift
  where shift.id = p_shift_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_FOUND';
  end if;

  if v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_ALREADY_CLOSED';
  end if;

  if exists (
    select 1
    from public.shift_closures as closure
    where closure.shift_id = p_shift_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CLOSURE_ALREADY_EXISTS';
  end if;

  if exists (
    select 1
    from public.service_sessions as session
    where session.shift_id = p_shift_id
      and session.status in (
        'OPEN'::public.session_status,
        'AWAITING_PAYMENT'::public.session_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_HAS_ACTIVE_SESSIONS';
  end if;

  if exists (
    select 1
    from public.order_items as order_item
    join public.service_sessions as current_session
      on current_session.id = order_item.current_service_session_id
    where current_session.shift_id = p_shift_id
      and order_item.status in (
        'PENDING'::public.order_item_status,
        'PREPARING'::public.order_item_status,
        'READY'::public.order_item_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_HAS_UNRESOLVED_ITEMS';
  end if;

  -- Every PAID session must have exactly one payment. The existing UNIQUE
  -- constraint guarantees the upper bound; this check guarantees existence.
  if exists (
    select 1
    from public.service_sessions as session
    where session.shift_id = p_shift_id
      and session.status = 'PAID'::public.session_status
      and not exists (
        select 1
        from public.payments as payment
        where payment.service_session_id = session.id
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_PAYMENT_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.service_sessions as session
    join public.payments as payment
      on payment.service_session_id = session.id
    where session.shift_id = p_shift_id
      and session.status <> 'PAID'::public.session_status
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_PAYMENT_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.service_sessions as session
    where session.shift_id = p_shift_id
      and session.status = 'CANCELLED'::public.session_status
      and exists (
        select 1
        from public.order_items as order_item
        where order_item.current_service_session_id = session.id
          and order_item.status <> 'CANCELLED'::public.order_item_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CANCELLED_SESSION_HAS_CONSUMPTION';
  end if;

  -- Recalculate each paid session from immutable snapshots and current
  -- economic ownership. This detects any historical/payment inconsistency
  -- before the executive snapshot is frozen.
  if exists (
    select 1
    from public.service_sessions as session
    join public.payments as payment
      on payment.service_session_id = session.id
    left join lateral (
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
      ) as business_amount
      from public.order_items as order_item
      left join lateral (
        select pg_catalog.sum(
          addition.unit_price * addition.quantity_per_item
        ) as unit_total
        from public.order_item_additions as addition
        where addition.order_item_id = order_item.id
      ) as additions on true
      where order_item.current_service_session_id = session.id
        and order_item.status <> 'CANCELLED'::public.order_item_status
    ) as current_consumption on true
    where session.shift_id = p_shift_id
      and session.status = 'PAID'::public.session_status
      and payment.business_amount <> current_consumption.business_amount
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_PAYMENT_INCONSISTENT';
  end if;

  select
    pg_catalog.coalesce(pg_catalog.sum(payment.business_amount)
      filter (where payment.method = 'CASH'::public.payment_method), 0),
    pg_catalog.coalesce(pg_catalog.sum(payment.business_amount)
      filter (where payment.method = 'YAPE'::public.payment_method), 0),
    pg_catalog.coalesce(pg_catalog.sum(payment.business_amount)
      filter (where payment.method = 'CARD'::public.payment_method), 0),
    pg_catalog.coalesce(pg_catalog.sum(payment.fee_amount)
      filter (where payment.method = 'CARD'::public.payment_method), 0),
    pg_catalog.coalesce(pg_catalog.sum(payment.customer_total)
      filter (where payment.method = 'CARD'::public.payment_method), 0)
  into
    v_cash_total,
    v_yape_total,
    v_card_total,
    v_card_fee_total,
    v_customer_card_total
  from public.payments as payment
  where payment.shift_id = p_shift_id;

  v_business_sales_total := v_cash_total + v_yape_total + v_card_total;

  select
    pg_catalog.count(*),
    pg_catalog.coalesce(pg_catalog.sum(expense.amount), 0)
  into
    v_operational_expenses_count,
    v_operational_expenses_total
  from public.shift_expenses as expense
  where expense.shift_id = p_shift_id
    and expense.voided_at is null;

  v_expected_cash_at_close :=
    v_opening_cash
    + v_cash_total
    - v_operational_expenses_total;

  if v_expected_cash_at_close < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_EXPECTED_CASH_NEGATIVE';
  end if;

  -- All financial snapshot columns are numeric(10,2).
  if v_business_sales_total > 99999999.99
     or v_cash_total > 99999999.99
     or v_yape_total > 99999999.99
     or v_card_total > 99999999.99
     or v_card_fee_total > 99999999.99
     or v_customer_card_total > 99999999.99
     or v_operational_expenses_total > 99999999.99
     or v_expected_cash_at_close > 99999999.99 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CLOSURE_AMOUNT_INVALID';
  end if;

  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where session.status = 'CANCELLED'::public.session_status
    )
  into
    v_service_sessions_count,
    v_cancelled_sessions_count
  from public.service_sessions as session
  where session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_orders_count
  from public.orders as command
  join public.service_sessions as original_session
    on original_session.id = command.service_session_id
  where original_session.shift_id = p_shift_id;

  select
    pg_catalog.count(*),
    pg_catalog.coalesce(pg_catalog.sum(order_item.quantity), 0),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'PENDING'::public.order_item_cancellation_origin_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'PREPARING'::public.order_item_cancellation_origin_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'READY'::public.order_item_cancellation_origin_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'DELIVERED'::public.order_item_cancellation_origin_status
    )
  into
    v_order_items_count,
    v_product_units_count,
    v_cancelled_order_items_count,
    v_cancelled_pending_count,
    v_cancelled_preparing_count,
    v_cancelled_ready_count,
    v_cancelled_delivered_count
  from public.order_items as order_item
  join public.orders as command
    on command.id = order_item.order_id
  join public.service_sessions as original_session
    on original_session.id = command.service_session_id
  where original_session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_service_session_transfers_count
  from public.service_session_transfers as transfer
  join public.service_sessions as session
    on session.id = transfer.service_session_id
  where session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_order_item_transfers_count
  from public.order_item_transfers as transfer
  join public.service_sessions as from_session
    on from_session.id = transfer.from_service_session_id
  where from_session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_released_sessions_count
  from public.audit_logs as audit
  where audit.shift_id = p_shift_id
    and audit.action = 'SERVICE_SESSION_RELEASED';

  if v_service_sessions_count > 2147483647
     or v_cancelled_sessions_count > 2147483647
     or v_orders_count > 2147483647
     or v_order_items_count > 2147483647
     or v_product_units_count > 2147483647
     or v_cancelled_order_items_count > 2147483647
     or v_cancelled_pending_count > 2147483647
     or v_cancelled_preparing_count > 2147483647
     or v_cancelled_ready_count > 2147483647
     or v_cancelled_delivered_count > 2147483647
     or v_service_session_transfers_count > 2147483647
     or v_order_item_transfers_count > 2147483647
     or v_operational_expenses_count > 2147483647
     or v_released_sessions_count > 2147483647 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CLOSURE_COUNT_INVALID';
  end if;

  v_summary := pg_catalog.jsonb_build_object(
    'reportVersion', 1,
    'releasedSessionsCount', v_released_sessions_count
  );

  insert into public.shift_closures (
    shift_id,
    closed_by,
    closed_by_role,
    business_sales_total,
    cash_total,
    yape_total,
    card_total,
    card_fee_total,
    customer_card_total,
    service_sessions_count,
    cancelled_sessions_count,
    orders_count,
    summary,
    order_items_count,
    product_units_count,
    cancelled_order_items_count,
    cancelled_pending_count,
    cancelled_preparing_count,
    cancelled_ready_count,
    cancelled_delivered_count,
    service_session_transfers_count,
    order_item_transfers_count,
    closing_notes,
    operational_expenses_count,
    operational_expenses_total,
    created_at
  )
  values (
    p_shift_id,
    p_actor_id,
    p_actor_role,
    v_business_sales_total,
    v_cash_total,
    v_yape_total,
    v_card_total,
    v_card_fee_total,
    v_customer_card_total,
    v_service_sessions_count::integer,
    v_cancelled_sessions_count::integer,
    v_orders_count::integer,
    v_summary,
    v_order_items_count::integer,
    v_product_units_count::integer,
    v_cancelled_order_items_count::integer,
    v_cancelled_pending_count::integer,
    v_cancelled_preparing_count::integer,
    v_cancelled_ready_count::integer,
    v_cancelled_delivered_count::integer,
    v_service_session_transfers_count::integer,
    v_order_item_transfers_count::integer,
    v_closing_notes,
    v_operational_expenses_count::integer,
    v_operational_expenses_total,
    v_now
  )
  returning id into v_closure_id;

  update public.shifts as shift
  set
    status = 'CLOSED'::public.shift_status,
    closed_at = v_now,
    closed_by = p_actor_id,
    closed_by_role = p_actor_role
  where shift.id = p_shift_id
    and shift.status = 'OPEN'::public.shift_status;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CHANGED';
  end if;

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
    'SHIFT_CLOSED',
    'SHIFT',
    p_shift_id,
    p_shift_id,
    null,
    pg_catalog.jsonb_build_object(
      'closureId', v_closure_id,
      'businessSalesTotal', v_business_sales_total,
      'cashTotal', v_cash_total,
      'yapeTotal', v_yape_total,
      'cardTotal', v_card_total,
      'cardFeeTotal', v_card_fee_total,
      'customerCardTotal', v_customer_card_total,
      'operationalExpensesTotal', v_operational_expenses_total,
      'expectedCashAtClose', v_expected_cash_at_close,
      'serviceSessionsCount', v_service_sessions_count,
      'ordersCount', v_orders_count
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'closureId', v_closure_id,
    'shiftId', p_shift_id,
    'shiftStatus', 'CLOSED',
    'closedAt', v_now,
    'closedBy', p_actor_id,
    'closedByRole', p_actor_role,
    'openingCash', v_opening_cash,
    'businessSalesTotal', v_business_sales_total,
    'cashTotal', v_cash_total,
    'yapeTotal', v_yape_total,
    'cardTotal', v_card_total,
    'cardFeeTotal', v_card_fee_total,
    'customerCardTotal', v_customer_card_total,
    'operationalExpensesCount', v_operational_expenses_count,
    'operationalExpensesTotal', v_operational_expenses_total,
    'expectedCashAtClose', v_expected_cash_at_close,
    'serviceSessionsCount', v_service_sessions_count,
    'cancelledSessionsCount', v_cancelled_sessions_count,
    'ordersCount', v_orders_count,
    'orderItemsCount', v_order_items_count,
    'productUnitsCount', v_product_units_count,
    'cancelledOrderItemsCount', v_cancelled_order_items_count,
    'cancelledPendingCount', v_cancelled_pending_count,
    'cancelledPreparingCount', v_cancelled_preparing_count,
    'cancelledReadyCount', v_cancelled_ready_count,
    'cancelledDeliveredCount', v_cancelled_delivered_count,
    'serviceSessionTransfersCount', v_service_session_transfers_count,
    'orderItemTransfersCount', v_order_item_transfers_count,
    'closingNotes', v_closing_notes,
    'summary', v_summary
  );
end;
$function$;

comment on function public.logistics_close_shift(
  uuid,
  text,
  uuid,
  public.user_role
) is
  'Atomically validates and closes one OPEN shift, persists its executive snapshot and records audit history.';


-- ============================================================================
-- 5. RPC: CASH RECONCILIATION
-- ============================================================================

create or replace function public.logistics_reconcile_shift(
  p_shift_id uuid,
  p_counted_cash numeric,
  p_confirmed_yape numeric,
  p_confirmed_card_customer_total numeric,
  p_notes text,
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
  v_notes text := pg_catalog.nullif(pg_catalog.btrim(p_notes), '');

  v_shift_status public.shift_status;
  v_opening_cash numeric;
  v_cash_total numeric;
  v_operational_expenses_total numeric;
  v_yape_total numeric;
  v_card_total numeric;
  v_card_fee_total numeric;
  v_expected_cash numeric;

  v_reconciliation_id uuid;
  v_cash_difference numeric;
  v_yape_difference numeric;
  v_expected_card_customer_total numeric;
  v_card_difference numeric;
begin
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

  if p_shift_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_FOUND';
  end if;

  if p_counted_cash is null
     or p_confirmed_yape is null
     or p_confirmed_card_customer_total is null
     or p_counted_cash < 0
     or p_confirmed_yape < 0
     or p_confirmed_card_customer_total < 0
     or p_counted_cash > 99999999.99
     or p_confirmed_yape > 99999999.99
     or p_confirmed_card_customer_total > 99999999.99
     or p_counted_cash <> pg_catalog.round(p_counted_cash, 2)
     or p_confirmed_yape <> pg_catalog.round(p_confirmed_yape, 2)
     or p_confirmed_card_customer_total <>
       pg_catalog.round(p_confirmed_card_customer_total, 2) then
    raise exception using
      errcode = 'P0001',
      message = 'RECONCILIATION_INPUT_INVALID';
  end if;

  if p_notes is not null and v_notes is null then
    raise exception using
      errcode = 'P0001',
      message = 'RECONCILIATION_NOTES_INVALID';
  end if;

  select
    shift.status,
    shift.opening_cash
  into
    v_shift_status,
    v_opening_cash
  from public.shifts as shift
  where shift.id = p_shift_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_FOUND';
  end if;

  if v_shift_status <> 'CLOSED'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_CLOSED';
  end if;

  -- One lock serializes all attempts for this shift. Expected values are read
  -- from the immutable closure snapshot, never accepted from the caller.
  select
    closure.cash_total,
    closure.operational_expenses_total,
    closure.yape_total,
    closure.card_total,
    closure.card_fee_total
  into
    v_cash_total,
    v_operational_expenses_total,
    v_yape_total,
    v_card_total,
    v_card_fee_total
  from public.shift_closures as closure
  where closure.shift_id = p_shift_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CLOSURE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.cash_reconciliations as reconciliation
    where reconciliation.shift_id = p_shift_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CASH_RECONCILIATION_ALREADY_EXISTS';
  end if;

  v_expected_cash :=
    v_opening_cash
    + v_cash_total
    - v_operational_expenses_total;

  if v_expected_cash < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_EXPECTED_CASH_NEGATIVE';
  end if;

  begin
    insert into public.cash_reconciliations (
      shift_id,
      reconciled_by,
      reconciled_by_role,
      opening_cash_snapshot,
      cash_sales_expected,
      cash_expenses_snapshot,
      counted_cash,
      expected_yape,
      confirmed_yape,
      expected_card_business,
      expected_card_fee,
      confirmed_card_customer_total,
      notes,
      created_at,
      updated_at
    )
    values (
      p_shift_id,
      p_actor_id,
      p_actor_role,
      v_opening_cash,
      v_cash_total,
      v_operational_expenses_total,
      p_counted_cash,
      v_yape_total,
      p_confirmed_yape,
      v_card_total,
      v_card_fee_total,
      p_confirmed_card_customer_total,
      v_notes,
      v_now,
      v_now
    )
    returning
      id,
      expected_cash,
      cash_difference,
      yape_difference,
      expected_card_customer_total,
      card_difference
    into
      v_reconciliation_id,
      v_expected_cash,
      v_cash_difference,
      v_yape_difference,
      v_expected_card_customer_total,
      v_card_difference;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'CASH_RECONCILIATION_ALREADY_EXISTS';
  end;

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
    'CASH_RECONCILED',
    'CASH_RECONCILIATION',
    v_reconciliation_id,
    p_shift_id,
    null,
    pg_catalog.jsonb_build_object(
      'expectedCash', v_expected_cash,
      'countedCash', p_counted_cash,
      'cashDifference', v_cash_difference,
      'expectedYape', v_yape_total,
      'confirmedYape', p_confirmed_yape,
      'yapeDifference', v_yape_difference,
      'expectedCardBusiness', v_card_total,
      'expectedCardFee', v_card_fee_total,
      'expectedCardCustomerTotal', v_expected_card_customer_total,
      'confirmedCardCustomerTotal', p_confirmed_card_customer_total,
      'cardDifference', v_card_difference
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'reconciliationId', v_reconciliation_id,
    'shiftId', p_shift_id,
    'reconciledAt', v_now,
    'reconciledBy', p_actor_id,
    'reconciledByRole', p_actor_role,
    'openingCashSnapshot', v_opening_cash,
    'cashSalesExpected', v_cash_total,
    'cashExpensesSnapshot', v_operational_expenses_total,
    'expectedCash', v_expected_cash,
    'countedCash', p_counted_cash,
    'cashDifference', v_cash_difference,
    'expectedYape', v_yape_total,
    'confirmedYape', p_confirmed_yape,
    'yapeDifference', v_yape_difference,
    'expectedCardBusiness', v_card_total,
    'expectedCardFee', v_card_fee_total,
    'expectedCardCustomerTotal', v_expected_card_customer_total,
    'confirmedCardCustomerTotal', p_confirmed_card_customer_total,
    'cardDifference', v_card_difference,
    'notes', v_notes
  );
end;
$function$;

comment on function public.logistics_reconcile_shift(
  uuid,
  numeric,
  numeric,
  numeric,
  text,
  uuid,
  public.user_role
) is
  'Atomically records one immutable cash/payment-channel reconciliation for a closed shift from authoritative closure snapshots.';


-- ============================================================================
-- 6. FUNCTION PRIVILEGES
-- ============================================================================

revoke execute on function public.logistics_assert_active_session_shift_open()
from public, anon, authenticated;

grant execute on function public.logistics_assert_active_session_shift_open()
to service_role;

revoke execute on function public.logistics_release_empty_service_session(
  uuid,
  text,
  uuid,
  public.user_role
)
from public, anon, authenticated;

grant execute on function public.logistics_release_empty_service_session(
  uuid,
  text,
  uuid,
  public.user_role
)
to service_role;

revoke execute on function public.logistics_close_shift(
  uuid,
  text,
  uuid,
  public.user_role
)
from public, anon, authenticated;

grant execute on function public.logistics_close_shift(
  uuid,
  text,
  uuid,
  public.user_role
)
to service_role;

revoke execute on function public.logistics_reconcile_shift(
  uuid,
  numeric,
  numeric,
  numeric,
  text,
  uuid,
  public.user_role
)
from public, anon, authenticated;

grant execute on function public.logistics_reconcile_shift(
  uuid,
  numeric,
  numeric,
  numeric,
  text,
  uuid,
  public.user_role
)
to service_role;


-- ============================================================================
-- END — KUCHI'S LOGISTICO V1 / SHIFT CLOSE AND RECONCILIATION
-- ============================================================================
