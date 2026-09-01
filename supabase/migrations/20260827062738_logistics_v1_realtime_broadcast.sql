-- ============================================================================
-- KUCHI'S LOGISTICO V1
-- Private Supabase Realtime Broadcast infrastructure
-- ============================================================================
--
-- Realtime messages are invalidation signals only. Authorized data continues
-- to be read through the REST API; no operational row is exposed here.
--
-- Every realtime.send call is private and runs inside the transaction that
-- changed the source row. The insert into realtime.messages therefore becomes
-- visible to logical replication only after COMMIT and disappears on ROLLBACK.
-- The trigger functions intentionally do not catch realtime.send errors.
--
-- Production rollout also requires disabling "Allow public access" in the
-- Supabase Realtime dashboard settings. Future clients must join each channel
-- with config: { private: true } and refetch through REST after reconnecting.
-- ============================================================================


-- ============================================================================
-- 1. PRIVATE SCHEMA AND REALTIME AUTHORIZATION HELPER
-- ============================================================================

create schema if not exists private;

comment on schema private is
  'Non-exposed database helpers for KUCHI''S internal authorization and triggers.';

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.logistics_realtime_profile_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.is_active = true
  );
$function$;

revoke execute
on function private.logistics_realtime_profile_active()
from public, anon;

grant execute
on function private.logistics_realtime_profile_active()
to authenticated;

comment on function private.logistics_realtime_profile_active() is
  'Returns only whether the calling Supabase Auth user has an active KUCHI''S profile.';


-- ============================================================================
-- 2. PRIVATE BROADCAST RECEIVE POLICY
-- ============================================================================
--
-- realtime is a Supabase-owned protected schema. This migration creates only
-- the supported RLS policy on realtime.messages and no other realtime object.
-- No INSERT policy is created, so authenticated clients cannot send messages.
-- ============================================================================

create policy logistics_active_profiles_receive_broadcasts
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) in (
    'logistics:v1:tables',
    'logistics:v1:kitchen',
    'logistics:v1:drinks',
    'logistics:v1:catalog',
    'logistics:v1:shift',
    'logistics:v1:finance'
  )
  and (select private.logistics_realtime_profile_active())
);


-- ============================================================================
-- 3. SERVICE SESSIONS -> TABLES_CHANGED
-- ============================================================================

create function private.logistics_realtime_service_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_occurred_at timestamptz := pg_catalog.clock_timestamp();
  v_service_point_ids uuid[];
  v_payload jsonb;
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.service_point_id is not distinct from new.service_point_id then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.service_point_id is distinct from new.service_point_id then
    v_service_point_ids := array[
      old.service_point_id,
      new.service_point_id
    ]::uuid[];
  else
    v_service_point_ids := array[new.service_point_id]::uuid[];
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'TABLES_CHANGED',
    'occurredAt', v_occurred_at,
    'serviceSessionIds', array[new.id]::uuid[],
    'servicePointIds', v_service_point_ids
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:tables',
    true
  );

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_service_sessions()
from public, anon, authenticated;

comment on function private.logistics_realtime_service_sessions() is
  'Privately broadcasts table/session invalidation after a session is created, changes status or moves service point.';

create trigger trg_service_sessions_realtime
after insert or update of status, service_point_id
on public.service_sessions
for each row
execute function private.logistics_realtime_service_sessions();


-- ============================================================================
-- 4. NEW ORDER -> ORDERS_CHANGED + ONE PREPARATION EVENT PER STATION
-- ============================================================================
--
-- This constraint trigger is deferred until transaction completion so it can
-- observe every order_item created by logistics_create_order. It emits exactly
-- one order invalidation and at most one preparation invalidation for each of
-- the two V1 stations, regardless of the number of items in the order.
-- ============================================================================

create function private.logistics_realtime_orders_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_occurred_at timestamptz := pg_catalog.clock_timestamp();
  v_service_session_ids uuid[];
  v_station public.preparation_station;
  v_topic text;
  v_payload jsonb;
begin
  select pg_catalog.coalesce(
    pg_catalog.array_agg(
      distinct order_item.current_service_session_id
      order by order_item.current_service_session_id
    ),
    array[new.service_session_id]::uuid[]
  )
  into v_service_session_ids
  from public.order_items as order_item
  where order_item.order_id = new.id;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'ORDERS_CHANGED',
    'occurredAt', v_occurred_at,
    'orderId', new.id,
    'serviceSessionIds', v_service_session_ids
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:tables',
    true
  );

  for v_station in
    select distinct order_item.preparation_station
    from public.order_items as order_item
    where order_item.order_id = new.id
    order by order_item.preparation_station
  loop
    if v_station = 'KITCHEN'::public.preparation_station then
      v_topic := 'logistics:v1:kitchen';
    elsif v_station = 'DRINKS'::public.preparation_station then
      v_topic := 'logistics:v1:drinks';
    else
      raise exception using
        errcode = 'P0001',
        message = 'REALTIME_PREPARATION_STATION_UNSUPPORTED';
    end if;

    v_payload := pg_catalog.jsonb_build_object(
      'version', 1,
      'type', 'PREPARATION_CHANGED',
      'occurredAt', v_occurred_at,
      'station', v_station,
      'orderId', new.id,
      'serviceSessionIds', v_service_session_ids
    );

    perform realtime.send(
      v_payload,
      v_payload ->> 'type',
      v_topic,
      true
    );
  end loop;

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_orders_insert()
from public, anon, authenticated;

comment on function private.logistics_realtime_orders_insert() is
  'Deferred order broadcaster: one order signal plus at most one signal per KITCHEN/DRINKS station.';

create constraint trigger trg_orders_realtime_after_insert
after insert
on public.orders
deferrable initially deferred
for each row
execute function private.logistics_realtime_orders_insert();


-- ============================================================================
-- 5. ORDER ITEM STATUS -> ORDERS_CHANGED + PREPARATION_CHANGED
-- ============================================================================

create function private.logistics_realtime_order_items_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_occurred_at timestamptz := pg_catalog.clock_timestamp();
  v_service_session_ids uuid[];
  v_topic text;
  v_payload jsonb;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.current_service_session_id is distinct from new.current_service_session_id then
    v_service_session_ids := array[
      old.current_service_session_id,
      new.current_service_session_id
    ]::uuid[];
  else
    v_service_session_ids := array[new.current_service_session_id]::uuid[];
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'ORDERS_CHANGED',
    'occurredAt', v_occurred_at,
    'orderId', new.order_id,
    'serviceSessionIds', v_service_session_ids
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:tables',
    true
  );

  if new.preparation_station = 'KITCHEN'::public.preparation_station then
    v_topic := 'logistics:v1:kitchen';
  elsif new.preparation_station = 'DRINKS'::public.preparation_station then
    v_topic := 'logistics:v1:drinks';
  else
    raise exception using
      errcode = 'P0001',
      message = 'REALTIME_PREPARATION_STATION_UNSUPPORTED';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'PREPARATION_CHANGED',
    'occurredAt', v_occurred_at,
    'station', new.preparation_station,
    'orderId', new.order_id,
    'orderItemId', new.id,
    'serviceSessionIds', v_service_session_ids
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    v_topic,
    true
  );

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_order_items_status()
from public, anon, authenticated;

comment on function private.logistics_realtime_order_items_status() is
  'Broadcasts order and station invalidation only after a real order-item status change.';

create trigger trg_order_items_status_realtime
after update of status
on public.order_items
for each row
execute function private.logistics_realtime_order_items_status();


-- ============================================================================
-- 6. ORDER ITEM TRANSFER -> ORDERS_CHANGED + PREPARATION_CHANGED
-- ============================================================================

create function private.logistics_realtime_order_item_transfers_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_occurred_at timestamptz := pg_catalog.clock_timestamp();
  v_order_id uuid;
  v_station public.preparation_station;
  v_service_session_ids uuid[] := array[
    new.from_service_session_id,
    new.to_service_session_id
  ]::uuid[];
  v_topic text;
  v_payload jsonb;
begin
  select
    order_item.order_id,
    order_item.preparation_station
  into strict
    v_order_id,
    v_station
  from public.order_items as order_item
  where order_item.id = new.order_item_id;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'ORDERS_CHANGED',
    'occurredAt', v_occurred_at,
    'orderId', v_order_id,
    'serviceSessionIds', v_service_session_ids
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:tables',
    true
  );

  if v_station = 'KITCHEN'::public.preparation_station then
    v_topic := 'logistics:v1:kitchen';
  elsif v_station = 'DRINKS'::public.preparation_station then
    v_topic := 'logistics:v1:drinks';
  else
    raise exception using
      errcode = 'P0001',
      message = 'REALTIME_PREPARATION_STATION_UNSUPPORTED';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'PREPARATION_CHANGED',
    'occurredAt', v_occurred_at,
    'station', v_station,
    'orderId', v_order_id,
    'orderItemId', new.order_item_id,
    'serviceSessionIds', v_service_session_ids
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    v_topic,
    true
  );

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_order_item_transfers_insert()
from public, anon, authenticated;

comment on function private.logistics_realtime_order_item_transfers_insert() is
  'Broadcasts exactly one order and one station invalidation for a full or partial item transfer.';

create trigger trg_order_item_transfers_realtime
after insert
on public.order_item_transfers
for each row
execute function private.logistics_realtime_order_item_transfers_insert();


-- ============================================================================
-- 7. PRODUCT AVAILABILITY -> CATALOG_CHANGED
-- ============================================================================

create function private.logistics_realtime_products_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
begin
  if old.is_available is not distinct from new.is_available then
    return new;
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'CATALOG_CHANGED',
    'occurredAt', pg_catalog.clock_timestamp(),
    'productId', new.id
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:catalog',
    true
  );

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_products_availability()
from public, anon, authenticated;

comment on function private.logistics_realtime_products_availability() is
  'Broadcasts catalog invalidation only after a real product availability change.';

create trigger trg_products_availability_realtime
after update of is_available
on public.products
for each row
execute function private.logistics_realtime_products_availability();


-- ============================================================================
-- 8. PAYMENT -> FINANCE_CHANGED
-- ============================================================================

create function private.logistics_realtime_payments_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
begin
  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'FINANCE_CHANGED',
    'occurredAt', pg_catalog.clock_timestamp(),
    'scope', 'PAYMENT',
    'shiftId', new.shift_id,
    'serviceSessionId', new.service_session_id
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:finance',
    true
  );

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_payments_insert()
from public, anon, authenticated;

comment on function private.logistics_realtime_payments_insert() is
  'Broadcasts a payment invalidation without financial amounts or payment method.';

create trigger trg_payments_realtime
after insert
on public.payments
for each row
execute function private.logistics_realtime_payments_insert();


-- ============================================================================
-- 9. SHIFTS -> SHIFT_CHANGED + FINANCE_CHANGED(CLOSURE)
-- ============================================================================

create function private.logistics_realtime_shifts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_occurred_at timestamptz := pg_catalog.clock_timestamp();
  v_payload jsonb;
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status then
    return new;
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'SHIFT_CHANGED',
    'occurredAt', v_occurred_at,
    'shiftId', new.id
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:shift',
    true
  );

  if new.status = 'CLOSED'::public.shift_status then
    v_payload := pg_catalog.jsonb_build_object(
      'version', 1,
      'type', 'FINANCE_CHANGED',
      'occurredAt', v_occurred_at,
      'scope', 'CLOSURE',
      'shiftId', new.id
    );

    perform realtime.send(
      v_payload,
      v_payload ->> 'type',
      'logistics:v1:finance',
      true
    );
  end if;

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_shifts()
from public, anon, authenticated;

comment on function private.logistics_realtime_shifts() is
  'Broadcasts shift invalidation and a separate finance invalidation when the shift closes.';

create trigger trg_shifts_realtime
after insert or update of status
on public.shifts
for each row
execute function private.logistics_realtime_shifts();


-- ============================================================================
-- 10. SHIFT EXPENSES -> FINANCE_CHANGED(EXPENSE)
-- ============================================================================

create function private.logistics_realtime_shift_expenses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
begin
  if tg_op = 'UPDATE'
     and old.voided_at is not distinct from new.voided_at then
    return new;
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'FINANCE_CHANGED',
    'occurredAt', pg_catalog.clock_timestamp(),
    'scope', 'EXPENSE',
    'shiftId', new.shift_id
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:finance',
    true
  );

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_shift_expenses()
from public, anon, authenticated;

comment on function private.logistics_realtime_shift_expenses() is
  'Broadcasts expense invalidation after insertion or a real void-state change, without expense details.';

create trigger trg_shift_expenses_realtime
after insert or update of voided_at
on public.shift_expenses
for each row
execute function private.logistics_realtime_shift_expenses();


-- ============================================================================
-- 11. CASH RECONCILIATION -> FINANCE_CHANGED(RECONCILIATION)
-- ============================================================================

create function private.logistics_realtime_cash_reconciliations_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
begin
  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', 'FINANCE_CHANGED',
    'occurredAt', pg_catalog.clock_timestamp(),
    'scope', 'RECONCILIATION',
    'shiftId', new.shift_id
  );

  perform realtime.send(
    v_payload,
    v_payload ->> 'type',
    'logistics:v1:finance',
    true
  );

  return new;
end;
$function$;

revoke execute
on function private.logistics_realtime_cash_reconciliations_insert()
from public, anon, authenticated;

comment on function private.logistics_realtime_cash_reconciliations_insert() is
  'Broadcasts reconciliation invalidation without cash, card, Yape or difference values.';

create trigger trg_cash_reconciliations_realtime
after insert
on public.cash_reconciliations
for each row
execute function private.logistics_realtime_cash_reconciliations_insert();


-- ============================================================================
-- END — KUCHI'S LOGISTICO V1 / PRIVATE REALTIME BROADCAST
-- ============================================================================
