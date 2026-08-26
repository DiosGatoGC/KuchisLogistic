-- ============================================================================
-- KUCHI'S LOGÍSTICO V1
-- Migration 2: orders, preparation lifecycle and item additions
-- ============================================================================


-- ============================================================================
-- 0. SAFETY CHECK
--
-- This migration redesigns the operational order model.
-- KUCHI'S currently has no orders/order_items, so abort if unexpected
-- operational data exists instead of silently transforming historical data.
-- ============================================================================

do $$
begin
  if exists (select 1 from public.orders limit 1)
     or exists (select 1 from public.order_items limit 1) then
    raise exception
      'Migration 2 expects orders and order_items to be empty. Review operational data before continuing.';
  end if;
end
$$;


-- ============================================================================
-- 1. ORDERS = COMMAND HEADER
--
-- An order represents one command sent during a service session.
--
-- Preparation state no longer belongs here because one command may contain:
--
--   Hamburguesa -> PREPARING
--   Coca-Cola   -> READY
--
-- Each item will own its preparation state.
-- ============================================================================

drop index if exists public.idx_orders_status_created_at;

alter table public.orders
  drop constraint if exists orders_ready_after_created,
  drop constraint if exists orders_preparing_requires_sent_at,
  drop constraint if exists orders_ready_requires_timestamps;


-- Remove old global preparation information.
alter table public.orders
  drop column status,
  drop column ready_at;


-- The old order_status enum is no longer needed.
drop type public.order_status;


-- Every command has a sequential number inside its service session.
alter table public.orders
  add column sequence_number integer not null;


-- A command starts its operational timer when it is sent.
-- In V1 commands are persisted when they are actually sent,
-- therefore sent_at is mandatory.
alter table public.orders
  alter column sent_at set default now(),
  alter column sent_at set not null;


alter table public.orders
  add constraint orders_sequence_number_positive
    check (sequence_number > 0),

  add constraint orders_session_sequence_unique
    unique (service_session_id, sequence_number);


comment on column public.orders.sequence_number is
  'Sequential command number inside the service session: 1, 2, 3, ...';

comment on column public.orders.sent_at is
  'Time when the command was officially sent and its operational timer began.';


create index idx_orders_sent_at
  on public.orders(sent_at);


-- ============================================================================
-- 2. ORDER ITEM STATUS
--
-- Old:
-- ACTIVE
-- CANCELLED
--
-- New operational lifecycle:
--
-- PENDING -> PREPARING -> READY -> DELIVERED
--                  \         \          \
--                   -------- CANCELLED ---
-- ============================================================================

create type public.order_item_status_v2 as enum (
  'PENDING',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED'
);


-- Stores the state an item had immediately before being cancelled.
create type public.order_item_cancellation_origin_status as enum (
  'PENDING',
  'PREPARING',
  'READY',
  'DELIVERED'
);


-- Remove old cancellation constraint before changing status semantics.
alter table public.order_items
  drop constraint if exists order_items_cancellation_consistent;


alter table public.order_items
  alter column status drop default;


alter table public.order_items
  alter column status type public.order_item_status_v2
  using (
    case status::text
      when 'ACTIVE' then 'PENDING'
      when 'CANCELLED' then 'CANCELLED'
    end
  )::public.order_item_status_v2;


drop type public.order_item_status;


alter type public.order_item_status_v2
  rename to order_item_status;


alter table public.order_items
  alter column status
    set default 'PENDING'::public.order_item_status;


-- ============================================================================
-- 3. ORDER ITEMS
--
-- Each row represents ONE PRODUCT CONFIGURATION.
--
-- Example:
--
-- 2x Hamburguesa + Huevo
--
-- can remain one row.
--
-- But:
--
-- 1x Hamburguesa + Huevo
-- 1x Hamburguesa
--
-- are two different order_items.
-- ============================================================================

alter table public.order_items
  add column line_number integer not null,

  add column preparation_station public.preparation_station not null,

  add column updated_at timestamptz not null default now(),

  add column preparing_at timestamptz,

  add column ready_at timestamptz,

  add column delivered_at timestamptz,

  add column cancelled_at timestamptz,

  add column cancelled_from_status
    public.order_item_cancellation_origin_status;


alter table public.order_items
  add constraint order_items_line_number_positive
    check (line_number > 0),

  add constraint order_items_order_line_unique
    unique (order_id, line_number);


comment on column public.order_items.line_number is
  'Stable visual position of the item inside its command.';

comment on column public.order_items.preparation_station is
  'Snapshot of the preparation destination at command time.';

comment on column public.order_items.preparing_at is
  'Time when preparation actually started.';

comment on column public.order_items.ready_at is
  'Time when preparation finished and the item became ready.';

comment on column public.order_items.delivered_at is
  'Time when the item was delivered or picked up.';

comment on column public.order_items.cancelled_from_status is
  'Operational state immediately before cancellation.';


-- ============================================================================
-- 4. TIMESTAMP CHRONOLOGY
-- ============================================================================

alter table public.order_items
  add constraint order_items_timestamps_chronological
  check (
    (
      preparing_at is null
      or preparing_at >= created_at
    )
    and
    (
      ready_at is null
      or (
        preparing_at is not null
        and ready_at >= preparing_at
      )
    )
    and
    (
      delivered_at is null
      or (
        ready_at is not null
        and delivered_at >= ready_at
      )
    )
    and
    (
      cancelled_at is null
      or cancelled_at >= created_at
    )
  );


-- ============================================================================
-- 5. STATUS / TIMESTAMP / CANCELLATION CONSISTENCY
--
-- PostgreSQL prevents impossible states such as:
--
-- READY without ready_at
-- DELIVERED without ready_at
-- CANCELLED without reason
-- CANCELLED without responsible user
-- ============================================================================

alter table public.order_items
  add constraint order_items_operational_state_consistent
  check (

    -- ------------------------------------------------------------
    -- PENDING
    -- ------------------------------------------------------------
    (
      status = 'PENDING'
      and preparing_at is null
      and ready_at is null
      and delivered_at is null

      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------
    -- PREPARING
    -- ------------------------------------------------------------
    (
      status = 'PREPARING'
      and preparing_at is not null
      and ready_at is null
      and delivered_at is null

      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------
    -- READY
    -- ------------------------------------------------------------
    (
      status = 'READY'
      and preparing_at is not null
      and ready_at is not null
      and delivered_at is null

      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------
    -- DELIVERED
    -- ------------------------------------------------------------
    (
      status = 'DELIVERED'
      and preparing_at is not null
      and ready_at is not null
      and delivered_at is not null

      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
      and cancelled_from_status is null
    )

    or

    -- ------------------------------------------------------------
    -- CANCELLED
    -- ------------------------------------------------------------
    (
      status = 'CANCELLED'

      and cancelled_at is not null
      and cancelled_by is not null
      and cancellation_reason is not null
      and length(trim(cancellation_reason)) > 0
      and cancelled_from_status is not null

      and (

        -- Cancelled while still waiting.
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

        -- Cancelled after delivery.
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
-- 6. UPDATED_AT TRIGGER
-- ============================================================================

drop trigger if exists trg_order_items_set_updated_at
  on public.order_items;


create trigger trg_order_items_set_updated_at
before update on public.order_items
for each row
execute function public.set_updated_at();


-- ============================================================================
-- 7. ORDER ITEM ADDITIONS
--
-- Additions belong to ONE specific order_item configuration.
--
-- Example:
--
-- order_item:
--   2x Hamburguesa
--
-- additions:
--   Huevo  x1 per item
--   Tocino x1 per item
--
-- Total addition quantities:
--   2 Huevos
--   2 Tocinos
--
-- If only one of the two hamburgers receives Huevo,
-- the frontend/backend MUST split the hamburgers into separate order_items
-- before sending the command.
-- ============================================================================

create table public.order_item_additions (

  id uuid primary key default gen_random_uuid(),

  order_item_id uuid not null
    references public.order_items(id)
    on delete restrict,

  product_id uuid not null
    references public.products(id)
    on delete restrict,

  addition_name varchar(120) not null,

  unit_price numeric(10,2) not null,

  quantity_per_item integer not null default 1,

  created_at timestamptz not null default now(),


  constraint order_item_additions_name_not_blank
    check (length(trim(addition_name)) > 0),

  constraint order_item_additions_unit_price_non_negative
    check (unit_price >= 0),

  constraint order_item_additions_quantity_positive
    check (quantity_per_item > 0),

  constraint order_item_additions_item_product_unique
    unique (order_item_id, product_id)
);


comment on table public.order_item_additions is
  'Immutable snapshots of additions attached to one order item configuration.';

comment on column public.order_item_additions.addition_name is
  'Snapshot of the addition name at command time.';

comment on column public.order_item_additions.unit_price is
  'Snapshot of the addition price at command time.';

comment on column public.order_item_additions.quantity_per_item is
  'Number of this addition applied to each unit represented by the parent order_item.';


-- ============================================================================
-- 8. INDEXES FOR PREPARATION QUEUES
-- ============================================================================

create index idx_order_items_station_status_created_at
  on public.order_items(
    preparation_station,
    status,
    created_at
  );


create index idx_order_item_additions_product_id
  on public.order_item_additions(product_id);


-- ============================================================================
-- 9. SECURITY
--
-- Follow the same backend-only pattern already used by KUCHI'S.
-- ============================================================================

alter table public.order_item_additions
  enable row level security;


revoke all
on table public.order_item_additions
from anon, authenticated;


-- Existing service_role grants were created before this table existed,
-- therefore this new table needs its own explicit grant.
grant select, insert
on table public.order_item_additions
to service_role;


-- ============================================================================
-- END — KUCHI'S LOGÍSTICO V1 / MIGRATION 2
-- ============================================================================