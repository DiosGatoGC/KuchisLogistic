-- ============================================================================
-- KUCHI'S LOGISTICO
-- Transactional operations for catalog, orders, preparation and transfers
-- ============================================================================
--
-- Each function is invoked as one PostgREST RPC statement. PostgreSQL executes
-- the complete function call in one transaction, so every unhandled exception
-- rolls back all writes performed by that call.
--
-- Security model:
--   * SECURITY INVOKER
--   * empty search_path
--   * schema-qualified application objects
--   * callable only by service_role
--   * actor identity and role revalidated against public.profiles
-- ============================================================================


-- ============================================================================
-- 1. CREATE ORDER
--
-- p_items shape (snapshots are deliberately not accepted):
-- [
--   {
--     "productId": "uuid",
--     "quantity": 2,
--     "notes": "optional",
--     "additions": [
--       { "productId": "uuid", "quantityPerItem": 1 }
--     ]
--   }
-- ]
-- ============================================================================

create or replace function public.logistics_create_order(
  p_service_session_id uuid,
  p_actor_id uuid,
  p_actor_role public.user_role,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_session_status public.session_status;
  v_shift_id uuid;
  v_shift_status public.shift_status;
  v_sequence_number integer;
  v_order_id uuid;
  v_order_item_id uuid;
  v_item jsonb;
  v_line_number integer;
  v_product_id uuid;
  v_product_name text;
  v_product_price numeric(10, 2);
  v_product_station public.preparation_station;
  v_product_allows_additions boolean;
  v_product_is_active boolean;
  v_product_is_available boolean;
  v_category_is_active boolean;
  v_product_category_slug text;
  v_quantity integer;
  v_item_notes text;
  v_additions jsonb;
  v_addition jsonb;
  v_addition_id uuid;
  v_addition_name text;
  v_addition_price numeric(10, 2);
  v_addition_station public.preparation_station;
  v_addition_product_active boolean;
  v_addition_product_available boolean;
  v_addition_category_active boolean;
  v_addition_category_slug text;
  v_quantity_per_item integer;
  v_seen_addition_ids uuid[];
  v_item_count integer := 0;
  v_product_units integer := 0;
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

  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEMS_REQUIRED';
  end if;

  -- Serializes sequence_number allocation for this service session.
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

  if v_session_status <> 'OPEN'::public.session_status then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_OPEN';
  end if;

  if v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_OPEN';
  end if;

  select pg_catalog.coalesce(pg_catalog.max(existing_order.sequence_number), 0) + 1
  into v_sequence_number
  from public.orders as existing_order
  where existing_order.service_session_id = p_service_session_id;

  insert into public.orders (
    service_session_id,
    created_by,
    created_by_role,
    sequence_number,
    notes,
    created_at,
    sent_at
  )
  values (
    p_service_session_id,
    p_actor_id,
    p_actor_role,
    v_sequence_number,
    pg_catalog.nullif(pg_catalog.btrim(p_notes), ''),
    v_now,
    v_now
  )
  returning id into v_order_id;

  for v_item, v_line_number in
    select request_item.value, request_item.ordinality::integer
    from pg_catalog.jsonb_array_elements(p_items)
      with ordinality as request_item(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_INVALID';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_item) as item_key(key_name)
      where item_key.key_name not in (
        'productId',
        'quantity',
        'notes',
        'additions'
      )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_FIELDS_INVALID';
    end if;

    if not (v_item ? 'productId')
       or pg_catalog.jsonb_typeof(v_item -> 'productId') <> 'string'
       or not (v_item ? 'quantity')
       or pg_catalog.jsonb_typeof(v_item -> 'quantity') <> 'number' then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_INVALID';
    end if;

    if (v_item ? 'notes')
       and pg_catalog.jsonb_typeof(v_item -> 'notes') not in ('string', 'null') then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_NOTES_INVALID';
    end if;

    begin
      v_product_id := (v_item ->> 'productId')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using
          errcode = 'P0001',
          message = 'ORDER_ITEM_INVALID';
    end;

    if v_quantity <= 0 then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_QUANTITY_INVALID';
    end if;

    v_item_notes := pg_catalog.nullif(
      pg_catalog.btrim(v_item ->> 'notes'),
      ''
    );

    if v_item ? 'additions' then
      v_additions := v_item -> 'additions';
    else
      v_additions := '[]'::jsonb;
    end if;

    if pg_catalog.jsonb_typeof(v_additions) <> 'array' then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_ADDITIONS_INVALID';
    end if;

    -- FOR SHARE keeps catalog snapshots stable until this RPC completes and
    -- conflicts with availability/name/price updates to these rows.
    select
      product.name,
      product.price,
      product.preparation_station,
      product.allows_additions,
      product.is_active,
      product.is_available,
      category.is_active,
      category.slug
    into
      v_product_name,
      v_product_price,
      v_product_station,
      v_product_allows_additions,
      v_product_is_active,
      v_product_is_available,
      v_category_is_active,
      v_product_category_slug
    from public.products as product
    join public.categories as category
      on category.id = product.category_id
    where product.id = v_product_id
    for share of product, category;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'PRODUCT_NOT_FOUND';
    end if;

    if not v_product_is_active or not v_category_is_active then
      raise exception using
        errcode = 'P0001',
        message = 'PRODUCT_INACTIVE';
    end if;

    if not v_product_is_available then
      raise exception using
        errcode = 'P0001',
        message = 'PRODUCT_UNAVAILABLE';
    end if;

    if v_product_category_slug = 'adicionales'
       or v_product_station is null then
      raise exception using
        errcode = 'P0001',
        message = 'PRODUCT_NOT_ORDERABLE';
    end if;

    if pg_catalog.jsonb_array_length(v_additions) > 0
       and (
         not v_product_allows_additions
         or v_product_category_slug in ('bebidas', 'porciones')
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'PRODUCT_ADDITIONS_NOT_ALLOWED';
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price,
      quantity,
      notes,
      status,
      created_at,
      line_number,
      preparation_station,
      updated_at,
      current_service_session_id
    )
    values (
      v_order_id,
      v_product_id,
      v_product_name,
      v_product_price,
      v_quantity,
      v_item_notes,
      'PENDING'::public.order_item_status,
      v_now,
      v_line_number,
      v_product_station,
      v_now,
      p_service_session_id
    )
    returning id into v_order_item_id;

    v_seen_addition_ids := '{}'::uuid[];

    for v_addition in
      select requested_addition.value
      from pg_catalog.jsonb_array_elements(v_additions)
        as requested_addition(value)
    loop
      if pg_catalog.jsonb_typeof(v_addition) <> 'object' then
        raise exception using
          errcode = 'P0001',
          message = 'ORDER_ITEM_ADDITION_INVALID';
      end if;

      if exists (
        select 1
        from pg_catalog.jsonb_object_keys(v_addition)
          as addition_key(key_name)
        where addition_key.key_name not in (
          'productId',
          'quantityPerItem'
        )
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'ORDER_ITEM_ADDITION_FIELDS_INVALID';
      end if;

      if not (v_addition ? 'productId')
         or pg_catalog.jsonb_typeof(v_addition -> 'productId') <> 'string'
         or not (v_addition ? 'quantityPerItem')
         or pg_catalog.jsonb_typeof(v_addition -> 'quantityPerItem') <> 'number' then
        raise exception using
          errcode = 'P0001',
          message = 'ORDER_ITEM_ADDITION_INVALID';
      end if;

      begin
        v_addition_id := (v_addition ->> 'productId')::uuid;
        v_quantity_per_item :=
          (v_addition ->> 'quantityPerItem')::integer;
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          raise exception using
            errcode = 'P0001',
            message = 'ORDER_ITEM_ADDITION_INVALID';
      end;

      if v_quantity_per_item <= 0 then
        raise exception using
          errcode = 'P0001',
          message = 'ADDITION_QUANTITY_INVALID';
      end if;

      if v_addition_id = any(v_seen_addition_ids) then
        raise exception using
          errcode = 'P0001',
          message = 'ADDITION_DUPLICATED';
      end if;

      v_seen_addition_ids := pg_catalog.array_append(
        v_seen_addition_ids,
        v_addition_id
      );

      select
        addition.name,
        addition.price,
        addition.preparation_station,
        addition.is_active,
        addition.is_available,
        category.is_active,
        category.slug
      into
        v_addition_name,
        v_addition_price,
        v_addition_station,
        v_addition_product_active,
        v_addition_product_available,
        v_addition_category_active,
        v_addition_category_slug
      from public.products as addition
      join public.categories as category
        on category.id = addition.category_id
      where addition.id = v_addition_id
      for share of addition, category;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = 'ADDITION_NOT_FOUND';
      end if;

      if not v_addition_product_active
         or not v_addition_product_available
         or not v_addition_category_active
         or v_addition_category_slug <> 'adicionales'
         or v_addition_station is not null then
        raise exception using
          errcode = 'P0001',
          message = 'ADDITION_INVALID';
      end if;

      insert into public.order_item_additions (
        order_item_id,
        product_id,
        addition_name,
        unit_price,
        quantity_per_item,
        created_at
      )
      values (
        v_order_item_id,
        v_addition_id,
        v_addition_name,
        v_addition_price,
        v_quantity_per_item,
        v_now
      );
    end loop;

    v_item_count := v_item_count + 1;
    v_product_units := v_product_units + v_quantity;
  end loop;

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
    'ORDER_CREATED',
    'ORDER',
    v_order_id,
    v_shift_id,
    p_service_session_id,
    pg_catalog.jsonb_build_object(
      'sequenceNumber', v_sequence_number,
      'itemLines', v_item_count,
      'productUnits', v_product_units
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'id', v_order_id,
    'serviceSessionId', p_service_session_id,
    'sequenceNumber', v_sequence_number,
    'sentAt', v_now,
    'itemLines', v_item_count,
    'productUnits', v_product_units
  );
end;
$function$;


-- ============================================================================
-- 2. TRANSFER A COMPLETE SERVICE SESSION
-- ============================================================================

create or replace function public.logistics_transfer_service_session(
  p_service_session_id uuid,
  p_to_service_point_id uuid,
  p_actor_id uuid,
  p_actor_role public.user_role,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_reason text := pg_catalog.nullif(pg_catalog.btrim(p_reason), '');
  v_from_service_point_id uuid;
  v_from_service_point_name text;
  v_to_service_point_name text;
  v_to_service_point_active boolean;
  v_session_status public.session_status;
  v_shift_id uuid;
  v_shift_status public.shift_status;
  v_occupied_session_id uuid;
  v_transfer_id uuid;
  v_updated_count integer;
begin
  if p_actor_id is null or p_actor_role is null then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_actor_id
    and profile.role = p_actor_role
    and profile.is_active = true
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  if p_service_session_id is null or p_to_service_point_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'TRANSFER_INPUT_INVALID';
  end if;

  -- Lock the session first. All service-point locks are acquired afterwards
  -- in UUID order by every transfer function.
  select
    session.service_point_id,
    session.status,
    session.shift_id,
    shift.status
  into
    v_from_service_point_id,
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

  if v_session_status not in (
    'OPEN'::public.session_status,
    'AWAITING_PAYMENT'::public.session_status
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_ACTIVE';
  end if;

  if v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_OPEN';
  end if;

  if v_from_service_point_id = p_to_service_point_id then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_POINT_SAME_AS_ORIGIN';
  end if;

  perform service_point.id
  from public.service_points as service_point
  where service_point.id in (
    v_from_service_point_id,
    p_to_service_point_id
  )
  order by service_point.id
  for update;

  select service_point.name
  into v_from_service_point_name
  from public.service_points as service_point
  where service_point.id = v_from_service_point_id;

  select
    service_point.name,
    service_point.is_active
  into
    v_to_service_point_name,
    v_to_service_point_active
  from public.service_points as service_point
  where service_point.id = p_to_service_point_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_POINT_NOT_FOUND';
  end if;

  if not v_to_service_point_active then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_POINT_INACTIVE';
  end if;

  select destination_session.id
  into v_occupied_session_id
  from public.service_sessions as destination_session
  where destination_session.service_point_id = p_to_service_point_id
    and destination_session.id <> p_service_session_id
    and destination_session.status in (
      'OPEN'::public.session_status,
      'AWAITING_PAYMENT'::public.session_status
    )
  order by destination_session.id
  limit 1;

  if v_occupied_session_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_POINT_OCCUPIED';
  end if;

  begin
    update public.service_sessions as session
    set service_point_id = p_to_service_point_id
    where session.id = p_service_session_id
      and session.service_point_id = v_from_service_point_id
      and session.status = v_session_status;

    get diagnostics v_updated_count = row_count;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'SERVICE_POINT_OCCUPIED';
  end;

  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_CHANGED';
  end if;

  insert into public.service_session_transfers (
    service_session_id,
    from_service_point_id,
    to_service_point_id,
    from_service_point_name,
    to_service_point_name,
    transferred_by,
    transferred_by_role,
    reason,
    transferred_at
  )
  values (
    p_service_session_id,
    v_from_service_point_id,
    p_to_service_point_id,
    v_from_service_point_name,
    v_to_service_point_name,
    p_actor_id,
    p_actor_role,
    v_reason,
    v_now
  )
  returning id into v_transfer_id;

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
    'SERVICE_SESSION_TRANSFERRED',
    'SERVICE_SESSION',
    p_service_session_id,
    v_shift_id,
    p_service_session_id,
    pg_catalog.jsonb_build_object(
      'transferId', v_transfer_id,
      'fromServicePointId', v_from_service_point_id,
      'fromServicePointName', v_from_service_point_name,
      'toServicePointId', p_to_service_point_id,
      'toServicePointName', v_to_service_point_name,
      'reason', v_reason
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'serviceSessionId', p_service_session_id,
    'transferId', v_transfer_id,
    'fromServicePointId', v_from_service_point_id,
    'fromServicePointName', v_from_service_point_name,
    'toServicePointId', p_to_service_point_id,
    'toServicePointName', v_to_service_point_name,
    'transferredAt', v_now
  );
end;
$function$;


-- ============================================================================
-- 3. TRANSFER A COMPLETE OR PARTIAL ORDER ITEM
-- ============================================================================

create or replace function public.logistics_transfer_order_item(
  p_order_item_id uuid,
  p_to_service_session_id uuid,
  p_quantity integer,
  p_actor_id uuid,
  p_actor_role public.user_role,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_reason text := pg_catalog.nullif(pg_catalog.btrim(p_reason), '');
  v_item public.order_items%rowtype;
  v_from_session_status public.session_status;
  v_to_session_status public.session_status;
  v_from_shift_id uuid;
  v_to_shift_id uuid;
  v_from_shift_status public.shift_status;
  v_to_shift_status public.shift_status;
  v_from_service_point_id uuid;
  v_to_service_point_id uuid;
  v_from_service_point_name text;
  v_to_service_point_name text;
  v_to_service_point_active boolean;
  v_locked_session_count integer;
  v_new_line_number integer;
  v_transferred_item_id uuid;
  v_transfer_id uuid;
  v_remaining_quantity integer;
  v_updated_count integer;
  v_is_split boolean;
begin
  if p_actor_id is null or p_actor_role is null then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_actor_id
    and profile.role = p_actor_role
    and profile.is_active = true
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  if p_order_item_id is null
     or p_to_service_session_id is null
     or p_quantity is null
     or p_quantity <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'TRANSFER_INPUT_INVALID';
  end if;

  -- First lock the mutable item, then its immutable original order. Locking
  -- the order serializes MAX(line_number) allocation for partial splits.
  select order_item.*
  into v_item
  from public.order_items as order_item
  where order_item.id = p_order_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_ITEM_NOT_FOUND';
  end if;

  perform original_order.id
  from public.orders as original_order
  where original_order.id = v_item.order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;

  if v_item.status = 'CANCELLED'::public.order_item_status then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_CANCELLED';
  end if;

  if p_quantity > v_item.quantity then
    raise exception using
      errcode = 'P0001',
      message = 'TRANSFER_QUANTITY_EXCEEDS_AVAILABLE';
  end if;

  if v_item.current_service_session_id = p_to_service_session_id then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_SAME_AS_ORIGIN';
  end if;

  -- Lock both sessions in UUID order regardless of transfer direction.
  perform session.id
  from public.service_sessions as session
  where session.id in (
    v_item.current_service_session_id,
    p_to_service_session_id
  )
  order by session.id
  for update;

  get diagnostics v_locked_session_count = row_count;

  if v_locked_session_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_FOUND';
  end if;

  select
    session.status,
    session.shift_id,
    shift.status,
    session.service_point_id
  into
    v_from_session_status,
    v_from_shift_id,
    v_from_shift_status,
    v_from_service_point_id
  from public.service_sessions as session
  join public.shifts as shift
    on shift.id = session.shift_id
  where session.id = v_item.current_service_session_id;

  select
    session.status,
    session.shift_id,
    shift.status,
    session.service_point_id
  into
    v_to_session_status,
    v_to_shift_id,
    v_to_shift_status,
    v_to_service_point_id
  from public.service_sessions as session
  join public.shifts as shift
    on shift.id = session.shift_id
  where session.id = p_to_service_session_id;

  if v_from_session_status not in (
       'OPEN'::public.session_status,
       'AWAITING_PAYMENT'::public.session_status
     )
     or v_to_session_status not in (
       'OPEN'::public.session_status,
       'AWAITING_PAYMENT'::public.session_status
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_ACTIVE';
  end if;

  if v_from_shift_id <> v_to_shift_id then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSIONS_DIFFERENT_SHIFT';
  end if;

  if v_from_shift_status <> 'OPEN'::public.shift_status
     or v_to_shift_status <> 'OPEN'::public.shift_status then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_OPEN';
  end if;

  if v_from_service_point_id = v_to_service_point_id then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_POINT_SAME_AS_ORIGIN';
  end if;

  -- Preserve service-point name snapshots while the transfer is recorded.
  perform service_point.id
  from public.service_points as service_point
  where service_point.id in (
    v_from_service_point_id,
    v_to_service_point_id
  )
  order by service_point.id
  for share;

  select service_point.name
  into v_from_service_point_name
  from public.service_points as service_point
  where service_point.id = v_from_service_point_id;

  select
    service_point.name,
    service_point.is_active
  into
    v_to_service_point_name,
    v_to_service_point_active
  from public.service_points as service_point
  where service_point.id = v_to_service_point_id;

  if not v_to_service_point_active then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_POINT_INACTIVE';
  end if;

  v_is_split := p_quantity < v_item.quantity;

  if not v_is_split then
    update public.order_items as order_item
    set current_service_session_id = p_to_service_session_id
    where order_item.id = p_order_item_id
      and order_item.current_service_session_id =
        v_item.current_service_session_id
      and order_item.quantity = v_item.quantity
      and order_item.status = v_item.status;

    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_CHANGED';
    end if;

    v_transferred_item_id := p_order_item_id;
    v_remaining_quantity := 0;
  else
    select pg_catalog.coalesce(pg_catalog.max(order_item.line_number), 0) + 1
    into v_new_line_number
    from public.order_items as order_item
    where order_item.order_id = v_item.order_id;

    update public.order_items as order_item
    set quantity = order_item.quantity - p_quantity
    where order_item.id = p_order_item_id
      and order_item.current_service_session_id =
        v_item.current_service_session_id
      and order_item.quantity = v_item.quantity
      and order_item.status = v_item.status;

    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_CHANGED';
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price,
      quantity,
      notes,
      status,
      cancelled_by,
      cancellation_reason,
      created_at,
      line_number,
      preparation_station,
      updated_at,
      preparing_at,
      ready_at,
      delivered_at,
      cancelled_at,
      cancelled_from_status,
      current_service_session_id,
      cancelled_by_role
    )
    values (
      v_item.order_id,
      v_item.product_id,
      v_item.product_name,
      v_item.unit_price,
      p_quantity,
      v_item.notes,
      v_item.status,
      null,
      null,
      v_item.created_at,
      v_new_line_number,
      v_item.preparation_station,
      v_now,
      v_item.preparing_at,
      v_item.ready_at,
      v_item.delivered_at,
      null,
      null,
      p_to_service_session_id,
      null
    )
    returning id into v_transferred_item_id;

    insert into public.order_item_additions (
      order_item_id,
      product_id,
      addition_name,
      unit_price,
      quantity_per_item,
      created_at
    )
    select
      v_transferred_item_id,
      addition.product_id,
      addition.addition_name,
      addition.unit_price,
      addition.quantity_per_item,
      addition.created_at
    from public.order_item_additions as addition
    where addition.order_item_id = p_order_item_id
    order by addition.id;

    v_remaining_quantity := v_item.quantity - p_quantity;
  end if;

  insert into public.order_item_transfers (
    order_item_id,
    from_service_session_id,
    to_service_session_id,
    from_service_point_id,
    to_service_point_id,
    from_service_point_name,
    to_service_point_name,
    quantity,
    status_at_transfer,
    transferred_by,
    transferred_by_role,
    reason,
    transferred_at
  )
  values (
    v_transferred_item_id,
    v_item.current_service_session_id,
    p_to_service_session_id,
    v_from_service_point_id,
    v_to_service_point_id,
    v_from_service_point_name,
    v_to_service_point_name,
    p_quantity,
    v_item.status,
    p_actor_id,
    p_actor_role,
    v_reason,
    v_now
  )
  returning id into v_transfer_id;

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
    'ORDER_ITEM_TRANSFERRED',
    'ORDER_ITEM',
    v_transferred_item_id,
    v_to_shift_id,
    p_to_service_session_id,
    pg_catalog.jsonb_build_object(
      'transferId', v_transfer_id,
      'sourceOrderItemId', p_order_item_id,
      'orderId', v_item.order_id,
      'quantity', p_quantity,
      'split', v_is_split,
      'fromServiceSessionId', v_item.current_service_session_id,
      'toServiceSessionId', p_to_service_session_id,
      'fromServicePointId', v_from_service_point_id,
      'toServicePointId', v_to_service_point_id,
      'reason', v_reason
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'orderItemId', v_transferred_item_id,
    'sourceOrderItemId', p_order_item_id,
    'transferId', v_transfer_id,
    'fromServiceSessionId', v_item.current_service_session_id,
    'toServiceSessionId', p_to_service_session_id,
    'quantity', p_quantity,
    'remainingQuantity', v_remaining_quantity,
    'split', v_is_split,
    'status', v_item.status,
    'transferredAt', v_now
  );
end;
$function$;


-- ============================================================================
-- 4. TRANSITION AN ORDER ITEM: START, READY OR DELIVER
-- ============================================================================

create or replace function public.logistics_transition_order_item(
  p_order_item_id uuid,
  p_action text,
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
  v_action text := pg_catalog.upper(pg_catalog.btrim(p_action));
  v_expected_status public.order_item_status;
  v_target_status public.order_item_status;
  v_audit_action text;
  v_current_status public.order_item_status;
  v_station public.preparation_station;
  v_current_service_session_id uuid;
  v_shift_id uuid;
  v_session_status public.session_status;
  v_shift_status public.shift_status;
  v_preparing_at timestamptz;
  v_ready_at timestamptz;
  v_delivered_at timestamptz;
begin
  if p_actor_id is null or p_actor_role is null then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_actor_id
    and profile.role = p_actor_role
    and profile.is_active = true
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  if p_order_item_id is null or p_action is null then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_TRANSITION_INVALID';
  end if;

  case v_action
    when 'START' then
      v_expected_status := 'PENDING'::public.order_item_status;
      v_target_status := 'PREPARING'::public.order_item_status;
      v_audit_action := 'ORDER_ITEM_STARTED';
    when 'READY' then
      v_expected_status := 'PREPARING'::public.order_item_status;
      v_target_status := 'READY'::public.order_item_status;
      v_audit_action := 'ORDER_ITEM_READY';
    when 'DELIVER' then
      v_expected_status := 'READY'::public.order_item_status;
      v_target_status := 'DELIVERED'::public.order_item_status;
      v_audit_action := 'ORDER_ITEM_DELIVERED';
    else
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_ITEM_TRANSITION_INVALID';
  end case;

  select
    order_item.status,
    order_item.preparation_station,
    order_item.current_service_session_id,
    order_item.preparing_at,
    order_item.ready_at,
    order_item.delivered_at
  into
    v_current_status,
    v_station,
    v_current_service_session_id,
    v_preparing_at,
    v_ready_at,
    v_delivered_at
  from public.order_items as order_item
  where order_item.id = p_order_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_ITEM_NOT_FOUND';
  end if;

  if v_current_status <> v_expected_status then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_TRANSITION_NOT_ALLOWED';
  end if;

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
  where session.id = v_current_service_session_id
  for share of session, shift;

  if v_session_status not in (
       'OPEN'::public.session_status,
       'AWAITING_PAYMENT'::public.session_status
     )
     or v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_ACTIVE';
  end if;

  update public.order_items as order_item
  set
    status = v_target_status,
    preparing_at = case
      when v_target_status = 'PREPARING'::public.order_item_status then v_now
      else order_item.preparing_at
    end,
    ready_at = case
      when v_target_status = 'READY'::public.order_item_status then v_now
      else order_item.ready_at
    end,
    delivered_at = case
      when v_target_status = 'DELIVERED'::public.order_item_status then v_now
      else order_item.delivered_at
    end
  where order_item.id = p_order_item_id
    and order_item.status = v_expected_status
  returning
    order_item.preparing_at,
    order_item.ready_at,
    order_item.delivered_at
  into
    v_preparing_at,
    v_ready_at,
    v_delivered_at;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_CHANGED';
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
    v_audit_action,
    'ORDER_ITEM',
    p_order_item_id,
    v_shift_id,
    v_current_service_session_id,
    pg_catalog.jsonb_build_object(
      'fromStatus', v_expected_status,
      'toStatus', v_target_status,
      'preparationStation', v_station
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'orderItemId', p_order_item_id,
    'status', v_target_status,
    'preparationStation', v_station,
    'preparingAt', v_preparing_at,
    'readyAt', v_ready_at,
    'deliveredAt', v_delivered_at
  );
end;
$function$;


-- ============================================================================
-- 5. CANCEL AN ORDER ITEM
-- ============================================================================

create or replace function public.logistics_cancel_order_item(
  p_order_item_id uuid,
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
  v_reason text := pg_catalog.nullif(pg_catalog.btrim(p_reason), '');
  v_previous_status public.order_item_status;
  v_current_service_session_id uuid;
  v_shift_id uuid;
  v_session_status public.session_status;
  v_shift_status public.shift_status;
begin
  if p_actor_id is null or p_actor_role is null then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_actor_id
    and profile.role = p_actor_role
    and profile.is_active = true
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  if p_order_item_id is null then
    raise exception using errcode = 'P0001', message = 'ORDER_ITEM_NOT_FOUND';
  end if;

  if v_reason is null then
    raise exception using
      errcode = 'P0001',
      message = 'CANCELLATION_REASON_REQUIRED';
  end if;

  select
    order_item.status,
    order_item.current_service_session_id
  into
    v_previous_status,
    v_current_service_session_id
  from public.order_items as order_item
  where order_item.id = p_order_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_ITEM_NOT_FOUND';
  end if;

  if v_previous_status = 'CANCELLED'::public.order_item_status then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_ALREADY_CANCELLED';
  end if;

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
  where session.id = v_current_service_session_id
  for share of session, shift;

  if v_session_status not in (
       'OPEN'::public.session_status,
       'AWAITING_PAYMENT'::public.session_status
     )
     or v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_ACTIVE';
  end if;

  update public.order_items as order_item
  set
    status = 'CANCELLED'::public.order_item_status,
    cancelled_by = p_actor_id,
    cancelled_by_role = p_actor_role,
    cancelled_at = v_now,
    cancellation_reason = v_reason,
    cancelled_from_status =
      v_previous_status::text::public.order_item_cancellation_origin_status
  where order_item.id = p_order_item_id
    and order_item.status = v_previous_status;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEM_CHANGED';
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
    'ORDER_ITEM_CANCELLED',
    'ORDER_ITEM',
    p_order_item_id,
    v_shift_id,
    v_current_service_session_id,
    pg_catalog.jsonb_build_object(
      'cancelledFromStatus', v_previous_status,
      'reason', v_reason
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'orderItemId', p_order_item_id,
    'status', 'CANCELLED',
    'cancelledFromStatus', v_previous_status,
    'cancelledAt', v_now,
    'cancellationReason', v_reason
  );
end;
$function$;


-- ============================================================================
-- 6. SET PRODUCT AVAILABILITY
-- ============================================================================

create or replace function public.logistics_set_product_availability(
  p_product_id uuid,
  p_is_available boolean,
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
  v_product_name text;
  v_product_is_active boolean;
  v_previous_is_available boolean;
  v_updated_at timestamptz;
  v_changed boolean;
begin
  if p_actor_id is null or p_actor_role is null then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_actor_id
    and profile.role = p_actor_role
    and profile.is_active = true
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTOR_INVALID';
  end if;

  if p_product_id is null or p_is_available is null then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_AVAILABILITY_INPUT_INVALID';
  end if;

  select
    product.name,
    product.is_active,
    product.is_available,
    product.updated_at
  into
    v_product_name,
    v_product_is_active,
    v_previous_is_available,
    v_updated_at
  from public.products as product
  where product.id = p_product_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND';
  end if;

  if not v_product_is_active then
    raise exception using errcode = 'P0001', message = 'PRODUCT_INACTIVE';
  end if;

  v_changed := v_previous_is_available is distinct from p_is_available;

  if v_changed then
    update public.products as product
    set is_available = p_is_available
    where product.id = p_product_id
      and product.is_available = v_previous_is_available
    returning product.updated_at into v_updated_at;

    if not found then
      raise exception using errcode = 'P0001', message = 'PRODUCT_CHANGED';
    end if;

    insert into public.audit_logs (
      user_id,
      actor_role,
      action,
      entity,
      entity_id,
      details,
      created_at
    )
    values (
      p_actor_id,
      p_actor_role,
      'CATALOG_AVAILABILITY_CHANGED',
      'PRODUCT',
      p_product_id,
      pg_catalog.jsonb_build_object(
        'productName', v_product_name,
        'fromIsAvailable', v_previous_is_available,
        'toIsAvailable', p_is_available
      ),
      v_now
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'id', p_product_id,
    'name', v_product_name,
    'isActive', v_product_is_active,
    'isAvailable', p_is_available,
    'changed', v_changed,
    'updatedAt', v_updated_at
  );
end;
$function$;


-- ============================================================================
-- FUNCTION PRIVILEGES
--
-- PostgreSQL grants EXECUTE to PUBLIC by default. Revoke every public/client
-- path explicitly, then grant only the backend Data API role.
-- ============================================================================

revoke execute on function public.logistics_create_order(
  uuid,
  uuid,
  public.user_role,
  text,
  jsonb
) from public, anon, authenticated;

revoke execute on function public.logistics_transfer_service_session(
  uuid,
  uuid,
  uuid,
  public.user_role,
  text
) from public, anon, authenticated;

revoke execute on function public.logistics_transfer_order_item(
  uuid,
  uuid,
  integer,
  uuid,
  public.user_role,
  text
) from public, anon, authenticated;

revoke execute on function public.logistics_transition_order_item(
  uuid,
  text,
  uuid,
  public.user_role
) from public, anon, authenticated;

revoke execute on function public.logistics_cancel_order_item(
  uuid,
  text,
  uuid,
  public.user_role
) from public, anon, authenticated;

revoke execute on function public.logistics_set_product_availability(
  uuid,
  boolean,
  uuid,
  public.user_role
) from public, anon, authenticated;


grant execute on function public.logistics_create_order(
  uuid,
  uuid,
  public.user_role,
  text,
  jsonb
) to service_role;

grant execute on function public.logistics_transfer_service_session(
  uuid,
  uuid,
  uuid,
  public.user_role,
  text
) to service_role;

grant execute on function public.logistics_transfer_order_item(
  uuid,
  uuid,
  integer,
  uuid,
  public.user_role,
  text
) to service_role;

grant execute on function public.logistics_transition_order_item(
  uuid,
  text,
  uuid,
  public.user_role
) to service_role;

grant execute on function public.logistics_cancel_order_item(
  uuid,
  text,
  uuid,
  public.user_role
) to service_role;

grant execute on function public.logistics_set_product_availability(
  uuid,
  boolean,
  uuid,
  public.user_role
) to service_role;


comment on function public.logistics_create_order(
  uuid,
  uuid,
  public.user_role,
  text,
  jsonb
) is
  'Atomically creates one order, its item/addition snapshots and audit log.';

comment on function public.logistics_transfer_service_session(
  uuid,
  uuid,
  uuid,
  public.user_role,
  text
) is
  'Atomically moves an active service session and records transfer history/audit.';

comment on function public.logistics_transfer_order_item(
  uuid,
  uuid,
  integer,
  uuid,
  public.user_role,
  text
) is
  'Atomically transfers a full item or splits a partial quantity with additions.';

comment on function public.logistics_transition_order_item(
  uuid,
  text,
  uuid,
  public.user_role
) is
  'Atomically applies START, READY or DELIVER and writes the audit event.';

comment on function public.logistics_cancel_order_item(
  uuid,
  text,
  uuid,
  public.user_role
) is
  'Atomically cancels a non-cancelled item with actor/status snapshots and audit.';

comment on function public.logistics_set_product_availability(
  uuid,
  boolean,
  uuid,
  public.user_role
) is
  'Atomically changes shared product availability and audits actual changes.';


-- ============================================================================
-- END
-- ============================================================================
