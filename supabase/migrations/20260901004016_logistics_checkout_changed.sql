-- ============================================================================
-- KUCHI'S Logistico - canonical checkout fingerprint and atomic preview
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;


-- One SQL statement produces the public items, amount and canonical economic
-- projection. VOLATILE is intentional: payment calls this helper only after
-- acquiring the service_session row lock and must see a transaction that may
-- have committed while that lock was being awaited.
create function private.logistics_checkout_state(
  p_service_session_id uuid
)
returns table (
  service_session_id uuid,
  session_status public.session_status,
  service_point_id uuid,
  service_point_name varchar,
  service_point_type public.service_point_type,
  items jsonb,
  business_amount numeric,
  checkout_token text
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  with item_state as materialized (
    select
      order_item.id,
      order_item.product_id,
      order_item.product_name,
      order_item.unit_price,
      (order_item.unit_price * 100)::bigint as unit_price_cents,
      order_item.quantity,
      order_item.status,
      order_item.line_number,
      coalesce(additions.public_items, '[]'::jsonb) as public_additions,
      coalesce(additions.canonical_items, '[]'::jsonb) as canonical_additions,
      coalesce(additions.unit_cents, 0::numeric) as addition_unit_cents
    from public.order_items as order_item
    left join lateral (
      select
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'productId', addition.product_id,
              'additionName', addition.addition_name,
              'unitPrice', addition.unit_price,
              'quantityPerItem', addition.quantity_per_item
            )
            order by addition.id
          ),
          '[]'::jsonb
        ) as public_items,
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'additionId', addition.id,
              'productId', addition.product_id,
              'quantityPerItem', addition.quantity_per_item,
              'unitPriceCents', (addition.unit_price * 100)::bigint
            )
            order by addition.id
          ),
          '[]'::jsonb
        ) as canonical_items,
        coalesce(
          pg_catalog.sum(
            (addition.unit_price * 100)::bigint::numeric
            * addition.quantity_per_item
          ),
          0::numeric
        ) as unit_cents
      from public.order_item_additions as addition
      where addition.order_item_id = order_item.id
    ) as additions on true
    where order_item.current_service_session_id = p_service_session_id
      and order_item.status <> 'CANCELLED'::public.order_item_status
  ),
  aggregate_state as (
    select
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', item.id,
            'productId', item.product_id,
            'productName', item.product_name,
            'unitPrice', item.unit_price,
            'quantity', item.quantity,
            'status', item.status,
            'additions', item.public_additions,
            'lineTotal', pg_catalog.round(
              (
                (
                  item.unit_price_cents::numeric
                  + item.addition_unit_cents
                )
                * item.quantity
              ) / 100,
              2
            )
          )
          order by item.line_number, item.id
        ),
        '[]'::jsonb
      ) as public_items,
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'itemId', item.id,
            'productId', item.product_id,
            'quantity', item.quantity,
            'unitPriceCents', item.unit_price_cents,
            'additions', item.canonical_additions
          )
          order by item.id
        ),
        '[]'::jsonb
      ) as canonical_items,
      coalesce(
        pg_catalog.sum(
          (
            item.unit_price_cents::numeric
            + item.addition_unit_cents
          )
          * item.quantity
        ),
        0::numeric
      ) as business_amount_cents
    from item_state as item
  ),
  checkout_state as (
    select
      session.id as service_session_id,
      session.status as session_status,
      service_point.id as service_point_id,
      service_point.name as service_point_name,
      service_point.type as service_point_type,
      aggregate_state.public_items,
      aggregate_state.canonical_items,
      aggregate_state.business_amount_cents
    from public.service_sessions as session
    join public.service_points as service_point
      on service_point.id = session.service_point_id
    cross join aggregate_state
    where session.id = p_service_session_id
  )
  select
    checkout_state.service_session_id,
    checkout_state.session_status,
    checkout_state.service_point_id,
    checkout_state.service_point_name,
    checkout_state.service_point_type,
    checkout_state.public_items,
    pg_catalog.round(checkout_state.business_amount_cents / 100, 2),
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'version', 'checkout.v1',
            'serviceSessionId', checkout_state.service_session_id,
            'items', checkout_state.canonical_items
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  from checkout_state;
$function$;


create function public.logistics_checkout_preview(
  p_service_session_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_build_object(
      'id', state.service_session_id,
      'status', state.session_status,
      'servicePoint', pg_catalog.jsonb_build_object(
        'id', state.service_point_id,
        'name', state.service_point_name,
        'type', state.service_point_type
      )
    ),
    'items', state.items,
    'businessAmount', state.business_amount,
    'paymentOptions', pg_catalog.jsonb_build_object(
      'CASH', pg_catalog.jsonb_build_object(
        'method', 'CASH',
        'businessAmount', state.business_amount,
        'feeRate', 0,
        'feeAmount', 0,
        'customerTotal', state.business_amount
      ),
      'YAPE', pg_catalog.jsonb_build_object(
        'method', 'YAPE',
        'businessAmount', state.business_amount,
        'feeRate', 0,
        'feeAmount', 0,
        'customerTotal', state.business_amount
      ),
      'CARD', pg_catalog.jsonb_build_object(
        'method', 'CARD',
        'businessAmount', state.business_amount,
        'feeRate', 0.0500,
        'feeAmount', pg_catalog.round(state.business_amount * 0.0500, 2),
        'customerTotal', state.business_amount
          + pg_catalog.round(state.business_amount * 0.0500, 2)
      )
    ),
    'checkoutToken', state.checkout_token
  )
  from private.logistics_checkout_state(p_service_session_id) as state;
$function$;


-- A changed parameter list would otherwise leave an executable overload.
revoke execute on function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  uuid,
  public.user_role
) from public, anon, authenticated, service_role;

drop function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  uuid,
  public.user_role
);


create function public.logistics_pay_service_session(
  p_service_session_id uuid,
  p_method public.payment_method,
  p_expected_checkout_token text,
  p_actor_id uuid,
  p_actor_role public.user_role
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();

  v_session_status public.session_status;
  v_shift_id uuid;
  v_shift_status public.shift_status;

  v_business_amount numeric;
  v_current_checkout_token text;
  v_fee_rate numeric(5, 4);
  v_fee_amount numeric;
  v_customer_total numeric;

  v_payment_id uuid;
  v_updated_count integer;
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

  if p_expected_checkout_token is null
    or pg_catalog.btrim(p_expected_checkout_token) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'CHECKOUT_TOKEN_REQUIRED';
  end if;

  -- Existing session-row serialization barrier shared by all economic writes.
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

  -- This is deliberately a statement after FOR UPDATE. Because the helper is
  -- VOLATILE, READ COMMITTED obtains a fresh snapshot after any lock wait.
  select
    state.business_amount,
    state.checkout_token
  into
    v_business_amount,
    v_current_checkout_token
  from private.logistics_checkout_state(p_service_session_id) as state;

  if p_expected_checkout_token is distinct from v_current_checkout_token then
    raise exception using
      errcode = 'P0001',
      message = 'CHECKOUT_CHANGED';
  end if;

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


-- Backend-only execution. The helper also needs explicit schema USAGE for the
-- service_role assumed by PostgREST.
grant usage on schema private to service_role;

revoke execute on function private.logistics_checkout_state(uuid)
  from public, anon, authenticated;
grant execute on function private.logistics_checkout_state(uuid)
  to service_role;

revoke execute on function public.logistics_checkout_preview(uuid)
  from public, anon, authenticated;
grant execute on function public.logistics_checkout_preview(uuid)
  to service_role;

revoke execute on function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  text,
  uuid,
  public.user_role
) from public, anon, authenticated;
grant execute on function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  text,
  uuid,
  public.user_role
) to service_role;


comment on function private.logistics_checkout_state(uuid) is
  'Returns one atomic checkout projection, exact business amount and deterministic SHA-256 economic fingerprint.';

comment on function public.logistics_checkout_preview(uuid) is
  'Backend-only atomic checkout preview including an opaque checkoutToken.';

comment on function public.logistics_pay_service_session(
  uuid,
  public.payment_method,
  text,
  uuid,
  public.user_role
) is
  'Atomically rejects stale checkout tokens, records one payment, closes the session and writes its audit event.';
