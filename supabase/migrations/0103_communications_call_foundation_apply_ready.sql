-- COMM-09A: Calls foundation and unified Communications integration.
--
-- Purpose:
-- - Add a first-class call record linked to Communications conversations.
-- - Keep Retell/Telnyx phone ingestion scoped through existing source accounts.
-- - Preserve existing conversation/message/transcript/timeline storage while
--   making call status, duration, provider id, and transcript linkage durable.
--
-- Safety:
-- - Forward-only.
-- - No Retell/Telnyx routing changes.
-- - No softphone, outbound voice, transfer, or recording storage.
-- - No anon access.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.communication_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  source_account_id uuid references public.communication_source_accounts(id) on delete set null,
  provider_name text not null
    check (provider_name in ('telnyx', 'retell', 'manual', 'other')),
  provider_call_id text not null,
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  from_phone text,
  to_phone text,
  status text not null default 'unknown',
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer
    check (duration_seconds is null or duration_seconds >= 0),
  disposition text,
  end_reason text,
  recording_reference text,
  transcript_id uuid references public.communication_transcripts(id) on delete set null,
  summary text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider_name, provider_call_id)
);

comment on table public.communication_calls is
  'COMM-09A first-class call records linked to Communications conversations. Stores sanitized call lifecycle metadata; recordings remain provider-fetched, not stored here.';
comment on column public.communication_calls.provider_call_id is
  'Provider call id used for idempotency. Scoped by company and provider.';
comment on column public.communication_calls.recording_reference is
  'Provider-safe recording reference or call id. This is not a public recording URL.';
comment on column public.communication_calls.provider_metadata is
  'Sanitized provider metadata only. Do not store provider secrets or raw sensitive payloads.';

create index if not exists communication_calls_conversation_started_idx
  on public.communication_calls (conversation_id, started_at desc nulls last, created_at desc);

create index if not exists communication_calls_company_status_updated_idx
  on public.communication_calls (company_id, status, updated_at desc);

drop trigger if exists set_communication_calls_updated_at
  on public.communication_calls;
create trigger set_communication_calls_updated_at
before update on public.communication_calls
for each row
execute function public.set_updated_at();

alter table public.communication_calls enable row level security;

revoke all on public.communication_calls from public;
revoke all on public.communication_calls from anon;

grant select on public.communication_calls to authenticated;
grant select, insert, update on table public.communication_calls to service_role;

drop policy if exists "communication_calls_dashboard_select"
  on public.communication_calls;
create policy "communication_calls_dashboard_select"
on public.communication_calls
for select
to authenticated
using (public.can_access_communication_conversation(conversation_id));
