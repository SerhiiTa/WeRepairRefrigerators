-- FINANCE-V2-25 Stage 3.3
-- Repair independent Estimate creation after Finance V2 made logical_estimate_id
-- and revision_number required. New Estimates are logical roots; revisions continue
-- through revise_service_request_estimate_rpc.

create or replace function public.create_service_request_estimate_rpc(
  p_request_id uuid,
  p_catalog_items jsonb default '[]'::jsonb,
  p_custom_items jsonb default '[]'::jsonb,
  p_adjustments jsonb default '{}'::jsonb
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
  v_estimate_id uuid := gen_random_uuid();
  v_item jsonb;
  v_catalog_item record;
  v_line_total numeric(10,2);
  v_quantity numeric(10,2);
  v_unit_price numeric(10,2);
  v_unit_cost numeric(10,2);
  v_line_type text;
  v_customer_name text;
  v_internal_name text;
  v_line_count integer := 0;
  v_request_status text;
  v_totals jsonb;
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
    id,
    service_request_id,
    created_by_profile_id,
    subtotal,
    tax,
    total,
    estimate_status,
    estimate_number,
    customer_preview_notes,
    warranty_text,
    disclaimer_text,
    logical_estimate_id,
    revision_number,
    revision_status
  )
  values (
    v_estimate_id,
    p_request_id,
    v_profile_id,
    0,
    0,
    0,
    'draft',
    'EST-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
    'Draft estimate prepared for customer review. Not sent or approved yet.',
    null,
    null,
    v_estimate_id,
    1,
    'current'
  );

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

    v_quantity := greatest(1, least(20, public.repair_proposal_numeric_from_json(v_item->>'quantity', 1)));
    v_unit_price := coalesce(v_catalog_item.customer_price, v_catalog_item.default_labor_price, 0);
    v_unit_cost := coalesce(v_catalog_item.technician_cost, 0);
    v_line_total := round(v_quantity * v_unit_price, 2);
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

    v_quantity := greatest(1, least(99, public.repair_proposal_numeric_from_json(v_item->>'quantity', 1)));
    v_unit_price := greatest(0, public.repair_proposal_numeric_from_json(v_item->>'unitPrice', 0));
    v_unit_cost := greatest(0, coalesce(
      public.repair_proposal_numeric_from_json(v_item->>'unitCost', null),
      public.repair_proposal_numeric_from_json(v_item->>'technicianCost', 0)
    ));
    v_line_total := round(v_quantity * v_unit_price, 2);
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

  v_totals := public.apply_service_request_estimate_calculation_snapshot(
    v_estimate_id,
    coalesce(p_adjustments, '{}'::jsonb)
  );

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
    'subtotal', v_totals->'subtotal',
    'discount_type', v_totals->'discount_type',
    'discount_value', v_totals->'discount_value',
    'discount_amount', v_totals->'discount_amount',
    'tax_rate', v_totals->'tax_rate',
    'taxable_amount', v_totals->'taxable_amount',
    'non_taxable_amount', v_totals->'non_taxable_amount',
    'tax', v_totals->'tax',
    'total', v_totals->'total',
    'internal_cost_total', v_totals->'internal_cost_total',
    'gross_profit', v_totals->'gross_profit',
    'margin_percent', v_totals->'margin_percent',
    'request_status', v_request_status,
    'logical_estimate_id', v_estimate_id,
    'revision_number', 1,
    'revision_status', 'current'
  );
end;
$$;

comment on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb, jsonb) is
  'Creates an independent Finance V2 logical Estimate root with revision metadata populated.';

revoke all on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb, jsonb) to authenticated;
