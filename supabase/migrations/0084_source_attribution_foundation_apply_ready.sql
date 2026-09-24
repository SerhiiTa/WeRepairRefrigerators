-- COM-01: Source Attribution Foundation.
--
-- APPLY-READY.
-- Purpose:
--   Add the durable source-attribution registry and minimal attribution fields
--   needed for future Unified Intake, Communications, and Booking work.
--
-- Safety model:
--   - This does not implement public forms, booking APIs, SMS, Telnyx, Retell,
--     Settings UI, Communications UI, analytics, or Scheduling changes.
--   - Existing Communications, Intake, and Job records may keep NULL attribution.
--   - Existing source columns remain canonical where they already exist:
--       communication_conversations.primary_source_type
--       communication_conversations.source_account_id
--       communication_conversations.provider_name
--       communication_conversations.external_conversation_id
--       intake_requests.source_type/source_name/source_identifier
--       service_requests.request_source/marketing_source_id
--   - Public website/booking access is intentionally not granted here.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.inbound_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_key text not null,
  channel text not null
    check (channel in (
      'phone',
      'sms',
      'website_form',
      'booking_widget',
      'lead_generator',
      'email',
      'social',
      'manual',
      'other'
    )),
  source_name text not null,
  provider_name text,
  domain text,
  allowed_domains text[] not null default '{}'::text[],
  campaign text,
  default_service_type text,
  communication_source_account_id uuid
    references public.communication_source_accounts(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inbound_sources_source_key_not_blank_check
    check (btrim(source_key) <> ''),
  constraint inbound_sources_source_name_not_blank_check
    check (btrim(source_name) <> ''),
  constraint inbound_sources_domain_not_blank_check
    check (domain is null or btrim(domain) <> ''),
  constraint inbound_sources_provider_name_not_blank_check
    check (provider_name is null or btrim(provider_name) <> '')
);

comment on table public.inbound_sources is
  'COM-01 source-attribution registry for websites, microsites, booking widgets, lead generators, tracking sources, and manual sources. It does not grant public website or booking access.';
comment on column public.inbound_sources.source_key is
  'Stable source key unique within a company, such as main_website, subzero_widget, google_lsa_refrigerator, or manual_dispatch.';
comment on column public.inbound_sources.communication_source_account_id is
  'Optional communication endpoint used by this source, such as a campaign tracking phone number. communication_source_accounts remains the endpoint model.';
comment on column public.inbound_sources.metadata is
  'Safe source metadata only. Do not store provider API keys, webhook secrets, or raw sensitive customer payloads.';

create unique index if not exists inbound_sources_company_source_key_idx
  on public.inbound_sources (company_id, source_key);

create index if not exists inbound_sources_company_channel_active_idx
  on public.inbound_sources (company_id, channel, is_active);

create index if not exists inbound_sources_communication_source_account_idx
  on public.inbound_sources (communication_source_account_id)
  where communication_source_account_id is not null;

create index if not exists inbound_sources_allowed_domains_idx
  on public.inbound_sources using gin (allowed_domains);

drop trigger if exists set_inbound_sources_updated_at
  on public.inbound_sources;
create trigger set_inbound_sources_updated_at
before update on public.inbound_sources
for each row
execute function public.set_updated_at();

alter table public.inbound_sources enable row level security;

revoke all on public.inbound_sources from public;
revoke all on public.inbound_sources from anon;
grant select on public.inbound_sources to authenticated;

create or replace function public.can_access_inbound_source(
  target_inbound_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inbound_sources source
    where source.id = target_inbound_source_id
      and auth.uid() is not null
      and exists (
        select 1
        from public.company_members cm
        where cm.company_id = source.company_id
          and cm.profile_id = auth.uid()
          and cm.member_status = 'active'
          and cm.archived_at is null
      )
  );
$$;

comment on function public.can_access_inbound_source(uuid) is
  'COM-01 helper. Checks whether the authenticated dashboard user can read a company inbound source.';

revoke execute on function public.can_access_inbound_source(uuid) from public;
grant execute on function public.can_access_inbound_source(uuid) to authenticated;

drop policy if exists "inbound_sources_dashboard_select" on public.inbound_sources;
create policy "inbound_sources_dashboard_select"
on public.inbound_sources
for select
to authenticated
using (public.can_access_inbound_source(id));

alter table public.communication_conversations
  add column if not exists inbound_source_id uuid
    references public.inbound_sources(id) on delete set null,
  add column if not exists attribution jsonb not null default '{}'::jsonb;

comment on column public.communication_conversations.inbound_source_id is
  'Registered source attribution for the inbound event that created or most clearly owns this conversation.';
comment on column public.communication_conversations.attribution is
  'Provider/source-specific attribution metadata. Important reportable fields should also be stored in typed columns.';

create index if not exists communication_conversations_inbound_source_idx
  on public.communication_conversations (inbound_source_id, updated_at desc)
  where inbound_source_id is not null;

alter table public.intake_requests
  add column if not exists inbound_source_id uuid
    references public.inbound_sources(id) on delete set null,
  add column if not exists source_account_id uuid
    references public.communication_source_accounts(id) on delete set null,
  add column if not exists provider_lead_id text,
  add column if not exists provider_event_id text,
  add column if not exists attribution jsonb not null default '{}'::jsonb;

comment on column public.intake_requests.inbound_source_id is
  'Registered source attribution for the inquiry that produced this Intake record.';
comment on column public.intake_requests.source_account_id is
  'Optional communication source account such as the tracking number or owned endpoint tied to the Intake.';
comment on column public.intake_requests.attribution is
  'Provider/source-specific attribution metadata copied from the normalized inbound event.';

create index if not exists intake_requests_inbound_source_idx
  on public.intake_requests (inbound_source_id, created_at desc)
  where inbound_source_id is not null;
create index if not exists intake_requests_source_account_idx
  on public.intake_requests (source_account_id, created_at desc)
  where source_account_id is not null;
create index if not exists intake_requests_provider_lead_idx
  on public.intake_requests (company_id, source_type, provider_lead_id)
  where provider_lead_id is not null;
create index if not exists intake_requests_provider_event_idx
  on public.intake_requests (company_id, source_type, provider_event_id)
  where provider_event_id is not null;

alter table public.service_requests
  add column if not exists inbound_source_id uuid
    references public.inbound_sources(id) on delete set null,
  add column if not exists source_account_id uuid
    references public.communication_source_accounts(id) on delete set null,
  add column if not exists attribution jsonb not null default '{}'::jsonb;

comment on column public.service_requests.inbound_source_id is
  'Registered source attribution carried from the inbound event, Intake, or trusted WRA Booking surface that produced this Job.';
comment on column public.service_requests.source_account_id is
  'Optional communication source account such as the tracking number or owned endpoint tied to this Job.';
comment on column public.service_requests.attribution is
  'Provider/source-specific attribution metadata preserved for future source-to-job reporting.';

create index if not exists service_requests_inbound_source_idx
  on public.service_requests (inbound_source_id, created_at desc)
  where inbound_source_id is not null;
create index if not exists service_requests_source_account_idx
  on public.service_requests (source_account_id, created_at desc)
  where source_account_id is not null;
