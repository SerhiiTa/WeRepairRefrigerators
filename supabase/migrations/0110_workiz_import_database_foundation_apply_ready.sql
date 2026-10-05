-- WORKIZ-IMPORT-02: Workiz import database foundation.
--
-- APPLY-READY, FORWARD ONLY.
-- Purpose:
--   Prepare the existing unified HomeFixOS/WRA operational data model for a
--   safe, rerunnable import of historical Workiz customers, jobs, estimates,
--   invoices, payments, financial snapshots, and future manual attachments.
--
-- This migration does not import Workiz data and does not create separate
-- legacy customer/job tables.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared typed provenance columns for imported Workiz records.
-- ---------------------------------------------------------------------------

alter table public.customers
  add column if not exists source_system text not null default 'native',
  add column if not exists external_customer_id text,
  add column if not exists imported_at timestamptz,
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

alter table public.customers
  drop constraint if exists customers_source_system_check,
  add constraint customers_source_system_check
    check (source_system in ('native', 'workiz'));

create unique index if not exists customers_workiz_external_customer_uidx
  on public.customers (company_id, external_customer_id)
  where source_system = 'workiz' and external_customer_id is not null;

comment on column public.customers.source_system is
  'Origin of the customer row. Imported Workiz customers remain in the unified customer table.';
comment on column public.customers.external_customer_id is
  'Original Workiz Client # when source_system = workiz.';
comment on column public.customers.import_metadata is
  'Sanitized import/provenance metadata. Do not store credentials or sensitive raw exports.';

alter table public.customer_addresses
  add column if not exists source_system text not null default 'native',
  add column if not exists external_address_key text,
  add column if not exists imported_at timestamptz,
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

alter table public.customer_addresses
  drop constraint if exists customer_addresses_source_system_check,
  add constraint customer_addresses_source_system_check
    check (source_system in ('native', 'workiz'));

create unique index if not exists customer_addresses_workiz_external_key_uidx
  on public.customer_addresses (customer_id, external_address_key)
  where source_system = 'workiz' and external_address_key is not null;

comment on column public.customer_addresses.external_address_key is
  'Deterministic Workiz import address key, typically customer import key plus normalized address.';

alter table public.service_requests
  add column if not exists source_system text not null default 'native',
  add column if not exists external_job_id text,
  add column if not exists imported_at timestamptz,
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

alter table public.service_requests
  drop constraint if exists service_requests_source_system_check,
  add constraint service_requests_source_system_check
    check (source_system in ('native', 'workiz'));

create unique index if not exists service_requests_workiz_external_job_uidx
  on public.service_requests (company_id, external_job_id)
  where source_system = 'workiz' and external_job_id is not null;

comment on column public.service_requests.source_system is
  'Origin of the Job. Workiz-imported jobs remain normal service_requests linked to unified customers.';
comment on column public.service_requests.external_job_id is
  'Original Workiz Job # when source_system = workiz.';

alter table public.service_request_estimates
  add column if not exists source_system text not null default 'native',
  add column if not exists external_estimate_id text,
  add column if not exists external_import_key text,
  add column if not exists imported_at timestamptz,
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

alter table public.service_request_estimates
  drop constraint if exists service_request_estimates_source_system_check,
  add constraint service_request_estimates_source_system_check
    check (source_system in ('native', 'workiz'));

create unique index if not exists service_request_estimates_workiz_import_key_uidx
  on public.service_request_estimates (source_system, external_import_key)
  where source_system = 'workiz' and external_import_key is not null;

comment on column public.service_request_estimates.external_estimate_id is
  'Original Workiz Estimate # when available.';
comment on column public.service_request_estimates.external_import_key is
  'Deterministic Workiz estimate import key, unique for rerunnable imports.';

-- Historical Workiz invoices are job-based. Native WRA invoices may still be
-- estimate-backed; imported invoices must not require fake placeholder estimates.
alter table public.service_request_invoices
  alter column estimate_id drop not null,
  add column if not exists source_system text not null default 'native',
  add column if not exists external_invoice_id text,
  add column if not exists external_import_key text,
  add column if not exists amount_due numeric(10, 2),
  add column if not exists discount_amount numeric(10, 2),
  add column if not exists imported_at timestamptz,
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

alter table public.service_request_invoices
  drop constraint if exists service_request_invoices_source_system_check,
  add constraint service_request_invoices_source_system_check
    check (source_system in ('native', 'workiz')),
  drop constraint if exists service_request_invoices_amount_due_check,
  add constraint service_request_invoices_amount_due_check
    check (amount_due is null or (amount_due >= 0 and amount_due <= 100000)),
  drop constraint if exists service_request_invoices_discount_amount_check,
  add constraint service_request_invoices_discount_amount_check
    check (discount_amount is null or (discount_amount >= 0 and discount_amount <= 100000)),
  drop constraint if exists service_request_invoices_native_estimate_required_check,
  add constraint service_request_invoices_native_estimate_required_check
    check (source_system = 'workiz' or estimate_id is not null);

create unique index if not exists service_request_invoices_workiz_import_key_uidx
  on public.service_request_invoices (source_system, external_import_key)
  where source_system = 'workiz' and external_import_key is not null;

comment on column public.service_request_invoices.estimate_id is
  'Source approved WRA estimate for native invoices. Nullable only for historical imported invoices such as Workiz invoices that are job-based.';
comment on column public.service_request_invoices.external_invoice_id is
  'Original Workiz Invoice NO. when source_system = workiz.';
comment on column public.service_request_invoices.external_import_key is
  'Deterministic Workiz invoice import key, unique for rerunnable imports.';

-- ---------------------------------------------------------------------------
-- Historical payments. This is storage only, not payment processing.
-- ---------------------------------------------------------------------------

create table if not exists public.service_request_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies(id)
    on delete set null,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  invoice_id uuid
    references public.service_request_invoices(id)
    on delete set null,
  source_system text not null default 'native',
  external_payment_id text,
  external_import_key text,
  payment_status text not null default 'paid',
  payment_type text,
  payment_method text,
  amount numeric(10, 2) not null,
  service_fee numeric(10, 2),
  net_amount numeric(10, 2),
  tip_amount numeric(10, 2),
  payment_date date,
  paid_at timestamptz,
  confirmation_code text,
  reference_code text,
  card_last4 text,
  raw_document text,
  description text,
  imported_at timestamptz,
  import_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_request_payments_source_system_check
    check (source_system in ('native', 'workiz')),
  constraint service_request_payments_status_check
    check (payment_status in (
      'paid',
      'refunded',
      'partially_refunded',
      'void',
      'imported'
    )),
  constraint service_request_payments_amount_check
    check (amount >= -100000 and amount <= 100000),
  constraint service_request_payments_service_fee_check
    check (service_fee is null or (service_fee >= 0 and service_fee <= 100000)),
  constraint service_request_payments_net_amount_check
    check (net_amount is null or (net_amount >= -100000 and net_amount <= 100000)),
  constraint service_request_payments_tip_amount_check
    check (tip_amount is null or (tip_amount >= 0 and tip_amount <= 100000)),
  constraint service_request_payments_card_last4_check
    check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  constraint service_request_payments_external_key_not_blank_check
    check (external_import_key is null or length(btrim(external_import_key)) > 0)
);

comment on table public.service_request_payments is
  'Historical/service-request payment records. WORKIZ-IMPORT-02 stores imported payment history only and does not process payments.';
comment on column public.service_request_payments.card_last4 is
  'Last four card digits only. Never store full card numbers or payment credentials.';
comment on column public.service_request_payments.external_import_key is
  'Deterministic Workiz payment import key, unique for rerunnable imports.';

create unique index if not exists service_request_payments_workiz_import_key_uidx
  on public.service_request_payments (source_system, external_import_key)
  where source_system = 'workiz' and external_import_key is not null;
create index if not exists service_request_payments_request_paid_idx
  on public.service_request_payments (service_request_id, (coalesce(paid_at, created_at)) desc);
create index if not exists service_request_payments_invoice_idx
  on public.service_request_payments (invoice_id)
  where invoice_id is not null;

drop trigger if exists set_service_request_payments_updated_at
  on public.service_request_payments;
create trigger set_service_request_payments_updated_at
before update on public.service_request_payments
for each row
execute function public.set_updated_at();

alter table public.service_request_payments enable row level security;
revoke all on public.service_request_payments from public;
grant select on public.service_request_payments to authenticated;

drop policy if exists "service_request_payments_dashboard_select"
  on public.service_request_payments;
create policy "service_request_payments_dashboard_select"
on public.service_request_payments
for select
to authenticated
using (public.can_view_service_request(service_request_id));

-- ---------------------------------------------------------------------------
-- Historical financial snapshots. Preserves Workiz accounting/export values
-- without treating them as native WRA-calculated accounting.
-- ---------------------------------------------------------------------------

create table if not exists public.service_request_financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies(id)
    on delete set null,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  source_system text not null default 'workiz',
  external_job_id text,
  subtotal numeric(10, 2),
  total numeric(10, 2),
  cost numeric(10, 2),
  labor_cost numeric(10, 2),
  card_expenses numeric(10, 2),
  technician_expenses numeric(10, 2),
  paid_amount numeric(10, 2),
  due_amount numeric(10, 2),
  tax_amount numeric(10, 2),
  profit numeric(10, 2),
  tip_amount numeric(10, 2),
  invoice_number text,
  snapshot_metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz,
  created_at timestamptz not null default now(),

  constraint service_request_financial_snapshots_source_system_check
    check (source_system in ('workiz')),
  constraint service_request_financial_snapshots_external_job_not_blank_check
    check (external_job_id is null or length(btrim(external_job_id)) > 0)
);

comment on table public.service_request_financial_snapshots is
  'Imported historical job financial snapshots. Values preserve external-source totals and are not recalculated by native WRA accounting.';

create unique index if not exists service_request_financial_snapshots_workiz_job_uidx
  on public.service_request_financial_snapshots (source_system, external_job_id)
  where source_system = 'workiz' and external_job_id is not null;
create index if not exists service_request_financial_snapshots_request_idx
  on public.service_request_financial_snapshots (service_request_id, created_at desc);

alter table public.service_request_financial_snapshots enable row level security;
revoke all on public.service_request_financial_snapshots from public;
grant select on public.service_request_financial_snapshots to authenticated;

drop policy if exists "service_request_financial_snapshots_dashboard_select"
  on public.service_request_financial_snapshots;
create policy "service_request_financial_snapshots_dashboard_select"
on public.service_request_financial_snapshots
for select
to authenticated
using (public.can_view_service_request(service_request_id));

-- ---------------------------------------------------------------------------
-- Generic historical attachments for imported jobs and future manual uploads.
-- Existing service_request_photos remains the image/photo workflow.
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'service-request-attachments',
  'service-request-attachments',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.service_request_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies(id)
    on delete set null,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  uploaded_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  storage_bucket text not null default 'service-request-attachments',
  storage_path text not null unique,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  attachment_category text not null default 'other',
  source_system text not null default 'native',
  external_import_key text,
  imported_at timestamptz,
  attachment_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_request_attachments_bucket_check
    check (storage_bucket = 'service-request-attachments'),
  constraint service_request_attachments_category_check
    check (attachment_category in (
      'appliance_photo',
      'model_serial_photo',
      'before_photo',
      'after_photo',
      'screenshot',
      'pdf',
      'invoice_document',
      'other'
    )),
  constraint service_request_attachments_source_system_check
    check (source_system in ('native', 'workiz')),
  constraint service_request_attachments_file_size_check
    check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 20971520)),
  constraint service_request_attachments_original_filename_length_check
    check (original_filename is null or char_length(original_filename) <= 240)
);

comment on table public.service_request_attachments is
  'Generic private attachment metadata for service requests, including imported historical photos, PDFs, screenshots, and documents.';

create unique index if not exists service_request_attachments_workiz_import_key_uidx
  on public.service_request_attachments (source_system, external_import_key)
  where source_system = 'workiz' and external_import_key is not null;
create index if not exists service_request_attachments_request_created_idx
  on public.service_request_attachments (service_request_id, created_at desc);
create index if not exists service_request_attachments_category_idx
  on public.service_request_attachments (attachment_category, created_at desc);

drop trigger if exists set_service_request_attachments_updated_at
  on public.service_request_attachments;
create trigger set_service_request_attachments_updated_at
before update on public.service_request_attachments
for each row
execute function public.set_updated_at();

alter table public.service_request_attachments enable row level security;
revoke all on public.service_request_attachments from public;
grant select on public.service_request_attachments to authenticated;

drop policy if exists "service_request_attachments_dashboard_select"
  on public.service_request_attachments;
create policy "service_request_attachments_dashboard_select"
on public.service_request_attachments
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_attachments_dashboard_read_objects"
  on storage.objects;
create policy "service_request_attachments_dashboard_read_objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-request-attachments'
  and exists (
    select 1
    from public.service_request_attachments attachment
    where attachment.storage_path = name
      and public.can_view_service_request(attachment.service_request_id)
  )
);
