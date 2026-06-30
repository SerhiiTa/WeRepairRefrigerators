-- Task 147.1: Technician marketplace profile readiness.
--
-- Forward-only apply-ready migration for dev/staging.
--
-- Purpose:
--   Let technician-capable dashboard users configure the real profile data that
--   powers customer booking eligibility and ranking without creating duplicate
--   technician storage.
--
-- Scope:
--   - Adds explicit marketplace matching fields to public.technician_profiles.
--   - Replaces the public technician view to expose only public-safe fields.
--   - Replaces the existing self-owned technician profile RPC with additional
--     safe editable fields.
--   - Keeps the existing verified-only marketplace constraint intact.
--   - Does not expose private profile ids, phone numbers, emails, or service_role
--     behavior to frontend code.

alter table public.technician_profiles
  add column if not exists service_cities text[] not null default '{}',
  add column if not exists appliance_categories text[] not null default '{}',
  add column if not exists brands_serviced text[] not null default '{}',
  add column if not exists avatar_color text not null default '#0F6BFF';

comment on column public.technician_profiles.service_cities is
  'Customer-booking marketplace service cities configured by the technician/company owner.';
comment on column public.technician_profiles.appliance_categories is
  'Customer-booking appliance categories serviced by this technician.';
comment on column public.technician_profiles.brands_serviced is
  'Customer-booking brand experience configured by this technician.';
comment on column public.technician_profiles.avatar_color is
  'Public-safe avatar placeholder color for technician marketplace cards.';

create or replace view public.public_technician_profiles
with (security_barrier = true)
as
select
  (
    trim(
      both '-' from lower(
        regexp_replace(
          coalesce(nullif(tp.business_name, ''), nullif(tp.display_name, ''), 'houston-appliance-technician'),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        )
      )
    )
    || '-'
    || substring(md5(tp.id::text) from 1 for 8)
  ) as slug,
  tp.display_name,
  tp.business_name,
  tp.primary_city,
  tp.primary_state,
  tp.service_summary_public,
  tp.service_zip_codes,
  tp.service_cities,
  tp.appliance_categories,
  tp.brands_serviced,
  tp.specialties,
  tp.languages,
  tp.years_experience,
  tp.avatar_color,
  tp.technician_status,
  tp.public_profile_ready,
  tp.marketplace_enabled,
  tp.created_at
from public.technician_profiles tp
where tp.public_profile_ready = true
  and tp.marketplace_enabled = true
  and tp.technician_status = 'verified'
  and tp.archived_at is null
  and tp.rejected_at is null
  and tp.suspended_at is null
  and (
    nullif(tp.display_name, '') is not null
    or nullif(tp.business_name, '') is not null
  );

revoke all on public.public_technician_profiles from public;
grant select on public.public_technician_profiles to anon, authenticated;

comment on view public.public_technician_profiles is
  'Sanitized public technician profile projection for customer-facing pages and booking. Does not expose profile_id, company_id, private bio, verification internals, suspension/rejection/archive details, emails, phones, or audit data.';

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
  p_marketplace_enabled boolean default null
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

  if v_avatar_color !~ '^#[0-9A-Fa-f]{6}$' then
    v_avatar_color := '#0F6BFF';
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
  boolean
) is
  'Task 147.1 safe technician marketplace profile RPC. Lets authenticated technician-capable callers update self-owned marketplace readiness fields while keeping verification and private identity fields protected.';

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
  boolean
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
  boolean
) to authenticated;
