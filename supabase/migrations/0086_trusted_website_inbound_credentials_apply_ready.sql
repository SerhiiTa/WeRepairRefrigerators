-- COM-06: Trusted Website Inbound API credential foundation.
--
-- APPLY-READY.
-- Purpose:
--   Add per-source machine-to-machine credentials for trusted website,
--   microsite, booking widget, and lead-generator ingestion.
--
-- Safety model:
--   - Credentials authenticate server-to-server integrations only.
--   - Browser clients, anon, and authenticated dashboard clients receive no
--     direct table access to credential rows or hashes.
--   - Raw secrets are never stored here. secret_hash stores an HMAC-SHA-256
--     digest computed with a WRA server-side pepper/key kept outside Supabase.
--   - The credential-linked inbound_source is authoritative for tenant/source
--     identity. Submitted domains, referrers, and UTM fields are attribution.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.inbound_source_credentials (
  id uuid primary key default gen_random_uuid(),
  inbound_source_id uuid not null
    references public.inbound_sources(id) on delete cascade,
  public_key text not null unique,
  secret_hash text not null,
  secret_hash_algorithm text not null default 'hmac-sha256',
  label text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  last_used_ip inet,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revocation_reason text,
  metadata jsonb not null default '{}'::jsonb,

  constraint inbound_source_credentials_public_key_not_blank_check
    check (btrim(public_key) <> ''),
  constraint inbound_source_credentials_secret_hash_not_blank_check
    check (btrim(secret_hash) <> ''),
  constraint inbound_source_credentials_secret_hash_algorithm_check
    check (secret_hash_algorithm = 'hmac-sha256'),
  constraint inbound_source_credentials_label_not_blank_check
    check (label is null or btrim(label) <> ''),
  constraint inbound_source_credentials_revocation_reason_not_blank_check
    check (revocation_reason is null or btrim(revocation_reason) <> '')
);

comment on table public.inbound_source_credentials is
  'COM-06 server-to-server integration credentials linked to inbound_sources. Raw secrets are never stored.';
comment on column public.inbound_source_credentials.public_key is
  'Non-secret credential identifier used in Authorization: WRA-Source <public_key>:<secret>.';
comment on column public.inbound_source_credentials.secret_hash is
  'HMAC-SHA-256 digest of the raw high-entropy secret using the WRA server-side pepper/key.';
comment on column public.inbound_source_credentials.last_used_ip is
  'Best-effort request IP recorded only after successful credential verification.';
comment on column public.inbound_source_credentials.metadata is
  'Operational credential metadata only. Do not store raw secrets or provider payloads.';

create index if not exists inbound_source_credentials_source_idx
  on public.inbound_source_credentials (inbound_source_id);

create index if not exists inbound_source_credentials_active_public_key_idx
  on public.inbound_source_credentials (public_key)
  where is_active = true and revoked_at is null;

alter table public.inbound_source_credentials enable row level security;

revoke all on public.inbound_source_credentials from public;
revoke all on public.inbound_source_credentials from anon;
revoke all on public.inbound_source_credentials from authenticated;

grant select on public.inbound_source_credentials to service_role;
grant update (last_used_at, last_used_ip)
  on public.inbound_source_credentials to service_role;
grant select on public.inbound_sources to service_role;

-- COM-06.1 provider-neutral website/booking/lead persistence support.
-- Durable idempotency is scoped by company + inbound source + provider id so
-- separate companies/sources cannot collide, and concurrent retries are stopped
-- by the database instead of an application-only check.
create unique index if not exists intake_requests_inbound_source_provider_event_unique_idx
  on public.intake_requests (company_id, inbound_source_id, provider_event_id)
  where company_id is not null
    and inbound_source_id is not null
    and provider_event_id is not null;

create unique index if not exists intake_requests_inbound_source_provider_lead_unique_idx
  on public.intake_requests (company_id, inbound_source_id, provider_lead_id)
  where company_id is not null
    and inbound_source_id is not null
    and provider_lead_id is not null;

create unique index if not exists communication_conversations_inbound_source_external_unique_idx
  on public.communication_conversations (
    company_id,
    inbound_source_id,
    external_conversation_id
  )
  where company_id is not null
    and inbound_source_id is not null
    and external_conversation_id is not null;

grant select, insert on public.intake_requests to service_role;
grant select, insert on public.communication_conversations to service_role;
grant update (intake_request_id)
  on public.communication_conversations to service_role;
grant select, insert on public.communication_messages to service_role;
grant select, insert on public.communication_timeline_events to service_role;
