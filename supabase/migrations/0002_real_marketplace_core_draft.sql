-- WeRepairRefrigerators Task 55 draft migration.
--
-- REVIEW-ONLY DRAFT:
-- - Do not apply this file until the marketplace schema, RLS policies, and
--   customer privacy boundaries are reviewed.
-- - This migration has not been applied to any Supabase project by Codex.
-- - This migration intentionally does not wire frontend mock flows to the
--   database, protect routes, create API endpoints, or use service-role access.
-- - The real development database should currently contain only the reviewed
--   profiles foundation from 0001_profiles_roles.sql.
--
-- Privacy model:
-- - Full customer contact/address details live on service_requests and are
--   intended for post-assignment access only.
-- - Open marketplace/job preview fields expose only city/state/ZIP, appliance
--   details, issue summary, preferred window, and estimated service value.
-- - Public SEO pages must never read raw service_requests, leads, jobs, or
--   repair_cases rows directly.

-- Uses gen_random_uuid() for draft UUID primary keys. Confirm extension policy
-- in the target Supabase project before applying.
create extension if not exists pgcrypto with schema extensions;

-- This draft assumes public.set_updated_at() exists from
-- 0001_profiles_roles.sql. Do not apply 0002 before reviewing/applying 0001.

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid references public.profiles(id) on delete set null,
  requested_technician_profile_id uuid references public.profiles(id) on delete set null,
  requested_company_id uuid,
  converted_lead_id uuid,

  customer_first_name text,
  customer_last_name text,
  customer_phone text,
  customer_email text,
  street_address text,
  unit text,
  city text not null,
  state text not null default 'TX',
  zip text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  gate_access_notes text,

  industry text not null default 'appliance_repair',
  service_category text not null default 'refrigerator_repair',
  appliance_type text not null,
  brand text,
  issue_description text not null,
  preferred_service_window text,
  urgency text not null default 'normal'
    check (urgency in ('normal', 'high', 'urgent', 'emergency')),
  source text not null default 'schedule_service'
    check (source in (
      'homepage_cta',
      'schedule_service',
      'technician_profile',
      'zip_search',
      'brand_page',
      'service_page',
      'location_page',
      'dashboard_entry',
      'referral',
      'other'
    )),
  status text not null default 'new'
    check (status in (
      'new',
      'lead_created',
      'open_job_created',
      'assigned',
      'scheduled',
      'cancelled',
      'completed',
      'archived'
    )),
  privacy_level text not null default 'customer_private'
    check (privacy_level in (
      'customer_private',
      'technician_preview',
      'assigned_full',
      'admin_full'
    )),
  estimated_service_call_cents integer check (estimated_service_call_cents is null or estimated_service_call_cents >= 0),
  estimated_lead_value_cents integer check (estimated_lead_value_cents is null or estimated_lead_value_cents >= 0),
  customer_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.service_requests is
  'Task 55 review-only draft. Private customer intake source of truth; do not expose raw rows publicly.';
comment on column public.service_requests.requested_company_id is
  'Nullable placeholder until companies table exists. Add FK after company schema is reviewed.';
comment on column public.service_requests.converted_lead_id is
  'Nullable backlink placeholder. Add FK after lead creation/conversion flow is finalized.';
comment on column public.service_requests.customer_phone is
  'Private customer contact field. Intended only for assigned technician/company/admin access after policy review.';
comment on column public.service_requests.street_address is
  'Private full address field. Open job previews must use city/state/ZIP only.';
comment on column public.service_requests.gate_access_notes is
  'Sensitive access notes. Never expose in public SEO, public previews, or pre-assignment marketplace views.';

create index if not exists service_requests_customer_profile_id_idx
  on public.service_requests (customer_profile_id);
create index if not exists service_requests_zip_status_idx
  on public.service_requests (zip, status);
create index if not exists service_requests_source_created_at_idx
  on public.service_requests (source, created_at desc);
create index if not exists service_requests_requested_technician_idx
  on public.service_requests (requested_technician_profile_id);

drop trigger if exists set_service_requests_updated_at on public.service_requests;
create trigger set_service_requests_updated_at
before update on public.service_requests
for each row
execute function public.set_updated_at();

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete set null,
  customer_profile_id uuid references public.profiles(id) on delete set null,
  company_id uuid,
  assigned_technician_profile_id uuid references public.profiles(id) on delete set null,
  converted_by_profile_id uuid references public.profiles(id) on delete set null,

  customer_first_name text,
  customer_last_name text,
  customer_phone text,
  customer_email text,

  preview_city text not null,
  preview_state text not null default 'TX',
  preview_zip text not null,
  preview_appliance_type text not null,
  preview_brand text,
  preview_issue_summary text not null,
  preview_preferred_window text,

  source text not null default 'schedule_service'
    check (source in (
      'homepage_cta',
      'schedule_service',
      'technician_profile',
      'zip_search',
      'brand_page',
      'service_page',
      'location_page',
      'dashboard_entry',
      'referral',
      'other'
    )),
  status text not null default 'new'
    check (status in (
      'new',
      'reviewed',
      'open_job',
      'assigned',
      'converted',
      'closed',
      'spam',
      'archived'
    )),
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'urgent')),
  privacy_level text not null default 'technician_preview'
    check (privacy_level in (
      'technician_preview',
      'assigned_full',
      'admin_full'
    )),
  estimated_service_call_cents integer check (estimated_service_call_cents is null or estimated_service_call_cents >= 0),
  estimated_lead_value_cents integer check (estimated_lead_value_cents is null or estimated_lead_value_cents >= 0),
  internal_notes text,
  reviewed_at timestamptz,
  converted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.leads is
  'Task 55 review-only draft. Private dashboard CRM lead rows derived from service requests.';
comment on column public.leads.company_id is
  'Nullable placeholder until companies table exists. Add FK after company/team schema is reviewed.';
comment on column public.leads.preview_issue_summary is
  'Privacy-limited issue summary suitable for dashboard/open marketplace previews.';
comment on column public.leads.customer_phone is
  'Private customer contact field. Hide from unassigned technicians and public surfaces.';
comment on column public.leads.internal_notes is
  'Private CRM notes. Never expose publicly or use directly for public SEO generation.';

create index if not exists leads_service_request_id_idx
  on public.leads (service_request_id);
create index if not exists leads_company_status_idx
  on public.leads (company_id, status);
create index if not exists leads_assigned_technician_idx
  on public.leads (assigned_technician_profile_id);
create index if not exists leads_preview_zip_status_idx
  on public.leads (preview_zip, status);
create index if not exists leads_source_created_at_idx
  on public.leads (source, created_at desc);

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid,
  primary_technician_profile_id uuid references public.profiles(id) on delete set null,
  accepted_by_technician_profile_id uuid references public.profiles(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,

  preview_city text not null,
  preview_state text not null default 'TX',
  preview_zip text not null,
  preview_appliance_type text not null,
  preview_brand text,
  preview_issue_summary text not null,
  preview_preferred_window text,

  status text not null default 'draft'
    check (status in (
      'draft',
      'open',
      'assigned',
      'scheduled',
      'in_progress',
      'completed',
      'cancelled',
      'expired',
      'converted_to_repair_case'
    )),
  job_type text not null default 'service_call'
    check (job_type in (
      'service_call',
      'diagnostic',
      'repair',
      'callback',
      'maintenance',
      'estimate'
    )),
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'urgent')),
  privacy_level text not null default 'technician_preview'
    check (privacy_level in (
      'technician_preview',
      'assigned_full',
      'admin_full'
    )),
  coverage_match text
    check (coverage_match is null or coverage_match in ('exact_zip', 'nearby_zip', 'extended_area')),
  service_call_price_cents integer check (service_call_price_cents is null or service_call_price_cents >= 0),
  estimated_lead_value_cents integer check (estimated_lead_value_cents is null or estimated_lead_value_cents >= 0),
  customer_approved_price_cents integer check (customer_approved_price_cents is null or customer_approved_price_cents >= 0),
  arrival_window_label text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  accepted_at timestamptz,
  full_customer_details_unlocked_at timestamptz,
  dispatch_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.jobs is
  'Task 55 review-only draft. Dispatchable job rows with privacy-limited preview fields before assignment.';
comment on column public.jobs.company_id is
  'Nullable placeholder until companies table exists. Add FK after company/team schema is reviewed.';
comment on column public.jobs.preview_zip is
  'Open job preview ZIP. Full street address remains on service_requests and is unlocked only after assignment.';
comment on column public.jobs.full_customer_details_unlocked_at is
  'Audit-oriented timestamp for when assigned users may view full customer contact/address details.';
comment on column public.jobs.dispatch_notes is
  'Private dispatch notes. Do not expose before assignment or in public SEO content.';

create index if not exists jobs_service_request_id_idx
  on public.jobs (service_request_id);
create index if not exists jobs_lead_id_idx
  on public.jobs (lead_id);
create index if not exists jobs_company_status_idx
  on public.jobs (company_id, status);
create index if not exists jobs_primary_technician_idx
  on public.jobs (primary_technician_profile_id);
create index if not exists jobs_preview_zip_status_idx
  on public.jobs (preview_zip, status);
create index if not exists jobs_scheduled_start_at_idx
  on public.jobs (scheduled_start_at);

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

create table if not exists public.repair_cases (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  company_id uuid,
  technician_profile_id uuid references public.profiles(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,

  industry text not null default 'appliance_repair',
  service_category text not null default 'refrigerator_repair',
  city text not null,
  state text not null default 'TX',
  zip text not null,
  appliance_type text not null,
  brand text,
  model_number text,
  serial_number text,
  symptoms text not null,
  customer_complaint text,
  diagnosis text,
  root_cause text,
  repair_summary text,
  parts_used text,
  labor_summary text,
  estimated_cost_cents integer check (estimated_cost_cents is null or estimated_cost_cents >= 0),
  final_cost_cents integer check (final_cost_cents is null or final_cost_cents >= 0),
  repair_status text not null default 'draft'
    check (repair_status in (
      'draft',
      'diagnosing',
      'repaired',
      'not_repaired',
      'follow_up_needed',
      'cancelled'
    )),
  technician_private_notes text,
  customer_safe_notes text,
  ai_ready_notes text,
  voice_transcription text,
  photo_summary text,
  seo_status text not null default 'not_ready'
    check (seo_status in (
      'not_ready',
      'needs_review',
      'approved_for_ai',
      'draft_created',
      'published',
      'rejected'
    )),
  ai_status text not null default 'not_ready'
    check (ai_status in (
      'not_ready',
      'ready',
      'draft_requested',
      'draft_created',
      'reviewed',
      'rejected'
    )),
  public_summary_slug text,
  privacy_reviewed_at timestamptz,
  seo_reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.repair_cases is
  'Task 55 review-only draft. Private raw repair documentation; public SEO must use reviewed/sanitized projections only.';
comment on column public.repair_cases.company_id is
  'Nullable placeholder until companies table exists. Add FK after company/team schema is reviewed.';
comment on column public.repair_cases.serial_number is
  'Private/internal appliance identifier. Do not expose publicly or include in public SEO prompts.';
comment on column public.repair_cases.technician_private_notes is
  'Private notes for technicians/company/admin only. Never use directly for public pages.';
comment on column public.repair_cases.customer_safe_notes is
  'Sanitized notes intended for customer-safe summaries and possible AI preparation after review.';
comment on column public.repair_cases.ai_ready_notes is
  'Privacy-reviewed structured notes that may later feed AI article drafts after human approval.';

create index if not exists repair_cases_service_request_id_idx
  on public.repair_cases (service_request_id);
create index if not exists repair_cases_lead_id_idx
  on public.repair_cases (lead_id);
create index if not exists repair_cases_job_id_idx
  on public.repair_cases (job_id);
create index if not exists repair_cases_company_status_idx
  on public.repair_cases (company_id, repair_status);
create index if not exists repair_cases_technician_idx
  on public.repair_cases (technician_profile_id);
create index if not exists repair_cases_brand_zip_idx
  on public.repair_cases (brand, zip);
create index if not exists repair_cases_seo_status_idx
  on public.repair_cases (seo_status);

drop trigger if exists set_repair_cases_updated_at on public.repair_cases;
create trigger set_repair_cases_updated_at
before update on public.repair_cases
for each row
execute function public.set_updated_at();

alter table public.service_requests enable row level security;
alter table public.leads enable row level security;
alter table public.jobs enable row level security;
alter table public.repair_cases enable row level security;

-- RLS POLICY TODOs BEFORE APPLYING:
-- - Add customer-owned service request policies for authenticated customers.
-- - Add company-scoped lead/job/repair case policies after companies and
--   company_members exist.
-- - Add assigned-technician policies for leads, jobs, and repair cases.
-- - Add eligible verified-technician preview policies for open jobs only after
--   service area/specialty matching exists.
-- - Add admin policies paired with audit logging.
-- - Do not add anonymous/public read policies to these raw private tables.
-- - Consider security-barrier views or RPCs for open job previews and customer
--   detail unlocks instead of broad table access.

-- Grants are intentionally omitted in this draft. Review desired direct client
-- access, RLS policies, and server-side mutation boundaries before granting
-- anon/authenticated permissions beyond what 0001 already defines.
