-- Task 125: Dev/staging appointment booking QA fixture.
--
-- DEV/STAGING ONLY. DO NOT APPLY TO PRODUCTION.
--
-- This script does not create an auth password. First create or update the
-- Supabase Auth user in the dev/staging dashboard and set a temporary password
-- in your password manager. Then update qa_user_email below if needed and apply
-- this script in Supabase SQL Editor.
--
-- Default QA user:
--   qa-booking-tech@example.test
--
-- The script prepares:
--   - active technician dashboard profile
--   - public-ready verified technician profile
--   - Monday availability that matches the current dispatcher preview date
--     fallback of 2026-06-01
--   - two private service requests selected for that public technician slug
--
-- It intentionally does not store real customer or technician phone numbers.

do $$
declare
  qa_user_email text := lower('qa-booking-tech@example.test');
  qa_profile_id uuid;
  qa_technician_profile_id uuid;
  qa_slug text;
begin
  select p.id
    into qa_profile_id
  from public.profiles p
  where lower(p.email) = qa_user_email
  order by p.created_at asc
  limit 1;

  if qa_profile_id is null then
    raise exception 'QA profile % not found. Create the Supabase Auth user first, confirm it, then rerun this fixture.', qa_user_email;
  end if;

  -- Existing profile protection triggers correctly block browser self-escalation.
  -- For dev/staging fixture setup only, the SQL Editor admin session temporarily
  -- disables them around the controlled QA profile update.
  alter table public.profiles disable trigger prevent_unsafe_profile_updates;
  alter table public.profiles disable trigger prevent_unsafe_onboarding_profile_updates;

  update public.profiles
  set
    full_name = 'QA Booking Technician',
    role = 'technician',
    status = 'active',
    role_intent = 'technician',
    onboarding_status = 'complete',
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    updated_at = now()
  where id = qa_profile_id;

  alter table public.profiles enable trigger prevent_unsafe_profile_updates;
  alter table public.profiles enable trigger prevent_unsafe_onboarding_profile_updates;

  select tp.id
    into qa_technician_profile_id
  from public.technician_profiles tp
  where tp.profile_id = qa_profile_id
  order by tp.created_at desc
  limit 1;

  if qa_technician_profile_id is null then
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
      qa_profile_id,
      null,
      'independent',
      'QA Booking Technician',
      'QA Booking Refrigeration',
      12,
      'Dev/staging refrigerator and built-in refrigeration booking QA profile.',
      null,
      'Katy',
      'TX',
      array['77494', '77449', '77084', '77095'],
      array['Refrigerators', 'Built-in Refrigeration', 'Sub-Zero', 'Ice Makers'],
      array['English'],
      'verified',
      true,
      true,
      now(),
      now(),
      qa_profile_id,
      null,
      null,
      null,
      null
    )
    returning id into qa_technician_profile_id;
  else
    update public.technician_profiles
    set
      company_id = null,
      affiliation_type = 'independent',
      display_name = 'QA Booking Technician',
      business_name = 'QA Booking Refrigeration',
      years_experience = 12,
      service_summary_public = 'Dev/staging refrigerator and built-in refrigeration booking QA profile.',
      primary_city = 'Katy',
      primary_state = 'TX',
      service_zip_codes = array['77494', '77449', '77084', '77095'],
      specialties = array['Refrigerators', 'Built-in Refrigeration', 'Sub-Zero', 'Ice Makers'],
      languages = array['English'],
      technician_status = 'verified',
      marketplace_enabled = true,
      public_profile_ready = true,
      verification_submitted_at = coalesce(verification_submitted_at, now()),
      verified_at = coalesce(verified_at, now()),
      verified_by_profile_id = coalesce(verified_by_profile_id, qa_profile_id),
      rejected_at = null,
      suspended_at = null,
      archived_by_profile_id = null,
      archived_at = null,
      updated_at = now()
    where id = qa_technician_profile_id;
  end if;

  qa_slug := public.public_technician_profile_slug_for_profile(qa_profile_id);

  if qa_slug is null then
    raise exception 'QA public technician slug was not generated. Confirm 0015 public technician view/helpers and technician profile readiness.';
  end if;

  delete from public.service_requests
  where customer_email = 'qa-booking@example.test'
    and customer_name in (
      'QA Booking Primary',
      'QA Booking Overlap'
    );

  delete from public.technician_availability_rules
  where technician_profile_id = qa_technician_profile_id
    and day_of_week = 1
    and start_time = '09:00'::time
    and end_time = '12:00'::time;

  insert into public.technician_availability_rules (
    company_id,
    technician_profile_id,
    day_of_week,
    start_time,
    end_time,
    is_available
  ) values (
    null,
    qa_technician_profile_id,
    1,
    '09:00',
    '12:00',
    true
  );

  insert into public.service_requests (
    customer_name,
    customer_email,
    customer_phone,
    appliance_type,
    appliance_brand,
    appliance_model,
    issue_description,
    zip_code,
    city,
    state,
    preferred_time_window,
    selected_technician_slug,
    selected_technician_business_name,
    request_source,
    status
  ) values
  (
    'QA Booking Primary',
    'qa-booking@example.test',
    null,
    'Built-In Refrigerator',
    'Sub-Zero',
    'BI-48',
    'Dev QA booking request. Customer reports built-in refrigerator is warm and fan is noisy.',
    '77494',
    'Katy',
    'TX',
    'Morning',
    qa_slug,
    'QA Booking Refrigeration',
    'technician_profile',
    'new'
  ),
  (
    'QA Booking Overlap',
    'qa-booking@example.test',
    null,
    'Refrigerator',
    'Sub-Zero',
    null,
    'Dev QA overlap request. Use after booking the primary request to confirm overlap protection.',
    '77494',
    'Katy',
    'TX',
    'Morning',
    qa_slug,
    'QA Booking Refrigeration',
    'technician_profile',
    'new'
  );

  raise notice 'Task 125 booking QA fixture ready. Email %, technician_profile %, slug %', qa_user_email, qa_technician_profile_id, qa_slug;
end
$$;

-- Manual verification after applying:
--
-- select id, customer_name, status, selected_technician_slug, appointment_id,
--        assigned_technician_profile_id, scheduled_date,
--        scheduled_window_start_time, scheduled_window_end_time
-- from public.service_requests
-- where customer_email = 'qa-booking@example.test'
-- order by created_at desc;
--
-- select id, technician_profile_id, appointment_date, window_start_time,
--        window_end_time, status, source
-- from public.appointments
-- where service_request_id in (
--   select id from public.service_requests
--   where customer_email = 'qa-booking@example.test'
-- )
-- order by created_at desc;
