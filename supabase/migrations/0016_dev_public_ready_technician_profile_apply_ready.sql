-- Task 89: Create one public-ready dev technician profile.
--
-- DEV/STAGING ONLY.
-- This is not a production seed and should not be applied to production data.
-- Purpose: make one existing dev technician profile qualify for the sanitized
-- public.public_technician_profiles view created by migration 0015.
--
-- Apply manually in Supabase SQL Editor for the confirmed dev/staging project.
-- This migration does not weaken RLS, does not grant permissions, and does not
-- expose private technician fields. It only updates or creates one row owned by
-- the existing dev auth/profile account below.
--
-- Expected owner profile:
--   info@refrigeratorhoustonrepair.com
--
-- If this profile does not exist, the block raises an exception instead of
-- creating unsafe fake auth/profile ownership.

do $$
declare
  v_profile_id uuid;
  v_technician_profile_id uuid;
begin
  select p.id
    into v_profile_id
  from public.profiles p
  where lower(p.email) = lower('info@refrigeratorhoustonrepair.com')
  order by p.created_at asc
  limit 1;

  if v_profile_id is null then
    raise exception 'Dev profile info@refrigeratorhoustonrepair.com was not found in public.profiles. Sign up/log in first or update this script to a known dev profile email before applying.';
  end if;

  select tp.id
    into v_technician_profile_id
  from public.technician_profiles tp
  where tp.profile_id = v_profile_id
  order by tp.created_at desc
  limit 1;

  if v_technician_profile_id is null then
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
      technician_status,
      marketplace_enabled,
      public_profile_ready,
      verification_submitted_at,
      verified_at,
      verified_by_profile_id,
      rejected_at,
      suspended_at,
      archived_by_profile_id,
      archived_at
    ) values (
      v_profile_id,
      null,
      'independent',
      'Sergio Martinez',
      'Refrigerator Houston Repair',
      12,
      'Refrigerator repair specialist serving Houston, Katy, Cypress, Sugar Land, Richmond, and surrounding areas. Experienced with Sub-Zero, Viking, Thermador, LG, Samsung, Whirlpool, GE, and built-in refrigeration.',
      null,
      'Katy',
      'TX',
      array['77494', '77449', '77084', '77095', '77064', '77433', '77407'],
      array['Refrigerators', 'Built-in Refrigeration', 'Ice Makers', 'Sealed System', 'Compressors'],
      array['English', 'Spanish'],
      'verified',
      true,
      true,
      now(),
      now(),
      v_profile_id,
      null,
      null,
      null,
      null
    )
    returning id into v_technician_profile_id;
  else
    update public.technician_profiles
    set
      company_id = null,
      affiliation_type = 'independent',
      display_name = 'Sergio Martinez',
      business_name = 'Refrigerator Houston Repair',
      years_experience = 12,
      service_summary_public = 'Refrigerator repair specialist serving Houston, Katy, Cypress, Sugar Land, Richmond, and surrounding areas. Experienced with Sub-Zero, Viking, Thermador, LG, Samsung, Whirlpool, GE, and built-in refrigeration.',
      primary_city = 'Katy',
      primary_state = 'TX',
      service_zip_codes = array['77494', '77449', '77084', '77095', '77064', '77433', '77407'],
      specialties = array['Refrigerators', 'Built-in Refrigeration', 'Ice Makers', 'Sealed System', 'Compressors'],
      languages = array['English', 'Spanish'],
      technician_status = 'verified',
      marketplace_enabled = true,
      public_profile_ready = true,
      verification_submitted_at = coalesce(verification_submitted_at, now()),
      verified_at = coalesce(verified_at, now()),
      verified_by_profile_id = coalesce(verified_by_profile_id, v_profile_id),
      rejected_at = null,
      suspended_at = null,
      archived_by_profile_id = null,
      archived_at = null
    where id = v_technician_profile_id;
  end if;

  raise notice 'Dev public-ready technician profile prepared: %', v_technician_profile_id;
end
$$;

-- Verification after applying manually:
-- select slug, display_name, business_name, primary_city, primary_state, specialties, languages, years_experience
-- from public.public_technician_profiles
-- where business_name = 'Refrigerator Houston Repair';
--
-- Expected public slug format:
--   refrigerator-houston-repair-<8-char-id-hash>
