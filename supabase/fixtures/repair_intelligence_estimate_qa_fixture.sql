-- Task 148.13: Dev/staging Repair Intelligence estimate persistence QA fixture.
--
-- DEV/STAGING ONLY. DO NOT APPLY TO PRODUCTION.
--
-- This script does not create an auth password. First create or update the
-- Supabase Auth user in the dev/staging dashboard, confirm the user, and store
-- the temporary password outside git/docs.
--
-- Default QA user:
--   qa-estimate-tech@example.com
--
-- The script prepares:
--   - active verified_technician dashboard profile with onboarding complete
--   - active company and active owner membership for company-scoped estimate RPCs
--   - public-ready marketplace technician profile and slug
--   - one private service request selected for that technician slug
--   - no real customer or technician phone numbers

do $$
declare
  qa_user_email text := lower('qa-estimate-tech@example.com');
  qa_profile_id uuid;
  qa_company_id uuid;
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
    raise exception 'QA profile % not found. Create and confirm the Supabase Auth user first, then rerun this fixture.', qa_user_email;
  end if;

  -- Later estimate/learning RPCs expect company-owned service requests.
  -- This is a dev/staging fixture guard only; production schema changes must
  -- continue to use reviewed forward migrations.
  alter table public.service_requests
    add column if not exists company_id uuid references public.companies(id) on delete set null;

  -- Existing profile protection triggers correctly block browser self-escalation.
  -- For dev/staging fixture setup only, the SQL Editor admin session temporarily
  -- disables them around the controlled QA profile update.
  alter table public.profiles disable trigger prevent_unsafe_profile_updates;
  alter table public.profiles disable trigger prevent_unsafe_onboarding_profile_updates;

  update public.profiles
  set
    email = qa_user_email,
    full_name = 'QA Estimate Technician',
    role = 'verified_technician',
    status = 'active',
    role_intent = 'technician',
    onboarding_status = 'complete',
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    updated_at = now()
  where id = qa_profile_id;

  alter table public.profiles enable trigger prevent_unsafe_profile_updates;
  alter table public.profiles enable trigger prevent_unsafe_onboarding_profile_updates;

  insert into public.companies (
    owner_profile_id,
    name,
    slug,
    primary_city,
    primary_state,
    business_email,
    status,
    onboarding_status,
    created_by_profile_id,
    reviewed_by_profile_id,
    reviewed_at
  ) values (
    qa_profile_id,
    'QA Estimate Refrigeration',
    'qa-estimate-refrigeration',
    'Katy',
    'TX',
    qa_user_email,
    'active',
    'complete',
    qa_profile_id,
    qa_profile_id,
    now()
  )
  on conflict (slug)
  do update set
    owner_profile_id = excluded.owner_profile_id,
    name = excluded.name,
    primary_city = excluded.primary_city,
    primary_state = excluded.primary_state,
    business_email = excluded.business_email,
    status = 'active',
    onboarding_status = 'complete',
    reviewed_by_profile_id = excluded.reviewed_by_profile_id,
    reviewed_at = coalesce(public.companies.reviewed_at, now()),
    updated_at = now()
  returning id into qa_company_id;

  update public.profiles
  set company_id = qa_company_id, updated_at = now()
  where id = qa_profile_id;

  insert into public.company_members (
    company_id,
    profile_id,
    member_role,
    member_status,
    invited_by_profile_id,
    invited_at,
    joined_at,
    notes
  ) values (
    qa_company_id,
    qa_profile_id,
    'owner',
    'active',
    qa_profile_id,
    now(),
    now(),
    'Task 148.13 dev/staging estimate persistence QA membership.'
  )
  on conflict (company_id, profile_id)
  do update set
    member_role = 'owner',
    member_status = 'active',
    joined_at = coalesce(public.company_members.joined_at, now()),
    removed_at = null,
    suspended_at = null,
    archived_at = null,
    notes = excluded.notes,
    updated_at = now();

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
      service_cities,
      appliance_categories,
      brands_serviced,
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
      qa_company_id,
      'company_member',
      'QA Estimate Technician',
      'QA Estimate Refrigeration',
      14,
      'Dev/staging estimate persistence QA technician profile.',
      null,
      'Katy',
      'TX',
      array['77494', '77449', '77084', '77095'],
      array['Katy', 'Houston', 'Sugar Land'],
      array['Refrigerator', 'Built-in Refrigeration', 'Freezer', 'Ice Maker'],
      array['LG', 'Sub-Zero', 'Samsung', 'GE'],
      array['Refrigerators', 'Built-in Refrigeration', 'LG', 'Sub-Zero'],
      array['English', 'Russian'],
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
      company_id = qa_company_id,
      affiliation_type = 'company_member',
      display_name = 'QA Estimate Technician',
      business_name = 'QA Estimate Refrigeration',
      years_experience = 14,
      service_summary_public = 'Dev/staging estimate persistence QA technician profile.',
      primary_city = 'Katy',
      primary_state = 'TX',
      service_zip_codes = array['77494', '77449', '77084', '77095'],
      service_cities = array['Katy', 'Houston', 'Sugar Land'],
      appliance_categories = array['Refrigerator', 'Built-in Refrigeration', 'Freezer', 'Ice Maker'],
      brands_serviced = array['LG', 'Sub-Zero', 'Samsung', 'GE'],
      specialties = array['Refrigerators', 'Built-in Refrigeration', 'LG', 'Sub-Zero'],
      languages = array['English', 'Russian'],
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
    raise exception 'QA public technician slug was not generated. Confirm public technician profile helpers and marketplace profile readiness migrations are applied.';
  end if;

  delete from public.service_requests
  where customer_email = 'qa-estimate@example.test'
    and customer_name = 'QA Estimate Persistence';

  insert into public.service_requests (
    company_id,
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
    assigned_technician_profile_id,
    request_source,
    status
  ) values (
    qa_company_id,
    'QA Estimate Persistence',
    'qa-estimate@example.test',
    null,
    'Refrigerator',
    'LG',
    'LFXS26973S',
    'Dev QA estimate persistence request. LG refrigerator linear compressor runs but does not cool.',
    '77494',
    'Katy',
    'TX',
    'Morning',
    qa_slug,
    'QA Estimate Refrigeration',
    qa_technician_profile_id,
    'technician_profile',
    'new'
  );

  raise notice 'Task 148.13 estimate QA fixture ready. Login email %, company %, technician_profile %, slug %', qa_user_email, qa_company_id, qa_technician_profile_id, qa_slug;
end
$$;

-- Manual verification after applying:
--
-- select p.id, p.email, p.role, p.status, p.onboarding_status, p.company_id
-- from public.profiles p
-- where lower(p.email) = lower('qa-estimate-tech@example.com');
--
-- select sr.id, sr.customer_name, sr.appliance_brand, sr.appliance_type,
--        sr.company_id, sr.selected_technician_slug,
--        sr.assigned_technician_profile_id, sr.status
-- from public.service_requests sr
-- where sr.customer_email = 'qa-estimate@example.test'
-- order by sr.created_at desc;
