-- ============================================================================
-- KUCHI'S
-- Initial schema — ERD v2 FINAL
-- Target: PostgreSQL / Supabase
-- Physical implementation of docs/database/erd-v2-final.md
-- Reviewed revision: integrity checks strengthened before first Supabase apply
-- ============================================================================

create type public.user_role as enum ('ADMIN','CASHIER','HALL','GRILL');
create type public.service_point_type as enum ('TABLE','BAR');
create type public.shift_status as enum ('OPEN','CLOSED');
create type public.session_status as enum ('OPEN','AWAITING_PAYMENT','PAID','CANCELLED');
create type public.order_status as enum ('PENDING','PREPARING','READY','CANCELLED');
create type public.order_item_status as enum ('ACTIVE','CANCELLED');
create type public.payment_method as enum ('CASH','YAPE','CARD');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name varchar(120) not null,
  role public.user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_full_name_not_blank check (length(trim(full_name)) > 0)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null,
  slug varchar(100) not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_slug_not_blank check (length(trim(slug)) > 0),
  constraint categories_sort_order_non_negative check (sort_order >= 0)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name varchar(120) not null,
  description text,
  price numeric(10,2) not null,
  image_path text,
  is_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_price_non_negative check (price >= 0)
);

create table public.service_points (
  id uuid primary key default gen_random_uuid(),
  name varchar(50) not null unique,
  type public.service_point_type not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  constraint service_points_name_not_blank check (length(trim(name)) > 0),
  constraint service_points_sort_order_non_negative check (sort_order >= 0)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles(id) on delete restrict,
  closed_by uuid references public.profiles(id) on delete restrict,
  opening_cash numeric(10,2) not null default 0,
  status public.shift_status not null default 'OPEN',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint shifts_opening_cash_non_negative check (opening_cash >= 0),
  constraint shifts_status_dates_consistent check (
    (
      status = 'OPEN'
      and closed_at is null
      and closed_by is null
    )
    or
    (
      status = 'CLOSED'
      and closed_at is not null
      and closed_by is not null
    )
  ),
  constraint shifts_closed_after_opened check (
    closed_at is null or closed_at >= opened_at
  )
);

create table public.shift_closures (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.shifts(id) on delete restrict,
  closed_by uuid not null references public.profiles(id) on delete restrict,
  business_sales_total numeric(10,2) not null,
  cash_total numeric(10,2) not null default 0,
  yape_total numeric(10,2) not null default 0,
  card_total numeric(10,2) not null default 0,
  card_fee_total numeric(10,2) not null default 0,
  customer_card_total numeric(10,2) not null default 0,
  service_sessions_count integer not null default 0,
  cancelled_sessions_count integer not null default 0,
  orders_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  report_path text,
  created_at timestamptz not null default now(),

  constraint shift_closures_business_sales_non_negative check (business_sales_total >= 0),
  constraint shift_closures_cash_non_negative check (cash_total >= 0),
  constraint shift_closures_yape_non_negative check (yape_total >= 0),
  constraint shift_closures_card_non_negative check (card_total >= 0),
  constraint shift_closures_card_fee_non_negative check (card_fee_total >= 0),
  constraint shift_closures_customer_card_non_negative check (customer_card_total >= 0),
  constraint shift_closures_sessions_count_non_negative check (service_sessions_count >= 0),
  constraint shift_closures_cancelled_sessions_count_non_negative check (cancelled_sessions_count >= 0),
  constraint shift_closures_orders_count_non_negative check (orders_count >= 0),
  constraint shift_closures_customer_card_total_consistent
    check (customer_card_total = card_total + card_fee_total),

  constraint shift_closures_business_total_consistent
    check (business_sales_total = cash_total + yape_total + card_total)
);

create table public.service_sessions (
  id uuid primary key default gen_random_uuid(),
  service_point_id uuid not null references public.service_points(id) on delete restrict,
  shift_id uuid not null references public.shifts(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  closed_by uuid references public.profiles(id) on delete restrict,
  status public.session_status not null default 'OPEN',
  cancellation_reason text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint service_sessions_status_dates_consistent check (
    (
      status in ('OPEN','AWAITING_PAYMENT')
      and closed_at is null
      and closed_by is null
    )
    or
    (
      status in ('PAID','CANCELLED')
      and closed_at is not null
      and closed_by is not null
    )
  ),
  constraint service_sessions_closed_after_opened check (
    closed_at is null or closed_at >= opened_at
  ),
  constraint service_sessions_cancellation_reason_consistent check (
    (
      status = 'CANCELLED'
      and cancellation_reason is not null
      and length(trim(cancellation_reason)) > 0
    )
    or
    (
      status <> 'CANCELLED'
      and cancellation_reason is null
    )
  ),

  constraint service_sessions_id_shift_unique
    unique (id, shift_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  service_session_id uuid not null references public.service_sessions(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  status public.order_status not null default 'PENDING',
  notes text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  ready_at timestamptz,

  constraint orders_sent_after_created check (
    sent_at is null or sent_at >= created_at
  ),
  constraint orders_ready_after_created check (
    ready_at is null or ready_at >= created_at
  ),
  constraint orders_preparing_requires_sent_at check (
    status <> 'PREPARING' or sent_at is not null
  ),
  constraint orders_ready_requires_timestamps check (
    status <> 'READY'
    or (sent_at is not null and ready_at is not null)
  )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name varchar(120) not null,
  unit_price numeric(10,2) not null,
  quantity integer not null,
  notes text,
  status public.order_item_status not null default 'ACTIVE',
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancellation_reason text,
  created_at timestamptz not null default now(),

  constraint order_items_product_name_not_blank check (length(trim(product_name)) > 0),
  constraint order_items_unit_price_non_negative check (unit_price >= 0),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_cancellation_consistent check (
    (
      status = 'CANCELLED'
      and cancelled_by is not null
      and cancellation_reason is not null
      and length(trim(cancellation_reason)) > 0
    )
    or
    (
      status = 'ACTIVE'
      and cancellation_reason is null
      and cancelled_by is null
    )
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  service_session_id uuid not null references public.service_sessions(id) on delete restrict,
  shift_id uuid not null references public.shifts(id) on delete restrict,
  received_by uuid not null references public.profiles(id) on delete restrict,
  method public.payment_method not null,
  business_amount numeric(10,2) not null,
  fee_rate numeric(5,4) not null default 0,
  fee_amount numeric(10,2) not null default 0,
  customer_total numeric(10,2) not null,
  paid_at timestamptz not null default now(),

  constraint payments_session_shift_consistent
    foreign key (service_session_id, shift_id)
    references public.service_sessions(id, shift_id)
    on delete restrict,

  constraint payments_business_amount_non_negative check (business_amount >= 0),
  constraint payments_fee_rate_valid check (fee_rate >= 0 and fee_rate <= 1),
  constraint payments_fee_amount_non_negative check (fee_amount >= 0),
  constraint payments_customer_total_non_negative check (customer_total >= 0),
  constraint payments_total_consistent check (
    customer_total = business_amount + fee_amount
  ),
  constraint payments_non_card_has_no_fee check (
    method = 'CARD'
    or (
      fee_rate = 0
      and fee_amount = 0
      and customer_total = business_amount
    )
  )
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  action varchar(80) not null,
  entity varchar(80) not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint audit_logs_action_not_blank check (length(trim(action)) > 0),
  constraint audit_logs_entity_not_blank check (length(trim(entity)) > 0)
);

-- ============================================================================
-- INDEXES AND BUSINESS CONSTRAINTS
-- ============================================================================

create index idx_products_category_id
  on public.products(category_id);

create index idx_products_catalog_visibility
  on public.products(category_id, is_active, is_available);

create index idx_categories_sort_order
  on public.categories(sort_order);

create index idx_service_points_type_sort_order
  on public.service_points(type, sort_order);

create unique index uq_shifts_single_open
  on public.shifts(status)
  where status = 'OPEN';

create index idx_shifts_opened_at
  on public.shifts(opened_at);

create index idx_shifts_closed_at
  on public.shifts(closed_at);

create index idx_shift_closures_created_at
  on public.shift_closures(created_at);

create index idx_shift_closures_closed_by
  on public.shift_closures(closed_by);

create index idx_service_sessions_shift_id
  on public.service_sessions(shift_id);

create index idx_service_sessions_service_point_id
  on public.service_sessions(service_point_id);

create index idx_service_sessions_status
  on public.service_sessions(status);

create index idx_service_sessions_opened_at
  on public.service_sessions(opened_at);

create index idx_service_sessions_closed_at
  on public.service_sessions(closed_at);

create unique index uq_service_sessions_one_active_per_point
  on public.service_sessions(service_point_id)
  where status in ('OPEN','AWAITING_PAYMENT');

create index idx_orders_service_session_id
  on public.orders(service_session_id);

create index idx_orders_status_created_at
  on public.orders(status, created_at);

create index idx_orders_created_by
  on public.orders(created_by);

create index idx_order_items_order_id
  on public.order_items(order_id);

create index idx_order_items_product_id
  on public.order_items(product_id);

create index idx_order_items_status
  on public.order_items(status);

create index idx_payments_service_session_id
  on public.payments(service_session_id);

create index idx_payments_shift_id
  on public.payments(shift_id);

create index idx_payments_method
  on public.payments(method);

create index idx_payments_paid_at
  on public.payments(paid_at);

create index idx_audit_logs_user_id
  on public.audit_logs(user_id);

create index idx_audit_logs_entity
  on public.audit_logs(entity, entity_id);

create index idx_audit_logs_created_at
  on public.audit_logs(created_at);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.service_points enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_closures enable row level security;
alter table public.service_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

-- ============================================================================
-- INITIAL CLIENT-ROLE LOCKDOWN
-- ============================================================================

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.service_points from anon, authenticated;
revoke all on table public.shifts from anon, authenticated;
revoke all on table public.shift_closures from anon, authenticated;
revoke all on table public.service_sessions from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

-- ============================================================================
-- END — KUCHI'S INITIAL SCHEMA / ERD v2 FINAL
-- ============================================================================
