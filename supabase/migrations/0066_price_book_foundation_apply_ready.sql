-- Task 166: Price Book foundation and finance roadmap lock.
--
-- Forward-only, additive migration.
--
-- Purpose:
--   Add a canonical company/system Price Book foundation for future manual
--   estimates, AI estimates, invoice line items, and analytics.
--
-- Safety:
--   - Does not replace the existing pricing_catalog_items, estimate, invoice,
--     approval, or customer-facing estimate flow.
--   - Does not create estimates, invoices, payments, deposits, inventory, or
--     purchasing behavior.
--   - Browser users receive read access only. Mutations should go through WRA
--     server APIs/RPCs.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.normalize_price_book_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g')),
    ''
  );
$$;

comment on function public.normalize_price_book_text(text) is
  'Normalizes Price Book names and aliases for duplicate prevention.';

create table if not exists public.price_book_appliance_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint price_book_appliance_groups_name_not_blank_check
    check (length(btrim(name)) > 0),
  constraint price_book_appliance_groups_slug_not_blank_check
    check (length(btrim(slug)) > 0)
);

comment on table public.price_book_appliance_groups is
  'Canonical Price Book appliance grouping layer. System rows have company_id null; company rows are company-specific.';

create unique index if not exists price_book_appliance_groups_scope_slug_idx
  on public.price_book_appliance_groups (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(slug)
  );

create index if not exists price_book_appliance_groups_company_active_idx
  on public.price_book_appliance_groups (company_id, active, sort_order, name);

drop trigger if exists set_price_book_appliance_groups_updated_at
  on public.price_book_appliance_groups;
create trigger set_price_book_appliance_groups_updated_at
before update on public.price_book_appliance_groups
for each row
execute function public.set_updated_at();

create table if not exists public.price_book_appliance_group_types (
  id uuid primary key default gen_random_uuid(),
  appliance_group_id uuid not null
    references public.price_book_appliance_groups(id) on delete cascade,
  appliance_type text not null,
  normalized_appliance_type text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint price_book_appliance_group_types_type_not_blank_check
    check (length(btrim(appliance_type)) > 0),
  constraint price_book_appliance_group_types_normalized_not_blank_check
    check (length(btrim(normalized_appliance_type)) > 0)
);

comment on table public.price_book_appliance_group_types is
  'Appliance-type aliases that map jobs to Price Book appliance groups.';

create unique index if not exists price_book_appliance_group_types_unique_idx
  on public.price_book_appliance_group_types (
    appliance_group_id,
    normalized_appliance_type
  );

create index if not exists price_book_appliance_group_types_lookup_idx
  on public.price_book_appliance_group_types (normalized_appliance_type);

create table if not exists public.price_book_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  item_type text not null,
  name text not null,
  normalized_name text not null,
  description text,
  appliance_group_id uuid
    references public.price_book_appliance_groups(id) on delete set null,
  appliance_type text,
  brand text,
  default_quantity numeric(10, 2) not null default 1,
  unit text not null default 'each',
  labor_price numeric(10, 2) not null default 0,
  part_price numeric(10, 2) not null default 0,
  total_price numeric(10, 2) not null default 0,
  pricing_strategy text not null default 'fixed_total',
  taxable boolean not null default true,
  default_tax_behavior text not null default 'company_default',
  warranty_text text,
  estimated_duration_minutes integer,
  internal_notes text,
  customer_description text,
  ai_keywords text[] not null default array[]::text[],
  bundle_display_mode text not null default 'expanded',
  active boolean not null default true,
  review_status text not null default 'approved',
  canonical_item_id uuid references public.price_book_items(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  usage_count integer not null default 0,
  source text not null default 'company',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint price_book_items_type_check
    check (item_type in ('labor', 'part', 'service', 'fee', 'bundle')),
  constraint price_book_items_name_not_blank_check
    check (length(btrim(name)) > 0),
  constraint price_book_items_normalized_name_not_blank_check
    check (length(btrim(normalized_name)) > 0),
  constraint price_book_items_quantity_check
    check (default_quantity > 0 and default_quantity <= 999),
  constraint price_book_items_labor_price_check
    check (labor_price >= 0 and labor_price <= 100000),
  constraint price_book_items_part_price_check
    check (part_price >= 0 and part_price <= 100000),
  constraint price_book_items_total_price_check
    check (total_price >= 0 and total_price <= 100000),
  constraint price_book_items_pricing_strategy_check
    check (pricing_strategy in ('fixed_total', 'labor_plus_part', 'bundle_override', 'manual')),
  constraint price_book_items_default_tax_behavior_check
    check (default_tax_behavior in ('company_default', 'taxable', 'non_taxable')),
  constraint price_book_items_review_status_check
    check (review_status in ('pending', 'approved', 'rejected', 'merged', 'archived')),
  constraint price_book_items_bundle_display_mode_check
    check (bundle_display_mode in ('expanded', 'collapsed', 'technician_choice')),
  constraint price_book_items_duration_check
    check (
      estimated_duration_minutes is null
      or (estimated_duration_minutes > 0 and estimated_duration_minutes <= 2880)
    ),
  constraint price_book_items_usage_count_check
    check (usage_count >= 0),
  constraint price_book_items_not_self_canonical_check
    check (canonical_item_id is null or canonical_item_id <> id)
);

comment on table public.price_book_items is
  'Canonical Price Book items for labor, parts, services, fees, and reusable bundles. Future estimate/invoice flows should select from this table.';
comment on column public.price_book_items.company_id is
  'Null means a system/default item available as a starter catalog. Non-null means company-owned.';
comment on column public.price_book_items.review_status is
  'Governance state for duplicate prevention, owner review, merge, and archive workflows.';
comment on column public.price_book_items.canonical_item_id is
  'When review_status=merged, points to the future canonical item for analytics/grouping without rewriting historical estimate lines.';

create unique index if not exists price_book_items_active_exact_unique_idx
  on public.price_book_items (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    item_type,
    coalesce(appliance_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_name
  )
  where active = true
    and archived_at is null
    and review_status in ('approved', 'pending');

create index if not exists price_book_items_company_lookup_idx
  on public.price_book_items (
    company_id,
    active,
    review_status,
    item_type,
    appliance_group_id,
    name
  );

create index if not exists price_book_items_system_lookup_idx
  on public.price_book_items (
    active,
    review_status,
    item_type,
    appliance_group_id,
    name
  )
  where company_id is null;

create index if not exists price_book_items_keywords_idx
  on public.price_book_items using gin (ai_keywords);

drop trigger if exists set_price_book_items_updated_at
  on public.price_book_items;
create trigger set_price_book_items_updated_at
before update on public.price_book_items
for each row
execute function public.set_updated_at();

create table if not exists public.price_book_item_aliases (
  id uuid primary key default gen_random_uuid(),
  price_book_item_id uuid not null
    references public.price_book_items(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),

  constraint price_book_item_aliases_alias_not_blank_check
    check (length(btrim(alias)) > 0),
  constraint price_book_item_aliases_normalized_not_blank_check
    check (length(btrim(normalized_alias)) > 0)
);

comment on table public.price_book_item_aliases is
  'Search aliases and duplicate-prevention terms for Price Book items.';

create unique index if not exists price_book_item_aliases_item_alias_idx
  on public.price_book_item_aliases (price_book_item_id, normalized_alias);

create index if not exists price_book_item_aliases_lookup_idx
  on public.price_book_item_aliases (normalized_alias);

create table if not exists public.price_book_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_item_id uuid not null
    references public.price_book_items(id) on delete cascade,
  child_item_id uuid not null
    references public.price_book_items(id) on delete restrict,
  sort_order integer not null default 0,
  default_quantity numeric(10, 2) not null default 1,
  is_optional boolean not null default false,
  is_required boolean not null default true,
  bundled_price_override numeric(10, 2),
  use_child_price boolean not null default true,
  hidden_internal boolean not null default false,
  customer_expanded_description text,
  created_at timestamptz not null default now(),

  constraint price_book_bundle_items_not_self_check
    check (bundle_item_id <> child_item_id),
  constraint price_book_bundle_items_quantity_check
    check (default_quantity > 0 and default_quantity <= 999),
  constraint price_book_bundle_items_override_check
    check (bundled_price_override is null or bundled_price_override >= 0)
);

comment on table public.price_book_bundle_items is
  'Ordered child item rows for reusable Price Book bundles.';

create unique index if not exists price_book_bundle_items_unique_child_idx
  on public.price_book_bundle_items (bundle_item_id, child_item_id);

create index if not exists price_book_bundle_items_bundle_order_idx
  on public.price_book_bundle_items (bundle_item_id, sort_order, created_at);

create table if not exists public.price_book_item_merge_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_item_id uuid not null references public.price_book_items(id) on delete restrict,
  target_item_id uuid not null references public.price_book_items(id) on delete restrict,
  merged_by_profile_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),

  constraint price_book_item_merge_history_not_self_check
    check (source_item_id <> target_item_id)
);

comment on table public.price_book_item_merge_history is
  'Merge audit trail. Historical estimate lines are not rewritten; future selection should use the target canonical item.';

create index if not exists price_book_item_merge_history_company_created_idx
  on public.price_book_item_merge_history (company_id, created_at desc);

create index if not exists price_book_item_merge_history_source_idx
  on public.price_book_item_merge_history (source_item_id);

create or replace function public.find_price_book_duplicate_candidates_rpc(
  p_company_id uuid,
  p_item_type text,
  p_name text,
  p_appliance_group_id uuid default null,
  p_aliases text[] default array[]::text[]
)
returns table (
  id uuid,
  company_id uuid,
  item_type text,
  name text,
  appliance_group_id uuid,
  review_status text,
  active boolean,
  match_reason text,
  match_score integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_normalized_name text := public.normalize_price_book_text(p_name);
  v_alias_terms text[] := array(
    select public.normalize_price_book_text(alias_terms.alias_value)
    from unnest(coalesce(p_aliases, array[]::text[])) as alias_terms(alias_value)
    where public.normalize_price_book_text(alias_terms.alias_value) is not null
  );
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if v_normalized_name is null then
    return;
  end if;

  if p_company_id is not null and not public.user_can_access_company(p_company_id) then
    raise exception 'Company Price Book is not accessible.' using errcode = '42501';
  end if;

  return query
  with input_tokens as (
    select token
    from regexp_split_to_table(v_normalized_name, '\s+') as token
    where length(token) >= 3
  ),
  candidates as (
    select
      i.id,
      i.company_id,
      i.item_type,
      i.name,
      i.appliance_group_id,
      i.review_status,
      i.active,
      case
        when i.normalized_name = v_normalized_name then 'exact_name'
        when exists (
          select 1
          from public.price_book_item_aliases a
          where a.price_book_item_id = i.id
            and (
              a.normalized_alias = v_normalized_name
              or a.normalized_alias = any(v_alias_terms)
            )
        ) then 'alias'
        when p_appliance_group_id is not null
          and i.appliance_group_id = p_appliance_group_id
          and (
            select count(*)
            from input_tokens t
            where i.normalized_name like '%' || t.token || '%'
          ) >= 2 then 'token_overlap'
        else 'related'
      end as match_reason,
      case
        when i.normalized_name = v_normalized_name then 100
        when exists (
          select 1
          from public.price_book_item_aliases a
          where a.price_book_item_id = i.id
            and (
              a.normalized_alias = v_normalized_name
              or a.normalized_alias = any(v_alias_terms)
            )
        ) then 90
        when p_appliance_group_id is not null
          and i.appliance_group_id = p_appliance_group_id
          and (
            select count(*)
            from input_tokens t
            where i.normalized_name like '%' || t.token || '%'
          ) >= 2 then 70
        else 30
      end as match_score
    from public.price_book_items i
    where i.item_type = p_item_type
      and i.active = true
      and i.archived_at is null
      and i.review_status in ('approved', 'pending')
      and (i.company_id = p_company_id or i.company_id is null)
      and (
        i.normalized_name = v_normalized_name
        or exists (
          select 1
          from public.price_book_item_aliases a
          where a.price_book_item_id = i.id
            and (
              a.normalized_alias = v_normalized_name
              or a.normalized_alias = any(v_alias_terms)
            )
        )
        or (
          p_appliance_group_id is not null
          and i.appliance_group_id = p_appliance_group_id
          and (
            select count(*)
            from input_tokens t
            where i.normalized_name like '%' || t.token || '%'
          ) >= 2
        )
      )
  )
  select
    candidates.id,
    candidates.company_id,
    candidates.item_type,
    candidates.name,
    candidates.appliance_group_id,
    candidates.review_status,
    candidates.active,
    candidates.match_reason,
    candidates.match_score
  from candidates
  order by candidates.match_score desc, candidates.name asc
  limit 8;
end;
$$;

comment on function public.find_price_book_duplicate_candidates_rpc(uuid, text, text, uuid, text[]) is
  'Returns similar Price Book items for duplicate prevention before creating new catalog rows.';

revoke all on function public.find_price_book_duplicate_candidates_rpc(uuid, text, text, uuid, text[]) from public;
grant execute on function public.find_price_book_duplicate_candidates_rpc(uuid, text, text, uuid, text[]) to authenticated;

alter table public.price_book_appliance_groups enable row level security;
alter table public.price_book_appliance_group_types enable row level security;
alter table public.price_book_items enable row level security;
alter table public.price_book_item_aliases enable row level security;
alter table public.price_book_bundle_items enable row level security;
alter table public.price_book_item_merge_history enable row level security;

revoke all on public.price_book_appliance_groups from public;
revoke all on public.price_book_appliance_group_types from public;
revoke all on public.price_book_items from public;
revoke all on public.price_book_item_aliases from public;
revoke all on public.price_book_bundle_items from public;
revoke all on public.price_book_item_merge_history from public;

grant select on public.price_book_appliance_groups to authenticated;
grant select on public.price_book_appliance_group_types to authenticated;
grant select on public.price_book_items to authenticated;
grant select on public.price_book_item_aliases to authenticated;
grant select on public.price_book_bundle_items to authenticated;
grant select on public.price_book_item_merge_history to authenticated;

grant select, insert, update on public.price_book_appliance_groups to service_role;
grant select, insert, update on public.price_book_appliance_group_types to service_role;
grant select, insert, update on public.price_book_items to service_role;
grant select, insert, update on public.price_book_item_aliases to service_role;
grant select, insert, update on public.price_book_bundle_items to service_role;
grant select, insert on public.price_book_item_merge_history to service_role;

drop policy if exists "price_book_appliance_groups_dashboard_select"
  on public.price_book_appliance_groups;
create policy "price_book_appliance_groups_dashboard_select"
on public.price_book_appliance_groups
for select
to authenticated
using (
  company_id is null
  or public.user_can_access_company(company_id)
);

drop policy if exists "price_book_appliance_group_types_dashboard_select"
  on public.price_book_appliance_group_types;
create policy "price_book_appliance_group_types_dashboard_select"
on public.price_book_appliance_group_types
for select
to authenticated
using (
  exists (
    select 1
    from public.price_book_appliance_groups g
    where g.id = appliance_group_id
      and (
        g.company_id is null
        or public.user_can_access_company(g.company_id)
      )
  )
);

drop policy if exists "price_book_items_dashboard_select"
  on public.price_book_items;
create policy "price_book_items_dashboard_select"
on public.price_book_items
for select
to authenticated
using (
  company_id is null
  or public.user_can_access_company(company_id)
);

drop policy if exists "price_book_item_aliases_dashboard_select"
  on public.price_book_item_aliases;
create policy "price_book_item_aliases_dashboard_select"
on public.price_book_item_aliases
for select
to authenticated
using (
  exists (
    select 1
    from public.price_book_items i
    where i.id = price_book_item_id
      and (
        i.company_id is null
        or public.user_can_access_company(i.company_id)
      )
  )
);

drop policy if exists "price_book_bundle_items_dashboard_select"
  on public.price_book_bundle_items;
create policy "price_book_bundle_items_dashboard_select"
on public.price_book_bundle_items
for select
to authenticated
using (
  exists (
    select 1
    from public.price_book_items i
    where i.id = bundle_item_id
      and (
        i.company_id is null
        or public.user_can_access_company(i.company_id)
      )
  )
);

drop policy if exists "price_book_item_merge_history_dashboard_select"
  on public.price_book_item_merge_history;
create policy "price_book_item_merge_history_dashboard_select"
on public.price_book_item_merge_history
for select
to authenticated
using (
  company_id is null
  or public.user_can_access_company(company_id)
);

with groups as (
  insert into public.price_book_appliance_groups
    (company_id, name, slug, description, sort_order)
  values
    (null, 'Cooling', 'cooling', 'Refrigerator, freezer, wine cooler, ice maker, and commercial ice machine work.', 10),
    (null, 'Laundry', 'laundry', 'Washer and dryer work.', 20),
    (null, 'Cooking', 'cooking', 'Oven, range, cooktop, microwave, and range hood work.', 30),
    (null, 'Dishwashing', 'dishwashing', 'Dishwasher work.', 40),
    (null, 'General', 'general', 'Diagnostic, maintenance, universal service, and fees.', 50)
  on conflict (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(slug)
  )
  do update
  set
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now()
  returning id, slug
),
all_groups as (
  select id, slug
  from groups
  union
  select id, slug
  from public.price_book_appliance_groups
  where company_id is null
    and slug in ('cooling', 'laundry', 'cooking', 'dishwashing', 'general')
),
types_to_insert as (
  select g.id as appliance_group_id, v.appliance_type, v.sort_order
  from all_groups g
  join (
    values
      ('cooling', 'Refrigerator', 10),
      ('cooling', 'Freezer', 20),
      ('cooling', 'Wine Cooler', 30),
      ('cooling', 'Ice Maker', 40),
      ('cooling', 'Commercial Ice Machine', 50),
      ('laundry', 'Washer', 10),
      ('laundry', 'Dryer', 20),
      ('cooking', 'Oven', 10),
      ('cooking', 'Range', 20),
      ('cooking', 'Cooktop', 30),
      ('cooking', 'Microwave', 40),
      ('cooking', 'Range Hood', 50),
      ('dishwashing', 'Dishwasher', 10),
      ('general', 'Diagnostic', 10),
      ('general', 'Maintenance', 20),
      ('general', 'Universal Service', 30),
      ('general', 'Fees', 40)
  ) as v(group_slug, appliance_type, sort_order)
    on v.group_slug = g.slug
)
insert into public.price_book_appliance_group_types
  (appliance_group_id, appliance_type, normalized_appliance_type, sort_order)
select
  appliance_group_id,
  appliance_type,
  public.normalize_price_book_text(appliance_type),
  sort_order
from types_to_insert
on conflict (appliance_group_id, normalized_appliance_type)
do update
set
  appliance_type = excluded.appliance_type,
  sort_order = excluded.sort_order;

with group_rows as (
  select id, slug
  from public.price_book_appliance_groups
  where company_id is null
    and slug in ('cooling', 'laundry', 'cooking', 'dishwashing', 'general')
),
seed as (
  select
    g.id as appliance_group_id,
    v.item_type,
    v.name,
    v.description,
    v.appliance_type,
    v.brand,
    v.default_quantity::numeric(10, 2) as default_quantity,
    v.unit,
    v.labor_price::numeric(10, 2) as labor_price,
    v.part_price::numeric(10, 2) as part_price,
    v.total_price::numeric(10, 2) as total_price,
    v.pricing_strategy,
    v.taxable,
    v.default_tax_behavior,
    v.warranty_text,
    v.estimated_duration_minutes,
    v.customer_description,
    v.ai_keywords::text[] as ai_keywords,
    v.bundle_display_mode,
    v.sort_order,
    v.aliases::text[] as aliases
  from group_rows g
  join (
    values
      ('general', 'service', 'Diagnostic Fee', 'Standard diagnostic visit and basic troubleshooting.', 'Diagnostic', null, 1, 'visit', 0, 0, 95, 'fixed_total', true, 'company_default', 'Diagnostic fee applies to the visit unless credited by company policy.', 45, 'Diagnostic visit and repair evaluation.', array['diagnostic','service call','trip diagnosis'], 'expanded', 10, array['service call','diagnosis']),
      ('general', 'service', 'Trip Charge', 'Trip/service call charge.', 'Universal Service', null, 1, 'visit', 0, 0, 89, 'fixed_total', true, 'company_default', null, 30, 'Trip charge for service visit.', array['trip','service call','travel'], 'expanded', 20, array['service fee','trip fee']),
      ('general', 'service', 'Maintenance', 'General appliance maintenance service.', 'Maintenance', null, 1, 'service', 0, 0, 149, 'fixed_total', true, 'company_default', '90 days labor unless otherwise specified.', 60, 'Preventive maintenance service.', array['maintenance','cleaning','inspection'], 'expanded', 30, array['preventive maintenance']),
      ('general', 'fee', 'After Hours Fee', 'After-hours service surcharge.', 'Fees', null, 1, 'fee', 0, 0, 125, 'fixed_total', true, 'company_default', null, null, 'After-hours service fee.', array['after hours','surcharge','emergency'], 'expanded', 40, array['emergency fee']),
      ('cooling', 'labor', 'Replace Compressor', 'Compressor replacement labor.', 'Refrigerator', null, 1, 'labor', 850, 0, 850, 'fixed_total', true, 'company_default', '90 days labor unless otherwise specified.', 240, 'Replace compressor and verify system operation.', array['compressor','sealed system','not cooling'], 'expanded', 100, array['compressor replacement','install compressor']),
      ('cooling', 'labor', 'Replace Evaporator Fan', 'Evaporator fan replacement labor.', 'Refrigerator', null, 1, 'labor', 325, 0, 325, 'fixed_total', true, 'company_default', '90 days labor and installed parts unless otherwise specified.', 90, 'Replace evaporator fan motor assembly.', array['evaporator fan','airflow','fan motor'], 'expanded', 110, array['evap fan','evaporator fan motor']),
      ('cooling', 'labor', 'Replace Condenser Fan', 'Condenser fan replacement labor.', 'Refrigerator', null, 1, 'labor', 285, 0, 285, 'fixed_total', true, 'company_default', '90 days labor and installed parts unless otherwise specified.', 75, 'Replace condenser fan motor assembly.', array['condenser fan','fan motor','overheating'], 'expanded', 120, array['condenser fan motor']),
      ('cooling', 'part', 'Replace Thermostat', 'Thermostat replacement.', 'Refrigerator', null, 1, 'each', 0, 120, 249, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace thermostat and verify temperature control.', array['thermostat','temperature control'], 'expanded', 130, array['cold control']),
      ('cooling', 'part', 'Replace Defrost Heater', 'Defrost heater replacement.', 'Refrigerator', null, 1, 'each', 0, 135, 289, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace evaporator defrost heater and verify defrost operation.', array['defrost heater','heating element','iced over'], 'expanded', 140, array['heating element','heater']),
      ('cooling', 'part', 'Replace Main Control Board', 'Main control board replacement.', 'Refrigerator', null, 1, 'each', 0, 275, 549, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace main control board and verify functions.', array['control board','main board','electronic control'], 'expanded', 150, array['pcb','board']),
      ('cooling', 'service', 'Sealed System Diagnostic', 'Advanced sealed-system diagnosis.', 'Refrigerator', null, 1, 'service', 0, 0, 325, 'fixed_total', true, 'company_default', null, 120, 'Perform sealed-system diagnostic checks.', array['sealed system','compressor','refrigerant'], 'expanded', 160, array['cooling system diagnosis']),
      ('cooling', 'service', 'Refrigerant Leak Test', 'Refrigerant leak test.', 'Refrigerator', null, 1, 'service', 0, 0, 285, 'fixed_total', true, 'company_default', null, 120, 'Perform refrigerant leak test and document findings.', array['leak test','refrigerant','sealed system'], 'expanded', 170, array['nitrogen pressure test']),
      ('laundry', 'part', 'Replace Heating Element', 'Dryer heating element replacement.', 'Dryer', null, 1, 'each', 0, 95, 249, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace dryer heating element and test heat cycle.', array['dryer heat','heating element','no heat'], 'expanded', 200, array['heater element']),
      ('laundry', 'part', 'Replace Drain Pump', 'Washer drain pump replacement.', 'Washer', null, 1, 'each', 0, 110, 289, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace washer drain pump and test drain cycle.', array['drain pump','washer drain','not draining'], 'expanded', 210, array['pump replacement']),
      ('laundry', 'part', 'Replace Water Inlet Valve', 'Washer water inlet valve replacement.', 'Washer', null, 1, 'each', 0, 95, 239, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace water inlet valve and verify fill operation.', array['water valve','inlet valve','fill'], 'expanded', 220, array['water valve']),
      ('laundry', 'part', 'Replace Belt', 'Dryer or washer belt replacement.', 'Dryer', null, 1, 'each', 0, 45, 189, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace drive belt and test operation.', array['belt','drive belt','drum'], 'expanded', 230, array['drive belt']),
      ('laundry', 'part', 'Replace Thermal Fuse', 'Dryer thermal fuse replacement.', 'Dryer', null, 1, 'each', 0, 35, 169, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace thermal fuse and verify safety circuit.', array['thermal fuse','no heat','dryer'], 'expanded', 240, array['fuse']),
      ('laundry', 'part', 'Replace Door Lock', 'Washer door lock replacement.', 'Washer', null, 1, 'each', 0, 85, 229, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace door lock assembly and test latch cycle.', array['door lock','lid lock','washer'], 'expanded', 250, array['lid lock']),
      ('dishwashing', 'part', 'Replace Drain Pump', 'Dishwasher drain pump replacement.', 'Dishwasher', null, 1, 'each', 0, 115, 259, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace dishwasher drain pump and verify drain cycle.', array['drain pump','dishwasher drain','not draining'], 'expanded', 300, array['dishwasher pump']),
      ('dishwashing', 'part', 'Replace Circulation Pump', 'Dishwasher circulation pump replacement.', 'Dishwasher', null, 1, 'each', 0, 245, 489, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace circulation pump and test wash cycle.', array['circulation pump','wash motor'], 'expanded', 310, array['wash pump']),
      ('dishwashing', 'part', 'Replace Water Inlet Valve', 'Dishwasher water inlet valve replacement.', 'Dishwasher', null, 1, 'each', 0, 85, 219, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace water inlet valve and test fill cycle.', array['water valve','inlet valve','dishwasher fill'], 'expanded', 320, array['fill valve']),
      ('dishwashing', 'service', 'Clear Drain System', 'Clear dishwasher drain obstruction.', 'Dishwasher', null, 1, 'service', 0, 0, 189, 'fixed_total', true, 'company_default', null, 60, 'Clear dishwasher drain system and verify flow.', array['clear drain','drain restriction','clog'], 'expanded', 330, array['unclog drain']),
      ('cooking', 'part', 'Replace Bake Element', 'Oven bake element replacement.', 'Oven', null, 1, 'each', 0, 85, 219, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace bake element and verify heating.', array['bake element','oven heat','no heat'], 'expanded', 400, array['heating element']),
      ('cooking', 'part', 'Replace Igniter', 'Gas oven igniter replacement.', 'Oven', null, 1, 'each', 0, 95, 249, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace igniter and verify ignition.', array['igniter','gas oven','no heat'], 'expanded', 410, array['oven ignitor']),
      ('cooking', 'part', 'Replace Temperature Sensor', 'Oven temperature sensor replacement.', 'Oven', null, 1, 'each', 0, 75, 199, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace temperature sensor and verify temperature reading.', array['temperature sensor','oven sensor'], 'expanded', 420, array['temp probe']),
      ('cooking', 'part', 'Replace Control Board', 'Cooking appliance control board replacement.', 'Oven', null, 1, 'each', 0, 245, 489, 'fixed_total', true, 'company_default', '90 days installed parts unless otherwise specified.', null, 'Replace control board and verify operation.', array['control board','oven board','electronic control'], 'expanded', 430, array['main board']),
      ('laundry', 'bundle', 'Dryer Not Heating Repair', 'Reusable dryer no-heat repair bundle.', 'Dryer', null, 1, 'bundle', 0, 0, 429, 'bundle_override', true, 'company_default', '90 days labor and installed parts unless otherwise specified.', 120, 'Dryer no-heat repair package.', array['dryer not heating','no heat','heating element','thermal fuse'], 'expanded', 900, array['dryer no heat']),
      ('cooling', 'bundle', 'Refrigerator Not Cooling Diagnostic', 'Reusable refrigerator not-cooling diagnostic bundle.', 'Refrigerator', null, 1, 'bundle', 0, 0, 325, 'bundle_override', true, 'company_default', null, 120, 'Refrigerator not-cooling diagnostic and repair planning.', array['refrigerator not cooling','cooling diagnostic'], 'expanded', 910, array['not cooling diagnostic']),
      ('dishwashing', 'bundle', 'Dishwasher Not Draining Repair', 'Reusable dishwasher drain repair bundle.', 'Dishwasher', null, 1, 'bundle', 0, 0, 329, 'bundle_override', true, 'company_default', '90 days labor and installed parts unless otherwise specified.', 90, 'Dishwasher not-draining repair package.', array['dishwasher not draining','drain pump','clear drain'], 'expanded', 920, array['dishwasher drain repair']),
      ('cooling', 'bundle', 'LG Compressor Replacement', 'Reusable LG compressor/sealed-system repair bundle.', 'Refrigerator', 'LG', 1, 'bundle', 0, 0, 1895, 'bundle_override', true, 'company_default', 'Warranty depends on manufacturer authorization and installed parts.', 360, 'LG compressor replacement and sealed-system service package.', array['lg compressor','linear compressor','sealed system'], 'expanded', 930, array['lg linear compressor'])
  ) as v(group_slug, item_type, name, description, appliance_type, brand, default_quantity, unit, labor_price, part_price, total_price, pricing_strategy, taxable, default_tax_behavior, warranty_text, estimated_duration_minutes, customer_description, ai_keywords, bundle_display_mode, sort_order, aliases)
    on v.group_slug = g.slug
),
upserted as (
  insert into public.price_book_items (
    company_id,
    item_type,
    name,
    normalized_name,
    description,
    appliance_group_id,
    appliance_type,
    brand,
    default_quantity,
    unit,
    labor_price,
    part_price,
    total_price,
    pricing_strategy,
    taxable,
    default_tax_behavior,
    warranty_text,
    estimated_duration_minutes,
    customer_description,
    ai_keywords,
    bundle_display_mode,
    active,
    review_status,
    source
  )
  select
    null,
    item_type,
    name,
    public.normalize_price_book_text(name),
    description,
    appliance_group_id,
    appliance_type,
    brand,
    default_quantity,
    unit,
    labor_price,
    part_price,
    total_price,
    pricing_strategy,
    taxable,
    default_tax_behavior,
    warranty_text,
    estimated_duration_minutes,
    customer_description,
    ai_keywords,
    bundle_display_mode,
    true,
    'approved',
    'system'
  from seed
  on conflict (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    item_type,
    coalesce(appliance_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_name
  )
  where active = true
    and archived_at is null
    and review_status in ('approved', 'pending')
  do update
  set
    name = excluded.name,
    description = excluded.description,
    appliance_type = excluded.appliance_type,
    brand = excluded.brand,
    default_quantity = excluded.default_quantity,
    unit = excluded.unit,
    labor_price = excluded.labor_price,
    part_price = excluded.part_price,
    total_price = excluded.total_price,
    pricing_strategy = excluded.pricing_strategy,
    taxable = excluded.taxable,
    default_tax_behavior = excluded.default_tax_behavior,
    warranty_text = excluded.warranty_text,
    estimated_duration_minutes = excluded.estimated_duration_minutes,
    customer_description = excluded.customer_description,
    ai_keywords = excluded.ai_keywords,
    bundle_display_mode = excluded.bundle_display_mode,
    active = true,
    updated_at = now()
  returning id, name
)
insert into public.price_book_item_aliases
  (price_book_item_id, alias, normalized_alias)
select
  i.id,
  aliases.alias_value,
  public.normalize_price_book_text(aliases.alias_value)
from seed s
join public.price_book_items i
  on i.company_id is null
 and i.item_type = s.item_type
 and i.appliance_group_id = s.appliance_group_id
 and i.normalized_name = public.normalize_price_book_text(s.name)
cross join lateral unnest(s.aliases) as aliases(alias_value)
where public.normalize_price_book_text(aliases.alias_value) is not null
on conflict (price_book_item_id, normalized_alias)
do update
set alias = excluded.alias;

with items as (
  select id, name
  from public.price_book_items
  where company_id is null
    and active = true
),
bundle_rows as (
  select
    bundle.id as bundle_item_id,
    child.id as child_item_id,
    v.sort_order,
    v.default_quantity::numeric(10, 2) as default_quantity,
    v.is_optional,
    v.is_required,
    v.bundled_price_override::numeric(10, 2) as bundled_price_override,
    v.use_child_price,
    v.hidden_internal,
    v.customer_expanded_description
  from (
    values
      ('Dryer Not Heating Repair', 'Diagnostic Fee', 10, 1, false, true, null, true, false, 'Diagnostic troubleshooting for no-heat condition.'),
      ('Dryer Not Heating Repair', 'Replace Heating Element', 20, 1, false, true, null, true, false, 'Heating element replacement if confirmed failed.'),
      ('Dryer Not Heating Repair', 'Replace Thermal Fuse', 30, 1, true, false, null, true, false, 'Thermal fuse replacement if confirmed failed.'),
      ('Dryer Not Heating Repair', 'Maintenance', 40, 1, true, false, 0, false, true, 'Reassembly and operational test.'),
      ('Refrigerator Not Cooling Diagnostic', 'Diagnostic Fee', 10, 1, false, true, null, true, false, 'Cooling complaint diagnostic.'),
      ('Refrigerator Not Cooling Diagnostic', 'Sealed System Diagnostic', 20, 1, true, false, null, true, false, 'Advanced sealed-system testing when indicated.'),
      ('Refrigerator Not Cooling Diagnostic', 'Refrigerant Leak Test', 30, 1, true, false, null, true, false, 'Leak test when sealed-system issue is suspected.'),
      ('Dishwasher Not Draining Repair', 'Diagnostic Fee', 10, 1, false, true, null, true, false, 'Drain failure diagnostic.'),
      ('Dishwasher Not Draining Repair', 'Clear Drain System', 20, 1, false, true, null, true, false, 'Clear drain path restriction.'),
      ('Dishwasher Not Draining Repair', 'Replace Drain Pump', 30, 1, true, false, null, true, false, 'Drain pump replacement if confirmed failed.'),
      ('LG Compressor Replacement', 'Sealed System Diagnostic', 10, 1, false, true, null, true, false, 'Advanced sealed-system diagnostic.'),
      ('LG Compressor Replacement', 'Replace Compressor', 20, 1, false, true, null, true, false, 'Compressor replacement labor.'),
      ('LG Compressor Replacement', 'Refrigerant Leak Test', 30, 1, false, true, null, true, false, 'Pressure, leak, evacuation, and performance checks.'),
      ('LG Compressor Replacement', 'Trip Charge', 40, 1, true, false, 0, false, true, 'Service visit credit or internal trip accounting line if company policy requires it.')
  ) as v(bundle_name, child_name, sort_order, default_quantity, is_optional, is_required, bundled_price_override, use_child_price, hidden_internal, customer_expanded_description)
  join items bundle on bundle.name = v.bundle_name
  join items child on child.name = v.child_name
)
insert into public.price_book_bundle_items (
  bundle_item_id,
  child_item_id,
  sort_order,
  default_quantity,
  is_optional,
  is_required,
  bundled_price_override,
  use_child_price,
  hidden_internal,
  customer_expanded_description
)
select
  bundle_item_id,
  child_item_id,
  sort_order,
  default_quantity,
  is_optional,
  is_required,
  bundled_price_override,
  use_child_price,
  hidden_internal,
  customer_expanded_description
from bundle_rows
on conflict (bundle_item_id, child_item_id)
do update
set
  sort_order = excluded.sort_order,
  default_quantity = excluded.default_quantity,
  is_optional = excluded.is_optional,
  is_required = excluded.is_required,
  bundled_price_override = excluded.bundled_price_override,
  use_child_price = excluded.use_child_price,
  hidden_internal = excluded.hidden_internal,
  customer_expanded_description = excluded.customer_expanded_description;
