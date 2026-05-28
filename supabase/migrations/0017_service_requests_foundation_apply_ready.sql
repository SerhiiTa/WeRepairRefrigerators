-- Task 91: Service request persistence foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Persist public /schedule-service intake requests, including optional
--   public technician slug context, without exposing raw customer requests.
--
-- Security model:
--   - Anonymous and authenticated users may INSERT validated intake rows.
--   - Public SELECT is intentionally not granted through RLS policies.
--   - Raw service requests are private customer/CRM data.
--   - Technician context stores only public-safe slug/name strings, never raw
--     technician profile IDs, company IDs, emails, phone numbers, or private notes.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),

  customer_name text not null,
  customer_email text,
  customer_phone text,

  appliance_type text not null,
  appliance_brand text,
  appliance_model text,
  issue_description text not null,

  zip_code text not null,
  city text,
  state text not null default 'TX',
  preferred_time_window text,

  selected_technician_slug text,
  selected_technician_business_name text,

  request_source text not null default 'schedule_service'
    check (request_source in (
      'schedule_service',
      'technician_profile',
      'homepage_cta',
      'zip_search',
      'brand_page',
      'service_page',
      'location_page',
      'other'
    )),
  status text not null default 'new'
    check (status in (
      'new',
      'reviewed',
      'lead_created',
      'archived',
      'spam'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_requests_zip_code_format_check
    check (zip_code ~ '^[0-9]{5}$'),
  constraint service_requests_customer_name_not_blank_check
    check (length(btrim(customer_name)) > 0),
  constraint service_requests_appliance_type_not_blank_check
    check (length(btrim(appliance_type)) > 0),
  constraint service_requests_issue_description_not_blank_check
    check (length(btrim(issue_description)) > 0),
  constraint service_requests_customer_email_format_check
    check (
      customer_email is null
      or customer_email = ''
      or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )
);

comment on table public.service_requests is
  'Task 91 public intake persistence table. Raw customer request rows are private; public users may insert only.';
comment on column public.service_requests.customer_phone is
  'Private customer contact field. Do not expose publicly.';
comment on column public.service_requests.customer_email is
  'Private customer contact field. Do not expose publicly.';
comment on column public.service_requests.selected_technician_slug is
  'Public technician slug selected from public.public_technician_profiles. No private technician IDs are stored here.';
comment on column public.service_requests.selected_technician_business_name is
  'Public-safe technician display/business name snapshot from the sanitized public profile view.';

create index if not exists service_requests_created_at_idx
  on public.service_requests (created_at desc);
create index if not exists service_requests_status_created_at_idx
  on public.service_requests (status, created_at desc);
create index if not exists service_requests_zip_status_idx
  on public.service_requests (zip_code, status);
create index if not exists service_requests_source_created_at_idx
  on public.service_requests (request_source, created_at desc);
create index if not exists service_requests_selected_technician_slug_idx
  on public.service_requests (selected_technician_slug)
  where selected_technician_slug is not null;

drop trigger if exists set_service_requests_updated_at on public.service_requests;
create trigger set_service_requests_updated_at
before update on public.service_requests
for each row
execute function public.set_updated_at();

alter table public.service_requests enable row level security;

drop policy if exists "service_requests_public_insert" on public.service_requests;
create policy "service_requests_public_insert"
on public.service_requests
for insert
to anon, authenticated
with check (
  status = 'new'
  and request_source in (
    'schedule_service',
    'technician_profile',
    'homepage_cta',
    'zip_search',
    'brand_page',
    'service_page',
    'location_page',
    'other'
  )
);

-- No SELECT/UPDATE/DELETE policies are created for anon/authenticated users.
-- Dashboard reads and CRM updates should be added in a later task with
-- company/admin-scoped RLS or trusted server-side actions.

revoke all on public.service_requests from public;
grant insert on public.service_requests to anon, authenticated;

-- Manual verification after applying:
-- 1. Anonymous SELECT should be blocked:
--    select * from public.service_requests limit 1;
-- 2. Public app insert should succeed through /schedule-service.
