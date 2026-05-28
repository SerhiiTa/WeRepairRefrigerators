-- WeRepairRefrigerators Task 69 apply-ready staging migration.
--
-- APPLY-READY SCOPE:
-- - Intended for a disposable development or staging Supabase project after 0003/0007 creates companies.
-- - Creates append-only audit log foundation, indexes, RLS enablement, and default no-browser-access grants.
-- - Does not create frontend behavior, audit UI, or trusted server insert helpers.
--
-- Audit privacy model:
-- - Audit logs are append-only in normal application flows.
-- - Normal users must not edit/delete audit records.
-- - Raw invite tokens, invite token hashes, customer PII, payment data,
--   service-role keys, and private notes must not be stored in metadata.
-- - Admin/server reads only at first. Redacted company audit summaries can be
--   designed later through separate views if needed.

-- Uses gen_random_uuid() for UUID primary keys. Confirm extension policy
-- in the target Supabase project before applying.
create extension if not exists pgcrypto with schema extensions;

-- This migration assumes public.profiles exists from 0001_profiles_roles.sql.
-- It also references public.companies from 0007_onboarding_foundation_apply_ready.sql.
-- Confirm dependencies exist before running this migration.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_event_type') then
    create type public.audit_event_type as enum (
      'company_created',
      'company_updated',
      'company_archived',
      'company_member_added',
      'company_member_role_changed',
      'company_member_suspended',
      'company_member_archived',
      'company_invite_created',
      'company_invite_revoked',
      'company_invite_accepted',
      'company_join_requested',
      'company_join_approved',
      'company_join_rejected',
      'technician_profile_created',
      'technician_profile_updated',
      'technician_profile_verified',
      'onboarding_completed',
      'admin_override'
    );
  end if;
end
$$;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type public.audit_event_type not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  related_table text,
  related_entity_id uuid,
  related_entity_label text,
  action_source text not null default 'server_action',
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now(),
  constraint audit_logs_related_table_check check (
    related_table is null
    or related_table in (
      'profiles',
      'companies',
      'company_members',
      'technician_profiles',
      'company_invites',
      'company_join_requests',
      'service_requests',
      'leads',
      'jobs',
      'repair_cases'
    )
  ),
  constraint audit_logs_action_source_check check (
    action_source in (
      'server_action',
      'api_route',
      'edge_function',
      'database_trigger',
      'admin_tool',
      'system_job'
    )
  ),
  constraint audit_logs_severity_check check (
    severity in ('info', 'warning', 'critical')
  ),
  constraint audit_logs_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint audit_logs_related_entity_pair_check check (
    (related_table is null and related_entity_id is null)
    or (related_table is not null and related_entity_id is not null)
  )
);

comment on table public.audit_logs is
  'Task 64 apply-ready staging migration. Private append-only audit records for sensitive onboarding, company, invite, join request, technician verification, and admin actions.';
comment on column public.audit_logs.event_type is
  'Controlled audit event type. Extending enum values requires reviewed migration.';
comment on column public.audit_logs.actor_user_id is
  'Auth user who initiated the action, when known. Nullable for trusted system jobs.';
comment on column public.audit_logs.actor_profile_id is
  'Profile that initiated the action, when known. Prefer profile id for app-level investigations.';
comment on column public.audit_logs.target_user_id is
  'Auth user affected by the action, when applicable.';
comment on column public.audit_logs.target_profile_id is
  'Profile affected by the action, when applicable.';
comment on column public.audit_logs.company_id is
  'Company scope for company/member/invite/join request actions. Raw logs are not company-readable by default.';
comment on column public.audit_logs.related_table is
  'Optional affected table name from an allowlist. Do not use for dynamic SQL.';
comment on column public.audit_logs.related_entity_id is
  'Optional affected row id paired with related_table.';
comment on column public.audit_logs.related_entity_label is
  'Optional redacted label for admin support context. Do not store customer PII or raw invite tokens.';
comment on column public.audit_logs.action_source is
  'Trusted source path that wrote the audit event. Browser clients should not write audit rows directly.';
comment on column public.audit_logs.severity is
  'Operational severity for admin review and alerting.';
comment on column public.audit_logs.metadata is
  'Sanitized supplemental context only. Never store raw invite tokens, token hashes, service-role keys, payment data, customer contact data, full addresses, or private notes.';
comment on column public.audit_logs.ip_address is
  'Optional private operational IP address for abuse/support review. Define retention before production.';
comment on column public.audit_logs.user_agent is
  'Optional private operational user agent for abuse/support review. Do not expose to normal users.';
comment on column public.audit_logs.request_id is
  'Optional request/correlation id for tracing server action/API activity.';

create index if not exists audit_logs_actor_profile_created_at_idx
  on public.audit_logs (actor_profile_id, created_at desc);
create index if not exists audit_logs_target_profile_created_at_idx
  on public.audit_logs (target_profile_id, created_at desc);
create index if not exists audit_logs_company_created_at_idx
  on public.audit_logs (company_id, created_at desc);
create index if not exists audit_logs_event_type_created_at_idx
  on public.audit_logs (event_type, created_at desc);
create index if not exists audit_logs_related_entity_created_at_idx
  on public.audit_logs (related_table, related_entity_id, created_at desc);
create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_request_id_idx
  on public.audit_logs (request_id)
  where request_id is not null;

create or replace function public.prevent_audit_log_update_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'audit_logs are append-only';
end;
$$;

comment on function public.prevent_audit_log_update_delete() is
  'Task 69 apply-ready append-only guard. Review ownership, SECURITY DEFINER behavior, and maintenance exceptions before applying.';

drop trigger if exists prevent_audit_log_update on public.audit_logs;
create trigger prevent_audit_log_update
before update on public.audit_logs
for each row
execute function public.prevent_audit_log_update_delete();

drop trigger if exists prevent_audit_log_delete on public.audit_logs;
create trigger prevent_audit_log_delete
before delete on public.audit_logs
for each row
execute function public.prevent_audit_log_update_delete();

alter table public.audit_logs enable row level security;

-- Baseline grants remain intentionally narrow. This migration avoids client access
-- until the final admin/server insertion and read model is reviewed.
revoke all on public.audit_logs from anon;
revoke all on public.audit_logs from authenticated;

-- No browser policies are created here. After this migration, no anon or
-- authenticated browser user should be able to access audit logs directly.

-- Access posture:
-- - SELECT: no browser access by default. A future admin read path should use reviewed server/admin tooling.
-- - INSERT: trusted server action/API/RPC only. Browser clients must not write audit rows directly.
-- - UPDATE/DELETE: blocked by append-only trigger. Retention or maintenance requires a separately reviewed server path.
-- - Metadata validation belongs in the future trusted insert path and must reject raw invite tokens, token hashes, service credentials, customer contact details, full addresses, payment data, private notes, and full client request payloads.
