-- Task 130: Google Calendar appointment sync metadata.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add safe external calendar metadata to appointments without changing the
--   existing appointment booking rules or exposing provider credentials.
--
-- Safety model:
--   - This migration stores only provider name, event reference, sync status,
--     last synced timestamp, and safe error text.
--   - It does not store Google OAuth secrets, refresh tokens, access tokens,
--     calendar credentials, customer phone numbers, or technician phone numbers.
--   - Browser clients do not get broad UPDATE grants on appointments.
--   - Calendar sync metadata updates go through a narrow authenticated RPC and
--     still require access to the underlying appointment/service request.

alter table public.appointments
  add column if not exists external_calendar_provider text,
  add column if not exists external_calendar_event_id text,
  add column if not exists external_calendar_status text not null default 'not_configured'
    check (external_calendar_status in (
      'not_configured',
      'pending',
      'synced',
      'failed',
      'canceled'
    )),
  add column if not exists external_calendar_last_synced_at timestamptz,
  add column if not exists external_calendar_error text;

comment on column public.appointments.external_calendar_provider is
  'Task 130 calendar provider name such as google. Does not store credentials.';
comment on column public.appointments.external_calendar_event_id is
  'Task 130 provider event reference only. No OAuth token or secret data.';
comment on column public.appointments.external_calendar_status is
  'Task 130 calendar sync status: not_configured, pending, synced, failed, or canceled.';
comment on column public.appointments.external_calendar_last_synced_at is
  'Task 130 timestamp of last calendar sync attempt/result.';
comment on column public.appointments.external_calendar_error is
  'Task 130 safe operational error summary. Do not store secrets or raw provider tokens.';

create index if not exists appointments_external_calendar_status_idx
  on public.appointments (external_calendar_status, updated_at desc);

create or replace function public.set_appointment_calendar_sync_rpc(
  p_appointment_id uuid,
  p_external_calendar_provider text,
  p_external_calendar_event_id text,
  p_external_calendar_status text,
  p_external_calendar_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_row public.appointments;
  safe_provider text;
  safe_event_id text;
  safe_error text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if p_external_calendar_status not in (
    'not_configured',
    'pending',
    'synced',
    'failed',
    'canceled'
  ) then
    raise exception 'Invalid calendar sync status.'
      using errcode = '22023';
  end if;

  select *
  into appointment_row
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found.'
      using errcode = 'P0002';
  end if;

  if not (
    public.can_view_service_request(appointment_row.service_request_id)
    or public.can_manage_technician_profile(appointment_row.technician_profile_id)
  ) then
    raise exception 'This account cannot update calendar sync for that appointment.'
      using errcode = '42501';
  end if;

  safe_provider := nullif(left(trim(coalesce(p_external_calendar_provider, '')), 40), '');
  safe_event_id := nullif(left(trim(coalesce(p_external_calendar_event_id, '')), 200), '');
  safe_error := nullif(left(trim(coalesce(p_external_calendar_error, '')), 500), '');

  update public.appointments
  set
    external_calendar_provider = safe_provider,
    external_calendar_event_id = safe_event_id,
    external_calendar_status = p_external_calendar_status,
    external_calendar_error = safe_error,
    external_calendar_last_synced_at = now(),
    updated_at = now()
  where id = p_appointment_id
  returning * into appointment_row;

  return jsonb_build_object(
    'id', appointment_row.id,
    'external_calendar_provider', appointment_row.external_calendar_provider,
    'external_calendar_event_id', appointment_row.external_calendar_event_id,
    'external_calendar_status', appointment_row.external_calendar_status,
    'external_calendar_last_synced_at', appointment_row.external_calendar_last_synced_at,
    'external_calendar_error', appointment_row.external_calendar_error,
    'updated_at', appointment_row.updated_at
  );
end;
$$;

comment on function public.set_appointment_calendar_sync_rpc(
  uuid,
  text,
  text,
  text,
  text
) is
  'Task 130 RPC. Updates only safe calendar sync metadata for an accessible appointment. Does not store credentials or provider tokens.';

revoke all on function public.set_appointment_calendar_sync_rpc(
  uuid,
  text,
  text,
  text,
  text
) from public;
grant execute on function public.set_appointment_calendar_sync_rpc(
  uuid,
  text,
  text,
  text,
  text
) to authenticated;
