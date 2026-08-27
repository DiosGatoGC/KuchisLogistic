-- ============================================================================
-- KUCHI'S LOGISTICO V1
-- Fix invalid schema qualification of PostgreSQL conditional expressions
-- ============================================================================
--
-- Forward-only mechanical correction. COALESCE and NULLIF are PostgreSQL
-- conditional expressions, not schema-qualified pg_catalog functions.
-- Function signatures, security, search_path, locking, validation, financial
-- rules, audit behavior, Realtime payloads and related triggers are unchanged.
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

  select coalesce(pg_catalog.max(existing_order.sequence_number), 0) + 1
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
    nullif(pg_catalog.btrim(p_notes), ''),
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

    v_item_notes := nullif(
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
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
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
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
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
    select coalesce(pg_catalog.max(order_item.line_number), 0) + 1
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
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
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
    nullif(pg_catalog.btrim(p_custom_category), '');

  v_description text :=
    nullif(pg_catalog.btrim(p_description), '');

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
    nullif(pg_catalog.btrim(p_reason), '');

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

create or replace function public.logistics_pay_service_session(
  p_service_session_id uuid,
  p_method public.payment_method,
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

  v_session_status public.session_status;
  v_shift_id uuid;
  v_shift_status public.shift_status;

  v_business_amount numeric;
  v_fee_rate numeric(5, 4);
  v_fee_amount numeric;
  v_customer_total numeric;

  v_payment_id uuid;
  v_updated_count integer;
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

  if p_service_session_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_FOUND';
  end if;

  if p_method is null then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_METHOD_REQUIRED';
  end if;


  -- --------------------------------------------------------------------------
  -- Session serialization barrier
  -- --------------------------------------------------------------------------

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

  if v_session_status <> 'AWAITING_PAYMENT'::public.session_status then
    if exists (
      select 1
      from public.payments as existing_payment
      where existing_payment.service_session_id = p_service_session_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_ALREADY_EXISTS';
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_NOT_AWAITING_PAYMENT';
  end if;

  if v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_OPEN';
  end if;

  if exists (
    select 1
    from public.payments as existing_payment
    where existing_payment.service_session_id = p_service_session_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_ALREADY_EXISTS';
  end if;


  -- --------------------------------------------------------------------------
  -- Operational completion
  --
  -- A paid session is no longer active, so preparation RPCs cannot advance its
  -- items afterwards. Only delivered items (and cancelled items, which are not
  -- charged) may therefore pass this financial boundary.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.order_items as order_item
    where order_item.current_service_session_id = p_service_session_id
      and order_item.status not in (
        'DELIVERED'::public.order_item_status,
        'CANCELLED'::public.order_item_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEMS_NOT_DELIVERED';
  end if;


  -- --------------------------------------------------------------------------
  -- Current consumption from historical snapshots
  --
  -- order_id intentionally does not determine who pays. Transfers preserve the
  -- original order while current_service_session_id identifies current economic
  -- ownership.
  -- --------------------------------------------------------------------------

  select coalesce(
    pg_catalog.round(
      pg_catalog.sum(
        (
          order_item.unit_price
          + coalesce(additions.unit_total, 0)
        )
        * order_item.quantity
      ),
      2
    ),
    0
  )
  into v_business_amount
  from public.order_items as order_item
  left join lateral (
    select pg_catalog.sum(
      addition.unit_price * addition.quantity_per_item
    ) as unit_total
    from public.order_item_additions as addition
    where addition.order_item_id = order_item.id
  ) as additions on true
  where order_item.current_service_session_id = p_service_session_id
    and order_item.status <> 'CANCELLED'::public.order_item_status;

  if v_business_amount <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'NOTHING_TO_PAY';
  end if;

  if v_business_amount > 99999999.99 then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_INVALID';
  end if;


  -- --------------------------------------------------------------------------
  -- V1 financial rules
  -- --------------------------------------------------------------------------

  if p_method = 'CARD'::public.payment_method then
    v_fee_rate := 0.0500;
  else
    v_fee_rate := 0;
  end if;

  v_fee_amount := pg_catalog.round(v_business_amount * v_fee_rate, 2);
  v_customer_total := v_business_amount + v_fee_amount;

  if v_customer_total > 99999999.99 then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_INVALID';
  end if;


  -- --------------------------------------------------------------------------
  -- Payment
  -- --------------------------------------------------------------------------

  begin
    insert into public.payments (
      service_session_id,
      shift_id,
      received_by,
      received_by_role,
      method,
      business_amount,
      fee_rate,
      fee_amount,
      customer_total,
      paid_at
    )
    values (
      p_service_session_id,
      v_shift_id,
      p_actor_id,
      p_actor_role,
      p_method,
      v_business_amount,
      v_fee_rate,
      v_fee_amount,
      v_customer_total,
      v_now
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_ALREADY_EXISTS';
  end;


  -- --------------------------------------------------------------------------
  -- Session closure
  -- --------------------------------------------------------------------------

  update public.service_sessions as session
  set
    status = 'PAID'::public.session_status,
    closed_at = v_now,
    closed_by = p_actor_id,
    closed_by_role = p_actor_role
  where session.id = p_service_session_id
    and session.status = 'AWAITING_PAYMENT'::public.session_status;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_CHANGED';
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
    'PAYMENT_CONFIRMED',
    'PAYMENT',
    v_payment_id,
    v_shift_id,
    p_service_session_id,
    pg_catalog.jsonb_build_object(
      'method', p_method,
      'businessAmount', v_business_amount,
      'feeRate', v_fee_rate,
      'feeAmount', v_fee_amount,
      'customerTotal', v_customer_total
    ),
    v_now
  );


  return pg_catalog.jsonb_build_object(
    'paymentId', v_payment_id,
    'serviceSessionId', p_service_session_id,
    'shiftId', v_shift_id,
    'method', p_method,
    'businessAmount', v_business_amount,
    'feeRate', v_fee_rate,
    'feeAmount', v_fee_amount,
    'customerTotal', v_customer_total,
    'paidAt', v_now,
    'sessionStatus', 'PAID'
  );
end;
$function$;

create or replace function public.logistics_release_empty_service_session(
  p_service_session_id uuid,
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
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');

  v_session_status public.session_status;
  v_shift_id uuid;
  v_shift_status public.shift_status;
  v_business_amount numeric;
  v_updated_count integer;
begin
  -- Actor identity is revalidated even though capability authorization lives
  -- in Node.
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

  if v_reason is null then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_RELEASE_REASON_REQUIRED';
  end if;

  -- Session is the serialization barrier shared with payment and transfers.
  select
    session.status,
    session.shift_id
  into
    v_session_status,
    v_shift_id
  from public.service_sessions as session
  where session.id = p_service_session_id
  for update;

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

  -- This lock conflicts with shift closing and stabilizes the OPEN state until
  -- the session release commits.
  select shift.status
  into v_shift_status
  from public.shifts as shift
  where shift.id = v_shift_id
  for share;

  if not found
     or v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_NOT_OPEN';
  end if;

  if exists (
    select 1
    from public.payments as payment
    where payment.service_session_id = p_service_session_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_ALREADY_EXISTS';
  end if;

  -- Use current economic ownership and the same immutable price snapshots as
  -- checkout/payment. No order-item row lock is acquired.
  select coalesce(
    pg_catalog.round(
      pg_catalog.sum(
        (
          order_item.unit_price
          + coalesce(additions.unit_total, 0)
        )
        * order_item.quantity
      ),
      2
    ),
    0
  )
  into v_business_amount
  from public.order_items as order_item
  left join lateral (
    select pg_catalog.sum(
      addition.unit_price * addition.quantity_per_item
    ) as unit_total
    from public.order_item_additions as addition
    where addition.order_item_id = order_item.id
  ) as additions on true
  where order_item.current_service_session_id = p_service_session_id
    and order_item.status <> 'CANCELLED'::public.order_item_status;

  if v_business_amount <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_HAS_BILLABLE_ITEMS';
  end if;

  -- A zero-priced, non-cancelled item is still consumption and cannot be
  -- silently represented as a cancelled/empty session in V1.
  if exists (
    select 1
    from public.order_items as order_item
    where order_item.current_service_session_id = p_service_session_id
      and order_item.status <> 'CANCELLED'::public.order_item_status
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_HAS_UNCANCELLED_ITEMS';
  end if;

  update public.service_sessions as session
  set
    status = 'CANCELLED'::public.session_status,
    cancellation_reason = v_reason,
    closed_at = v_now,
    closed_by = p_actor_id,
    closed_by_role = p_actor_role
  where session.id = p_service_session_id
    and session.status = v_session_status;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SERVICE_SESSION_CHANGED';
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
    'SERVICE_SESSION_RELEASED',
    'SERVICE_SESSION',
    p_service_session_id,
    v_shift_id,
    p_service_session_id,
    pg_catalog.jsonb_build_object(
      'reason', v_reason,
      'previousStatus', v_session_status,
      'businessAmount', v_business_amount
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'serviceSessionId', p_service_session_id,
    'shiftId', v_shift_id,
    'sessionStatus', 'CANCELLED',
    'reason', v_reason,
    'businessAmount', v_business_amount,
    'releasedAt', v_now,
    'releasedBy', p_actor_id,
    'releasedByRole', p_actor_role
  );
end;
$function$;

create or replace function public.logistics_close_shift(
  p_shift_id uuid,
  p_closing_notes text,
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
  v_closing_notes text := nullif(
    pg_catalog.btrim(p_closing_notes),
    ''
  );

  v_shift_status public.shift_status;
  v_opening_cash numeric;
  v_closure_id uuid;
  v_updated_count integer;

  v_cash_total numeric := 0;
  v_yape_total numeric := 0;
  v_card_total numeric := 0;
  v_card_fee_total numeric := 0;
  v_customer_card_total numeric := 0;
  v_business_sales_total numeric := 0;

  v_operational_expenses_count bigint := 0;
  v_operational_expenses_total numeric := 0;
  v_expected_cash_at_close numeric := 0;

  v_service_sessions_count bigint := 0;
  v_cancelled_sessions_count bigint := 0;
  v_orders_count bigint := 0;
  v_order_items_count bigint := 0;
  v_product_units_count bigint := 0;
  v_cancelled_order_items_count bigint := 0;
  v_cancelled_pending_count bigint := 0;
  v_cancelled_preparing_count bigint := 0;
  v_cancelled_ready_count bigint := 0;
  v_cancelled_delivered_count bigint := 0;
  v_service_session_transfers_count bigint := 0;
  v_order_item_transfers_count bigint := 0;
  v_released_sessions_count bigint := 0;

  v_summary jsonb;
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

  if p_closing_notes is not null and v_closing_notes is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_NOTES_INVALID';
  end if;

  -- Main serialization barrier. The active-session trigger and expense/item
  -- mutations take a conflicting SHARE lock on this row.
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

  if v_shift_status <> 'OPEN'::public.shift_status then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_ALREADY_CLOSED';
  end if;

  if exists (
    select 1
    from public.shift_closures as closure
    where closure.shift_id = p_shift_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CLOSURE_ALREADY_EXISTS';
  end if;

  if exists (
    select 1
    from public.service_sessions as session
    where session.shift_id = p_shift_id
      and session.status in (
        'OPEN'::public.session_status,
        'AWAITING_PAYMENT'::public.session_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_HAS_ACTIVE_SESSIONS';
  end if;

  if exists (
    select 1
    from public.order_items as order_item
    join public.service_sessions as current_session
      on current_session.id = order_item.current_service_session_id
    where current_session.shift_id = p_shift_id
      and order_item.status in (
        'PENDING'::public.order_item_status,
        'PREPARING'::public.order_item_status,
        'READY'::public.order_item_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_HAS_UNRESOLVED_ITEMS';
  end if;

  -- Every PAID session must have exactly one payment. The existing UNIQUE
  -- constraint guarantees the upper bound; this check guarantees existence.
  if exists (
    select 1
    from public.service_sessions as session
    where session.shift_id = p_shift_id
      and session.status = 'PAID'::public.session_status
      and not exists (
        select 1
        from public.payments as payment
        where payment.service_session_id = session.id
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_PAYMENT_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.service_sessions as session
    join public.payments as payment
      on payment.service_session_id = session.id
    where session.shift_id = p_shift_id
      and session.status <> 'PAID'::public.session_status
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_PAYMENT_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.service_sessions as session
    where session.shift_id = p_shift_id
      and session.status = 'CANCELLED'::public.session_status
      and exists (
        select 1
        from public.order_items as order_item
        where order_item.current_service_session_id = session.id
          and order_item.status <> 'CANCELLED'::public.order_item_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CANCELLED_SESSION_HAS_CONSUMPTION';
  end if;

  -- Recalculate each paid session from immutable snapshots and current
  -- economic ownership. This detects any historical/payment inconsistency
  -- before the executive snapshot is frozen.
  if exists (
    select 1
    from public.service_sessions as session
    join public.payments as payment
      on payment.service_session_id = session.id
    left join lateral (
      select coalesce(
        pg_catalog.round(
          pg_catalog.sum(
            (
              order_item.unit_price
              + coalesce(additions.unit_total, 0)
            )
            * order_item.quantity
          ),
          2
        ),
        0
      ) as business_amount
      from public.order_items as order_item
      left join lateral (
        select pg_catalog.sum(
          addition.unit_price * addition.quantity_per_item
        ) as unit_total
        from public.order_item_additions as addition
        where addition.order_item_id = order_item.id
      ) as additions on true
      where order_item.current_service_session_id = session.id
        and order_item.status <> 'CANCELLED'::public.order_item_status
    ) as current_consumption on true
    where session.shift_id = p_shift_id
      and session.status = 'PAID'::public.session_status
      and payment.business_amount <> current_consumption.business_amount
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_PAYMENT_INCONSISTENT';
  end if;

  select
    coalesce(pg_catalog.sum(payment.business_amount)
      filter (where payment.method = 'CASH'::public.payment_method), 0),
    coalesce(pg_catalog.sum(payment.business_amount)
      filter (where payment.method = 'YAPE'::public.payment_method), 0),
    coalesce(pg_catalog.sum(payment.business_amount)
      filter (where payment.method = 'CARD'::public.payment_method), 0),
    coalesce(pg_catalog.sum(payment.fee_amount)
      filter (where payment.method = 'CARD'::public.payment_method), 0),
    coalesce(pg_catalog.sum(payment.customer_total)
      filter (where payment.method = 'CARD'::public.payment_method), 0)
  into
    v_cash_total,
    v_yape_total,
    v_card_total,
    v_card_fee_total,
    v_customer_card_total
  from public.payments as payment
  where payment.shift_id = p_shift_id;

  v_business_sales_total := v_cash_total + v_yape_total + v_card_total;

  select
    pg_catalog.count(*),
    coalesce(pg_catalog.sum(expense.amount), 0)
  into
    v_operational_expenses_count,
    v_operational_expenses_total
  from public.shift_expenses as expense
  where expense.shift_id = p_shift_id
    and expense.voided_at is null;

  v_expected_cash_at_close :=
    v_opening_cash
    + v_cash_total
    - v_operational_expenses_total;

  if v_expected_cash_at_close < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_EXPECTED_CASH_NEGATIVE';
  end if;

  -- All financial snapshot columns are numeric(10,2).
  if v_business_sales_total > 99999999.99
     or v_cash_total > 99999999.99
     or v_yape_total > 99999999.99
     or v_card_total > 99999999.99
     or v_card_fee_total > 99999999.99
     or v_customer_card_total > 99999999.99
     or v_operational_expenses_total > 99999999.99
     or v_expected_cash_at_close > 99999999.99 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CLOSURE_AMOUNT_INVALID';
  end if;

  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where session.status = 'CANCELLED'::public.session_status
    )
  into
    v_service_sessions_count,
    v_cancelled_sessions_count
  from public.service_sessions as session
  where session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_orders_count
  from public.orders as command
  join public.service_sessions as original_session
    on original_session.id = command.service_session_id
  where original_session.shift_id = p_shift_id;

  select
    pg_catalog.count(*),
    coalesce(pg_catalog.sum(order_item.quantity), 0),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'PENDING'::public.order_item_cancellation_origin_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'PREPARING'::public.order_item_cancellation_origin_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'READY'::public.order_item_cancellation_origin_status
    ),
    pg_catalog.count(*) filter (
      where order_item.status = 'CANCELLED'::public.order_item_status
        and order_item.cancelled_from_status =
          'DELIVERED'::public.order_item_cancellation_origin_status
    )
  into
    v_order_items_count,
    v_product_units_count,
    v_cancelled_order_items_count,
    v_cancelled_pending_count,
    v_cancelled_preparing_count,
    v_cancelled_ready_count,
    v_cancelled_delivered_count
  from public.order_items as order_item
  join public.orders as command
    on command.id = order_item.order_id
  join public.service_sessions as original_session
    on original_session.id = command.service_session_id
  where original_session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_service_session_transfers_count
  from public.service_session_transfers as transfer
  join public.service_sessions as session
    on session.id = transfer.service_session_id
  where session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_order_item_transfers_count
  from public.order_item_transfers as transfer
  join public.service_sessions as from_session
    on from_session.id = transfer.from_service_session_id
  where from_session.shift_id = p_shift_id;

  select pg_catalog.count(*)
  into v_released_sessions_count
  from public.audit_logs as audit
  where audit.shift_id = p_shift_id
    and audit.action = 'SERVICE_SESSION_RELEASED';

  if v_service_sessions_count > 2147483647
     or v_cancelled_sessions_count > 2147483647
     or v_orders_count > 2147483647
     or v_order_items_count > 2147483647
     or v_product_units_count > 2147483647
     or v_cancelled_order_items_count > 2147483647
     or v_cancelled_pending_count > 2147483647
     or v_cancelled_preparing_count > 2147483647
     or v_cancelled_ready_count > 2147483647
     or v_cancelled_delivered_count > 2147483647
     or v_service_session_transfers_count > 2147483647
     or v_order_item_transfers_count > 2147483647
     or v_operational_expenses_count > 2147483647
     or v_released_sessions_count > 2147483647 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CLOSURE_COUNT_INVALID';
  end if;

  v_summary := pg_catalog.jsonb_build_object(
    'reportVersion', 1,
    'releasedSessionsCount', v_released_sessions_count
  );

  insert into public.shift_closures (
    shift_id,
    closed_by,
    closed_by_role,
    business_sales_total,
    cash_total,
    yape_total,
    card_total,
    card_fee_total,
    customer_card_total,
    service_sessions_count,
    cancelled_sessions_count,
    orders_count,
    summary,
    order_items_count,
    product_units_count,
    cancelled_order_items_count,
    cancelled_pending_count,
    cancelled_preparing_count,
    cancelled_ready_count,
    cancelled_delivered_count,
    service_session_transfers_count,
    order_item_transfers_count,
    closing_notes,
    operational_expenses_count,
    operational_expenses_total,
    created_at
  )
  values (
    p_shift_id,
    p_actor_id,
    p_actor_role,
    v_business_sales_total,
    v_cash_total,
    v_yape_total,
    v_card_total,
    v_card_fee_total,
    v_customer_card_total,
    v_service_sessions_count::integer,
    v_cancelled_sessions_count::integer,
    v_orders_count::integer,
    v_summary,
    v_order_items_count::integer,
    v_product_units_count::integer,
    v_cancelled_order_items_count::integer,
    v_cancelled_pending_count::integer,
    v_cancelled_preparing_count::integer,
    v_cancelled_ready_count::integer,
    v_cancelled_delivered_count::integer,
    v_service_session_transfers_count::integer,
    v_order_item_transfers_count::integer,
    v_closing_notes,
    v_operational_expenses_count::integer,
    v_operational_expenses_total,
    v_now
  )
  returning id into v_closure_id;

  update public.shifts as shift
  set
    status = 'CLOSED'::public.shift_status,
    closed_at = v_now,
    closed_by = p_actor_id,
    closed_by_role = p_actor_role
  where shift.id = p_shift_id
    and shift.status = 'OPEN'::public.shift_status;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SHIFT_CHANGED';
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
    'SHIFT_CLOSED',
    'SHIFT',
    p_shift_id,
    p_shift_id,
    null,
    pg_catalog.jsonb_build_object(
      'closureId', v_closure_id,
      'businessSalesTotal', v_business_sales_total,
      'cashTotal', v_cash_total,
      'yapeTotal', v_yape_total,
      'cardTotal', v_card_total,
      'cardFeeTotal', v_card_fee_total,
      'customerCardTotal', v_customer_card_total,
      'operationalExpensesTotal', v_operational_expenses_total,
      'expectedCashAtClose', v_expected_cash_at_close,
      'serviceSessionsCount', v_service_sessions_count,
      'ordersCount', v_orders_count
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'closureId', v_closure_id,
    'shiftId', p_shift_id,
    'shiftStatus', 'CLOSED',
    'closedAt', v_now,
    'closedBy', p_actor_id,
    'closedByRole', p_actor_role,
    'openingCash', v_opening_cash,
    'businessSalesTotal', v_business_sales_total,
    'cashTotal', v_cash_total,
    'yapeTotal', v_yape_total,
    'cardTotal', v_card_total,
    'cardFeeTotal', v_card_fee_total,
    'customerCardTotal', v_customer_card_total,
    'operationalExpensesCount', v_operational_expenses_count,
    'operationalExpensesTotal', v_operational_expenses_total,
    'expectedCashAtClose', v_expected_cash_at_close,
    'serviceSessionsCount', v_service_sessions_count,
    'cancelledSessionsCount', v_cancelled_sessions_count,
    'ordersCount', v_orders_count,
    'orderItemsCount', v_order_items_count,
    'productUnitsCount', v_product_units_count,
    'cancelledOrderItemsCount', v_cancelled_order_items_count,
    'cancelledPendingCount', v_cancelled_pending_count,
    'cancelledPreparingCount', v_cancelled_preparing_count,
    'cancelledReadyCount', v_cancelled_ready_count,
    'cancelledDeliveredCount', v_cancelled_delivered_count,
    'serviceSessionTransfersCount', v_service_session_transfers_count,
    'orderItemTransfersCount', v_order_item_transfers_count,
    'closingNotes', v_closing_notes,
    'summary', v_summary
  );
end;
$function$;

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

  select
    shift.status,
    shift.opening_cash
  into
    v_shift_status,
    v_opening_cash
  from public.shifts as shift
  where shift.id = p_shift_id;

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

  -- One lock serializes all attempts for this shift. Expected values are read
  -- from the immutable closure snapshot, never accepted from the caller.
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
  where closure.shift_id = p_shift_id
  for update;

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

create or replace function private.logistics_realtime_orders_insert()
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
  select coalesce(
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
