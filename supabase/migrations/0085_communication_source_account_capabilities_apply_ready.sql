-- COM-02: Communication Source Account Capabilities.
--
-- APPLY-READY.
-- Purpose:
--   Add durable operational capability flags to company-owned communication
--   endpoints so later Communications tasks can safely choose Voice/SMS sources.
--
-- Safety model:
--   - This does not implement outbound SMS, outbound calls, provider settings UI,
--     forwarding, routing, business hours, recording, AI settings, notifications,
--     provider credentials, or provider API keys.
--   - Existing source-account identity and tenant RLS stay unchanged.
--   - Existing phone source accounts remain valid for inbound phone workflows.

alter table public.communication_source_accounts
  add column if not exists supports_inbound_voice boolean not null default false,
  add column if not exists supports_outbound_voice boolean not null default false,
  add column if not exists supports_inbound_sms boolean not null default false,
  add column if not exists supports_outbound_sms boolean not null default false,
  add column if not exists is_default_outbound_voice boolean not null default false,
  add column if not exists is_default_outbound_sms boolean not null default false;

update public.communication_source_accounts
set supports_inbound_voice = true
where source_type = 'phone'
  and supports_inbound_voice = false;

update public.communication_source_accounts
set supports_inbound_sms = true
where source_type = 'sms'
  and supports_inbound_sms = false;

alter table public.communication_source_accounts
  drop constraint if exists communication_source_accounts_default_voice_capability_check,
  add constraint communication_source_accounts_default_voice_capability_check
    check (
      is_default_outbound_voice = false
      or (is_active = true and supports_outbound_voice = true)
    ),
  drop constraint if exists communication_source_accounts_default_sms_capability_check,
  add constraint communication_source_accounts_default_sms_capability_check
    check (
      is_default_outbound_sms = false
      or (is_active = true and supports_outbound_sms = true)
    );

comment on column public.communication_source_accounts.supports_inbound_voice is
  'COM-02 capability flag. True when this source account can receive inbound Voice/call events.';
comment on column public.communication_source_accounts.supports_outbound_voice is
  'COM-02 capability flag. True when this source account may be used for outbound Voice/call initiation.';
comment on column public.communication_source_accounts.supports_inbound_sms is
  'COM-02 capability flag. True when this source account can receive inbound SMS events.';
comment on column public.communication_source_accounts.supports_outbound_sms is
  'COM-02 capability flag. True when this source account may be used for outbound SMS.';
comment on column public.communication_source_accounts.is_default_outbound_voice is
  'COM-02 default selector. At most one active outbound Voice-capable source account may be default per company.';
comment on column public.communication_source_accounts.is_default_outbound_sms is
  'COM-02 default selector. At most one active outbound SMS-capable source account may be default per company.';

create unique index if not exists communication_source_accounts_default_outbound_voice_company_idx
  on public.communication_source_accounts (company_id)
  where is_default_outbound_voice = true
    and is_active = true
    and supports_outbound_voice = true;

create unique index if not exists communication_source_accounts_default_outbound_sms_company_idx
  on public.communication_source_accounts (company_id)
  where is_default_outbound_sms = true
    and is_active = true
    and supports_outbound_sms = true;

create index if not exists communication_source_accounts_voice_capabilities_idx
  on public.communication_source_accounts (
    company_id,
    is_active,
    supports_inbound_voice,
    supports_outbound_voice
  );

create index if not exists communication_source_accounts_sms_capabilities_idx
  on public.communication_source_accounts (
    company_id,
    is_active,
    supports_inbound_sms,
    supports_outbound_sms
  );
