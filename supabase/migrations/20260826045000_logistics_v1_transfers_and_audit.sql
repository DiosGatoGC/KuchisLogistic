-- ============================================================================
-- KUCHI'S LOGÍSTICO V1
-- Migration 3: transfers, operational audit and accountability
-- ============================================================================


-- ============================================================================
-- 1. ORDER ITEMS — CURRENT SERVICE SESSION
--
-- order_id preserves the ORIGINAL command where the item was created.
--
-- current_service_session_id represents the service session that currently
-- owns / receives / pays for the item.
--
-- Normally:
--
--   original session = current session
--
-- After an item transfer:
--
--   original session != current session
--
-- This preserves history without rewriting the original command.
-- ============================================================================

alter table public.order_items
  add column current_service_session_id uuid;


-- Backfill existing rows from the original order.
-- This also makes the migration safer if test data happens to exist.
update public.order_items as oi
set current_service_session_id = o.service_session_id
from public.orders as o
where o.id = oi.order_id
  and oi.current_service_session_id is null;


alter table public.order_items
  alter column current_service_session_id set not null;


alter table public.order_items
  add constraint order_items_current_service_session_id_fkey
  foreign key (current_service_session_id)
  references public.service_sessions(id)
  on delete restrict;


comment on column public.order_items.current_service_session_id is
  'Service session that currently owns the item. The original command remains preserved through order_id.';


create index idx_order_items_current_service_session_id
  on public.order_items(current_service_session_id);


-- ============================================================================
-- 2. CANCELLATION ROLE SNAPSHOT
--
-- cancelled_by tells us WHO cancelled.
--
-- cancelled_by_role tells us WHICH ROLE that person had at that exact moment.
--
-- Example:
--
-- Juan is WAITER in August.
-- Juan becomes MANAGER in October.
--
-- An August cancellation must continue showing WAITER historically.
-- ============================================================================

alter table public.order_items
  add column cancelled_by_role public.user_role;


comment on column public.order_items.cancelled_by_role is
  'Snapshot of the cancelling user role at the exact time of cancellation.';


-- Replace Migration 2 operational consistency constraint so cancelled_by_role
-- becomes mandatory only when an item is cancelled.

alter table public.order_items
  drop constraint if exists order_items_operational_state_consistent;


alter table public.order_items
  add constraint order_items_operational_state_consistent
  check (

    -- ------------------------------------------------------------------------
    -- PENDING
    -- ------------------------------------------------------------------------
    (
      status = 'PENDING'
      and preparing_at is null
      and ready_at is null
      and delivered_at is null

      and cancelled_at is null
      and cancelled_by is null
      and cancelled_by_role is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------------------
    -- PREPARING
    -- ------------------------------------------------------------------------
    (
      status = 'PREPARING'
      and preparing_at is not null
      and ready_at is null
      and delivered_at is null

      and cancelled_at is null
      and cancelled_by is null
      and cancelled_by_role is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------------------
    -- READY
    -- ------------------------------------------------------------------------
    (
      status = 'READY'
      and preparing_at is not null
      and ready_at is not null
      and delivered_at is null

      and cancelled_at is null
      and cancelled_by is null
      and cancelled_by_role is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------------------
    -- DELIVERED
    -- ------------------------------------------------------------------------
    (
      status = 'DELIVERED'
      and preparing_at is not null
      and ready_at is not null
      and delivered_at is not null

      and cancelled_at is null
      and cancelled_by is null
      and cancelled_by_role is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------------------
    -- CANCELLED
    -- ------------------------------------------------------------------------
    (
      status = 'CANCELLED'

      and cancelled_at is not null
      and cancelled_by is not null
      and cancelled_by_role is not null
      and cancellation_reason is not null
      and length(trim(cancellation_reason)) > 0
      and cancelled_from_status is not null

      and (

        -- Cancelled while waiting.
        (
          cancelled_from_status = 'PENDING'
          and preparing_at is null
          and ready_at is null
          and delivered_at is null
        )

        or

        -- Cancelled while being prepared.
        (
          cancelled_from_status = 'PREPARING'
          and preparing_at is not null
          and ready_at is null
          and delivered_at is null
          and cancelled_at >= preparing_at
        )

        or

        -- Cancelled after becoming ready.
        (
          cancelled_from_status = 'READY'
          and preparing_at is not null
          and ready_at is not null
          and delivered_at is null
          and cancelled_at >= ready_at
        )

        or

        -- Cancelled after being delivered.
        (
          cancelled_from_status = 'DELIVERED'
          and preparing_at is not null
          and ready_at is not null
          and delivered_at is not null
          and cancelled_at >= delivered_at
        )
      )
    )
  );


-- ============================================================================
-- 3. SERVICE SESSION TRANSFERS
--
-- Used when customers physically move:
--
-- Mesa 3 -> Mesa 5
--
-- The same service_session continues to exist.
-- service_sessions.service_point_id will be updated by the backend.
--
-- This table permanently records the movement.
-- ============================================================================

create table public.service_session_transfers (

  id uuid primary key default gen_random_uuid(),

  service_session_id uuid not null
    references public.service_sessions(id)
    on delete restrict,

  from_service_point_id uuid not null
    references public.service_points(id)
    on delete restrict,

  to_service_point_id uuid not null
    references public.service_points(id)
    on delete restrict,

  from_service_point_name varchar(120) not null,

  to_service_point_name varchar(120) not null,

  transferred_by uuid not null
    references public.profiles(id)
    on delete restrict,

  transferred_by_role public.user_role not null,

  reason text,

  transferred_at timestamptz not null default now(),


  constraint service_session_transfers_points_different
    check (from_service_point_id <> to_service_point_id),

  constraint service_session_transfers_from_name_not_blank
    check (length(trim(from_service_point_name)) > 0),

  constraint service_session_transfers_to_name_not_blank
    check (length(trim(to_service_point_name)) > 0),

  constraint service_session_transfers_reason_not_blank
    check (
      reason is null
      or length(trim(reason)) > 0
    )
);


comment on table public.service_session_transfers is
  'Immutable history of complete service-session movements between service points.';

comment on column public.service_session_transfers.transferred_by_role is
  'Snapshot of the user role at transfer time.';

comment on column public.service_session_transfers.from_service_point_name is
  'Historical snapshot of the origin service point name.';

comment on column public.service_session_transfers.to_service_point_name is
  'Historical snapshot of the destination service point name.';


-- ============================================================================
-- 4. ORDER ITEM TRANSFERS
--
-- Used when only one product/configuration moves between active sessions.
--
-- Example:
--
-- Hamburger originally commanded in Mesa 6
-- but actually belongs to Mesa 7.
--
-- order_item.order_id NEVER changes.
-- order_item.current_service_session_id changes to the destination session.
--
-- If only part of a quantity moves, the backend first splits the order_item.
-- ============================================================================

create table public.order_item_transfers (

  id uuid primary key default gen_random_uuid(),

  order_item_id uuid not null
    references public.order_items(id)
    on delete restrict,

  from_service_session_id uuid not null
    references public.service_sessions(id)
    on delete restrict,

  to_service_session_id uuid not null
    references public.service_sessions(id)
    on delete restrict,

  from_service_point_id uuid not null
    references public.service_points(id)
    on delete restrict,

  to_service_point_id uuid not null
    references public.service_points(id)
    on delete restrict,

  from_service_point_name varchar(120) not null,

  to_service_point_name varchar(120) not null,

  quantity integer not null,

  status_at_transfer public.order_item_status not null,

  transferred_by uuid not null
    references public.profiles(id)
    on delete restrict,

  transferred_by_role public.user_role not null,

  reason text,

  transferred_at timestamptz not null default now(),


  constraint order_item_transfers_sessions_different
    check (from_service_session_id <> to_service_session_id),

  constraint order_item_transfers_points_different
    check (from_service_point_id <> to_service_point_id),

  constraint order_item_transfers_quantity_positive
    check (quantity > 0),

  constraint order_item_transfers_status_not_cancelled
    check (status_at_transfer <> 'CANCELLED'),

  constraint order_item_transfers_from_name_not_blank
    check (length(trim(from_service_point_name)) > 0),

  constraint order_item_transfers_to_name_not_blank
    check (length(trim(to_service_point_name)) > 0),

  constraint order_item_transfers_reason_not_blank
    check (
      reason is null
      or length(trim(reason)) > 0
    )
);


comment on table public.order_item_transfers is
  'Immutable history of order-item movements between service sessions.';

comment on column public.order_item_transfers.quantity is
  'Quantity represented by the transferred order_item at transfer time.';

comment on column public.order_item_transfers.status_at_transfer is
  'Preparation status snapshot when the transfer occurred.';

comment on column public.order_item_transfers.transferred_by_role is
  'Snapshot of the transferring user role at transfer time.';


-- ============================================================================
-- 5. AUDIT LOG CONTEXT
--
-- Existing:
--
-- user_id
-- action
-- entity
-- entity_id
-- details
-- created_at
--
-- New contextual snapshots:
--
-- actor_role
-- shift_id
-- service_session_id
--
-- These are nullable because administrative actions may happen outside
-- an open shift or outside a particular service session.
-- ============================================================================

alter table public.audit_logs
  add column actor_role public.user_role,

  add column shift_id uuid
    references public.shifts(id)
    on delete restrict,

  add column service_session_id uuid
    references public.service_sessions(id)
    on delete restrict;


comment on column public.audit_logs.actor_role is
  'Snapshot of the actor role when the audited action occurred.';

comment on column public.audit_logs.shift_id is
  'Shift context for the audited action when applicable.';

comment on column public.audit_logs.service_session_id is
  'Service-session context for the audited action when applicable.';


-- ============================================================================
-- 6. TRANSFER INDEXES
-- ============================================================================

create index idx_service_session_transfers_session_time
  on public.service_session_transfers(
    service_session_id,
    transferred_at
  );


create index idx_service_session_transfers_from_point
  on public.service_session_transfers(from_service_point_id);


create index idx_service_session_transfers_to_point
  on public.service_session_transfers(to_service_point_id);


create index idx_service_session_transfers_transferred_by
  on public.service_session_transfers(transferred_by);


create index idx_order_item_transfers_item_time
  on public.order_item_transfers(
    order_item_id,
    transferred_at
  );


create index idx_order_item_transfers_from_session
  on public.order_item_transfers(
    from_service_session_id,
    transferred_at
  );


create index idx_order_item_transfers_to_session
  on public.order_item_transfers(
    to_service_session_id,
    transferred_at
  );


create index idx_order_item_transfers_from_point
  on public.order_item_transfers(from_service_point_id);


create index idx_order_item_transfers_to_point
  on public.order_item_transfers(to_service_point_id);


create index idx_order_item_transfers_transferred_by
  on public.order_item_transfers(transferred_by);


-- ============================================================================
-- 7. AUDIT INDEXES
-- ============================================================================

create index idx_audit_logs_shift_created_at
  on public.audit_logs(
    shift_id,
    created_at
  );


create index idx_audit_logs_session_created_at
  on public.audit_logs(
    service_session_id,
    created_at
  );


-- ============================================================================
-- 8. FOREIGN KEY PERFORMANCE INDEXES
--
-- Supabase advisors reported these FKs without covering indexes.
--
-- They are not functional requirements, but adding them now avoids avoidable
-- performance problems once real operational data begins accumulating.
-- ============================================================================

create index if not exists idx_order_items_cancelled_by
  on public.order_items(cancelled_by);


create index if not exists idx_service_sessions_opened_by
  on public.service_sessions(opened_by);


create index if not exists idx_service_sessions_closed_by
  on public.service_sessions(closed_by);


create index if not exists idx_shifts_opened_by
  on public.shifts(opened_by);


create index if not exists idx_shifts_closed_by
  on public.shifts(closed_by);


create index if not exists idx_payments_received_by
  on public.payments(received_by);


create index if not exists idx_payments_service_session_shift
  on public.payments(
    service_session_id,
    shift_id
  );


-- ============================================================================
-- 9. SECURITY — TRANSFER TABLES
--
-- Follow the current KUCHI'S backend-only architecture.
--
-- Frontend roles anon/authenticated do not directly modify operational tables.
-- The backend operates using service_role.
--
-- Transfer history is append-only from the application.
-- ============================================================================

alter table public.service_session_transfers
  enable row level security;


alter table public.order_item_transfers
  enable row level security;


revoke all
on table public.service_session_transfers
from anon, authenticated;


revoke all
on table public.order_item_transfers
from anon, authenticated;


grant select, insert
on table public.service_session_transfers
to service_role;


grant select, insert
on table public.order_item_transfers
to service_role;


-- ============================================================================
-- 10. SECURITY — RLS AUTO ENABLE FUNCTION
--
-- Supabase security advisor reported that this SECURITY DEFINER function was
-- executable through the API by anon/authenticated users.
--
-- It is an administrative event-trigger function and does not need to be
-- callable from the Data API.
--
-- Revoke PUBLIC as well, otherwise anon/authenticated could inherit EXECUTE
-- through PostgreSQL's PUBLIC pseudo-role.
-- ============================================================================

revoke execute
on function public.rls_auto_enable()
from public, anon, authenticated;


-- ============================================================================
-- END — KUCHI'S LOGÍSTICO V1 / MIGRATION 3
-- ============================================================================