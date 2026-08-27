-- ============================================================================
-- KUCHI'S LOGISTICO V1
-- Fix reconciliation serialization without requiring UPDATE on shift_closures
-- ============================================================================
--
-- shift_closures is an immutable historical snapshot and intentionally does
-- not grant UPDATE to service_role.
--
-- Reconciliation is serialized by locking the parent shifts row instead.
-- The closure snapshot is then read normally.
--
-- No signatures, financial rules, reconciliation semantics, grants, tables,
-- constraints or triggers are changed.
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
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');

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

  -- Main serialization barrier for reconciliation attempts.
  --
  -- service_role already has UPDATE privilege on shifts, and this row belongs
  -- to the same business aggregate as the immutable closure snapshot.
  -- Concurrent reconciliations for the same shift therefore serialize here.
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

  if v_shift_status <> 'CLOSED'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_CLOSED';
  end if;

  -- shift_closures is immutable. Read the snapshot without FOR UPDATE so the
  -- service_role does not require UPDATE privilege on this historical table.
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
  where closure.shift_id = p_shift_id;

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