-- Task 152: First live phone workflow foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add the provider-independent source-account mapping and call metadata
--   required for Telnyx/Retell phone events to enter WRA's Communications Hub.
--
-- Safety model:
--   - This does not modify authentication, Supabase Auth settings, or env vars.
--   - This does not connect production phone numbers.
--   - This does not send SMS, email, calls, or notifications.
--   - This does not expose provider debug events in normal technician UI.
--   - Provider ingestion must first resolve a communication_source_accounts row
--     so the conversation is scoped to a known company.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.communication_source_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null default 'phone'
    check (source_type in (
      'phone',
      'sms',
      'website_form',
      'email',
      'yelp',
      'google_business_messages',
      'facebook_messenger',
      'whatsapp',
      'manual',
      'other'
    )),
  provider_name text not null default 'manual'
    check (provider_name in ('telnyx', 'retell', 'email', 'website', 'manual', 'other')),
  source_identifier text not null,
  display_name text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_name, source_identifier)
);

comment on table public.communication_source_accounts is
  'Task 152 source ownership map for provider-originated communications. A phone/email/webhook source must map here before WRA accepts live provider events.';
comment on column public.communication_source_accounts.source_identifier is
  'Normalized owned source identifier such as a phone number in E.164/digits form or an inbound email address. Do not store provider secrets here.';
comment on column public.communication_source_accounts.metadata is
  'Safe operational metadata only. Do not store API keys, webhook secrets, or raw sensitive provider payloads.';

create index if not exists communication_source_accounts_company_idx
  on public.communication_source_accounts (company_id, is_active, source_type);
create index if not exists communication_source_accounts_identifier_idx
  on public.communication_source_accounts (source_identifier)
  where is_active = true;

drop trigger if exists set_communication_source_accounts_updated_at
  on public.communication_source_accounts;
create trigger set_communication_source_accounts_updated_at
before update on public.communication_source_accounts
for each row
execute function public.set_updated_at();

alter table public.communication_source_accounts enable row level security;

revoke all on public.communication_source_accounts from public;
revoke all on public.communication_source_accounts from anon;
grant select on public.communication_source_accounts to authenticated;

drop policy if exists "communication_source_accounts_dashboard_select"
  on public.communication_source_accounts;
create policy "communication_source_accounts_dashboard_select"
on public.communication_source_accounts
for select
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = communication_source_accounts.company_id
      and cm.profile_id = auth.uid()
      and cm.member_status = 'active'
      and cm.archived_at is null
  )
);

alter table public.communication_conversations
  add column if not exists source_account_id uuid
    references public.communication_source_accounts(id) on delete set null,
  add column if not exists external_conversation_id text,
  add column if not exists provider_name text,
  add column if not exists call_status text,
  add column if not exists call_started_at timestamptz,
  add column if not exists call_ended_at timestamptz,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

comment on column public.communication_conversations.source_account_id is
  'Owned WRA source account that accepted this provider event.';
comment on column public.communication_conversations.external_conversation_id is
  'Provider call/conversation identifier for idempotency and support. Not shown as normal technician UI.';
comment on column public.communication_conversations.provider_metadata is
  'Sanitized provider metadata for support. Normal technician UI must not display raw provider/debug details.';

create index if not exists communication_conversations_source_account_idx
  on public.communication_conversations (source_account_id, updated_at desc)
  where source_account_id is not null;
create index if not exists communication_conversations_external_idx
  on public.communication_conversations (provider_name, external_conversation_id)
  where external_conversation_id is not null;

grant select on public.communication_conversations to authenticated;
