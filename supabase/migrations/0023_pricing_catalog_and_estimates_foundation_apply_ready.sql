-- Task 97: Pricing catalog and service request estimate foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add a small reusable appliance repair pricing catalog and first estimate
--   workflow for service_requests.
--
-- Security model:
--   - Anonymous users cannot read/write pricing catalog or estimates.
--   - Authenticated dashboard users can read active catalog items.
--   - Estimate reads are scoped to service requests the user can already view.
--   - Estimate creation goes through create_service_request_estimate_rpc, which
--     validates request access, prices catalog items server-side, writes line
--     items transactionally, adds a timeline note, and moves first-time/new
--     requests to contacted.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pricing_catalog_items (
  id uuid primary key default gen_random_uuid(),
  appliance_type text not null,
  category text not null,
  title text not null,
  description text,
  default_labor_price numeric(10, 2) not null,
  estimated_duration_minutes integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint pricing_catalog_items_appliance_not_blank_check
    check (length(btrim(appliance_type)) > 0),
  constraint pricing_catalog_items_category_not_blank_check
    check (length(btrim(category)) > 0),
  constraint pricing_catalog_items_title_not_blank_check
    check (length(btrim(title)) > 0),
  constraint pricing_catalog_items_default_labor_price_check
    check (default_labor_price >= 0 and default_labor_price <= 20000),
  constraint pricing_catalog_items_duration_check
    check (
      estimated_duration_minutes is null
      or (estimated_duration_minutes > 0 and estimated_duration_minutes <= 1440)
    )
);

comment on table public.pricing_catalog_items is
  'Task 97 reusable pricing catalog for quick appliance repair estimates.';
comment on column public.pricing_catalog_items.default_labor_price is
  'MVP placeholder labor/flat-rate price. Not an accounting-grade billing amount.';

create unique index if not exists pricing_catalog_items_active_title_idx
  on public.pricing_catalog_items (lower(title), lower(appliance_type))
  where active = true;
create index if not exists pricing_catalog_items_active_appliance_idx
  on public.pricing_catalog_items (active, appliance_type, category, title);

create table if not exists public.service_request_estimates (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  created_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  subtotal numeric(10, 2) not null default 0,
  tax numeric(10, 2),
  total numeric(10, 2) not null default 0,
  estimate_status text not null default 'draft'
    check (estimate_status in (
      'draft',
      'presented',
      'approved',
      'declined',
      'converted_to_invoice',
      'void'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_request_estimates_subtotal_check
    check (subtotal >= 0 and subtotal <= 100000),
  constraint service_request_estimates_tax_check
    check (tax is null or (tax >= 0 and tax <= 100000)),
  constraint service_request_estimates_total_check
    check (total >= 0 and total <= 100000)
);

comment on table public.service_request_estimates is
  'Task 97 MVP service request estimates. Not an invoice, payment, or accounting ledger.';

create index if not exists service_request_estimates_request_created_at_idx
  on public.service_request_estimates (service_request_id, created_at desc);
create index if not exists service_request_estimates_created_by_idx
  on public.service_request_estimates (created_by_profile_id)
  where created_by_profile_id is not null;

drop trigger if exists set_service_request_estimates_updated_at
  on public.service_request_estimates;
create trigger set_service_request_estimates_updated_at
before update on public.service_request_estimates
for each row
execute function public.set_updated_at();

create table if not exists public.service_request_estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null
    references public.service_request_estimates(id)
    on delete cascade,
  pricing_catalog_item_id uuid
    references public.pricing_catalog_items(id)
    on delete set null,
  item_title text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null,
  line_total numeric(10, 2) not null,
  notes text,
  created_at timestamptz not null default now(),

  constraint service_request_estimate_items_title_not_blank_check
    check (length(btrim(item_title)) > 0),
  constraint service_request_estimate_items_quantity_check
    check (quantity > 0 and quantity <= 20),
  constraint service_request_estimate_items_unit_price_check
    check (unit_price >= 0 and unit_price <= 50000),
  constraint service_request_estimate_items_line_total_check
    check (line_total >= 0 and line_total <= 100000),
  constraint service_request_estimate_items_notes_length_check
    check (notes is null or char_length(notes) <= 1000)
);

comment on table public.service_request_estimate_items is
  'Task 97 MVP estimate line items copied from pricing catalog or a custom technician entry.';

create index if not exists service_request_estimate_items_estimate_idx
  on public.service_request_estimate_items (estimate_id, created_at);
create index if not exists service_request_estimate_items_catalog_idx
  on public.service_request_estimate_items (pricing_catalog_item_id)
  where pricing_catalog_item_id is not null;

insert into public.pricing_catalog_items (
  appliance_type,
  category,
  title,
  description,
  default_labor_price,
  estimated_duration_minutes,
  active
)
values
  ('Refrigerator', 'Diagnostic', 'Refrigerator diagnostic', 'Standard refrigerator diagnostic visit and basic troubleshooting.', 95.00, 45, true),
  ('Refrigerator', 'Sealed system', 'Compressor replacement', 'Compressor replacement labor estimate before parts and refrigerant-specific adjustments.', 850.00, 240, true),
  ('Refrigerator', 'Airflow', 'Evaporator fan motor', 'Replace evaporator fan motor after confirmed diagnosis.', 325.00, 90, true),
  ('Refrigerator', 'Ice maker', 'Ice maker repair', 'Repair or replace refrigerator ice maker assembly after diagnosis.', 275.00, 75, true),
  ('Dryer', 'Heating', 'Dryer heating element', 'Replace dryer heating element after confirming no-heat condition.', 225.00, 75, true),
  ('Washer', 'Drain system', 'Washer drain pump', 'Replace washer drain pump after confirming drain failure.', 285.00, 90, true),
  ('Dishwasher', 'Drain system', 'Dishwasher drain pump', 'Replace dishwasher drain pump after confirming drain failure.', 245.00, 75, true),
  ('Oven', 'Heating', 'Oven bake element', 'Replace electric oven bake element after diagnosis.', 215.00, 60, true),
  ('Built-in refrigeration', 'Sealed system', 'Built-in refrigeration sealed system repair', 'Built-in refrigerator sealed system repair labor estimate before parts and refrigerant-specific adjustments.', 1250.00, 360, true)
on conflict (lower(title), lower(appliance_type))
where active = true
do update
set
  category = excluded.category,
  description = excluded.description,
  default_labor_price = excluded.default_labor_price,
  estimated_duration_minutes = excluded.estimated_duration_minutes,
  active = excluded.active;

alter table public.service_request_notes
  drop constraint if exists service_request_notes_note_type_check;

alter table public.service_request_notes
  add constraint service_request_notes_note_type_check
  check (note_type in (
    'internal_note',
    'diagnostic',
    'dispatcher_note',
    'parts_note',
    'status_change',
    'estimate'
  ));

alter table public.pricing_catalog_items enable row level security;
alter table public.service_request_estimates enable row level security;
alter table public.service_request_estimate_items enable row level security;

revoke all on public.pricing_catalog_items from public;
revoke all on public.service_request_estimates from public;
revoke all on public.service_request_estimate_items from public;

grant select on public.pricing_catalog_items to authenticated;
grant select on public.service_request_estimates to authenticated;
grant select on public.service_request_estimate_items to authenticated;

drop policy if exists "pricing_catalog_items_authenticated_select_active"
  on public.pricing_catalog_items;
create policy "pricing_catalog_items_authenticated_select_active"
on public.pricing_catalog_items
for select
to authenticated
using (active = true);

drop policy if exists "service_request_estimates_dashboard_select"
  on public.service_request_estimates;
create policy "service_request_estimates_dashboard_select"
on public.service_request_estimates
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_estimate_items_dashboard_select"
  on public.service_request_estimate_items;
create policy "service_request_estimate_items_dashboard_select"
on public.service_request_estimate_items
for select
to authenticated
using (
  exists (
    select 1
    from public.service_request_estimates estimate
    where estimate.id = estimate_id
      and public.can_view_service_request(estimate.service_request_id)
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
  estimate_row public.service_request_estimates;
  catalog_item jsonb;
  custom_item jsonb;
  catalog_row public.pricing_catalog_items;
  item_quantity integer;
  item_notes text;
  item_title text;
  item_unit_price numeric(10, 2);
  running_subtotal numeric(10, 2) := 0;
  line_count integer := 0;
  previous_status text;
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

  if jsonb_array_length(coalesce(p_catalog_items, '[]'::jsonb))
    + jsonb_array_length(coalesce(p_custom_items, '[]'::jsonb)) > 20 then
    raise exception 'Estimate can include up to 20 line items.'
      using errcode = '22023';
  end if;

  insert into public.service_request_estimates (
    service_request_id,
    created_by_profile_id,
    subtotal,
    tax,
    total,
    estimate_status
  )
  values (
    p_request_id,
    auth.uid(),
    0,
    null,
    0,
    'draft'
  )
  returning * into estimate_row;

  for catalog_item in
    select value from jsonb_array_elements(coalesce(p_catalog_items, '[]'::jsonb))
  loop
    item_quantity := greatest(
      1,
      least(20, coalesce((catalog_item ->> 'quantity')::integer, 1))
    );
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
      notes
    )
    values (
      estimate_row.id,
      catalog_row.id,
      catalog_row.title,
      item_quantity,
      catalog_row.default_labor_price,
      catalog_row.default_labor_price * item_quantity,
      item_notes
    );

    running_subtotal := running_subtotal + (catalog_row.default_labor_price * item_quantity);
    line_count := line_count + 1;
  end loop;

  for custom_item in
    select value from jsonb_array_elements(coalesce(p_custom_items, '[]'::jsonb))
  loop
    item_title := left(btrim(coalesce(custom_item ->> 'itemTitle', '')), 160);
    item_quantity := greatest(
      1,
      least(20, coalesce((custom_item ->> 'quantity')::integer, 1))
    );
    item_unit_price := round(
      greatest(
        0,
        least(50000, coalesce((custom_item ->> 'unitPrice')::numeric, 0))
      ),
      2
    );
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
      notes
    )
    values (
      estimate_row.id,
      null,
      item_title,
      item_quantity,
      item_unit_price,
      item_unit_price * item_quantity,
      item_notes
    );

    running_subtotal := running_subtotal + (item_unit_price * item_quantity);
    line_count := line_count + 1;
  end loop;

  update public.service_request_estimates
  set
    subtotal = running_subtotal,
    tax = null,
    total = running_subtotal,
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  select status
  into previous_status
  from public.service_requests
  where id = p_request_id;

  if previous_status = 'new' then
    update public.service_requests
    set
      status = 'contacted',
      updated_at = now()
    where id = p_request_id;

    insert into public.service_request_notes (
      service_request_id,
      created_by_profile_id,
      note_type,
      body
    )
    values (
      p_request_id,
      auth.uid(),
      'status_change',
      'Status changed from New to Contacted after estimate creation.'
    );
  end if;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    p_request_id,
    auth.uid(),
    'estimate',
    'Estimate created for $'
      || to_char(estimate_row.total, 'FM999999990.00')
      || ' with '
      || line_count
      || case when line_count = 1 then ' line item.' else ' line items.' end
  );

  return jsonb_build_object(
    'id', estimate_row.id,
    'service_request_id', estimate_row.service_request_id,
    'created_by_profile_id', estimate_row.created_by_profile_id,
    'subtotal', estimate_row.subtotal,
    'tax', estimate_row.tax,
    'total', estimate_row.total,
    'estimate_status', estimate_row.estimate_status,
    'created_at', estimate_row.created_at,
    'updated_at', estimate_row.updated_at,
    'line_count', line_count,
    'request_status', case when previous_status = 'new' then 'contacted' else previous_status end
  );
end;
$$;

comment on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) is
  'Task 97 RPC. Creates a service request estimate and line items transactionally for an accessible request.';

revoke all on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) from public;
grant execute on function public.create_service_request_estimate_rpc(uuid, jsonb, jsonb) to authenticated;

-- No INSERT/UPDATE/DELETE table grants are added for estimates. Browser
-- estimate creation should go through create_service_request_estimate_rpc.
-- Future tasks can add approval, invoice, PDF, payment, and customer-facing
-- estimate views through separate reviewed policies/RPCs.
