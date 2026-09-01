-- ============================================================================
-- KUCHI'S LOGISTICO
-- Shift operational expenses
-- ============================================================================
--
-- V1 scope:
--   * Operational expenses are cash outflows taken from the physical register.
--   * They never reduce business sales.
--   * They reduce expected physical cash during reconciliation.
--   * Expenses are never deleted; mistakes are voided with an audit trail.
-- ============================================================================


-- ============================================================================
-- 1. EXPENSE CATEGORY
-- ============================================================================

create type public.expense_category as enum (
  'SUPPLIES',
  'CLEANING',
  'OTHER'
);

comment on type public.expense_category is
  'Operational expense category: supplies, cleaning or a custom other category.';


-- ============================================================================
-- 2. SHIFT EXPENSES
-- ============================================================================

create table public.shift_expenses (
  id uuid primary key default gen_random_uuid(),

  shift_id uuid not null
    references public.shifts(id)
    on delete restrict,

  recorded_by uuid not null
    references public.profiles(id)
    on delete restrict,

  recorded_by_role public.user_role not null,

  category public.expense_category not null,

  custom_category varchar(80),

  description text not null,

  amount numeric(10, 2) not null,

  recorded_at timestamptz not null default now(),

  voided_at timestamptz,

  voided_by uuid
    references public.profiles(id)
    on delete restrict,

  voided_by_role public.user_role,

  void_reason text,

  constraint shift_expenses_amount_positive
    check (amount > 0),

  constraint shift_expenses_description_not_blank
    check (
      pg_catalog.length(pg_catalog.btrim(description)) > 0
      and pg_catalog.length(pg_catalog.btrim(description)) <= 300
    ),

  constraint shift_expenses_custom_category_consistent
    check (
      (
        category = 'OTHER'::public.expense_category
        and custom_category is not null
        and pg_catalog.length(pg_catalog.btrim(custom_category)) > 0
        and pg_catalog.length(pg_catalog.btrim(custom_category)) <= 80
      )
      or
      (
        category <> 'OTHER'::public.expense_category
        and custom_category is null
      )
    ),

  constraint shift_expenses_void_consistent
    check (
      (
        voided_at is null
        and voided_by is null
        and voided_by_role is null
        and void_reason is null
      )
      or
      (
        voided_at is not null
        and voided_by is not null
        and voided_by_role is not null
        and void_reason is not null
        and pg_catalog.length(pg_catalog.btrim(void_reason)) > 0
        and pg_catalog.length(pg_catalog.btrim(void_reason)) <= 300
        and voided_at >= recorded_at
      )
    )
);

comment on table public.shift_expenses is
  'Operational expenses paid from physical cash during a shift. Expenses are immutable except for explicit voiding.';

comment on column public.shift_expenses.shift_id is
  'Shift during which cash was taken from the register.';

comment on column public.shift_expenses.recorded_by is
  'User who registered the expense.';

comment on column public.shift_expenses.recorded_by_role is
  'Snapshot of the user role when the expense was recorded.';

comment on column public.shift_expenses.category is
  'SUPPLIES, CLEANING or OTHER.';

comment on column public.shift_expenses.custom_category is
  'Required only when category is OTHER.';

comment on column public.shift_expenses.description is
  'Short explanation of why the operational expense occurred.';

comment on column public.shift_expenses.amount is
  'Cash amount removed from the register. Does not reduce business sales.';

comment on column public.shift_expenses.voided_at is
  'Timestamp when an incorrect expense was explicitly voided.';

comment on column public.shift_expenses.void_reason is
  'Mandatory explanation when an expense is voided.';


-- ============================================================================
-- 3. INDEXES
-- ============================================================================

create index idx_shift_expenses_shift_recorded_at
  on public.shift_expenses (shift_id, recorded_at);

create index idx_shift_expenses_active_shift
  on public.shift_expenses (shift_id)
  where voided_at is null;

create index idx_shift_expenses_recorded_by
  on public.shift_expenses (recorded_by);

create index idx_shift_expenses_voided_by
  on public.shift_expenses (voided_by)
  where voided_by is not null;


-- ============================================================================
-- 4. RLS / TABLE PRIVILEGES
-- ============================================================================

alter table public.shift_expenses enable row level security;

revoke all
on table public.shift_expenses
from public, anon, authenticated;

grant select, insert, update
on table public.shift_expenses
to service_role;


-- ============================================================================
-- 5. SHIFT CLOSURE SNAPSHOTS
-- ============================================================================
--
-- These values count only expenses that were NOT voided when the shift closes.
-- Detailed expense history remains normalized in shift_expenses.
-- ============================================================================

alter table public.shift_closures
  add column operational_expenses_count integer not null default 0,
  add column operational_expenses_total numeric(10, 2) not null default 0;

alter table public.shift_closures
  add constraint shift_closures_operational_expenses_count_non_negative
    check (operational_expenses_count >= 0),
  add constraint shift_closures_operational_expenses_total_non_negative
    check (operational_expenses_total >= 0);

comment on column public.shift_closures.operational_expenses_count is
  'Snapshot count of non-voided operational expenses recorded during the shift.';

comment on column public.shift_closures.operational_expenses_total is
  'Snapshot total of non-voided operational cash expenses. Kept separate from business sales.';


-- ============================================================================
-- 6. CASH RECONCILIATION
-- ============================================================================
--
-- Before:
--
-- expected_cash =
--   opening_cash_snapshot
--   + cash_sales_expected
--
-- Now:
--
-- expected_cash =
--   opening_cash_snapshot
--   + cash_sales_expected
--   - cash_expenses_snapshot
--
-- Expenses NEVER reduce business sales.
-- They only explain legitimate physical cash outflows.
-- ============================================================================

alter table public.cash_reconciliations
  add column cash_expenses_snapshot numeric(10, 2) not null default 0;

alter table public.cash_reconciliations
  add constraint cash_reconciliations_cash_expenses_snapshot_non_negative
    check (cash_expenses_snapshot >= 0);

comment on column public.cash_reconciliations.cash_expenses_snapshot is
  'Snapshot of non-voided operational cash expenses from the shift. Subtracted from expected physical cash.';


-- These generated columns currently have no external dependencies.
-- Recreate them with the expense-aware formulas.

alter table public.cash_reconciliations
  drop column cash_difference,
  drop column expected_cash;

alter table public.cash_reconciliations
  add column expected_cash numeric
    generated always as (
      opening_cash_snapshot
      + cash_sales_expected
      - cash_expenses_snapshot
    ) stored,

  add column cash_difference numeric
    generated always as (
      counted_cash
      - (
          opening_cash_snapshot
          + cash_sales_expected
          - cash_expenses_snapshot
        )
    ) stored;

comment on column public.cash_reconciliations.expected_cash is
  'Generated expected physical cash: opening cash + cash sales - non-voided operational cash expenses.';

comment on column public.cash_reconciliations.cash_difference is
  'Generated difference: counted physical cash minus expected cash after operational expenses.';


-- ============================================================================
-- 7. RPC: RECORD SHIFT EXPENSE
-- ============================================================================
--
-- The caller does NOT choose the shift.
-- The function resolves the single currently OPEN shift.
--
-- Node/API remains responsible for capability authorization.
-- PostgreSQL revalidates actor identity, actor role, active status and domain
-- integrity.
-- ============================================================================

create or replace function public.logistics_record_shift_expense(
  p_actor_id uuid,
  p_actor_role public.user_role,
  p_category public.expense_category,
  p_custom_category text,
  p_description text,
  p_amount numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();

  v_shift_id uuid;

  v_custom_category text :=
    pg_catalog.nullif(pg_catalog.btrim(p_custom_category), '');

  v_description text :=
    pg_catalog.nullif(pg_catalog.btrim(p_description), '');

  v_expense_id uuid;
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

  if p_category is null then
    raise exception using
      errcode = 'P0001',
      message = 'EXPENSE_CATEGORY_REQUIRED';
  end if;

  if v_description is null
     or pg_catalog.length(v_description) > 300 then
    raise exception using
      errcode = 'P0001',
      message = 'EXPENSE_DESCRIPTION_INVALID';
  end if;

  if p_amount is null
     or p_amount <= 0
     or p_amount > 99999999.99
     or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using
      errcode = 'P0001',
      message = 'EXPENSE_AMOUNT_INVALID';
  end if;

  if p_category = 'OTHER'::public.expense_category then
    if v_custom_category is null
       or pg_catalog.length(v_custom_category) > 80 then
      raise exception using
        errcode = 'P0001',
        message = 'EXPENSE_CUSTOM_CATEGORY_REQUIRED';
    end if;
  elsif v_custom_category is not null then
    raise exception using
      errcode = 'P0001',
      message = 'EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED';
  end if;


  -- --------------------------------------------------------------------------
  -- Current shift
  --
  -- FOR SHARE stabilizes the OPEN shift while the expense is being recorded.
  -- Future shift-closing logic must obtain a conflicting lock before closing.
  -- --------------------------------------------------------------------------

  select shift.id
  into v_shift_id
  from public.shifts as shift
  where shift.status = 'OPEN'::public.shift_status
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_OPEN';
  end if;


  -- --------------------------------------------------------------------------
  -- Expense
  -- --------------------------------------------------------------------------

  insert into public.shift_expenses (
    shift_id,
    recorded_by,
    recorded_by_role,
    category,
    custom_category,
    description,
    amount,
    recorded_at
  )
  values (
    v_shift_id,
    p_actor_id,
    p_actor_role,
    p_category,
    v_custom_category,
    v_description,
    p_amount,
    v_now
  )
  returning id into v_expense_id;


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
    'SHIFT_EXPENSE_RECORDED',
    'SHIFT_EXPENSE',
    v_expense_id,
    v_shift_id,
    null,
    pg_catalog.jsonb_build_object(
      'category', p_category,
      'customCategory', v_custom_category,
      'description', v_description,
      'amount', p_amount
    ),
    v_now
  );


  return pg_catalog.jsonb_build_object(
    'id', v_expense_id,
    'shiftId', v_shift_id,
    'category', p_category,
    'customCategory', v_custom_category,
    'description', v_description,
    'amount', p_amount,
    'recordedAt', v_now,
    'voided', false
  );
end;
$function$;


-- ============================================================================
-- 8. RPC: VOID SHIFT EXPENSE
-- ============================================================================
--
-- Expenses are never deleted.
--
-- An incorrect expense can only be voided while its shift remains OPEN.
-- Once the shift closes, the expense history is immutable.
-- ============================================================================

create or replace function public.logistics_void_shift_expense(
  p_expense_id uuid,
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

  v_reason text :=
    pg_catalog.nullif(pg_catalog.btrim(p_reason), '');

  v_shift_id uuid;
  v_shift_status public.shift_status;

  v_category public.expense_category;
  v_custom_category text;
  v_description text;
  v_amount numeric(10, 2);
  v_voided_at timestamptz;
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

  if p_expense_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_EXPENSE_NOT_FOUND';
  end if;

  if v_reason is null
     or pg_catalog.length(v_reason) > 300 then
    raise exception using
      errcode = 'P0001',
      message = 'EXPENSE_VOID_REASON_REQUIRED';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock expense
  -- --------------------------------------------------------------------------

  select
    expense.shift_id,
    expense.category,
    expense.custom_category,
    expense.description,
    expense.amount,
    expense.voided_at
  into
    v_shift_id,
    v_category,
    v_custom_category,
    v_description,
    v_amount,
    v_voided_at
  from public.shift_expenses as expense
  where expense.id = p_expense_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_EXPENSE_NOT_FOUND';
  end if;

  if v_voided_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_EXPENSE_ALREADY_VOIDED';
  end if;


  -- --------------------------------------------------------------------------
  -- The expense can only be voided while its original shift remains OPEN.
  -- --------------------------------------------------------------------------

  select shift.status
  into v_shift_status
  from public.shifts as shift
  where shift.id = v_shift_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_FOUND';
  end if;

  if v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'EXPENSE_SHIFT_CLOSED';
  end if;


  -- --------------------------------------------------------------------------
  -- Void
  -- --------------------------------------------------------------------------

  update public.shift_expenses as expense
  set
    voided_at = v_now,
    voided_by = p_actor_id,
    voided_by_role = p_actor_role,
    void_reason = v_reason
  where expense.id = p_expense_id
    and expense.voided_at is null;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_EXPENSE_CHANGED';
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
    'SHIFT_EXPENSE_VOIDED',
    'SHIFT_EXPENSE',
    p_expense_id,
    v_shift_id,
    null,
    pg_catalog.jsonb_build_object(
      'category', v_category,
      'customCategory', v_custom_category,
      'description', v_description,
      'amount', v_amount,
      'reason', v_reason
    ),
    v_now
  );


  return pg_catalog.jsonb_build_object(
    'id', p_expense_id,
    'shiftId', v_shift_id,
    'category', v_category,
    'customCategory', v_custom_category,
    'description', v_description,
    'amount', v_amount,
    'voided', true,
    'voidedAt', v_now,
    'voidReason', v_reason
  );
end;
$function$;


-- ============================================================================
-- 9. RPC PRIVILEGES
-- ============================================================================

revoke execute on function public.logistics_record_shift_expense(
  uuid,
  public.user_role,
  public.expense_category,
  text,
  text,
  numeric
) from public, anon, authenticated;

revoke execute on function public.logistics_void_shift_expense(
  uuid,
  text,
  uuid,
  public.user_role
) from public, anon, authenticated;


grant execute on function public.logistics_record_shift_expense(
  uuid,
  public.user_role,
  public.expense_category,
  text,
  text,
  numeric
) to service_role;

grant execute on function public.logistics_void_shift_expense(
  uuid,
  text,
  uuid,
  public.user_role
) to service_role;


comment on function public.logistics_record_shift_expense(
  uuid,
  public.user_role,
  public.expense_category,
  text,
  text,
  numeric
) is
  'Atomically records an operational cash expense for the currently open shift and writes its audit event.';

comment on function public.logistics_void_shift_expense(
  uuid,
  text,
  uuid,
  public.user_role
) is
  'Atomically voids an incorrect expense while its shift is open and writes its audit event.';


-- ============================================================================
-- END
-- ============================================================================