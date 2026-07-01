-- Task 148.16 follow-up: restore estimate number generation in the
-- Repair Intelligence estimate create RPC.
--
-- DEV/STAGING APPLY-READY.
--
-- Purpose:
--   Migration 0045 replaced create_service_request_estimate_rpc for legacy
--   independent-technician jobs, but regressed estimate_number generation.
--   Live databases with service_request_estimates.estimate_number set NOT NULL
--   reject those inserts. This forward-only patch preserves the 0045 access
--   compatibility while creating customer-facing estimate numbers again.

create or replace function public.create_service_request_estimate_rpc(
  p_request_id uuid,
  p_catalog_items jsonb default '[]'::jsonb,
  p_custom_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_request_exists boolean := false;
  v_estimate_id uuid;
  v_item jsonb;
  v_catalog_item record;
  v_subtotal numeric(10,2) := 0;
  v_line_total numeric(10,2);
  v_quantity numeric(10,2);
  v_unit_price numeric(10,2);
  v_unit_cost numeric(10,2);
  v_line_type text;
  v_customer_name text;
  v_internal_name text;
  v_line_count integer := 0;
  v_request_status text;
begin
  select p.id into v_profile_id from public.profiles p where p.id = auth.uid();

  if v_profile_id is null then
    raise exception 'Authenticated profile is required.';
  end if;

  select true, sr.company_id
  into v_request_exists, v_company_id
  from public.service_requests sr
  where sr.id = p_request_id;

  if not coalesce(v_request_exists, false) then
    raise exception 'Service request not found.';
  end if;

  if v_company_id is not null then
    if not public.user_can_access_company(v_company_id) then
      raise exception 'Service request is not accessible.';
    end if;
  elsif not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible.';
  end if;

  insert into public.service_request_estimates (
    service_request_id,
    created_by_profile_id,
    subtotal,
    tax,
    total,
    estimate_status,
    estimate_number,
    customer_preview_notes,
    warranty_text,
    disclaimer_text
  )
  values (
    p_request_id,
    v_profile_id,
    0,
    0,
    0,
    'draft',
    'EST-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
    'Draft estimate prepared for customer review. Not sent or approved yet.',
    null,
    null
  )
  returning id into v_estimate_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_catalog_items, '[]'::jsonb))
  loop
    select *
    into v_catalog_item
    from public.pricing_catalog_items pci
    where pci.id = nullif(v_item->>'pricingCatalogItemId', '')::uuid
      and pci.active = true;

    if v_catalog_item.id is null then
      continue;
    end if;

    v_quantity := greatest(1, least(20, coalesce((v_item->>'quantity')::numeric, 1)));
    v_unit_price := coalesce(v_catalog_item.customer_price, v_catalog_item.default_labor_price, 0);
    v_unit_cost := coalesce(v_catalog_item.technician_cost, 0);
    v_line_total := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_line_count := v_line_count + 1;

    insert into public.service_request_estimate_items (
      estimate_id,
      pricing_catalog_item_id,
      item_title,
      quantity,
      unit_price,
      line_total,
      technician_cost,
      taxable,
      warranty_text,
      notes,
      line_type,
      internal_name,
      customer_name,
      public_description,
      internal_cost,
      sell_price,
      service_catalog_repair_item_id
    )
    values (
      v_estimate_id,
      v_catalog_item.id,
      v_catalog_item.title,
      v_quantity,
      v_unit_price,
      v_line_total,
      v_unit_cost,
      coalesce(v_catalog_item.taxable, true),
      v_catalog_item.default_warranty_text,
      nullif(v_item->>'notes', ''),
      'labor',
      coalesce(v_catalog_item.internal_name, v_catalog_item.title),
      v_catalog_item.title,
      coalesce(v_catalog_item.public_description, v_catalog_item.description),
      v_unit_cost,
      v_unit_price,
      v_catalog_item.repair_item_id
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_custom_items, '[]'::jsonb))
  loop
    v_line_type := coalesce(nullif(v_item->>'lineType', ''), 'custom');

    if v_line_type not in ('labor', 'part', 'material', 'custom', 'warranty') then
      v_line_type := 'custom';
    end if;

    v_customer_name := coalesce(nullif(v_item->>'customerName', ''), nullif(v_item->>'itemTitle', ''));
    v_internal_name := nullif(v_item->>'internalName', '');

    if v_customer_name is null then
      continue;
    end if;

    v_quantity := greatest(1, least(99, coalesce((v_item->>'quantity')::numeric, 1)));
    v_unit_price := greatest(0, coalesce((v_item->>'unitPrice')::numeric, 0));
    v_unit_cost := greatest(0, coalesce((v_item->>'unitCost')::numeric, (v_item->>'technicianCost')::numeric, 0));
    v_line_total := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_line_count := v_line_count + 1;

    insert into public.service_request_estimate_items (
      estimate_id,
      pricing_catalog_item_id,
      item_title,
      quantity,
      unit_price,
      line_total,
      technician_cost,
      taxable,
      warranty_text,
      notes,
      line_type,
      internal_name,
      customer_name,
      public_description,
      internal_cost,
      sell_price
    )
    values (
      v_estimate_id,
      null,
      coalesce(v_internal_name, v_customer_name),
      v_quantity,
      v_unit_price,
      v_line_total,
      v_unit_cost,
      coalesce((v_item->>'taxable')::boolean, true),
      nullif(v_item->>'warrantyText', ''),
      nullif(v_item->>'notes', ''),
      v_line_type,
      v_internal_name,
      v_customer_name,
      nullif(v_item->>'publicDescription', ''),
      v_unit_cost,
      v_unit_price
    );
  end loop;

  if v_line_count = 0 then
    raise exception 'Estimate requires at least one line item.';
  end if;

  update public.service_request_estimates
  set
    subtotal = round(v_subtotal, 2),
    tax = 0,
    total = round(v_subtotal, 2),
    updated_at = now()
  where id = v_estimate_id;

  update public.service_requests
  set status = case when status in ('new', 'submitted') then 'contacted' else status end,
      updated_at = now()
  where id = p_request_id
  returning status into v_request_status;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    p_request_id,
    v_profile_id,
    'estimate',
    'Estimate ' || (select estimate_number from public.service_request_estimates where id = v_estimate_id)
      || ' created with ' || v_line_count || ' line item'
      || case when v_line_count = 1 then '' else 's' end || '.'
  );

  return jsonb_build_object(
    'id', v_estimate_id,
    'estimate_number', (select estimate_number from public.service_request_estimates where id = v_estimate_id),
    'line_count', v_line_count,
    'subtotal', round(v_subtotal, 2),
    'tax', 0,
    'total', round(v_subtotal, 2),
    'request_status', v_request_status
  );
end;
$$;

comment on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) is
  'Creates an estimate with a stable estimate number for company-owned service requests or legacy independent-technician service requests already visible through selected technician slug.';

revoke all on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) from public;
grant execute on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) to authenticated;
