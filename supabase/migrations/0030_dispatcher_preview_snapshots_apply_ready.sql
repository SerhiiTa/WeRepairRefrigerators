-- Task 120: Dispatcher preview snapshot persistence.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Persist an internal snapshot of the provider-free dispatcher preview shown
--   on /dashboard/leads/[id].
--
-- Safety model:
--   - This does not create appointments, bookings, calendar events, SMS, calls,
--     provider calls, or customer-facing behavior.
--   - Browser clients do not get broad INSERT/UPDATE/DELETE table access.
--   - Authenticated dashboard users use narrow RPCs.
--   - Access reuses public.can_view_service_request(service_request_id), which
--     is the current Task 92 visibility model for service_requests.
--   - company_id is nullable until service_requests receive durable company
--     ownership. For now it snapshots the caller profile company_id when present.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.dispatcher_preview_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies(id)
    on delete set null,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,

  normalized_zip text,
  normalized_service_type text,
  normalized_appliance text,
  normalized_brand text,
  normalized_issue text,
  requested_window text,
  requested_date date,

  orchestrator_status text not null
    check (orchestrator_status in (
      'success',
      'partial',
      'no_availability',
      'validation_failed'
    )),
  recommended_technician_profile_id uuid
    references public.technician_profiles(id)
    on delete set null,
  recommendation_summary jsonb not null default '{}'::jsonb,
  backup_options_count integer not null default 0
    check (backup_options_count >= 0),
  backup_options jsonb not null default '[]'::jsonb,
  safe_customer_response_draft text,
  validation_warnings jsonb not null default '[]'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,

  created_by uuid
    references public.profiles(id)
    on delete set null,
  created_at timestamptz not null default now(),

  constraint dispatcher_preview_snapshots_zip_check
    check (normalized_zip is null or normalized_zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  constraint dispatcher_preview_snapshots_response_length_check
    check (
      safe_customer_response_draft is null
      or char_length(safe_customer_response_draft) <= 2000
    )
);

comment on table public.dispatcher_preview_snapshots is
  'Task 120 internal snapshots of provider-free dispatcher preview output. Not bookings, appointments, sends, or customer-visible records.';
comment on column public.dispatcher_preview_snapshots.company_id is
  'Nullable until service_requests have durable company ownership. Snapshots caller profile company_id when available.';
comment on column public.dispatcher_preview_snapshots.recommendation_summary is
  'Sanitized internal best-recommendation payload from the provider-free orchestrator.';
comment on column public.dispatcher_preview_snapshots.backup_options is
  'Sanitized internal backup recommendation payloads from the provider-free orchestrator.';
comment on column public.dispatcher_preview_snapshots.safe_customer_response_draft is
  'Draft wording only. Does not indicate booking, confirmation, SMS, call, or appointment creation.';

create index if not exists dispatcher_preview_snapshots_request_created_at_idx
  on public.dispatcher_preview_snapshots (service_request_id, created_at desc);
create index if not exists dispatcher_preview_snapshots_company_created_at_idx
  on public.dispatcher_preview_snapshots (company_id, created_at desc)
  where company_id is not null;
create index if not exists dispatcher_preview_snapshots_created_by_idx
  on public.dispatcher_preview_snapshots (created_by, created_at desc)
  where created_by is not null;
create index if not exists dispatcher_preview_snapshots_status_created_at_idx
  on public.dispatcher_preview_snapshots (orchestrator_status, created_at desc);

alter table public.dispatcher_preview_snapshots enable row level security;

revoke all on public.dispatcher_preview_snapshots from public;

-- No direct INSERT/UPDATE/DELETE grants are provided. Reads/writes should use
-- the narrow RPCs below until company-owned service_requests and final RLS are
-- reviewed.

drop policy if exists "dispatcher_preview_snapshots_dashboard_select"
  on public.dispatcher_preview_snapshots;
create policy "dispatcher_preview_snapshots_dashboard_select"
on public.dispatcher_preview_snapshots
for select
to authenticated
using (public.can_view_service_request(service_request_id));

create or replace function public.save_dispatcher_preview_snapshot_rpc(
  p_service_request_id uuid,
  p_normalized_zip text,
  p_normalized_service_type text,
  p_normalized_appliance text,
  p_normalized_brand text,
  p_normalized_issue text,
  p_requested_window text,
  p_requested_date date,
  p_orchestrator_status text,
  p_recommended_technician_profile_id uuid,
  p_recommendation_summary jsonb,
  p_backup_options_count integer,
  p_backup_options jsonb,
  p_safe_customer_response_draft text,
  p_validation_warnings jsonb,
  p_validation_errors jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_company_id uuid;
  inserted_snapshot public.dispatcher_preview_snapshots;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_view_service_request(p_service_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  if p_orchestrator_status not in (
    'success',
    'partial',
    'no_availability',
    'validation_failed'
  ) then
    raise exception 'Invalid dispatcher orchestrator status.'
      using errcode = '22023';
  end if;

  select company_id
  into caller_company_id
  from public.profiles
  where id = auth.uid();

  insert into public.dispatcher_preview_snapshots (
    company_id,
    service_request_id,
    normalized_zip,
    normalized_service_type,
    normalized_appliance,
    normalized_brand,
    normalized_issue,
    requested_window,
    requested_date,
    orchestrator_status,
    recommended_technician_profile_id,
    recommendation_summary,
    backup_options_count,
    backup_options,
    safe_customer_response_draft,
    validation_warnings,
    validation_errors,
    created_by
  )
  values (
    caller_company_id,
    p_service_request_id,
    nullif(btrim(coalesce(p_normalized_zip, '')), ''),
    left(nullif(btrim(coalesce(p_normalized_service_type, '')), ''), 120),
    left(nullif(btrim(coalesce(p_normalized_appliance, '')), ''), 120),
    left(nullif(btrim(coalesce(p_normalized_brand, '')), ''), 120),
    left(nullif(btrim(coalesce(p_normalized_issue, '')), ''), 1000),
    left(nullif(btrim(coalesce(p_requested_window, '')), ''), 120),
    p_requested_date,
    p_orchestrator_status,
    p_recommended_technician_profile_id,
    coalesce(p_recommendation_summary, '{}'::jsonb),
    greatest(coalesce(p_backup_options_count, 0), 0),
    coalesce(p_backup_options, '[]'::jsonb),
    left(nullif(btrim(coalesce(p_safe_customer_response_draft, '')), ''), 2000),
    coalesce(p_validation_warnings, '[]'::jsonb),
    coalesce(p_validation_errors, '[]'::jsonb),
    auth.uid()
  )
  returning * into inserted_snapshot;

  return jsonb_build_object(
    'id', inserted_snapshot.id,
    'company_id', inserted_snapshot.company_id,
    'service_request_id', inserted_snapshot.service_request_id,
    'normalized_zip', inserted_snapshot.normalized_zip,
    'normalized_service_type', inserted_snapshot.normalized_service_type,
    'normalized_appliance', inserted_snapshot.normalized_appliance,
    'normalized_brand', inserted_snapshot.normalized_brand,
    'normalized_issue', inserted_snapshot.normalized_issue,
    'requested_window', inserted_snapshot.requested_window,
    'requested_date', inserted_snapshot.requested_date,
    'orchestrator_status', inserted_snapshot.orchestrator_status,
    'recommended_technician_profile_id', inserted_snapshot.recommended_technician_profile_id,
    'recommendation_summary', inserted_snapshot.recommendation_summary,
    'backup_options_count', inserted_snapshot.backup_options_count,
    'backup_options', inserted_snapshot.backup_options,
    'safe_customer_response_draft', inserted_snapshot.safe_customer_response_draft,
    'validation_warnings', inserted_snapshot.validation_warnings,
    'validation_errors', inserted_snapshot.validation_errors,
    'created_by', inserted_snapshot.created_by,
    'created_at', inserted_snapshot.created_at
  );
end;
$$;

comment on function public.save_dispatcher_preview_snapshot_rpc(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  uuid,
  jsonb,
  integer,
  jsonb,
  text,
  jsonb,
  jsonb
) is
  'Task 120 RPC. Saves an internal dispatcher preview snapshot for an accessible service request. Does not book, send, assign, or call providers.';

revoke all on function public.save_dispatcher_preview_snapshot_rpc(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  uuid,
  jsonb,
  integer,
  jsonb,
  text,
  jsonb,
  jsonb
) from public;
grant execute on function public.save_dispatcher_preview_snapshot_rpc(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  uuid,
  jsonb,
  integer,
  jsonb,
  text,
  jsonb,
  jsonb
) to authenticated;

create or replace function public.latest_dispatcher_preview_snapshot_rpc(
  p_service_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  latest_snapshot public.dispatcher_preview_snapshots;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_view_service_request(p_service_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  select *
  into latest_snapshot
  from public.dispatcher_preview_snapshots
  where service_request_id = p_service_request_id
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', latest_snapshot.id,
    'company_id', latest_snapshot.company_id,
    'service_request_id', latest_snapshot.service_request_id,
    'normalized_zip', latest_snapshot.normalized_zip,
    'normalized_service_type', latest_snapshot.normalized_service_type,
    'normalized_appliance', latest_snapshot.normalized_appliance,
    'normalized_brand', latest_snapshot.normalized_brand,
    'normalized_issue', latest_snapshot.normalized_issue,
    'requested_window', latest_snapshot.requested_window,
    'requested_date', latest_snapshot.requested_date,
    'orchestrator_status', latest_snapshot.orchestrator_status,
    'recommended_technician_profile_id', latest_snapshot.recommended_technician_profile_id,
    'recommendation_summary', latest_snapshot.recommendation_summary,
    'backup_options_count', latest_snapshot.backup_options_count,
    'backup_options', latest_snapshot.backup_options,
    'safe_customer_response_draft', latest_snapshot.safe_customer_response_draft,
    'validation_warnings', latest_snapshot.validation_warnings,
    'validation_errors', latest_snapshot.validation_errors,
    'created_by', latest_snapshot.created_by,
    'created_at', latest_snapshot.created_at
  );
end;
$$;

comment on function public.latest_dispatcher_preview_snapshot_rpc(uuid) is
  'Task 120 RPC. Returns the latest internal dispatcher preview snapshot for an accessible service request, or null when none exists.';

revoke all on function public.latest_dispatcher_preview_snapshot_rpc(uuid) from public;
grant execute on function public.latest_dispatcher_preview_snapshot_rpc(uuid) to authenticated;
