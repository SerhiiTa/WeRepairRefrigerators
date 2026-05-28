-- Task 98: Estimate UX v2 fields.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Improve the MVP estimate workflow with appliance category filtering,
--   customer-facing pricing/preview fields, warranty/disclaimer text, and
--   internal technician cost placeholders for future profitability analytics.
--
-- Security model:
--   - No new broad browser write grants.
--   - Estimate creation still goes through create_service_request_estimate_rpc.
--   - Technician/internal costs are stored for future internal analytics and
--     must not be exposed in public/customer preview routes.

alter table public.pricing_catalog_items
  add column if not exists customer_price numeric(10, 2),
  add column if not exists technician_cost numeric(10, 2),
  add column if not exists taxable boolean not null default true,
  add column if not exists default_warranty_text text,
  add column if not exists default_disclaimer_text text,
  add column if not exists sort_order integer not null default 0;

update public.pricing_catalog_items
set customer_price = default_labor_price
where customer_price is null;

alter table public.pricing_catalog_items
  alter column customer_price set not null,
  alter column customer_price set default 0;

alter table public.pricing_catalog_items
  drop constraint if exists pricing_catalog_items_customer_price_check,
  add constraint pricing_catalog_items_customer_price_check
    check (customer_price >= 0 and customer_price <= 20000),
  drop constraint if exists pricing_catalog_items_technician_cost_check,
  add constraint pricing_catalog_items_technician_cost_check
    check (technician_cost is null or (technician_cost >= 0 and technician_cost <= 20000)),
  drop constraint if exists pricing_catalog_items_default_warranty_length_check,
  add constraint pricing_catalog_items_default_warranty_length_check
    check (default_warranty_text is null or char_length(default_warranty_text) <= 1000),
  drop constraint if exists pricing_catalog_items_default_disclaimer_length_check,
  add constraint pricing_catalog_items_default_disclaimer_length_check
    check (default_disclaimer_text is null or char_length(default_disclaimer_text) <= 1500);

alter table public.service_request_estimates
  add column if not exists estimate_number text,
  add column if not exists customer_preview_notes text,
  add column if not exists warranty_text text,
  add column if not exists disclaimer_text text;

update public.service_request_estimates
set estimate_number = 'EST-' || to_char(created_at, 'YYYY') || '-' || upper(substring(replace(id::text, '-', '') from 1 for 8))
where estimate_number is null;

alter table public.service_request_estimates
  alter column estimate_number set not null,
  drop constraint if exists service_request_estimates_number_not_blank_check,
  add constraint service_request_estimates_number_not_blank_check
    check (length(btrim(estimate_number)) > 0),
  drop constraint if exists service_request_estimates_preview_notes_length_check,
  add constraint service_request_estimates_preview_notes_length_check
    check (customer_preview_notes is null or char_length(customer_preview_notes) <= 1500),
  drop constraint if exists service_request_estimates_warranty_length_check,
  add constraint service_request_estimates_warranty_length_check
    check (warranty_text is null or char_length(warranty_text) <= 1500),
  drop constraint if exists service_request_estimates_disclaimer_length_check,
  add constraint service_request_estimates_disclaimer_length_check
    check (disclaimer_text is null or char_length(disclaimer_text) <= 2000);

create unique index if not exists service_request_estimates_estimate_number_idx
  on public.service_request_estimates (estimate_number);

alter table public.service_request_estimate_items
  add column if not exists technician_cost numeric(10, 2),
  add column if not exists taxable boolean not null default true,
  add column if not exists warranty_text text;

alter table public.service_request_estimate_items
  drop constraint if exists service_request_estimate_items_technician_cost_check,
  add constraint service_request_estimate_items_technician_cost_check
    check (technician_cost is null or (technician_cost >= 0 and technician_cost <= 50000)),
  drop constraint if exists service_request_estimate_items_warranty_length_check,
  add constraint service_request_estimate_items_warranty_length_check
    check (warranty_text is null or char_length(warranty_text) <= 1000);

comment on column public.pricing_catalog_items.customer_price is
  'Customer-facing catalog price used for estimate previews.';
comment on column public.pricing_catalog_items.technician_cost is
  'Internal future profitability field. Do not expose in customer/public estimate previews.';
comment on column public.service_request_estimates.estimate_number is
  'Simple MVP estimate number. Not an accounting/invoice sequence.';
comment on column public.service_request_estimate_items.technician_cost is
  'Internal future profitability field copied from catalog/custom entries. Do not expose publicly.';

insert into public.pricing_catalog_items (
  appliance_type,
  category,
  title,
  description,
  default_labor_price,
  customer_price,
  technician_cost,
  estimated_duration_minutes,
  taxable,
  default_warranty_text,
  default_disclaimer_text,
  sort_order,
  active
)
values
  ('Refrigerator', 'Diagnostic', 'Refrigerator diagnostic', 'Diagnostic visit and basic refrigerator troubleshooting.', 95.00, 95.00, 35.00, 45, true, 'Diagnostic fee may be credited toward an approved repair when completed during the same visit.', 'Final repair price may change if additional failed components are found during diagnosis.', 10, true),
  ('Refrigerator', 'Sealed system', 'Compressor replacement', 'Customer-facing labor estimate for compressor replacement before model-specific parts.', 850.00, 850.00, 420.00, 240, true, 'Labor warranty applies to compressor installation workmanship. Part warranty depends on manufacturer terms.', 'Refrigerant, filter drier, access valve, and compressor part costs may vary by model.', 20, true),
  ('Refrigerator', 'Airflow', 'Evaporator fan motor', 'Replace evaporator fan motor after confirming airflow failure.', 325.00, 325.00, 120.00, 90, true, 'Standard workmanship warranty applies to installed fan motor labor.', 'Parts pricing may vary by brand and availability.', 30, true),
  ('Refrigerator', 'Ice maker', 'Ice maker repair', 'Repair or replace refrigerator ice maker assembly after diagnosis.', 275.00, 275.00, 105.00, 75, true, 'Standard workmanship warranty applies to ice maker installation.', 'Water pressure, valve, or control issues may require separate repair.', 40, true),
  ('Built-in Refrigeration', 'Sealed system', 'Built-in refrigeration sealed system repair', 'Built-in refrigerator sealed system repair labor estimate before parts and refrigerant adjustments.', 1250.00, 1250.00, 640.00, 360, true, 'Workmanship warranty applies to sealed-system labor. Manufacturer part warranties vary.', 'Built-in refrigeration repairs may require additional access, specialty parts, or follow-up testing.', 50, true),
  ('Ice Maker', 'Water system', 'Standalone ice maker service', 'Diagnostic and service estimate for standalone residential ice machine issues.', 295.00, 295.00, 125.00, 90, true, 'Standard workmanship warranty applies to completed ice machine service.', 'Cleaning, water filtration, and drain issues may require separate recommendations.', 60, true),
  ('Washer', 'Drain system', 'Washer drain pump', 'Replace washer drain pump after confirming drain failure.', 285.00, 285.00, 115.00, 90, true, 'Standard workmanship warranty applies to installed drain pump labor.', 'Foreign object removal or tub access can change final repair scope.', 70, true),
  ('Dryer', 'Heating', 'Dryer heating element', 'Replace dryer heating element after confirming no-heat condition.', 225.00, 225.00, 95.00, 75, true, 'Standard workmanship warranty applies to installed heating element labor.', 'Vent restriction or thermostat failures may require separate correction.', 80, true),
  ('Dishwasher', 'Drain system', 'Dishwasher drain pump', 'Replace dishwasher drain pump after confirming drain failure.', 245.00, 245.00, 105.00, 75, true, 'Standard workmanship warranty applies to installed drain pump labor.', 'Drain hose, disposal knockout, or control faults may require separate repair.', 90, true),
  ('Oven / Range', 'Heating', 'Oven bake element', 'Replace electric oven bake element after diagnosis.', 215.00, 215.00, 85.00, 60, true, 'Standard workmanship warranty applies to installed bake element labor.', 'Control board, sensor, or wiring failures are outside this line item.', 100, true)
on conflict (lower(title), lower(appliance_type))
where active = true
do update
set
  category = excluded.category,
  description = excluded.description,
  default_labor_price = excluded.default_labor_price,
  customer_price = excluded.customer_price,
  technician_cost = excluded.technician_cost,
  estimated_duration_minutes = excluded.estimated_duration_minutes,
  taxable = excluded.taxable,
  default_warranty_text = excluded.default_warranty_text,
  default_disclaimer_text = excluded.default_disclaimer_text,
  sort_order = excluded.sort_order,
  active = excluded.active;

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
  previous_status text;
  combined_warranty text;
  combined_disclaimer text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible for this account.'
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

  insert into public.service_request_estimates (
    service_request_id,
    created_by_profile_id,
    subtotal,
    tax,
    total,
    estimate_status,
    estimate_number,
    customer_preview_notes
  )
  values (
    p_request_id,
    auth.uid(),
    0,
    null,
    0,
    'draft',
    'EST-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
    'Draft estimate prepared for customer review. Not sent or approved yet.'
  )
  returning * into estimate_row;

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

    if length(item_title) = 0 then
      raise exception 'Custom line item title is required.'
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
    warranty_text = coalesce(combined_warranty, 'Standard workmanship warranty applies to completed repair labor. Manufacturer part warranties may vary.'),
    disclaimer_text = coalesce(combined_disclaimer, 'This draft estimate is based on visible symptoms and selected repair scope. Final pricing may change if additional failed components are found during diagnosis.'),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  select status into previous_status
  from public.service_requests
  where id = p_request_id;

  if previous_status = 'new' then
    update public.service_requests
    set status = 'contacted', updated_at = now()
    where id = p_request_id;

    insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
    values (p_request_id, auth.uid(), 'status_change', 'Status changed from New to Contacted after estimate creation.');
  end if;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    p_request_id,
    auth.uid(),
    'estimate',
    'Estimate ' || estimate_row.estimate_number || ' created for $'
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
    'line_count', line_count,
    'request_status', case when previous_status = 'new' then 'contacted' else previous_status end
  );
end;
$$;

comment on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) is
  'Task 98 update. Creates a customer-preview-ready estimate from appliance catalog items while keeping technician costs internal.';
