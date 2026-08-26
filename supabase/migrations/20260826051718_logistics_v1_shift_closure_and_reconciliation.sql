-- ============================================================================
-- KUCHI'S LOGÍSTICO V1
-- Migration 4: shift closure, financial snapshots and cash reconciliation
-- ============================================================================


-- ============================================================================
-- 1. HISTORICAL ROLE SNAPSHOTS
--
-- Preserve the role that each user had at the exact moment of the operation.
--
-- A worker may change role later, but historical reports must continue
-- reflecting the original role.
-- ============================================================================


-- ============================================================================
-- 1.1 PAYMENTS
-- ============================================================================

alter table public.payments
  add column received_by_role public.user_role;


-- Backfill safely in case test data exists.
update public.payments as p
set received_by_role = pr.role
from public.profiles as pr
where pr.id = p.received_by
  and p.received_by_role is null;


do $$
begin
  if exists (
    select 1
    from public.payments
    where received_by_role is null
  ) then
    raise exception
      'Could not backfill payments.received_by_role. Review payment/profile consistency.';
  end if;
end
$$;


alter table public.payments
  alter column received_by_role set not null;


comment on column public.payments.received_by_role is
  'Snapshot of the cashier/actor role at the exact time the payment was confirmed.';



-- ============================================================================
-- 1.2 SHIFTS
-- ============================================================================

alter table public.shifts
  add column opened_by_role public.user_role,
  add column closed_by_role public.user_role;


update public.shifts as s
set opened_by_role = pr.role
from public.profiles as pr
where pr.id = s.opened_by
  and s.opened_by_role is null;


update public.shifts as s
set closed_by_role = pr.role
from public.profiles as pr
where pr.id = s.closed_by
  and s.closed_by is not null
  and s.closed_by_role is null;


do $$
begin
  if exists (
    select 1
    from public.shifts
    where opened_by_role is null
  ) then
    raise exception
      'Could not backfill shifts.opened_by_role. Review shift/profile consistency.';
  end if;

  if exists (
    select 1
    from public.shifts
    where status = 'CLOSED'
      and closed_by_role is null
  ) then
    raise exception
      'Could not backfill shifts.closed_by_role for a closed shift.';
  end if;
end
$$;


alter table public.shifts
  alter column opened_by_role set not null;


comment on column public.shifts.opened_by_role is
  'Snapshot of the user role when the shift was opened.';

comment on column public.shifts.closed_by_role is
  'Snapshot of the user role when the shift was closed.';


-- Replace existing lifecycle constraint so role snapshots are also validated.

alter table public.shifts
  drop constraint if exists shifts_status_dates_consistent;


alter table public.shifts
  add constraint shifts_status_dates_consistent
  check (
    (
      status = 'OPEN'
      and closed_at is null
      and closed_by is null
      and closed_by_role is null
    )

    or

    (
      status = 'CLOSED'
      and closed_at is not null
      and closed_by is not null
      and closed_by_role is not null
    )
  );



-- ============================================================================
-- 1.3 SHIFT CLOSURES
-- ============================================================================

alter table public.shift_closures
  add column closed_by_role public.user_role;


update public.shift_closures as sc
set closed_by_role = pr.role
from public.profiles as pr
where pr.id = sc.closed_by
  and sc.closed_by_role is null;


do $$
begin
  if exists (
    select 1
    from public.shift_closures
    where closed_by_role is null
  ) then
    raise exception
      'Could not backfill shift_closures.closed_by_role.';
  end if;
end
$$;


alter table public.shift_closures
  alter column closed_by_role set not null;


comment on column public.shift_closures.closed_by_role is
  'Snapshot of the role of the user that generated the shift closure.';



-- ============================================================================
-- 2. EXECUTIVE SHIFT CLOSURE INFORMATION
--
-- Existing financial fields remain:
--
-- business_sales_total
-- cash_total
-- yape_total
-- card_total
-- card_fee_total
-- customer_card_total
--
-- IMPORTANT:
--
-- business_sales_total =
--   cash_total
-- + yape_total
-- + card_total
--
-- card_fee_total is NOT part of business sales.
-- ============================================================================

alter table public.shift_closures

  add column order_items_count integer not null default 0,

  add column cancelled_order_items_count integer not null default 0,

  add column cancelled_pending_count integer not null default 0,

  add column cancelled_preparing_count integer not null default 0,

  add column cancelled_ready_count integer not null default 0,

  add column cancelled_delivered_count integer not null default 0,

  add column service_session_transfers_count integer not null default 0,

  add column order_item_transfers_count integer not null default 0,

  add column closing_notes text;



-- ============================================================================
-- 3. SHIFT CLOSURE COUNT CONSTRAINTS
-- ============================================================================

alter table public.shift_closures

  add constraint shift_closures_order_items_count_non_negative
    check (order_items_count >= 0),

  add constraint shift_closures_cancelled_items_count_non_negative
    check (cancelled_order_items_count >= 0),

  add constraint shift_closures_cancelled_pending_non_negative
    check (cancelled_pending_count >= 0),

  add constraint shift_closures_cancelled_preparing_non_negative
    check (cancelled_preparing_count >= 0),

  add constraint shift_closures_cancelled_ready_non_negative
    check (cancelled_ready_count >= 0),

  add constraint shift_closures_cancelled_delivered_non_negative
    check (cancelled_delivered_count >= 0),

  add constraint shift_closures_session_transfers_non_negative
    check (service_session_transfers_count >= 0),

  add constraint shift_closures_item_transfers_non_negative
    check (order_item_transfers_count >= 0),

  add constraint shift_closures_cancelled_items_breakdown_consistent
    check (
      cancelled_order_items_count =
        cancelled_pending_count
        + cancelled_preparing_count
        + cancelled_ready_count
        + cancelled_delivered_count
    ),

  add constraint shift_closures_cancelled_items_not_greater_than_items
    check (
      cancelled_order_items_count <= order_items_count
    ),

  add constraint shift_closures_closing_notes_not_blank
    check (
      closing_notes is null
      or length(trim(closing_notes)) > 0
    );


comment on column public.shift_closures.order_items_count is
  'Number of order-item lines created during the shift.';

comment on column public.shift_closures.cancelled_order_items_count is
  'Total number of cancelled order-item lines during the shift.';

comment on column public.shift_closures.cancelled_pending_count is
  'Items cancelled while still PENDING.';

comment on column public.shift_closures.cancelled_preparing_count is
  'Items cancelled while PREPARING.';

comment on column public.shift_closures.cancelled_ready_count is
  'Items cancelled after reaching READY.';

comment on column public.shift_closures.cancelled_delivered_count is
  'Items cancelled after reaching DELIVERED.';

comment on column public.shift_closures.service_session_transfers_count is
  'Number of complete table/service-session transfers during the shift.';

comment on column public.shift_closures.order_item_transfers_count is
  'Number of individual order-item transfers during the shift.';

comment on column public.shift_closures.closing_notes is
  'Optional human-written observations recorded during shift closing.';



-- ============================================================================
-- 4. CASH RECONCILIATIONS
--
-- Shift closure:
--   What the system says happened.
--
-- Cash reconciliation:
--   Whether the real physical/payment-channel totals match the system.
--
-- One reconciliation per CLOSED shift.
--
-- The FK points to shift_closures.shift_id rather than directly to shifts.id.
-- This guarantees that a reconciliation cannot exist before a shift closure.
-- ============================================================================

create table public.cash_reconciliations (

  id uuid primary key default gen_random_uuid(),

  shift_id uuid not null unique
    references public.shift_closures(shift_id)
    on delete restrict,


  -- --------------------------------------------------------------------------
  -- Who reconciled
  -- --------------------------------------------------------------------------

  reconciled_by uuid not null
    references public.profiles(id)
    on delete restrict,

  reconciled_by_role public.user_role not null,


  -- --------------------------------------------------------------------------
  -- CASH
  --
  -- expected_cash =
  -- opening_cash_snapshot + cash_sales_expected
  -- --------------------------------------------------------------------------

  opening_cash_snapshot numeric(10,2) not null default 0,

  cash_sales_expected numeric(10,2) not null default 0,

  expected_cash numeric(10,2)
    generated always as (
      opening_cash_snapshot + cash_sales_expected
    ) stored,

  counted_cash numeric(10,2) not null,

  cash_difference numeric(10,2)
    generated always as (
      counted_cash
      - (opening_cash_snapshot + cash_sales_expected)
    ) stored,


  -- --------------------------------------------------------------------------
  -- YAPE
  -- --------------------------------------------------------------------------

  expected_yape numeric(10,2) not null default 0,

  confirmed_yape numeric(10,2) not null,

  yape_difference numeric(10,2)
    generated always as (
      confirmed_yape - expected_yape
    ) stored,


  -- --------------------------------------------------------------------------
  -- CARD / POS
  --
  -- IMPORTANT:
  --
  -- expected_card_business
  --   = actual KUCHI'S business sale
  --
  -- expected_card_fee
  --   = POS surcharge paid by customers
  --
  -- expected_card_customer_total
  --   = what the POS should have physically charged
  --
  -- The fee does NOT increase business sales.
  -- --------------------------------------------------------------------------

  expected_card_business numeric(10,2) not null default 0,

  expected_card_fee numeric(10,2) not null default 0,

  expected_card_customer_total numeric(10,2)
    generated always as (
      expected_card_business + expected_card_fee
    ) stored,

  confirmed_card_customer_total numeric(10,2) not null,

  card_difference numeric(10,2)
    generated always as (
      confirmed_card_customer_total
      - (expected_card_business + expected_card_fee)
    ) stored,


  -- --------------------------------------------------------------------------
  -- Notes / timestamps
  -- --------------------------------------------------------------------------

  notes text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),


  -- --------------------------------------------------------------------------
  -- Monetary integrity
  -- --------------------------------------------------------------------------

  constraint cash_reconciliations_opening_cash_non_negative
    check (opening_cash_snapshot >= 0),

  constraint cash_reconciliations_cash_sales_non_negative
    check (cash_sales_expected >= 0),

  constraint cash_reconciliations_counted_cash_non_negative
    check (counted_cash >= 0),

  constraint cash_reconciliations_expected_yape_non_negative
    check (expected_yape >= 0),

  constraint cash_reconciliations_confirmed_yape_non_negative
    check (confirmed_yape >= 0),

  constraint cash_reconciliations_card_business_non_negative
    check (expected_card_business >= 0),

  constraint cash_reconciliations_card_fee_non_negative
    check (expected_card_fee >= 0),

  constraint cash_reconciliations_confirmed_card_non_negative
    check (confirmed_card_customer_total >= 0),

  constraint cash_reconciliations_notes_not_blank
    check (
      notes is null
      or length(trim(notes)) > 0
    )
);


comment on table public.cash_reconciliations is
  'Manager/admin reconciliation between system-expected financial totals and real physical/payment-channel totals.';

comment on column public.cash_reconciliations.shift_id is
  'Closed shift being reconciled. References shift_closures so reconciliation cannot precede shift closing.';

comment on column public.cash_reconciliations.opening_cash_snapshot is
  'Snapshot of the cash amount with which the shift was opened.';

comment on column public.cash_reconciliations.cash_sales_expected is
  'Business sales paid in cash during the shift.';

comment on column public.cash_reconciliations.expected_cash is
  'Generated expected physical cash: opening cash plus cash sales.';

comment on column public.cash_reconciliations.cash_difference is
  'Generated difference: physically counted cash minus expected cash.';

comment on column public.cash_reconciliations.expected_yape is
  'Yape business sales expected according to the system.';

comment on column public.cash_reconciliations.yape_difference is
  'Generated difference between confirmed and expected Yape totals.';

comment on column public.cash_reconciliations.expected_card_business is
  'Business sales paid by card, excluding POS surcharge.';

comment on column public.cash_reconciliations.expected_card_fee is
  'Total POS surcharge charged to card-paying customers. Not part of KUCHI''S business sales.';

comment on column public.cash_reconciliations.expected_card_customer_total is
  'Generated total expected to appear in the POS: card business sales plus POS surcharge.';

comment on column public.cash_reconciliations.card_difference is
  'Generated difference between confirmed POS total and expected POS customer total.';

comment on column public.cash_reconciliations.reconciled_by_role is
  'Snapshot of the user role at reconciliation time.';



-- ============================================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================================

drop trigger if exists trg_cash_reconciliations_set_updated_at
  on public.cash_reconciliations;


create trigger trg_cash_reconciliations_set_updated_at
before update on public.cash_reconciliations
for each row
execute function public.set_updated_at();



-- ============================================================================
-- 6. INDEXES
-- ============================================================================

create index idx_cash_reconciliations_reconciled_by
  on public.cash_reconciliations(reconciled_by);


create index idx_payments_received_by_role
  on public.payments(received_by_role);


create index idx_shift_closures_closed_by_role
  on public.shift_closures(closed_by_role);



-- ============================================================================
-- 7. SECURITY
--
-- Current KUCHI'S architecture:
--
-- frontend
--   ↓
-- backend
--   ↓
-- service_role
--   ↓
-- Supabase
--
-- Reconciliation can be inserted and corrected,
-- but should not be physically deleted by the application.
-- ============================================================================

alter table public.cash_reconciliations
  enable row level security;


revoke all
on table public.cash_reconciliations
from anon, authenticated;


grant select, insert, update
on table public.cash_reconciliations
to service_role;



-- ============================================================================
-- END — KUCHI'S LOGÍSTICO V1 / MIGRATION 4
-- ============================================================================