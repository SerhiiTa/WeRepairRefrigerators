-- WeRepairRefrigerators Task 83 dev/staging migration.
--
-- Purpose:
-- Add a narrow authenticated RPC for self-owned technician profile edits.
--
-- Scope:
-- - Apply-ready for the confirmed dev/staging Supabase project after review.
-- - Not applied automatically by Codex.
-- - Does not expose service_role behavior to frontend code.
-- - Does not accept caller-supplied profile/company/user ids.
-- - Updates only self-editable technician profile fields.
-- - Leaves verification, marketplace, public profile, affiliation, company,
--   suspension, rejection, archive, and ownership fields server/admin controlled.

create or replace function public.update_own_technician_profile_rpc(
  p_display_name text default null,
  p_business_name text default null,
  p_years_experience integer default null,
  p_service_summary_public text default null,
  p_bio_private text default null,
  p_primary_city text default null,
  p_primary_state text default 'TX',
  p_service_zip_codes text[] default '{}',
  p_specialties text[] default '{}',
  p_languages text[] default '{}'
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
  v_service_zip_codes text[];
  v_specialties text[];
  v_languages text[];
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

  select coalesce(array_agg(value), '{}'::text[])
  into v_service_zip_codes
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 40) as value
    from unnest(coalesce(p_service_zip_codes, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 20
  ) normalized;

  select coalesce(array_agg(value), '{}'::text[])
  into v_specialties
  from (
    select distinct left(regexp_replace(btrim(item), '\s+', ' ', 'g'), 40) as value
    from unnest(coalesce(p_specialties, '{}'::text[])) as raw(item)
    where nullif(btrim(item), '') is not null
    order by value
    limit 20
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

  select *
  into v_technician_profile
  from public.technician_profiles
  where profile_id = v_user_id
    and archived_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Technician profile not found'
      using errcode = 'P0002';
  end if;

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
    updated_at = now()
  where id = v_technician_profile.id
    and profile_id = v_user_id
    and archived_at is null
  returning * into v_technician_profile;

  return v_technician_profile;
end;
$$;

comment on function public.update_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[]
) is
  'Task 83 safe technician profile update RPC. Lets an authenticated technician-capable caller update only approved self-owned profile fields.';

revoke all on function public.update_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[]
) from public;

revoke all on function public.update_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[]
) from anon;

grant execute on function public.update_own_technician_profile_rpc(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[]
) to authenticated;
