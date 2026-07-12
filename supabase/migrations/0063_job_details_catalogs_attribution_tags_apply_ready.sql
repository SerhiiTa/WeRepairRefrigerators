-- Task 165.23: Job Details catalogs, marketing attribution, and tags.
--
-- Forward-only apply-ready migration.
-- Purpose:
--   Add reusable company/system catalogs for job types, problem types,
--   marketing sources, and service tags. Keep service_requests.request_source
--   as the technical intake channel and add marketing_source_id separately.
--
-- Safety:
--   - Does not rewrite historical service request values.
--   - Does not disable RLS.
--   - Uses trusted RPCs and existing can_view_service_request(...) access.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.service_job_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  appliance_category text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_job_types_name_not_blank_check
    check (length(btrim(name)) > 0),
  constraint service_job_types_normalized_name_not_blank_check
    check (length(btrim(normalized_name)) > 0)
);

create unique index if not exists service_job_types_company_normalized_idx
  on public.service_job_types (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name);

create table if not exists public.service_problem_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  job_type_id uuid references public.service_job_types(id) on delete set null,
  appliance_category text,
  name text not null,
  normalized_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_problem_types_name_not_blank_check
    check (length(btrim(name)) > 0),
  constraint service_problem_types_normalized_name_not_blank_check
    check (length(btrim(normalized_name)) > 0)
);

create unique index if not exists service_problem_types_scope_normalized_idx
  on public.service_problem_types (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(job_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(lower(appliance_category), ''),
    normalized_name
  );

create table if not exists public.marketing_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  code text,
  name text not null,
  normalized_name text not null,
  category text not null default 'other'
    check (category in (
      'paid_search',
      'organic',
      'website',
      'marketplace',
      'referral',
      'returning_customer',
      'social',
      'direct',
      'property_management',
      'other'
    )),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_sources_name_not_blank_check
    check (length(btrim(name)) > 0),
  constraint marketing_sources_normalized_name_not_blank_check
    check (length(btrim(normalized_name)) > 0)
);

create unique index if not exists marketing_sources_company_normalized_idx
  on public.marketing_sources (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name);

create table if not exists public.service_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  category text not null default 'custom'
    check (category in (
      'appliance',
      'brand',
      'workflow',
      'pricing',
      'customer',
      'warranty',
      'priority',
      'custom'
    )),
  tone text not null default 'gray'
    check (tone in ('gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple')),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_tags_name_not_blank_check
    check (length(btrim(name)) > 0),
  constraint service_tags_normalized_name_not_blank_check
    check (length(btrim(normalized_name)) > 0)
);

create unique index if not exists service_tags_company_normalized_idx
  on public.service_tags (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name);

create table if not exists public.service_request_tags (
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  tag_id uuid not null references public.service_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (service_request_id, tag_id)
);

alter table public.service_requests
  add column if not exists job_type_id uuid references public.service_job_types(id) on delete set null,
  add column if not exists job_name text,
  add column if not exists problem_type_id uuid references public.service_problem_types(id) on delete set null,
  add column if not exists marketing_source_id uuid references public.marketing_sources(id) on delete set null;

create index if not exists service_requests_job_type_id_idx
  on public.service_requests (job_type_id)
  where job_type_id is not null;

create index if not exists service_requests_problem_type_id_idx
  on public.service_requests (problem_type_id)
  where problem_type_id is not null;

create index if not exists service_requests_marketing_source_id_idx
  on public.service_requests (marketing_source_id)
  where marketing_source_id is not null;

create index if not exists service_request_tags_tag_id_idx
  on public.service_request_tags (tag_id);

drop trigger if exists set_service_job_types_updated_at on public.service_job_types;
create trigger set_service_job_types_updated_at
before update on public.service_job_types
for each row execute function public.set_updated_at();

drop trigger if exists set_service_problem_types_updated_at on public.service_problem_types;
create trigger set_service_problem_types_updated_at
before update on public.service_problem_types
for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_sources_updated_at on public.marketing_sources;
create trigger set_marketing_sources_updated_at
before update on public.marketing_sources
for each row execute function public.set_updated_at();

drop trigger if exists set_service_tags_updated_at on public.service_tags;
create trigger set_service_tags_updated_at
before update on public.service_tags
for each row execute function public.set_updated_at();

create or replace function public.normalize_catalog_label(input_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(btrim(coalesce(input_text, ''))), '[^a-z0-9]+', ' ', 'g');
$$;

create or replace function public.service_request_default_job_name(input_appliance_type text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(input_appliance_type, '')), '') is null then 'Appliance Service'
    when lower(btrim(input_appliance_type)) in ('oven', 'range') then 'Oven / Range Repair'
    when lower(btrim(input_appliance_type)) like '%repair' then btrim(input_appliance_type)
    else btrim(input_appliance_type) || ' Repair'
  end;
$$;

create or replace function public.set_service_request_job_name_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(new.job_name, '')), '') is null then
    new.job_name := public.service_request_default_job_name(new.appliance_type);
  end if;

  return new;
end;
$$;

drop trigger if exists set_service_request_job_name_default on public.service_requests;
create trigger set_service_request_job_name_default
before insert or update of appliance_type, job_name on public.service_requests
for each row
execute function public.set_service_request_job_name_default();

alter table public.service_job_types enable row level security;
alter table public.service_problem_types enable row level security;
alter table public.marketing_sources enable row level security;
alter table public.service_tags enable row level security;
alter table public.service_request_tags enable row level security;

drop policy if exists "service_job_types_dashboard_read" on public.service_job_types;
create policy "service_job_types_dashboard_read"
on public.service_job_types
for select
to authenticated
using (company_id is null or public.user_can_access_company(company_id));

drop policy if exists "service_problem_types_dashboard_read" on public.service_problem_types;
create policy "service_problem_types_dashboard_read"
on public.service_problem_types
for select
to authenticated
using (company_id is null or public.user_can_access_company(company_id));

drop policy if exists "marketing_sources_dashboard_read" on public.marketing_sources;
create policy "marketing_sources_dashboard_read"
on public.marketing_sources
for select
to authenticated
using (company_id is null or public.user_can_access_company(company_id));

drop policy if exists "service_tags_dashboard_read" on public.service_tags;
create policy "service_tags_dashboard_read"
on public.service_tags
for select
to authenticated
using (company_id is null or public.user_can_access_company(company_id));

drop policy if exists "service_request_tags_dashboard_read" on public.service_request_tags;
create policy "service_request_tags_dashboard_read"
on public.service_request_tags
for select
to authenticated
using (public.can_view_service_request(service_request_id));

revoke all on public.service_job_types from public;
revoke all on public.service_problem_types from public;
revoke all on public.marketing_sources from public;
revoke all on public.service_tags from public;
revoke all on public.service_request_tags from public;

grant select on public.service_job_types to authenticated;
grant select on public.service_problem_types to authenticated;
grant select on public.marketing_sources to authenticated;
grant select on public.service_tags to authenticated;
grant select on public.service_request_tags to authenticated;

grant select, insert, update on public.service_job_types to service_role;
grant select, insert, update on public.service_problem_types to service_role;
grant select, insert, update on public.marketing_sources to service_role;
grant select, insert, update on public.service_tags to service_role;
grant select, insert, delete on public.service_request_tags to service_role;
grant select, update on public.service_requests to service_role;

insert into public.service_job_types (company_id, name, normalized_name, appliance_category, sort_order)
values
  (null, 'Refrigerator Repair', public.normalize_catalog_label('Refrigerator Repair'), 'Refrigerator', 10),
  (null, 'Freezer Repair', public.normalize_catalog_label('Freezer Repair'), 'Freezer', 20),
  (null, 'Wine Cooler Repair', public.normalize_catalog_label('Wine Cooler Repair'), 'Wine Cooler', 30),
  (null, 'Ice Maker Repair', public.normalize_catalog_label('Ice Maker Repair'), 'Ice Maker', 40),
  (null, 'Dishwasher Repair', public.normalize_catalog_label('Dishwasher Repair'), 'Dishwasher', 50),
  (null, 'Washer Repair', public.normalize_catalog_label('Washer Repair'), 'Washer', 60),
  (null, 'Dryer Repair', public.normalize_catalog_label('Dryer Repair'), 'Dryer', 70),
  (null, 'Oven / Range Repair', public.normalize_catalog_label('Oven / Range Repair'), 'Oven / Range', 80),
  (null, 'Cooktop Repair', public.normalize_catalog_label('Cooktop Repair'), 'Cooktop', 90),
  (null, 'Microwave Repair', public.normalize_catalog_label('Microwave Repair'), 'Microwave', 100),
  (null, 'Other', public.normalize_catalog_label('Other'), null, 900)
on conflict do nothing;

insert into public.service_problem_types (company_id, job_type_id, appliance_category, name, normalized_name, sort_order)
select null, sjt.id, sjt.appliance_category, problem.name, public.normalize_catalog_label(problem.name), problem.sort_order
from public.service_job_types sjt
join (
  values
    ('Refrigerator Repair', 'Not cooling', 10),
    ('Refrigerator Repair', 'Cooling poorly', 20),
    ('Refrigerator Repair', 'Ice buildup', 30),
    ('Refrigerator Repair', 'Leaking', 40),
    ('Refrigerator Repair', 'Making noise', 50),
    ('Refrigerator Repair', 'Temperature fluctuates', 60),
    ('Refrigerator Repair', 'Freezer not freezing', 70),
    ('Refrigerator Repair', 'Refrigerator section warm', 80),
    ('Dishwasher Repair', 'Not draining', 10),
    ('Dishwasher Repair', 'Not cleaning', 20),
    ('Dishwasher Repair', 'Leaking', 30),
    ('Dishwasher Repair', 'Full of water', 40),
    ('Dishwasher Repair', 'Not starting', 50),
    ('Dishwasher Repair', 'Making noise', 60),
    ('Dishwasher Repair', 'Not drying', 70),
    ('Dishwasher Repair', 'Door not closing', 80),
    ('Dryer Repair', 'Not heating', 10),
    ('Dryer Repair', 'Not spinning', 20),
    ('Dryer Repair', 'Taking too long to dry', 30),
    ('Dryer Repair', 'Making noise', 40),
    ('Dryer Repair', 'Burning smell', 50),
    ('Dryer Repair', 'Not starting', 60),
    ('Washer Repair', 'Leaking', 10),
    ('Washer Repair', 'Not draining', 20),
    ('Washer Repair', 'Not spinning', 30),
    ('Washer Repair', 'Making noise', 40),
    ('Oven / Range Repair', 'Not heating', 10),
    ('Oven / Range Repair', 'Temperature problem', 20),
    ('Oven / Range Repair', 'Door not closing', 30),
    ('Ice Maker Repair', 'Not making ice', 10),
    ('Freezer Repair', 'Not freezing', 10),
    ('Wine Cooler Repair', 'Not cooling', 10),
    ('Microwave Repair', 'Not heating', 10),
    ('Cooktop Repair', 'Not heating', 10)
) as problem(job_type_name, name, sort_order)
  on sjt.company_id is null
 and sjt.normalized_name = public.normalize_catalog_label(problem.job_type_name)
on conflict do nothing;

insert into public.marketing_sources (company_id, code, name, normalized_name, category, sort_order)
values
  (null, null, 'Google Ads', public.normalize_catalog_label('Google Ads'), 'paid_search', 10),
  (null, null, 'Google Organic', public.normalize_catalog_label('Google Organic'), 'organic', 20),
  (null, null, 'Google Business Profile', public.normalize_catalog_label('Google Business Profile'), 'organic', 30),
  (null, null, 'Website', public.normalize_catalog_label('Website'), 'website', 40),
  (null, null, 'Reserve with Google', public.normalize_catalog_label('Reserve with Google'), 'marketplace', 50),
  (null, null, 'Thumbtack', public.normalize_catalog_label('Thumbtack'), 'marketplace', 60),
  (null, null, 'Yelp', public.normalize_catalog_label('Yelp'), 'marketplace', 70),
  (null, null, 'Nextdoor', public.normalize_catalog_label('Nextdoor'), 'marketplace', 80),
  (null, null, 'Referral', public.normalize_catalog_label('Referral'), 'referral', 90),
  (null, null, 'Returning Customer', public.normalize_catalog_label('Returning Customer'), 'returning_customer', 100),
  (null, null, 'Facebook', public.normalize_catalog_label('Facebook'), 'social', 110),
  (null, null, 'Instagram', public.normalize_catalog_label('Instagram'), 'social', 120),
  (null, null, 'Direct Call', public.normalize_catalog_label('Direct Call'), 'direct', 130),
  (null, null, 'Property Management', public.normalize_catalog_label('Property Management'), 'property_management', 140),
  (null, null, 'Other', public.normalize_catalog_label('Other'), 'other', 900)
on conflict do nothing;

insert into public.service_tags (company_id, name, normalized_name, category, tone, sort_order)
values
  (null, 'High-End Appliance', public.normalize_catalog_label('High-End Appliance'), 'appliance', 'blue', 10),
  (null, 'Sealed System', public.normalize_catalog_label('Sealed System'), 'appliance', 'blue', 20),
  (null, 'Callback', public.normalize_catalog_label('Callback'), 'workflow', 'red', 30),
  (null, 'Follow Up', public.normalize_catalog_label('Follow Up'), 'workflow', 'yellow', 40),
  (null, 'Call Before Arrival', public.normalize_catalog_label('Call Before Arrival'), 'customer', 'orange', 50),
  (null, 'Recall', public.normalize_catalog_label('Recall'), 'workflow', 'red', 60),
  (null, 'Property Management', public.normalize_catalog_label('Property Management'), 'customer', 'purple', 70),
  (null, 'Warranty', public.normalize_catalog_label('Warranty'), 'warranty', 'green', 80),
  (null, 'Priority', public.normalize_catalog_label('Priority'), 'priority', 'red', 90)
on conflict do nothing;

create or replace function public.company_scope_for_service_request(target_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select sr.company_id from public.service_requests sr where sr.id = target_request_id),
    (select p.company_id from public.profiles p where p.id = auth.uid()),
    (
      select cm.company_id
      from public.company_members cm
      where cm.profile_id = auth.uid()
        and cm.member_status = 'active'
        and cm.archived_at is null
        and cm.removed_at is null
        and cm.suspended_at is null
      order by cm.created_at asc
      limit 1
    )
  );
$$;

create or replace function public.service_request_details_snapshot(target_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', sr.id,
    'jobTypeId', sr.job_type_id,
    'jobName', coalesce(nullif(btrim(sr.job_name), ''), public.service_request_default_job_name(sr.appliance_type)),
    'problemTypeId', sr.problem_type_id,
    'description', sr.issue_description,
    'marketingSourceId', sr.marketing_source_id,
    'marketingSource', case
      when ms.id is null then null
      else jsonb_build_object(
        'id', ms.id,
        'name', ms.name,
        'code', ms.code,
        'category', ms.category
      )
    end,
    'technicalRequestSource', sr.request_source,
    'tags', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'category', st.category,
            'tone', st.tone
          )
          order by st.sort_order, st.name
        )
        from public.service_request_tags srt
        join public.service_tags st on st.id = srt.tag_id
        where srt.service_request_id = sr.id
      ),
      '[]'::jsonb
    )
  )
  from public.service_requests sr
  left join public.marketing_sources ms on ms.id = sr.marketing_source_id
  where sr.id = target_request_id;
$$;

create or replace function public.get_service_request_details_options_rpc(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  scope_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  scope_company_id := public.company_scope_for_service_request(p_request_id);

  return jsonb_build_object(
    'job', public.service_request_details_snapshot(p_request_id),
    'jobTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'applianceCategory', appliance_category,
        'isSystem', company_id is null
      ) order by sort_order, name)
      from public.service_job_types
      where is_active = true
        and (company_id is null or company_id = scope_company_id)
    ), '[]'::jsonb),
    'problemTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'jobTypeId', job_type_id,
        'applianceCategory', appliance_category,
        'name', name,
        'isSystem', company_id is null
      ) order by sort_order, name)
      from public.service_problem_types
      where is_active = true
        and (company_id is null or company_id = scope_company_id)
    ), '[]'::jsonb),
    'marketingSources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'code', code,
        'category', category,
        'isSystem', company_id is null
      ) order by sort_order, name)
      from public.marketing_sources
      where is_active = true
        and (company_id is null or company_id = scope_company_id)
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'category', category,
        'tone', tone,
        'isSystem', company_id is null
      ) order by sort_order, name)
      from public.service_tags
      where is_active = true
        and (company_id is null or company_id = scope_company_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_service_request_details_rpc(
  p_request_id uuid,
  p_job_type_id uuid default null,
  p_job_name text default null,
  p_problem_type_id uuid default null,
  p_description text default null,
  p_marketing_source_id uuid default null,
  p_tag_ids uuid[] default array[]::uuid[],
  p_new_job_type_name text default null,
  p_new_problem_name text default null,
  p_new_marketing_source_name text default null,
  p_new_tag_name text default null,
  p_new_tag_category text default 'custom',
  p_new_tag_tone text default 'gray'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  scope_company_id uuid;
  cleaned_job_name text := nullif(btrim(coalesce(p_job_name, '')), '');
  cleaned_description text := nullif(btrim(coalesce(p_description, '')), '');
  new_normalized text;
  resolved_job_type_id uuid := p_job_type_id;
  resolved_problem_type_id uuid := p_problem_type_id;
  resolved_marketing_source_id uuid := p_marketing_source_id;
  resolved_tag_ids uuid[] := coalesce(p_tag_ids, array[]::uuid[]);
  tag_id uuid;
  current_job_type public.service_job_types%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  scope_company_id := public.company_scope_for_service_request(p_request_id);

  if nullif(btrim(coalesce(p_new_job_type_name, '')), '') is not null then
    new_normalized := public.normalize_catalog_label(p_new_job_type_name);

    select id into resolved_job_type_id
    from public.service_job_types
    where normalized_name = new_normalized
      and (company_id is null or company_id = scope_company_id)
    order by company_id is null, created_at asc
    limit 1;

    if resolved_job_type_id is null then
      insert into public.service_job_types (
        company_id,
        name,
        normalized_name,
        appliance_category,
        sort_order
      )
      values (
        scope_company_id,
        btrim(p_new_job_type_name),
        new_normalized,
        regexp_replace(btrim(p_new_job_type_name), '\s+repair$', '', 'i'),
        500
      )
      returning id into resolved_job_type_id;
    end if;
  end if;

  if resolved_job_type_id is not null then
    select * into current_job_type
    from public.service_job_types
    where id = resolved_job_type_id
      and (company_id is null or company_id = scope_company_id)
      and is_active = true;

    if current_job_type.id is null then
      raise exception 'Choose a valid job type.'
        using errcode = '22023';
    end if;

    cleaned_job_name := coalesce(cleaned_job_name, current_job_type.name);
  end if;

  if nullif(btrim(coalesce(p_new_problem_name, '')), '') is not null then
    new_normalized := public.normalize_catalog_label(p_new_problem_name);

    select id into resolved_problem_type_id
    from public.service_problem_types
    where normalized_name = new_normalized
      and (company_id is null or company_id = scope_company_id)
      and (
        resolved_job_type_id is null
        or job_type_id is null
        or job_type_id = resolved_job_type_id
      )
    order by company_id is null, created_at asc
    limit 1;

    if resolved_problem_type_id is null then
      insert into public.service_problem_types (
        company_id,
        job_type_id,
        appliance_category,
        name,
        normalized_name,
        sort_order
      )
      values (
        scope_company_id,
        resolved_job_type_id,
        current_job_type.appliance_category,
        btrim(p_new_problem_name),
        new_normalized,
        500
      )
      returning id into resolved_problem_type_id;
    end if;

    cleaned_description := coalesce(cleaned_description, btrim(p_new_problem_name));
  end if;

  if resolved_problem_type_id is not null then
    perform 1
    from public.service_problem_types
    where id = resolved_problem_type_id
      and (company_id is null or company_id = scope_company_id)
      and is_active = true;

    if not found then
      raise exception 'Choose a valid problem.'
        using errcode = '22023';
    end if;
  end if;

  if nullif(btrim(coalesce(p_new_marketing_source_name, '')), '') is not null then
    new_normalized := public.normalize_catalog_label(p_new_marketing_source_name);

    select id into resolved_marketing_source_id
    from public.marketing_sources
    where normalized_name = new_normalized
      and (company_id is null or company_id = scope_company_id)
    order by company_id is null, created_at asc
    limit 1;

    if resolved_marketing_source_id is null then
      insert into public.marketing_sources (
        company_id,
        name,
        normalized_name,
        category,
        sort_order
      )
      values (
        scope_company_id,
        btrim(p_new_marketing_source_name),
        new_normalized,
        'other',
        500
      )
      returning id into resolved_marketing_source_id;
    end if;
  end if;

  if resolved_marketing_source_id is not null then
    perform 1
    from public.marketing_sources
    where id = resolved_marketing_source_id
      and (company_id is null or company_id = scope_company_id)
      and is_active = true;

    if not found then
      raise exception 'Choose a valid ad source.'
        using errcode = '22023';
    end if;
  end if;

  if nullif(btrim(coalesce(p_new_tag_name, '')), '') is not null then
    if coalesce(p_new_tag_category, 'custom') not in (
      'appliance',
      'brand',
      'workflow',
      'pricing',
      'customer',
      'warranty',
      'priority',
      'custom'
    ) then
      raise exception 'Choose a valid tag category.'
        using errcode = '22023';
    end if;

    if coalesce(p_new_tag_tone, 'gray') not in (
      'gray',
      'blue',
      'green',
      'yellow',
      'orange',
      'red',
      'purple'
    ) then
      raise exception 'Choose a valid tag color.'
        using errcode = '22023';
    end if;

    new_normalized := public.normalize_catalog_label(p_new_tag_name);

    select id into tag_id
    from public.service_tags
    where normalized_name = new_normalized
      and (company_id is null or company_id = scope_company_id)
    order by company_id is null, created_at asc
    limit 1;

    if tag_id is null then
      insert into public.service_tags (
        company_id,
        name,
        normalized_name,
        category,
        tone,
        sort_order
      )
      values (
        scope_company_id,
        btrim(p_new_tag_name),
        new_normalized,
        coalesce(p_new_tag_category, 'custom'),
        coalesce(p_new_tag_tone, 'gray'),
        500
      )
      returning id into tag_id;
    end if;

    resolved_tag_ids := array_append(resolved_tag_ids, tag_id);
  end if;

  if cleaned_job_name is null then
    raise exception 'Job name is required.'
      using errcode = '22023';
  end if;

  if cleaned_description is null then
    raise exception 'Description is required.'
      using errcode = '22023';
  end if;

  update public.service_requests
  set
    job_type_id = resolved_job_type_id,
    job_name = cleaned_job_name,
    problem_type_id = resolved_problem_type_id,
    issue_description = cleaned_description,
    marketing_source_id = resolved_marketing_source_id,
    updated_at = now()
  where id = p_request_id;

  delete from public.service_request_tags
  where service_request_id = p_request_id;

  foreach tag_id in array coalesce(resolved_tag_ids, array[]::uuid[])
  loop
    if tag_id is null then
      continue;
    end if;

    perform 1
    from public.service_tags
    where id = tag_id
      and (company_id is null or company_id = scope_company_id)
      and is_active = true;

    if not found then
      raise exception 'Choose a valid tag.'
        using errcode = '22023';
    end if;

    insert into public.service_request_tags (service_request_id, tag_id, created_by)
    values (p_request_id, tag_id, auth.uid())
    on conflict do nothing;
  end loop;

  return public.get_service_request_details_options_rpc(p_request_id);
end;
$$;

comment on function public.get_service_request_details_options_rpc(uuid) is
  'Task 165.23. Returns the current job details snapshot and company/system catalogs for the mobile Job Details editor.';

comment on function public.update_service_request_details_rpc(uuid, uuid, text, uuid, text, uuid, uuid[], text, text, text, text, text, text) is
  'Task 165.23. Trusted update path for Job Name, Description, marketing attribution, and tags. Does not modify technical request_source.';

revoke all on function public.get_service_request_details_options_rpc(uuid) from public;
grant execute on function public.get_service_request_details_options_rpc(uuid) to authenticated;

revoke all on function public.update_service_request_details_rpc(uuid, uuid, text, uuid, text, uuid, uuid[], text, text, text, text, text, text) from public;
grant execute on function public.update_service_request_details_rpc(uuid, uuid, text, uuid, text, uuid, uuid[], text, text, text, text, text, text) to authenticated;
