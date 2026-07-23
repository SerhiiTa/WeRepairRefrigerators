-- Task 168.2C: authoritative Repair Proposal calculation persistence.
--
-- Forward-only / apply-ready.
--
-- Purpose:
--   Persist discount, taxable/non-taxable amounts, tax rate, internal cost,
--   gross profit, and margin snapshot on service_request_estimates so the
--   Job Workspace preview, saved draft, public proposal, and invoice snapshot
--   agree on the same financial numbers.
--
-- Compatibility:
--   - Adds nullable/defaulted columns only.
--   - Keeps old 3-argument estimate RPC callers working.
--   - Adds 4-argument create/update overloads used by the Repair Proposal
--     Builder for authoritative tax/discount persistence.
--   - Existing public approval tokens and invoice conversion remain on
--     service_request_estimates.

alter table public.service_request_estimates
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(10, 2),
  add column if not exists discount_amount numeric(10, 2),
  add column if not exists tax_rate numeric(7, 4),
  add column if not exists taxable_amount numeric(10, 2),
  add column if not exists non_taxable_amount numeric(10, 2),
  add column if not exists internal_cost_total numeric(10, 2),
  add column if not exists gross_profit numeric(10, 2),
  add column if not exists margin_percent numeric(8, 2);

alter table public.service_request_estimates
  alter column discount_type set default 'flat',
  alter column discount_value set default 0,
  alter column discount_amount set default 0,
  alter column tax_rate set default 0,
  alter column taxable_amount set default 0,
  alter column non_taxable_amount set default 0,
  alter column internal_cost_total set default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_discount_type_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_discount_type_check
      check (discount_type is null or discount_type in ('flat', 'percent'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_discount_value_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_discount_value_check
      check (discount_value is null or (discount_value >= 0 and discount_value <= 100000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_discount_amount_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_discount_amount_check
      check (discount_amount is null or (discount_amount >= 0 and discount_amount <= 100000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_tax_rate_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_tax_rate_check
      check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 20));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_taxable_amount_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_taxable_amount_check
      check (taxable_amount is null or (taxable_amount >= 0 and taxable_amount <= 100000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_non_taxable_amount_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_non_taxable_amount_check
      check (non_taxable_amount is null or (non_taxable_amount >= 0 and non_taxable_amount <= 100000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_internal_cost_total_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_internal_cost_total_check
      check (internal_cost_total is null or (internal_cost_total >= 0 and internal_cost_total <= 100000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_gross_profit_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_gross_profit_check
      check (gross_profit is null or (gross_profit >= -100000 and gross_profit <= 100000));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_request_estimates_margin_percent_check'
      and conrelid = 'public.service_request_estimates'::regclass
  ) then
    alter table public.service_request_estimates
      add constraint service_request_estimates_margin_percent_check
      check (margin_percent is null or (margin_percent >= -1000 and margin_percent <= 100));
  end if;
end $$;

comment on column public.service_request_estimates.discount_type is
  'Task 168.2C Repair Proposal calculation snapshot. Discount mode used for the saved proposal: flat or percent.';
comment on column public.service_request_estimates.discount_value is
  'Task 168.2C Repair Proposal calculation snapshot. Technician-entered discount value before capping.';
comment on column public.service_request_estimates.discount_amount is
  'Task 168.2C Repair Proposal calculation snapshot. Actual discount amount applied before tax.';
comment on column public.service_request_estimates.tax_rate is
  'Task 168.2C Repair Proposal calculation snapshot. Tax rate percentage explicitly saved with the proposal.';
comment on column public.service_request_estimates.taxable_amount is
  'Task 168.2C Repair Proposal calculation snapshot. Taxable amount after proportional discount allocation.';
comment on column public.service_request_estimates.non_taxable_amount is
  'Task 168.2C Repair Proposal calculation snapshot. Non-taxable amount after discount.';
comment on column public.service_request_estimates.internal_cost_total is
  'Task 168.2C Repair Proposal calculation snapshot. Internal technician/company cost total for dashboard-only margin.';
comment on column public.service_request_estimates.gross_profit is
  'Task 168.2C Repair Proposal calculation snapshot. Total minus internal cost total; can be negative.';
comment on column public.service_request_estimates.margin_percent is
  'Task 168.2C Repair Proposal calculation snapshot. Gross profit as a percentage of saved total.';

create or replace function public.repair_proposal_numeric_from_json(
  p_value text,
  p_default numeric default 0
)
returns numeric
language sql
immutable
as $$
  select case
    when p_value is null then p_default
    when btrim(p_value) ~ '^-?[0-9]+(\.[0-9]+)?$' then p_value::numeric
    else p_default
  end;
$$;

create or replace function public.apply_service_request_estimate_calculation_snapshot(
  p_estimate_id uuid,
  p_adjustments jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discount_type text := 'flat';
  v_discount_value numeric(10,2) := 0;
  v_tax_rate numeric(7,4) := 0;
  v_subtotal numeric(10,2) := 0;
  v_taxable_before_discount numeric(10,2) := 0;
  v_internal_cost_total numeric(10,2) := 0;
  v_discount_amount numeric(10,2) := 0;
  v_taxable_discount_share numeric(10,2) := 0;
  v_taxable_amount numeric(10,2) := 0;
  v_non_taxable_amount numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_gross_profit numeric(10,2) := 0;
  v_margin_percent numeric(8,2) := 0;
begin
  if not exists (
    select 1 from public.service_request_estimates where id = p_estimate_id
  ) then
    raise exception 'Estimate not found.';
  end if;

  v_discount_type := case
    when coalesce(p_adjustments->>'discountType', '') = 'percent' then 'percent'
    else 'flat'
  end;

  v_discount_value := greatest(
    0,
    round(public.repair_proposal_numeric_from_json(p_adjustments->>'discountValue', 0), 2)
  );

  if v_discount_type = 'percent' then
    v_discount_value := least(100, v_discount_value);
  end if;

  v_tax_rate := greatest(
    0,
    least(
      20,
      round(public.repair_proposal_numeric_from_json(p_adjustments->>'taxRate', 0), 4)
    )
  );

  select
    coalesce(round(sum(item.line_total), 2), 0),
    coalesce(round(sum(case when coalesce(item.taxable, true) then item.line_total else 0 end), 2), 0),
    coalesce(round(sum(item.quantity * coalesce(item.internal_cost, item.technician_cost, 0)), 2), 0)
  into v_subtotal, v_taxable_before_discount, v_internal_cost_total
  from public.service_request_estimate_items item
  where item.estimate_id = p_estimate_id;

  v_discount_amount := case
    when v_discount_type = 'percent'
      then least(v_subtotal, round(v_subtotal * (v_discount_value / 100), 2))
    else least(v_subtotal, v_discount_value)
  end;

  v_taxable_discount_share := case
    when v_subtotal > 0
      then round(v_discount_amount * (v_taxable_before_discount / v_subtotal), 2)
    else 0
  end;

  v_taxable_amount := greatest(0, round(v_taxable_before_discount - v_taxable_discount_share, 2));
  v_non_taxable_amount := greatest(0, round(v_subtotal - v_discount_amount - v_taxable_amount, 2));
  v_tax := round(v_taxable_amount * (v_tax_rate / 100), 2);
  v_total := greatest(0, round(v_subtotal - v_discount_amount + v_tax, 2));
  v_gross_profit := round(v_total - v_internal_cost_total, 2);
  v_margin_percent := case
    when v_total > 0 then round((v_gross_profit / v_total) * 100, 2)
    else 0
  end;

  update public.service_request_estimates
  set
    subtotal = v_subtotal,
    discount_type = v_discount_type,
    discount_value = v_discount_value,
    discount_amount = v_discount_amount,
    tax_rate = v_tax_rate,
    taxable_amount = v_taxable_amount,
    non_taxable_amount = v_non_taxable_amount,
    tax = v_tax,
    total = v_total,
    internal_cost_total = v_internal_cost_total,
    gross_profit = v_gross_profit,
    margin_percent = v_margin_percent,
    updated_at = now()
  where id = p_estimate_id;

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'discount_type', v_discount_type,
    'discount_value', v_discount_value,
    'discount_amount', v_discount_amount,
    'tax_rate', v_tax_rate,
    'taxable_amount', v_taxable_amount,
    'non_taxable_amount', v_non_taxable_amount,
    'tax', v_tax,
    'total', v_total,
    'internal_cost_total', v_internal_cost_total,
    'gross_profit', v_gross_profit,
    'margin_percent', v_margin_percent
  );
end;
$$;

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
  v_estimate_id uuid;
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
    'request_status', v_request_status
  );
end;
$$;

create or replace function public.update_service_request_estimate_draft_rpc(
  p_estimate_id uuid,
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
  v_request_id uuid;
  v_company_id uuid;
  v_status text;
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
  v_totals jsonb;
begin
  select p.id into v_profile_id from public.profiles p where p.id = auth.uid();

  if v_profile_id is null then
    raise exception 'Authenticated profile is required.';
  end if;

  select e.service_request_id, e.estimate_status, sr.company_id
  into v_request_id, v_status, v_company_id
  from public.service_request_estimates e
  join public.service_requests sr on sr.id = e.service_request_id
  where e.id = p_estimate_id;

  if v_request_id is null then
    raise exception 'Estimate not found.';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft estimates can be updated.';
  end if;

  if v_company_id is not null then
    if not public.user_can_access_company(v_company_id) then
      raise exception 'Estimate is not accessible.';
    end if;
  elsif not public.can_view_service_request(v_request_id) then
    raise exception 'Estimate is not accessible.';
  end if;

  delete from public.service_request_estimate_items
  where estimate_id = p_estimate_id;

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
      p_estimate_id,
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
      p_estimate_id,
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
    p_estimate_id,
    coalesce(p_adjustments, '{}'::jsonb)
  );

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    v_request_id,
    v_profile_id,
    'estimate',
    'Draft estimate updated with ' || v_line_count || ' line item' || case when v_line_count = 1 then '' else 's' end || '.'
  );

  return jsonb_build_object(
    'id', p_estimate_id,
    'estimate_number', (select estimate_number from public.service_request_estimates where id = p_estimate_id),
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
    'margin_percent', v_totals->'margin_percent'
  );
end;
$$;

create or replace function public.get_public_estimate_by_token_rpc(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text;
  estimate_row public.service_request_estimates;
  request_row public.service_requests;
  items_json jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into estimate_row
  from public.service_request_estimates
  where public_approval_token_hash = token_hash
    and estimate_status in ('sent', 'approved', 'declined')
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into request_row
  from public.service_requests
  where id = estimate_row.service_request_id;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_title', coalesce(item.customer_name, item.item_title),
        'quantity', item.quantity,
        'unit_price', item.unit_price,
        'line_total', item.line_total,
        'notes', coalesce(item.public_description, item.notes),
        'warranty_text', item.warranty_text,
        'line_type', item.line_type,
        'taxable', item.taxable
      )
      order by item.created_at asc
    ),
    '[]'::jsonb
  )
  into items_json
  from public.service_request_estimate_items item
  where item.estimate_id = estimate_row.id;

  return jsonb_build_object(
    'estimate', jsonb_build_object(
      'estimate_number', estimate_row.estimate_number,
      'estimate_status', estimate_row.estimate_status,
      'subtotal', estimate_row.subtotal,
      'discount_type', coalesce(estimate_row.discount_type, 'flat'),
      'discount_value', coalesce(estimate_row.discount_value, 0),
      'discount_amount', coalesce(estimate_row.discount_amount, 0),
      'tax_rate', coalesce(estimate_row.tax_rate, 0),
      'taxable_amount', coalesce(estimate_row.taxable_amount, 0),
      'non_taxable_amount', coalesce(estimate_row.non_taxable_amount, greatest(coalesce(estimate_row.subtotal, 0) - coalesce(estimate_row.discount_amount, 0), 0)),
      'tax', estimate_row.tax,
      'total', estimate_row.total,
      'warranty_text', estimate_row.warranty_text,
      'disclaimer_text', estimate_row.disclaimer_text,
      'sent_at', estimate_row.sent_at,
      'customer_responded_at', estimate_row.customer_responded_at,
      'items', items_json
    ),
    'service_request', jsonb_build_object(
      'customer_name', request_row.customer_name,
      'appliance_type', request_row.appliance_type,
      'appliance_brand', request_row.appliance_brand,
      'appliance_model', request_row.appliance_model,
      'issue_description', request_row.issue_description,
      'city', request_row.city,
      'state', request_row.state,
      'zip_code', request_row.zip_code,
      'selected_technician_business_name', request_row.selected_technician_business_name
    )
  );
end;
$$;

revoke all on function public.repair_proposal_numeric_from_json(text, numeric) from public;
revoke all on function public.apply_service_request_estimate_calculation_snapshot(uuid, jsonb) from public;
revoke all on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.update_service_request_estimate_draft_rpc(uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.get_public_estimate_by_token_rpc(text) from public;

grant execute on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_service_request_estimate_draft_rpc(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.get_public_estimate_by_token_rpc(text) to anon, authenticated;

comment on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb, jsonb) is
  'Task 168.2C. Creates a Repair Proposal-backed estimate with authoritative discount/tax/totals snapshot.';
comment on function public.update_service_request_estimate_draft_rpc(uuid, jsonb, jsonb, jsonb) is
  'Task 168.2C. Updates a draft Repair Proposal-backed estimate with authoritative discount/tax/totals snapshot.';
comment on function public.get_public_estimate_by_token_rpc(text) is
  'Task 168.2C. Public Repair Proposal read model including persisted discount/tax calculation snapshot.';
