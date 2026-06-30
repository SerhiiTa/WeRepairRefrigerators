-- Task 148: Professional Estimate & Service Intelligence Foundation
-- Forward-only migration. Extends the existing estimate system without breaking
-- saved estimates, customer approval pages, invoices, or CRM job history.

create table if not exists public.service_catalog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_catalog_repair_groups (
  id uuid primary key default gen_random_uuid(),
  service_category_id uuid not null references public.service_catalog_categories(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_category_id, slug)
);

create table if not exists public.service_catalog_repair_items (
  id uuid primary key default gen_random_uuid(),
  repair_group_id uuid not null references public.service_catalog_repair_groups(id) on delete cascade,
  pricing_catalog_item_id uuid references public.pricing_catalog_items(id) on delete set null,
  name text not null,
  internal_name text,
  public_description text,
  default_labor_price numeric(10,2) not null default 0,
  default_labor_hours numeric(6,2),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  service_category_id uuid references public.service_catalog_categories(id) on delete set null,
  repair_group_id uuid references public.service_catalog_repair_groups(id) on delete set null,
  repair_item_id uuid references public.service_catalog_repair_items(id) on delete set null,
  name text not null,
  appliance_type text,
  brand text,
  public_description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_template_lines (
  id uuid primary key default gen_random_uuid(),
  estimate_template_id uuid not null references public.estimate_templates(id) on delete cascade,
  line_type text not null default 'custom'
    check (line_type in ('labor', 'part', 'material', 'custom', 'warranty')),
  internal_name text,
  customer_name text not null,
  public_description text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_cost numeric(10,2) not null default 0 check (unit_cost >= 0),
  unit_price numeric(10,2) not null default 0 check (unit_price >= 0),
  taxable boolean not null default true,
  warranty_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pricing_catalog_items
  add column if not exists service_category_id uuid references public.service_catalog_categories(id) on delete set null,
  add column if not exists repair_group_id uuid references public.service_catalog_repair_groups(id) on delete set null,
  add column if not exists repair_item_id uuid references public.service_catalog_repair_items(id) on delete set null,
  add column if not exists default_labor_hours numeric(6,2),
  add column if not exists internal_name text,
  add column if not exists public_description text;

alter table public.service_request_estimate_items
  add column if not exists line_type text not null default 'custom'
    check (line_type in ('labor', 'part', 'material', 'custom', 'warranty')),
  add column if not exists internal_name text,
  add column if not exists customer_name text,
  add column if not exists public_description text,
  add column if not exists internal_cost numeric(10,2),
  add column if not exists sell_price numeric(10,2),
  add column if not exists service_catalog_repair_item_id uuid references public.service_catalog_repair_items(id) on delete set null,
  add column if not exists estimate_template_line_id uuid references public.estimate_template_lines(id) on delete set null;

update public.service_request_estimate_items
set
  customer_name = coalesce(customer_name, item_title),
  sell_price = coalesce(sell_price, unit_price),
  internal_cost = coalesce(internal_cost, technician_cost, 0)
where customer_name is null
   or sell_price is null
   or internal_cost is null;

create index if not exists idx_service_catalog_groups_category
  on public.service_catalog_repair_groups(service_category_id, active, sort_order);

create index if not exists idx_service_catalog_items_group
  on public.service_catalog_repair_items(repair_group_id, active, sort_order);

create index if not exists idx_estimate_templates_lookup
  on public.estimate_templates(appliance_type, brand, active, sort_order);

create index if not exists idx_estimate_template_lines_template
  on public.estimate_template_lines(estimate_template_id, sort_order);

insert into public.service_catalog_categories (name, slug, description, sort_order)
values
  ('Refrigerator', 'refrigerator', 'Refrigerator and built-in refrigeration service catalog.', 10),
  ('Dishwasher', 'dishwasher', 'Dishwasher repair service catalog.', 20),
  ('HVAC', 'hvac', 'Heating and cooling service catalog foundation.', 30),
  ('Plumbing', 'plumbing', 'Plumbing service catalog foundation.', 40),
  ('Electrical', 'electrical', 'Electrical service catalog foundation.', 50),
  ('Generator', 'generator', 'Generator service catalog foundation.', 60),
  ('Pool', 'pool', 'Pool equipment service catalog foundation.', 70),
  ('Handyman', 'handyman', 'General handyman service catalog foundation.', 80)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

with category_rows as (
  select id, slug from public.service_catalog_categories
),
groups_to_insert as (
  select c.id as service_category_id, v.name, v.slug, v.description, v.sort_order
  from category_rows c
  join (
    values
      ('refrigerator', 'Cooling System', 'cooling-system', 'Refrigerator cooling and airflow repairs.', 10),
      ('refrigerator', 'Ice Maker', 'ice-maker', 'Ice production and dispenser repairs.', 20),
      ('dishwasher', 'Drain System', 'drain-system', 'Dishwasher drain and pump repairs.', 10),
      ('hvac', 'Airflow', 'airflow', 'HVAC airflow and blower repairs.', 10),
      ('plumbing', 'Drain System', 'drain-system', 'Residential drain service foundation.', 10),
      ('electrical', 'Circuit', 'circuit', 'Residential circuit and outlet service foundation.', 10),
      ('generator', 'Maintenance', 'maintenance', 'Generator diagnostic and maintenance foundation.', 10),
      ('pool', 'Pump System', 'pump-system', 'Pool pump and circulation service foundation.', 10),
      ('handyman', 'General Repair', 'general-repair', 'General repair labor foundation.', 10)
  ) as v(category_slug, name, slug, description, sort_order)
    on v.category_slug = c.slug
)
insert into public.service_catalog_repair_groups
  (service_category_id, name, slug, description, sort_order)
select service_category_id, name, slug, description, sort_order
from groups_to_insert
on conflict (service_category_id, slug) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

with group_rows as (
  select g.id, c.slug as category_slug, g.slug as group_slug
  from public.service_catalog_repair_groups g
  join public.service_catalog_categories c on c.id = g.service_category_id
),
items_to_insert as (
  select g.id as repair_group_id, v.name, v.internal_name, v.public_description,
         v.default_labor_price::numeric(10,2), v.default_labor_hours::numeric(6,2), v.sort_order
  from group_rows g
  join (
    values
      ('refrigerator', 'cooling-system', 'Evaporator Fan Replacement', 'Evaporator Fan Motor', 'Replace failed evaporator fan assembly to restore cabinet airflow.', 325, 1.5, 10),
      ('refrigerator', 'cooling-system', 'Condenser Fan Replacement', 'Condenser Fan Motor', 'Replace condenser fan assembly to improve heat rejection.', 285, 1.3, 20),
      ('refrigerator', 'ice-maker', 'Ice Maker Replacement', 'Ice Maker Assembly', 'Replace ice maker assembly and verify water fill and harvest cycle.', 249, 1.0, 10),
      ('dishwasher', 'drain-system', 'Drain Pump Replacement', 'Dishwasher Drain Pump', 'Replace failed dishwasher drain pump and test drain cycle.', 229, 1.1, 10),
      ('hvac', 'airflow', 'Blower Motor Diagnostic', 'Blower Motor Diagnostic', 'Diagnose airflow complaint and identify blower motor or control failure.', 159, 1.0, 10),
      ('plumbing', 'drain-system', 'Drain Clearing', 'Drain Clearing Labor', 'Clear residential drain stoppage and verify flow.', 189, 1.0, 10),
      ('electrical', 'circuit', 'Outlet Replacement', 'Outlet Replacement Labor', 'Replace standard residential outlet and verify operation.', 149, 0.8, 10),
      ('generator', 'maintenance', 'Generator Diagnostic', 'Generator Diagnostic', 'Inspect generator startup, output, and safety conditions.', 179, 1.0, 10),
      ('pool', 'pump-system', 'Pool Pump Diagnostic', 'Pool Pump Diagnostic', 'Diagnose pool pump operation and circulation issue.', 169, 1.0, 10),
      ('handyman', 'general-repair', 'General Repair Labor', 'General Repair Labor', 'General residential repair labor line.', 125, 1.0, 10)
  ) as v(category_slug, group_slug, name, internal_name, public_description, default_labor_price, default_labor_hours, sort_order)
    on v.category_slug = g.category_slug and v.group_slug = g.group_slug
)
insert into public.service_catalog_repair_items
  (repair_group_id, name, internal_name, public_description, default_labor_price, default_labor_hours, sort_order)
select repair_group_id, name, internal_name, public_description, default_labor_price, default_labor_hours, sort_order
from items_to_insert
where not exists (
  select 1
  from public.service_catalog_repair_items existing
  where existing.repair_group_id = items_to_insert.repair_group_id
    and lower(existing.name) = lower(items_to_insert.name)
);

with template_seed as (
  select
    c.id as service_category_id,
    g.id as repair_group_id,
    i.id as repair_item_id
  from public.service_catalog_categories c
  join public.service_catalog_repair_groups g on g.service_category_id = c.id
  join public.service_catalog_repair_items i on i.repair_group_id = g.id
  where c.slug = 'refrigerator'
    and g.slug = 'cooling-system'
    and i.name = 'Evaporator Fan Replacement'
  limit 1
),
inserted_template as (
  insert into public.estimate_templates
    (service_category_id, repair_group_id, repair_item_id, name, appliance_type, brand, public_description, sort_order)
  select
    service_category_id,
    repair_group_id,
    repair_item_id,
    'Sub-Zero Evaporator Fan Replacement',
    'Built-In Refrigerator',
    'Sub-Zero',
    'Common built-in refrigeration airflow repair template.',
    10
  from template_seed
  where not exists (
    select 1
    from public.estimate_templates existing
    where lower(existing.name) = lower('Sub-Zero Evaporator Fan Replacement')
  )
  returning id
),
template_row as (
  select id from inserted_template
  union all
  select id
  from public.estimate_templates
  where lower(name) = lower('Sub-Zero Evaporator Fan Replacement')
  limit 1
)
insert into public.estimate_template_lines
  (estimate_template_id, line_type, internal_name, customer_name, public_description, quantity, unit_cost, unit_price, taxable, warranty_text, sort_order)
select t.id, line_type, internal_name, customer_name, public_description, quantity, unit_cost, unit_price, taxable, warranty_text, sort_order
from template_row t
cross join (
  values
    ('labor', 'Evaporator fan replacement labor', 'Evaporator Fan Replacement Labor', 'Remove failed fan assembly, install replacement, and verify airflow.', 1::numeric, 120::numeric, 325::numeric, true, null::text, 10),
    ('part', 'WPW10124096 Evaporator Fan Motor', 'Evaporator Fan Assembly', 'Replacement fan assembly for refrigerator airflow.', 1::numeric, 74::numeric, 189::numeric, true, null::text, 20),
    ('warranty', 'Workmanship warranty', 'Repair Warranty', 'Warranty coverage for completed repair labor.', 1::numeric, 0::numeric, 0::numeric, false, 'Standard workmanship warranty applies to completed repair labor.', 30)
) as lines(line_type, internal_name, customer_name, public_description, quantity, unit_cost, unit_price, taxable, warranty_text, sort_order)
where not exists (
  select 1
  from public.estimate_template_lines existing
  where existing.estimate_template_id = t.id
);

alter table public.service_catalog_categories enable row level security;
alter table public.service_catalog_repair_groups enable row level security;
alter table public.service_catalog_repair_items enable row level security;
alter table public.estimate_templates enable row level security;
alter table public.estimate_template_lines enable row level security;

revoke all on public.service_catalog_categories from public;
revoke all on public.service_catalog_repair_groups from public;
revoke all on public.service_catalog_repair_items from public;
revoke all on public.estimate_templates from public;
revoke all on public.estimate_template_lines from public;

grant select on public.service_catalog_categories to authenticated;
grant select on public.service_catalog_repair_groups to authenticated;
grant select on public.service_catalog_repair_items to authenticated;
grant select on public.estimate_templates to authenticated;
grant select on public.estimate_template_lines to authenticated;

drop policy if exists "Authenticated users can read active service catalog categories" on public.service_catalog_categories;
create policy "Authenticated users can read active service catalog categories"
  on public.service_catalog_categories
  for select
  to authenticated
  using (active = true);

drop policy if exists "Authenticated users can read active service catalog groups" on public.service_catalog_repair_groups;
create policy "Authenticated users can read active service catalog groups"
  on public.service_catalog_repair_groups
  for select
  to authenticated
  using (
    active = true
    and exists (
      select 1 from public.service_catalog_categories c
      where c.id = service_category_id and c.active = true
    )
  );

drop policy if exists "Authenticated users can read active service catalog items" on public.service_catalog_repair_items;
create policy "Authenticated users can read active service catalog items"
  on public.service_catalog_repair_items
  for select
  to authenticated
  using (
    active = true
    and exists (
      select 1
      from public.service_catalog_repair_groups g
      join public.service_catalog_categories c on c.id = g.service_category_id
      where g.id = repair_group_id
        and g.active = true
        and c.active = true
    )
  );

drop policy if exists "Authenticated users can read active estimate templates" on public.estimate_templates;
create policy "Authenticated users can read active estimate templates"
  on public.estimate_templates
  for select
  to authenticated
  using (active = true);

drop policy if exists "Authenticated users can read active estimate template lines" on public.estimate_template_lines;
create policy "Authenticated users can read active estimate template lines"
  on public.estimate_template_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.estimate_templates t
      where t.id = estimate_template_id and t.active = true
    )
  );

comment on table public.service_catalog_categories is
  'Provider-neutral service catalog category foundation for appliance repair and future trades.';
comment on table public.service_catalog_repair_groups is
  'Repair grouping layer under a service category, e.g. Cooling System or Drain System.';
comment on table public.service_catalog_repair_items is
  'Reusable repair item foundation with default labor pricing and public descriptions.';
comment on table public.estimate_templates is
  'Reusable estimate template header. Templates expand into editable estimate lines.';
comment on table public.estimate_template_lines is
  'Template line foundation for labor, part, material, custom, and warranty lines. No inventory tracking yet.';

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

  select sr.company_id into v_company_id
  from public.service_requests sr
  where sr.id = p_request_id;

  if v_company_id is null then
    raise exception 'Service request not found.';
  end if;

  if not public.user_can_access_company(v_company_id) then
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
  v_profile_id uuid;
  v_request_id uuid;
  v_company_id uuid;
  v_status text;
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

  if not public.user_can_access_company(v_company_id) then
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

  update public.service_request_estimates
  set
    subtotal = round(v_subtotal, 2),
    tax = 0,
    total = round(v_subtotal, 2),
    updated_at = now()
  where id = p_estimate_id;

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
    'subtotal', round(v_subtotal, 2),
    'tax', 0,
    'total', round(v_subtotal, 2)
  );
end;
$$;

grant execute on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.update_service_request_estimate_draft_rpc(uuid, jsonb, jsonb) to authenticated;
