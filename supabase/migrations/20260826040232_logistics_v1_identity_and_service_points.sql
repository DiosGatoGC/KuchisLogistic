-- ============================================================================
-- KUCHI'S LOGÍSTICO V1
-- Migration 1: identity, roles, service points and product routing
-- ============================================================================


-- ============================================================================
-- 1. USER ROLES
--
-- Old:
-- ADMIN, CASHIER, HALL, GRILL
--
-- New:
-- ADMIN, MANAGER, WAITER, CASHIER, KITCHEN
-- ============================================================================

create type public.user_role_v2 as enum (
  'ADMIN',
  'MANAGER',
  'WAITER',
  'CASHIER',
  'KITCHEN'
);

alter table public.profiles
  alter column role type public.user_role_v2
  using (
    case role::text
      when 'ADMIN' then 'ADMIN'
      when 'CASHIER' then 'CASHIER'
      when 'HALL' then 'WAITER'
      when 'GRILL' then 'KITCHEN'
    end
  )::public.user_role_v2;

drop type public.user_role;

alter type public.user_role_v2
  rename to user_role;


-- ============================================================================
-- 2. SERVICE POINT TYPES
--
-- Add TAKEAWAY for LL1 - LL7
-- ============================================================================

create type public.service_point_type_v2 as enum (
  'TABLE',
  'BAR',
  'TAKEAWAY'
);

alter table public.service_points
  alter column type type public.service_point_type_v2
  using type::text::public.service_point_type_v2;

drop type public.service_point_type;

alter type public.service_point_type_v2
  rename to service_point_type;


-- ============================================================================
-- 3. PREPARATION STATIONS
--
-- KITCHEN -> food prepared by kitchen
-- DRINKS  -> beverages handled by hall/waiters
-- ============================================================================

create type public.preparation_station as enum (
  'KITCHEN',
  'DRINKS'
);


-- ============================================================================
-- 4. PROFILES
--
-- Add internal username authentication metadata.
-- Passwords are NOT stored here. They remain managed by Supabase Auth.
-- ============================================================================

alter table public.profiles
  add column username varchar(60) not null,
  add column auth_email varchar(255) not null,
  add column updated_at timestamptz not null default now();

alter table public.profiles
  add constraint profiles_username_not_blank
    check (length(trim(username)) > 0),

  add constraint profiles_username_trimmed
    check (username = btrim(username)),

  add constraint profiles_username_lowercase
    check (username = lower(username)),

  add constraint profiles_auth_email_not_blank
    check (length(trim(auth_email)) > 0),

  add constraint profiles_auth_email_trimmed
    check (auth_email = btrim(auth_email)),

  add constraint profiles_auth_email_lowercase
    check (auth_email = lower(auth_email));

create unique index uq_profiles_username
  on public.profiles(username);

create unique index uq_profiles_auth_email
  on public.profiles(auth_email);


-- Automatically maintain profiles.updated_at
drop trigger if exists trg_profiles_set_updated_at
  on public.profiles;

create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


comment on column public.profiles.username is
  'Username visible to staff and used to start the KUCHI''S Logístico login flow.';

comment on column public.profiles.auth_email is
  'Internal synthetic email used as bridge to Supabase Auth. Never shown to staff.';


-- ============================================================================
-- 5. PRODUCTS
--
-- Add preparation routing and addition eligibility.
-- ============================================================================

alter table public.products
  add column preparation_station public.preparation_station,
  add column allows_additions boolean not null default false;


comment on column public.products.preparation_station is
  'Operational destination for preparation. NULL means the product is not prepared independently, such as an addition.';

comment on column public.products.allows_additions is
  'Whether the product can receive additions when building a command.';


-- ============================================================================
-- 6. BACKFILL CURRENT 50 PRODUCTS
--
-- KITCHEN:
-- salchipapas, hamburguesas, broaster, alitas,
-- de-pollo, criollasos, porciones
--
-- DRINKS:
-- bebidas
--
-- NULL:
-- adicionales
--
-- allows_additions:
-- food dishes except porciones
-- ============================================================================

update public.products as p
set
  preparation_station =
    case
      when c.slug in (
        'salchipapas',
        'hamburguesas',
        'broaster',
        'alitas',
        'de-pollo',
        'criollasos',
        'porciones'
      )
        then 'KITCHEN'::public.preparation_station

      when c.slug = 'bebidas'
        then 'DRINKS'::public.preparation_station

      when c.slug = 'adicionales'
        then null
    end,

  allows_additions =
    c.slug in (
      'salchipapas',
      'hamburguesas',
      'broaster',
      'alitas',
      'de-pollo',
      'criollasos'
    )

from public.categories as c
where c.id = p.category_id;


-- ============================================================================
-- 7. NORMALIZE BAR NAMES
--
-- Barra 1 -> B1
-- Barra 2 -> B2
-- Barra 3 -> B3
-- Barra 4 -> B4
-- ============================================================================

update public.service_points
set name =
  case name
    when 'Barra 1' then 'B1'
    when 'Barra 2' then 'B2'
    when 'Barra 3' then 'B3'
    when 'Barra 4' then 'B4'
    else name
  end
where name in (
  'Barra 1',
  'Barra 2',
  'Barra 3',
  'Barra 4'
);


-- ============================================================================
-- 8. ADD TAKEAWAY SERVICE POINTS
--
-- Final expected structure:
--
-- Mesa 1 - Mesa 7 -> TABLE       sort 1 - 7
-- B1 - B4           -> BAR         sort 8 - 11
-- LL1 - LL7         -> TAKEAWAY    sort 12 - 18
-- ============================================================================

insert into public.service_points (
  name,
  type,
  sort_order,
  is_active
)
values
  ('LL1', 'TAKEAWAY', 12, true),
  ('LL2', 'TAKEAWAY', 13, true),
  ('LL3', 'TAKEAWAY', 14, true),
  ('LL4', 'TAKEAWAY', 15, true),
  ('LL5', 'TAKEAWAY', 16, true),
  ('LL6', 'TAKEAWAY', 17, true),
  ('LL7', 'TAKEAWAY', 18, true)
on conflict (name)
do update set
  type = excluded.type,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;


-- ============================================================================
-- END — KUCHI'S LOGÍSTICO V1 / MIGRATION 1
-- ============================================================================