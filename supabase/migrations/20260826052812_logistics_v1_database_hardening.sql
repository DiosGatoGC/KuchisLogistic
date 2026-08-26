-- ============================================================================
-- KUCHI'S LOGÍSTICO V1
-- Migration 5: database hardening and historical consistency
-- ============================================================================


-- ============================================================================
-- 1. SERVICE SESSION ROLE SNAPSHOTS
--
-- Preserve the role a user had when opening/closing a service session.
--
-- Example:
-- Juan opens Mesa 3 as WAITER.
-- Months later Juan becomes MANAGER.
--
-- Historical records must continue showing that the session was opened
-- while Juan was a WAITER.
-- ============================================================================

alter table public.service_sessions
  add column opened_by_role public.user_role,
  add column closed_by_role public.user_role;


-- Backfill existing rows if any exist.
update public.service_sessions as ss
set opened_by_role = p.role
from public.profiles as p
where p.id = ss.opened_by
  and ss.opened_by_role is null;


update public.service_sessions as ss
set closed_by_role = p.role
from public.profiles as p
where p.id = ss.closed_by
  and ss.closed_by is not null
  and ss.closed_by_role is null;


-- Safety validation.
do $$
begin

  if exists (
    select 1
    from public.service_sessions
    where opened_by_role is null
  ) then
    raise exception
      'Could not backfill service_sessions.opened_by_role.';
  end if;


  if exists (
    select 1
    from public.service_sessions
    where status in ('PAID', 'CANCELLED')
      and closed_by_role is null
  ) then
    raise exception
      'Could not backfill service_sessions.closed_by_role.';
  end if;

end
$$;


alter table public.service_sessions
  alter column opened_by_role set not null;


comment on column public.service_sessions.opened_by_role is
  'Snapshot of the user role when the service session was opened.';

comment on column public.service_sessions.closed_by_role is
  'Snapshot of the user role when the service session was closed.';


-- Replace lifecycle constraint so role snapshots are consistent too.

alter table public.service_sessions
  drop constraint if exists service_sessions_status_dates_consistent;


alter table public.service_sessions
  add constraint service_sessions_status_dates_consistent
  check (

    (
      status in ('OPEN', 'AWAITING_PAYMENT')

      and closed_at is null
      and closed_by is null
      and closed_by_role is null
    )

    or

    (
      status in ('PAID', 'CANCELLED')

      and closed_at is not null
      and closed_by is not null
      and closed_by_role is not null
    )

  );


-- ============================================================================
-- 2. ORDER CREATOR ROLE SNAPSHOT
--
-- orders.created_by preserves who created the command.
-- orders.created_by_role preserves the role they had at that exact moment.
-- ============================================================================

alter table public.orders
  add column created_by_role public.user_role;


update public.orders as o
set created_by_role = p.role
from public.profiles as p
where p.id = o.created_by
  and o.created_by_role is null;


do $$
begin

  if exists (
    select 1
    from public.orders
    where created_by_role is null
  ) then
    raise exception
      'Could not backfill orders.created_by_role.';
  end if;

end
$$;


alter table public.orders
  alter column created_by_role set not null;


comment on column public.orders.created_by_role is
  'Snapshot of the user role when the command was created.';


-- ============================================================================
-- 3. SERVICE POINT SORT ORDER INTEGRITY
--
-- The logistics UI relies on sort_order to render:
--
-- Mesa 1 - Mesa 7
-- B1 - B4
-- LL1 - LL7
--
-- Duplicate positions must never exist.
-- ============================================================================

alter table public.service_points
  add constraint service_points_sort_order_unique
  unique (sort_order);


-- ============================================================================
-- 4. PAYMENT FEE MATHEMATICAL CONSISTENCY
--
-- Existing constraints already guarantee:
--
-- customer_total = business_amount + fee_amount
--
-- Non-card payments also require:
--
-- fee_rate = 0
-- fee_amount = 0
--
-- This new constraint additionally guarantees:
--
-- fee_amount = ROUND(business_amount * fee_rate, 2)
--
-- This does NOT hardcode 5%.
--
-- Example:
--
-- business_amount = 100.00
-- fee_rate        = 0.0500
-- fee_amount      = 5.00
--
-- If the POS fee changes in the future, another fee_rate can still be used.
-- ============================================================================

alter table public.payments
  add constraint payments_fee_amount_matches_rate
  check (
    fee_amount = round(business_amount * fee_rate, 2)
  );


-- ============================================================================
-- 5. SHIFT CLOSURE — ORDERED PRODUCT UNITS
--
-- order_items_count counts CONFIGURATION LINES.
--
-- Example:
--
-- 3x Hamburguesa + Huevo
--
-- order_items_count += 1
-- product_units_count += 3
--
-- This allows reports to distinguish:
--
-- Order lines       86
-- Units commanded  123
--
-- This field represents the total quantity across order-item lines created
-- during the shift, before considering later cancellations.
-- ============================================================================

alter table public.shift_closures
  add column product_units_count integer not null default 0;


alter table public.shift_closures

  add constraint shift_closures_product_units_non_negative
    check (product_units_count >= 0),

  add constraint shift_closures_product_units_not_less_than_lines
    check (product_units_count >= order_items_count);


comment on column public.shift_closures.product_units_count is
  'Total quantity represented by all order-item lines created during the shift. Distinct from order_items_count, which counts configuration lines.';


-- ============================================================================
-- 6. PAYMENT IMMUTABILITY
--
-- A confirmed payment is financial history.
--
-- The application may:
--
-- SELECT payments
-- INSERT payments
--
-- But it must NOT silently rewrite:
--
-- amount
-- method
-- POS fee
-- received_by
--
-- Future refunds/reversals must use an explicit dedicated workflow.
-- ============================================================================

revoke update
on table public.payments
from service_role;


-- ============================================================================
-- 7. RUNTIME PRIVILEGE HARDENING
--
-- service_role is the runtime role used by the KUCHI'S backend.
--
-- Runtime application code does not need privileges to:
--
-- TRUNCATE tables
-- CREATE/TRIGGER triggers
-- CREATE foreign-key REFERENCES
--
-- Database migrations run with administrative migration credentials instead,
-- so removing these permissions does not prevent future migrations.
-- ============================================================================

revoke truncate, references, trigger
on all tables in schema public
from service_role;


-- ============================================================================
-- END — KUCHI'S LOGÍSTICO V1 / MIGRATION 5
-- ============================================================================