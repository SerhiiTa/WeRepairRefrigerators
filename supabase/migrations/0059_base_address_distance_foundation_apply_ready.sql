-- Task 165.14: Base address and distance foundation.
--
-- Forward-only apply-ready migration.
--
-- Purpose:
-- - Add explicit company and technician base addresses for driving-distance
--   calculations.
-- - Keep phone/device geolocation out of the workflow.
-- - Extend the existing trusted technician profile RPC with optional base
--   address fields.
-- - Add a narrow trusted company base address RPC for owner/manager/admin use.

alter table public.companies
  add column if not exists base_address_line1 text,
  add column if not exists base_address_line2 text,
  add column if not exists base_city text,
  add column if not exists base_state text,
  add column if not exists base_zip text,
  add column if not exists base_country text not null default 'US',
  add column if not exists base_formatted_address text,
  add column if not exists base_latitude double precision,
  add column if not exists base_longitude double precision,
  add column if not exists base_place_id text,
  add column if not exists base_address_updated_at timestamptz;

alter table public.technician_profiles
  add column if not exists base_address_line1 text,
  add column if not exists base_address_line2 text,
  add column if not exists base_city text,
  add column if not exists base_state text,
  add column if not exists base_zip text,
  add column if not exists base_country text not null default 'US',
  add column if not exists base_formatted_address text,
  add column if not exists base_latitude double precision,
  add column if not exists base_longitude double precision,
  add column if not exists base_place_id text,
  add column if not exists base_address_updated_at timestamptz;

comment on column public.companies.base_formatted_address is
  'Saved company dispatch/home-base address used as the default origin for driving-distance calculations. Not device GPS.';
comment on column public.technician_profiles.base_formatted_address is
  'Saved technician base-address override used before company base address for driving-distance calculations. Not device GPS.';

create index if not exists companies_base_address_idx
  on public.companies(base_state, base_zip)
  where base_formatted_address is not null;

create index if not exists technician_profiles_base_address_idx
  on public.technician_profiles(base_state, base_zip)
  where base_formatted_address is not null;

drop function if exists public.upsert_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text,
  boolean
);

create or replace function public.upsert_own_technician_profile_rpc(
  p_display_name text default null,
  p_business_name text default null,
  p_years_experience integer default null,
  p_service_summary_public text default null,
  p_bio_private text default null,
  p_primary_city text default null,
  p_primary_state text default 'TX',
  p_service_zip_codes text[] default '{}',
  p_specialties text[] default '{}',
  p_languages text[] default '{}',
  p_service_cities text[] default '{}',
  p_appliance_categories text[] default '{}',
  p_brands_serviced text[] default '{}',
  p_avatar_color text default '#0F6BFF',
  p_marketplace_enabled boolean default null,
  p_base_address_line1 text default null,
  p_base_address_line2 text default null,
  p_base_city text default null,
  p_base_state text default null,
  p_base_zip text default null,
  p_base_country text default 'US',
  p_base_formatted_address text default null,
  p_base_latitude double precision default null,
  p_base_longitude double precision default null,
  p_base_place_id text default null
)
returns public.technician_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_technician_profile public.technician_profiles%rowtype;
  v_display_name text := left(nullif(regexp_replace(btrim(p_display_name), '\s+', ' ', 'g'), ''), 120);
  v_business_name text := left(nullif(regexp_replace(btrim(p_business_name), '\s+', ' ', 'g'), ''), 120);
  v_service_summary_public text := left(nullif(regexp_replace(btrim(p_service_summary_public), '\s+', ' ', 'g'), ''), 1200);
  v_bio_private text := left(nullif(regexp_replace(btrim(p_bio_private), '\s+', ' ', 'g'), ''), 1200);
  v_primary_city text := left(nullif(regexp_replace(btrim(p_primary_city), '\s+', ' ', 'g'), ''), 120);
  v_primary_state text := upper(coalesce(nullif(btrim(p_primary_state), ''), 'TX'));
  v_avatar_color text := coalesce(nullif(btrim(p_avatar_color), ''), '#0F6BFF');
  v_base_address_line1 text := left(nullif(regexp_replace(btrim(p_base_address_line1), '\s+', ' ', 'g'), ''), 180);
  v_base_address_line2 text := left(nullif(regexp_replace(btrim(p_base_address_line2), '\s+', ' ', 'g'), ''), 80);
  v_base_city text := left(nullif(regexp_replace(btrim(p_base_city), '\s+', ' ', 'g'), ''), 120);
  v_base_state text := upper(nullif(btrim(p_base_state), ''));
  v_base_zip text := left(nullif(regexp_replace(btrim(p_base_zip), '\s+', ' ', 'g'), ''), 20);
  v_base_country text := upper(coalesce(nullif(btrim(p_base_country), ''), 'US'));
  v_base_formatted_address text := left(nullif(regexp_replace(btrim(p_base_formatted_address), '\s+', ' ', 'g'), ''), 320);
  v_base_latitude double precision := p_base_latitude;
  v_base_longitude double precision := p_base_longitude;
  v_base_place_id text := left(nullif(btrim(p_base_place_id), ''), 160);
  v_has_base_address boolean;
  v_service_zip_codes text[];
  v_specialties text[];
  v_languages text[];
  v_service_cities text[];
  v_appliance_categories text[];
  v_brands_serviced text[];
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Profile row is required'
      using errcode = '42501';
  end if;

  if v_profile.status not in ('active', 'verified') then
    raise exception 'Active profile is required'
      using errcode = '42501';
  end if;

  if v_profile.role not in (
    'technician',
    'verified_technician',
    'expert_technician',
    'company_owner',
    'admin'
  ) then
    raise exception 'Technician-capable role is required'
      using errcode = '42501';
  end if;

  if v_primary_state !~ '^[A-Z]{2}$' then
    raise exception 'Primary state must be a two-letter state code';
  end if;

  if v_base_state is not null and v_base_state !~ '^[A-Z]{2}$' then
    raise exception 'Base state must be a two-letter state code';
  end if;

  if v_base_country is not null and v_base_country !~ '^[A-Z]{2}$' then
    raise exception 'Base country must be a two-letter country code';
  end if;

  if v_avatar_color !~ '^#[0-9A-Fa-f]{6}$' then
    v_avatar_color := '#0F6BFF';
  end if;

  v_has_base_address := v_base_address_line1 is not null
    or v_base_city is not null
    or v_base_zip is not null
    or v_base_formatted_address is not null;

  if v_base_formatted_address is null and v_has_base_address then
    v_base_formatted_address := concat_ws(
      ', ',
      nullif(concat_ws(' ', v_base_address_line1, v_base_address_line2), ''),
      nullif(concat_ws(' ', v_base_city, v_base_state, v_base_zip), ''),
      v_base_country
    );
  end if;

  if not v_has_base_address then
    v_base_country := 'US';
    v_base_latitude := null;
    v_base_longitude := null;
    v_base_place_id := null;
  elsif v_base_latitude is null or v_base_longitude is null then
    v_base_latitude := null;
    v_base_longitude := null;
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into v_service_zip_codes
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 40) as value
    from unnest(coalesce(p_service_zip_codes, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 80
  ) normalized;

  select coalesce(array_agg(value), '{}'::text[])
  into v_specialties
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 80) as value
    from unnest(coalesce(p_specialties, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 80
  ) normalized;

  select coalesce(array_agg(value), '{}'::text[])
  into v_languages
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 40) as value
    from unnest(coalesce(p_languages, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 20
  ) normalized;

  select coalesce(array_agg(value), '{}'::text[])
  into v_service_cities
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 80) as value
    from unnest(coalesce(p_service_cities, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 80
  ) normalized;

  select coalesce(array_agg(value), '{}'::text[])
  into v_appliance_categories
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 80) as value
    from unnest(coalesce(p_appliance_categories, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 80
  ) normalized;

  select coalesce(array_agg(value), '{}'::text[])
  into v_brands_serviced
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 80) as value
    from unnest(coalesce(p_brands_serviced, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 120
  ) normalized;

  select *
  into v_technician_profile
  from public.technician_profiles
  where profile_id = v_user_id
    and archived_at is null
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_technician_profile.technician_status in ('rejected', 'suspended', 'archived') then
      raise exception 'Technician profile is not editable in its current status'
        using errcode = '42501';
    end if;

    update public.technician_profiles
    set
      display_name = v_display_name,
      business_name = v_business_name,
      years_experience = case
        when p_years_experience is null then null
        else greatest(0, least(80, p_years_experience))
      end,
      service_summary_public = v_service_summary_public,
      bio_private = v_bio_private,
      primary_city = v_primary_city,
      primary_state = v_primary_state,
      service_zip_codes = v_service_zip_codes,
      specialties = v_specialties,
      languages = v_languages,
      service_cities = v_service_cities,
      appliance_categories = v_appliance_categories,
      brands_serviced = v_brands_serviced,
      avatar_color = v_avatar_color,
      marketplace_enabled = case
        when p_marketplace_enabled is null then marketplace_enabled
        when technician_status = 'verified' then p_marketplace_enabled
        else false
      end,
      public_profile_ready = case
        when p_marketplace_enabled is null then public_profile_ready
        when technician_status = 'verified' then p_marketplace_enabled
        else false
      end,
      base_address_line1 = v_base_address_line1,
      base_address_line2 = v_base_address_line2,
      base_city = v_base_city,
      base_state = v_base_state,
      base_zip = v_base_zip,
      base_country = coalesce(v_base_country, 'US'),
      base_formatted_address = v_base_formatted_address,
      base_latitude = case when v_has_base_address then v_base_latitude else null end,
      base_longitude = case when v_has_base_address then v_base_longitude else null end,
      base_place_id = v_base_place_id,
      base_address_updated_at = case when v_has_base_address then now() else null end,
      updated_at = now()
    where id = v_technician_profile.id
      and profile_id = v_user_id
      and archived_at is null
    returning * into v_technician_profile;

    return v_technician_profile;
  end if;

  insert into public.technician_profiles (
    profile_id,
    company_id,
    affiliation_type,
    display_name,
    business_name,
    years_experience,
    service_summary_public,
    bio_private,
    primary_city,
    primary_state,
    service_zip_codes,
    specialties,
    languages,
    service_cities,
    appliance_categories,
    brands_serviced,
    avatar_color,
    base_address_line1,
    base_address_line2,
    base_city,
    base_state,
    base_zip,
    base_country,
    base_formatted_address,
    base_latitude,
    base_longitude,
    base_place_id,
    base_address_updated_at,
    technician_status,
    marketplace_enabled,
    public_profile_ready,
    verified_at,
    verified_by_profile_id,
    rejected_at,
    suspended_at,
    archived_at,
    archived_by_profile_id
  )
  values (
    v_user_id,
    null,
    'independent',
    v_display_name,
    v_business_name,
    case
      when p_years_experience is null then null
      else greatest(0, least(80, p_years_experience))
    end,
    v_service_summary_public,
    v_bio_private,
    v_primary_city,
    v_primary_state,
    v_service_zip_codes,
    v_specialties,
    v_languages,
    v_service_cities,
    v_appliance_categories,
    v_brands_serviced,
    v_avatar_color,
    v_base_address_line1,
    v_base_address_line2,
    v_base_city,
    v_base_state,
    v_base_zip,
    coalesce(v_base_country, 'US'),
    v_base_formatted_address,
    case when v_has_base_address then v_base_latitude else null end,
    case when v_has_base_address then v_base_longitude else null end,
    v_base_place_id,
    case when v_has_base_address then now() else null end,
    'draft',
    false,
    false,
    null,
    null,
    null,
    null,
    null,
    null
  )
  returning * into v_technician_profile;

  return v_technician_profile;
end;
$$;

comment on function public.upsert_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) is
  'Task 165.14 safe technician marketplace/base-address RPC. Lets authenticated technician-capable callers update self-owned marketplace fields and their own base-address override.';

revoke all on function public.upsert_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) from public;

grant execute on function public.upsert_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) to authenticated;

create or replace function public.update_company_base_address_rpc(
  p_company_id uuid,
  p_base_address_line1 text default null,
  p_base_address_line2 text default null,
  p_base_city text default null,
  p_base_state text default null,
  p_base_zip text default null,
  p_base_country text default 'US',
  p_base_formatted_address text default null,
  p_base_latitude double precision default null,
  p_base_longitude double precision default null,
  p_base_place_id text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company public.companies%rowtype;
  v_base_address_line1 text := left(nullif(regexp_replace(btrim(p_base_address_line1), '\s+', ' ', 'g'), ''), 180);
  v_base_address_line2 text := left(nullif(regexp_replace(btrim(p_base_address_line2), '\s+', ' ', 'g'), ''), 80);
  v_base_city text := left(nullif(regexp_replace(btrim(p_base_city), '\s+', ' ', 'g'), ''), 120);
  v_base_state text := upper(nullif(btrim(p_base_state), ''));
  v_base_zip text := left(nullif(regexp_replace(btrim(p_base_zip), '\s+', ' ', 'g'), ''), 20);
  v_base_country text := upper(coalesce(nullif(btrim(p_base_country), ''), 'US'));
  v_base_formatted_address text := left(nullif(regexp_replace(btrim(p_base_formatted_address), '\s+', ' ', 'g'), ''), 320);
  v_base_latitude double precision := p_base_latitude;
  v_base_longitude double precision := p_base_longitude;
  v_base_place_id text := left(nullif(btrim(p_base_place_id), ''), 160);
  v_has_base_address boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'Company id is required';
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1
      from public.company_members cm
      join public.companies c on c.id = cm.company_id
      join public.profiles p on p.id = cm.profile_id
      where cm.company_id = p_company_id
        and cm.profile_id = v_user_id
        and cm.member_status = 'active'
        and cm.member_role in ('owner', 'manager')
        and cm.archived_at is null
        and cm.removed_at is null
        and cm.suspended_at is null
        and c.status = 'active'
        and c.archived_at is null
        and p.status in ('active', 'verified')
    )
  ) then
    raise exception 'Company base address requires owner or manager access'
      using errcode = '42501';
  end if;

  if v_base_state is not null and v_base_state !~ '^[A-Z]{2}$' then
    raise exception 'Base state must be a two-letter state code';
  end if;

  if v_base_country is not null and v_base_country !~ '^[A-Z]{2}$' then
    raise exception 'Base country must be a two-letter country code';
  end if;

  v_has_base_address := v_base_address_line1 is not null
    or v_base_city is not null
    or v_base_zip is not null
    or v_base_formatted_address is not null;

  if v_base_formatted_address is null and v_has_base_address then
    v_base_formatted_address := concat_ws(
      ', ',
      nullif(concat_ws(' ', v_base_address_line1, v_base_address_line2), ''),
      nullif(concat_ws(' ', v_base_city, v_base_state, v_base_zip), ''),
      v_base_country
    );
  end if;

  if not v_has_base_address then
    v_base_country := 'US';
    v_base_latitude := null;
    v_base_longitude := null;
    v_base_place_id := null;
  elsif v_base_latitude is null or v_base_longitude is null then
    v_base_latitude := null;
    v_base_longitude := null;
  end if;

  update public.companies
  set
    base_address_line1 = v_base_address_line1,
    base_address_line2 = v_base_address_line2,
    base_city = v_base_city,
    base_state = v_base_state,
    base_zip = v_base_zip,
    base_country = coalesce(v_base_country, 'US'),
    base_formatted_address = v_base_formatted_address,
    base_latitude = case when v_has_base_address then v_base_latitude else null end,
    base_longitude = case when v_has_base_address then v_base_longitude else null end,
    base_place_id = v_base_place_id,
    base_address_updated_at = case when v_has_base_address then now() else null end,
    updated_at = now()
  where id = p_company_id
    and archived_at is null
  returning * into v_company;

  if not found then
    raise exception 'Company not found'
      using errcode = '02000';
  end if;

  return v_company;
end;
$$;

comment on function public.update_company_base_address_rpc(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) is
  'Task 165.14 trusted company base-address updater. Only active owner/manager/admin access can update the company driving-distance origin.';

revoke all on function public.update_company_base_address_rpc(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) from public;

grant execute on function public.update_company_base_address_rpc(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
) to authenticated;

-- Verification helpers.
select
  '0059_base_address_distance_foundation_ready' as migration,
  to_regclass('public.companies') is not null as companies_exists,
  to_regclass('public.technician_profiles') is not null as technician_profiles_exists;
