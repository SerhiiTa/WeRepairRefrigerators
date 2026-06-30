-- Task 100: Estimate lifecycle RPCs.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Treat estimates as managed business documents. Draft estimates may be
--   updated or voided; non-draft estimates remain read-only until future
--   customer approval/send workflows are implemented.
--
-- Security model:
--   - No broad browser write grants are added.
--   - Mutations remain behind authenticated SECURITY DEFINER RPCs.
--   - Each RPC validates auth.uid() and public.can_view_service_request(...).
--   - Only draft estimates can be changed.
--   - Technician/internal costs remain stored only in dashboard/private tables.

create or replace function public.update_service_request_estimate_draft_rpc(
  p_estimate_id uuid,
  p_catalog_items jsonb default '[]'::jsonb,
  p_custom_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  catalog_item jsonb;
  custom_item jsonb;
  catalog_row public.pricing_catalog_items;
  item_quantity integer;
  item_notes text;
  item_title text;
  item_unit_price numeric(10, 2);
  item_technician_cost numeric(10, 2);
  running_subtotal numeric(10, 2) := 0;
  line_count integer := 0;
  combined_warranty text;
  combined_disclaimer text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate was not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be updated.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_catalog_items, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_custom_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Estimate items must be arrays.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_catalog_items, '[]'::jsonb))
    + jsonb_array_length(coalesce(p_custom_items, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one estimate line item.'
      using errcode = '22023';
  end if;

  delete from public.service_request_estimate_items
  where estimate_id = estimate_row.id;

  for catalog_item in
    select value from jsonb_array_elements(coalesce(p_catalog_items, '[]'::jsonb))
  loop
    item_quantity := greatest(1, least(20, coalesce((catalog_item ->> 'quantity')::integer, 1)));
    item_notes := nullif(left(btrim(coalesce(catalog_item ->> 'notes', '')), 1000), '');

    select *
    into catalog_row
    from public.pricing_catalog_items
    where id = (catalog_item ->> 'pricingCatalogItemId')::uuid
      and active = true;

    if not found then
      raise exception 'Selected pricing catalog item was not found.'
        using errcode = 'P0002';
    end if;

    insert into public.service_request_estimate_items (
      estimate_id,
      pricing_catalog_item_id,
      item_title,
      quantity,
      unit_price,
      line_total,
      notes,
      technician_cost,
      taxable,
      warranty_text
    )
    values (
      estimate_row.id,
      catalog_row.id,
      catalog_row.title,
      item_quantity,
      catalog_row.customer_price,
      catalog_row.customer_price * item_quantity,
      item_notes,
      catalog_row.technician_cost,
      catalog_row.taxable,
      catalog_row.default_warranty_text
    );

    running_subtotal := running_subtotal + (catalog_row.customer_price * item_quantity);
    combined_warranty := coalesce(combined_warranty || E'\n', '') || coalesce(catalog_row.default_warranty_text, '');
    combined_disclaimer := coalesce(combined_disclaimer || E'\n', '') || coalesce(catalog_row.default_disclaimer_text, '');
    line_count := line_count + 1;
  end loop;

  for custom_item in
    select value from jsonb_array_elements(coalesce(p_custom_items, '[]'::jsonb))
  loop
    item_title := left(btrim(coalesce(custom_item ->> 'itemTitle', '')), 160);
    item_quantity := greatest(1, least(20, coalesce((custom_item ->> 'quantity')::integer, 1)));
    item_unit_price := round(greatest(0, least(50000, coalesce((custom_item ->> 'unitPrice')::numeric, 0))), 2);
    item_technician_cost := nullif(round(greatest(0, least(50000, coalesce((custom_item ->> 'technicianCost')::numeric, 0))), 2), 0);
    item_notes := nullif(left(btrim(coalesce(custom_item ->> 'notes', '')), 1000), '');

    if length(item_title) = 0 or item_unit_price <= 0 then
      raise exception 'Custom line item title and price are required.'
        using errcode = '22023';
    end if;

    insert into public.service_request_estimate_items (
      estimate_id,
      pricing_catalog_item_id,
      item_title,
      quantity,
      unit_price,
      line_total,
      notes,
      technician_cost,
      taxable,
      warranty_text
    )
    values (
      estimate_row.id,
      null,
      item_title,
      item_quantity,
      item_unit_price,
      item_unit_price * item_quantity,
      item_notes,
      item_technician_cost,
      true,
      null
    );

    running_subtotal := running_subtotal + (item_unit_price * item_quantity);
    line_count := line_count + 1;
  end loop;

  combined_warranty := nullif(btrim(coalesce(combined_warranty, '')), '');
  combined_disclaimer := nullif(btrim(coalesce(combined_disclaimer, '')), '');

  update public.service_request_estimates
  set
    subtotal = running_subtotal,
    tax = null,
    total = running_subtotal,
    warranty_text = coalesce(combined_warranty, warranty_text, 'Standard workmanship warranty applies to completed repair labor. Manufacturer part warranties may vary.'),
    disclaimer_text = coalesce(combined_disclaimer, disclaimer_text, 'This draft estimate is based on visible symptoms and selected repair scope. Final pricing may change if additional failed components are found during diagnosis.'),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    estimate_row.service_request_id,
    auth.uid(),
    'estimate',
    'Draft estimate ' || estimate_row.estimate_number || ' updated to $'
      || to_char(estimate_row.total, 'FM999999990.00')
      || ' with ' || line_count
      || case when line_count = 1 then ' line item.' else ' line items.' end
  );

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'service_request_id', estimate_row.service_request_id,
    'subtotal', estimate_row.subtotal,
    'tax', estimate_row.tax,
    'total', estimate_row.total,
    'estimate_status', estimate_row.estimate_status,
    'warranty_text', estimate_row.warranty_text,
    'disclaimer_text', estimate_row.disclaimer_text,
    'created_at', estimate_row.created_at,
    'updated_at', estimate_row.updated_at,
    'line_count', line_count
  );
end;
$$;

comment on function public.update_service_request_estimate_draft_rpc(uuid, jsonb, jsonb) is
  'Task 100. Replaces line items and recalculates totals for an accessible draft estimate only.';

create or replace function public.void_service_request_estimate_draft_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate was not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be voided.'
      using errcode = '42501';
  end if;

  update public.service_request_estimates
  set estimate_status = 'void', updated_at = now()
  where id = p_estimate_id
  returning * into estimate_row;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    estimate_row.service_request_id,
    auth.uid(),
    'estimate',
    'Draft estimate ' || estimate_row.estimate_number || ' was voided.'
  );

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'service_request_id', estimate_row.service_request_id,
    'estimate_status', estimate_row.estimate_status,
    'updated_at', estimate_row.updated_at
  );
end;
$$;

comment on function public.void_service_request_estimate_draft_rpc(uuid) is
  'Task 100. Voids an accessible draft estimate while preserving read-only history.';

revoke all on function public.update_service_request_estimate_draft_rpc(uuid, jsonb, jsonb) from public;
revoke all on function public.void_service_request_estimate_draft_rpc(uuid) from public;

grant execute on function public.update_service_request_estimate_draft_rpc(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.void_service_request_estimate_draft_rpc(uuid) to authenticated;
