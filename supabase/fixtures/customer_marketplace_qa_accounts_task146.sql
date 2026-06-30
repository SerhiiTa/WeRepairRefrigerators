-- Task 146.1: Customer marketplace confirmed QA account fixture.
--
-- DEV/STAGING ONLY. DO NOT APPLY TO PRODUCTION.
--
-- This fixture does not create or store passwords.
-- First create these Supabase Auth users in the dev/staging dashboard, set
-- temporary passwords in a password manager only, and confirm their emails:
--
--   qa-customer-marketplace@example.test
--   qa-customer-dashboard@example.test
--
-- Then apply this SQL in Supabase SQL Editor. It links the customer account,
-- prepares a dashboard-ready technician/company-owner account, creates a
-- public-ready technician profile, adds a customer appliance, and creates a
-- customer-linked service request selected for the QA technician.

do $$
declare
  qa_customer_email text := lower('qa-customer-marketplace@example.test');
  qa_dashboard_email text := lower('qa-customer-dashboard@example.test');
  qa_customer_profile_id uuid;
  qa_dashboard_profile_id uuid;
  qa_customer_id uuid;
  qa_appliance_id uuid;
  qa_technician_profile_id uuid;
  qa_slug text;
begin
  select p.id
    into qa_customer_profile_id
  from public.profiles p
  where lower(p.email) = qa_customer_email
  order by p.created_at asc
  limit 1;

  if qa_customer_profile_id is null then
    raise exception 'QA customer profile % not found. Create and confirm the Supabase Auth user first.', qa_customer_email;
  end if;

  select p.id
    into qa_dashboard_profile_id
  from public.profiles p
  where lower(p.email) = qa_dashboard_email
  order by p.created_at asc
  limit 1;

  if qa_dashboard_profile_id is null then
    raise exception 'QA dashboard profile % not found. Create and confirm the Supabase Auth user first.', qa_dashboard_email;
  end if;

  update auth.users
  set
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    confirmed_at = coalesce(confirmed_at, now()),
    updated_at = now()
  where lower(email) in (qa_customer_email, qa_dashboard_email);

  alter table public.profiles disable trigger prevent_unsafe_profile_updates;
  alter table public.profiles disable trigger prevent_unsafe_onboarding_profile_updates;

  update public.profiles
  set
    full_name = 'QA Customer Marketplace',
    role = 'customer',
    status = 'active',
    role_intent = 'customer',
    onboarding_status = 'complete',
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    updated_at = now()
  where id = qa_customer_profile_id;

  update public.profiles
  set
    full_name = 'QA Customer Dashboard',
    role = 'technician',
    status = 'active',
    role_intent = 'technician',
    onboarding_status = 'complete',
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    updated_at = now()
  where id = qa_dashboard_profile_id;

  alter table public.profiles enable trigger prevent_unsafe_profile_updates;
  alter table public.profiles enable trigger prevent_unsafe_onboarding_profile_updates;

  select public.find_or_create_customer_for_request_rpc(
    'QA',
    'Customer Marketplace',
    '5551461000',
    qa_customer_email
  )
  into qa_customer_id;

  update public.customers
  set
    auth_user_id = qa_customer_profile_id,
    full_name = 'QA Customer Marketplace',
    first_name = 'QA',
    last_name = 'Customer Marketplace',
    phone = '5551461000',
    email = qa_customer_email,
    customer_status = 'active',
    updated_at = now()
  where id = qa_customer_id;

  insert into public.customer_appliances (
    customer_id,
    appliance_type,
    brand,
    model_number,
    serial_number,
    purchase_year,
    location_label,
    notes
  )
  values (
    qa_customer_id,
    'Built-in refrigerator',
    'Sub-Zero',
    'BI-48S',
    'QA146SERIAL',
    2021,
    'Kitchen',
    'Task 146 confirmed customer QA appliance.'
  )
  on conflict do nothing
  returning id into qa_appliance_id;

  if qa_appliance_id is null then
    select id
      into qa_appliance_id
    from public.customer_appliances
    where customer_id = qa_customer_id
      and serial_number = 'QA146SERIAL'
    order by created_at desc
    limit 1;
  end if;

  select tp.id
    into qa_technician_profile_id
  from public.technician_profiles tp
  where tp.profile_id = qa_dashboard_profile_id
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
      qa_dashboard_profile_id,
      null,
      'independent',
      'QA Customer Dashboard Technician',
      'QA Customer Dashboard Refrigeration',
      12,
      'Dev/staging customer marketplace CRM QA profile.',
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
      qa_dashboard_profile_id,
      null,
      null,
      null,
      null
    )
    returning id into qa_technician_profile_id;
  else
    update public.technician_profiles
    set
      display_name = 'QA Customer Dashboard Technician',
      business_name = 'QA Customer Dashboard Refrigeration',
      years_experience = 12,
      service_summary_public = 'Dev/staging customer marketplace CRM QA profile.',
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
      verified_by_profile_id = coalesce(verified_by_profile_id, qa_dashboard_profile_id),
      rejected_at = null,
      suspended_at = null,
      archived_by_profile_id = null,
      archived_at = null,
      updated_at = now()
    where id = qa_technician_profile_id;
  end if;

  qa_slug := public.public_technician_profile_slug_for_profile(qa_dashboard_profile_id);

  if qa_slug is null then
    raise exception 'QA dashboard public technician slug was not generated. Confirm public technician profile helpers are applied.';
  end if;

  delete from public.service_requests
  where customer_email = qa_customer_email
    and request_source = 'schedule_service'
    and issue_description like 'Task 146 confirmed customer QA%';

  insert into public.service_requests (
    customer_id,
    customer_appliance_id,
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
  )
  values (
    qa_customer_id,
    qa_appliance_id,
    'QA Customer Marketplace',
    qa_customer_email,
    '5551461000',
    'Built-in refrigerator',
    'Sub-Zero',
    'BI-48S',
    'Task 146 confirmed customer QA linked service request.',
    '77494',
    'Katy',
    'TX',
    'Morning',
    qa_slug,
    'QA Customer Dashboard Refrigeration',
    'schedule_service',
    'new'
  );

  raise notice 'Task 146.1 QA fixture ready. Customer %, dashboard %, customer_id %, technician_slug %',
    qa_customer_email,
    qa_dashboard_email,
    qa_customer_id,
    qa_slug;
end $$;
