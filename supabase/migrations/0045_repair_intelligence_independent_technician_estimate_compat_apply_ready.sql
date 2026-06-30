-- Task 148.15: Repair Intelligence estimate persistence compatibility.
--
-- DEV/STAGING APPLY-READY.
--
-- Purpose:
--   Task 148 professional estimates are company-scoped, but older dev/staging
--   CRM jobs can still be legitimately visible to an independent technician
--   through selected_technician_slug while service_requests.company_id is null.
--   Those jobs should be estimate-capable when can_view_service_request(...)
--   already authorizes the dashboard user.
--
-- Scope:
--   - Keeps company-owned estimate access unchanged.
--   - Adds selected-technician-slug compatibility for legacy independent
--     service requests with null company_id.
--   - Allows estimate learning events to persist for those legacy requests with
--     nullable company scope.
--   - Does not expose public writes, service-role frontend access, providers,
--     inventory, vendor search, payments, or Task 149 behavior.

alter table public.estimate_learning_events
  alter column company_id drop not null;

comment on column public.estimate_learning_events.company_id is
  'Owning company for estimate learning records when available. May be null for legacy independent-technician service requests that are authorized through selected technician slug.';

drop policy if exists "estimate_learning_events_company_select"
  on public.estimate_learning_events;
create policy "estimate_learning_events_company_select"
on public.estimate_learning_events
for select
to authenticated
using (
  (
    company_id is not null
    and public.user_can_access_company(company_id)
  )
  or (
    service_request_id is not null
    and public.can_view_service_request(service_request_id)
  )
);

drop policy if exists "estimate_learning_events_company_insert"
  on public.estimate_learning_events;
create policy "estimate_learning_events_company_insert"
on public.estimate_learning_events
for insert
to authenticated
with check (
  (
    company_id is not null
    and public.user_can_access_company(company_id)
  )
  or (
    service_request_id is not null
    and public.can_view_service_request(service_request_id)
  )
);

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
    'Estimate created with ' || v_line_count || ' line item' || case when v_line_count = 1 then '' else 's' end || '.'
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
  'Creates an estimate for company-owned service requests or legacy independent-technician service requests already visible through selected technician slug.';

create or replace function public.record_estimate_learning_event_rpc(
  p_request_id uuid default null,
  p_estimate_id uuid default null,
  p_event_type text default 'draft_saved',
  p_decision_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_request_id uuid;
  v_estimate_id uuid;
  v_event_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.id = auth.uid();

  if v_profile_id is null then
    raise exception 'Authenticated profile is required.';
  end if;

  if p_event_type not in (
    'draft_generated',
    'draft_saved',
    'draft_updated',
    'draft_sent',
    'draft_archived',
    'line_adjusted'
  ) then
    raise exception 'Unsupported estimate learning event type.';
  end if;

  if p_estimate_id is not null then
    select e.id, e.service_request_id, sr.company_id
    into v_estimate_id, v_request_id, v_company_id
    from public.service_request_estimates e
    join public.service_requests sr on sr.id = e.service_request_id
    where e.id = p_estimate_id;
  elsif p_request_id is not null then
    select sr.id, sr.company_id
    into v_request_id, v_company_id
    from public.service_requests sr
    where sr.id = p_request_id;
  end if;

  if v_request_id is null then
    raise exception 'Estimate learning event target not found.';
  end if;

  if p_request_id is not null and p_request_id <> v_request_id then
    raise exception 'Estimate learning event request mismatch.';
  end if;

  if v_company_id is not null then
    if not public.user_can_access_company(v_company_id) then
      raise exception 'Estimate learning event is not accessible.';
    end if;
  elsif not public.can_view_service_request(v_request_id) then
    raise exception 'Estimate learning event is not accessible.';
  end if;

  insert into public.estimate_learning_events (
    company_id,
    service_request_id,
    estimate_id,
    created_by_profile_id,
    event_type,
    diagnosis_text,
    repair_scope,
    line_decisions,
    totals,
    decision_context
  )
  values (
    v_company_id,
    v_request_id,
    v_estimate_id,
    v_profile_id,
    p_event_type,
    nullif(p_decision_context->>'diagnosisText', ''),
    coalesce(p_decision_context->'repairScope', '{}'::jsonb),
    coalesce(p_decision_context->'lineDecisions', '[]'::jsonb),
    coalesce(p_decision_context->'totals', '{}'::jsonb),
    coalesce(p_decision_context, '{}'::jsonb)
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'id', v_event_id,
    'event_type', p_event_type,
    'service_request_id', v_request_id,
    'estimate_id', v_estimate_id,
    'company_id', v_company_id
  );
end;
$$;

grant execute on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.record_estimate_learning_event_rpc(uuid, uuid, text, jsonb) to authenticated;
