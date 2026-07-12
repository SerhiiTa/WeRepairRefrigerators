-- Task 165.19: Appointment availability fallback and conflict clarity.
--
-- Purpose:
-- - Preserve real appointment protections while fixing the false "technician
--   unavailable" block for technicians without explicit available-hour rows.
-- - Keep the existing book_service_request_appointment_rpc(...) signature so
--   existing callers continue to work.
-- - Continue blocking ZIP mismatches, inactive technicians, duplicate active
--   appointments, explicit unavailable recurring rules, explicit working-hour
--   mismatches, and real overlapping appointments.
--
-- Availability decision:
-- - If any explicit unavailable rule overlaps the requested window, block.
-- - If explicit available rules exist for the technician, require one rule to
--   fully cover the requested window.
-- - If no explicit available rules exist, fall back to the existing platform
--   default business hours: Monday-Friday, 08:00-17:00, America/Chicago.
-- - Overlap remains: existing_start < requested_end AND existing_end > requested_start.
-- - Only scheduled/confirmed/en_route appointments block.

create or replace function public.book_service_request_appointment_rpc(
  p_service_request_id uuid,
  p_technician_profile_id uuid,
  p_appointment_date date,
  p_window_start_time time,
  p_window_end_time time,
  p_dispatcher_snapshot_id uuid default null,
  p_source text default 'dispatcher'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  technician_row public.technician_profiles;
  inserted_appointment public.appointments;
  appointment_day integer;
  source_value text;
  available_rule_count integer := 0;
  has_matching_available_rule boolean := false;
  has_blocking_unavailable_rule boolean := false;
  default_business_start time := time '08:00:00';
  default_business_end time := time '17:00:00';
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if p_source not in ('dispatcher', 'manual', 'ai_dispatcher') then
    raise exception 'Invalid appointment source.'
      using errcode = '22023';
  end if;

  source_value := p_source;

  if p_window_start_time >= p_window_end_time then
    raise exception 'Appointment window start must be before end.'
      using errcode = '22023';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Service request not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(p_service_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  select *
  into technician_row
  from public.technician_profiles
  where id = p_technician_profile_id
  for update;

  if not found then
    raise exception 'Technician profile not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_manage_technician_profile(p_technician_profile_id) then
    raise exception 'This account cannot book appointments for that technician.'
      using errcode = '42501';
  end if;

  if technician_row.technician_status <> 'verified'
     or technician_row.marketplace_enabled is not true
     or technician_row.archived_at is not null
     or technician_row.rejected_at is not null
     or technician_row.suspended_at is not null then
    raise exception 'Technician is not eligible for appointment booking.'
      using errcode = '42501';
  end if;

  if not (
    request_row.zip_code = any(
      coalesce(technician_row.service_zip_codes, array[]::text[])
    )
  ) then
    raise exception 'Technician does not cover the service request ZIP code.'
      using errcode = '42501';
  end if;

  if technician_row.company_id is not null
     and not public.can_manage_company_members(technician_row.company_id) then
    raise exception 'This account cannot manage appointments for that company technician.'
      using errcode = '42501';
  end if;

  if p_dispatcher_snapshot_id is not null
     and not exists (
       select 1
       from public.dispatcher_preview_snapshots dps
       where dps.id = p_dispatcher_snapshot_id
         and dps.service_request_id = p_service_request_id
     ) then
    raise exception 'Dispatcher snapshot does not belong to this service request.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.appointments existing
    where existing.service_request_id = p_service_request_id
      and existing.status in ('scheduled', 'confirmed', 'en_route')
  ) then
    raise exception 'This service request already has an active appointment.'
      using errcode = '23505';
  end if;

  appointment_day := extract(dow from p_appointment_date)::integer;

  select exists (
    select 1
    from public.technician_availability_rules availability
    where availability.technician_profile_id = p_technician_profile_id
      and availability.is_available is false
      and availability.day_of_week = appointment_day
      and availability.start_time < p_window_end_time
      and availability.end_time > p_window_start_time
  )
  into has_blocking_unavailable_rule;

  if has_blocking_unavailable_rule then
    raise exception 'Technician is blocked for this time.'
      using errcode = '22023';
  end if;

  select count(*)
  into available_rule_count
  from public.technician_availability_rules availability
  where availability.technician_profile_id = p_technician_profile_id
    and availability.is_available is true;

  if available_rule_count > 0 then
    select exists (
      select 1
      from public.technician_availability_rules availability
      where availability.technician_profile_id = p_technician_profile_id
        and availability.is_available is true
        and availability.day_of_week = appointment_day
        and availability.start_time <= p_window_start_time
        and availability.end_time >= p_window_end_time
    )
    into has_matching_available_rule;

    if not has_matching_available_rule then
      raise exception 'Technician is not scheduled to work at this time.'
        using errcode = '22023';
    end if;
  elsif appointment_day not in (1, 2, 3, 4, 5)
        or p_window_start_time < default_business_start
        or p_window_end_time > default_business_end then
    raise exception 'Appointment is outside company business hours.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.appointments overlapping
    where overlapping.technician_profile_id = p_technician_profile_id
      and overlapping.appointment_date = p_appointment_date
      and overlapping.status in ('scheduled', 'confirmed', 'en_route')
      and overlapping.window_start_time < p_window_end_time
      and overlapping.window_end_time > p_window_start_time
  ) then
    raise exception 'Technician already has an appointment in that window.'
      using errcode = '23P01';
  end if;

  insert into public.appointments (
    company_id,
    service_request_id,
    technician_profile_id,
    appointment_date,
    window_start_time,
    window_end_time,
    status,
    source,
    dispatcher_snapshot_id,
    created_by
  )
  values (
    technician_row.company_id,
    p_service_request_id,
    p_technician_profile_id,
    p_appointment_date,
    p_window_start_time,
    p_window_end_time,
    'scheduled',
    source_value,
    p_dispatcher_snapshot_id,
    auth.uid()
  )
  returning * into inserted_appointment;

  update public.service_requests
  set
    assigned_technician_profile_id = p_technician_profile_id,
    appointment_id = inserted_appointment.id,
    scheduled_date = p_appointment_date,
    scheduled_window_start_time = p_window_start_time,
    scheduled_window_end_time = p_window_end_time,
    status = 'scheduled',
    updated_at = now()
  where id = p_service_request_id;

  return jsonb_build_object(
    'id', inserted_appointment.id,
    'company_id', inserted_appointment.company_id,
    'service_request_id', inserted_appointment.service_request_id,
    'technician_profile_id', inserted_appointment.technician_profile_id,
    'appointment_date', inserted_appointment.appointment_date,
    'window_start_time', inserted_appointment.window_start_time,
    'window_end_time', inserted_appointment.window_end_time,
    'status', inserted_appointment.status,
    'source', inserted_appointment.source,
    'dispatcher_snapshot_id', inserted_appointment.dispatcher_snapshot_id,
    'created_by', inserted_appointment.created_by,
    'created_at', inserted_appointment.created_at,
    'updated_at', inserted_appointment.updated_at
  );
end;
$$;

comment on function public.book_service_request_appointment_rpc(
  uuid,
  uuid,
  date,
  time,
  time,
  uuid,
  text
) is
  'Task 165.19 RPC patch. Books one active appointment while preserving ZIP, eligibility, explicit availability, default business-hours fallback, and overlap checks.';

revoke all on function public.book_service_request_appointment_rpc(
  uuid,
  uuid,
  date,
  time,
  time,
  uuid,
  text
) from public;
grant execute on function public.book_service_request_appointment_rpc(
  uuid,
  uuid,
  date,
  time,
  time,
  uuid,
  text
) to authenticated;

-- Verification query for Supabase SQL Editor after applying.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'book_service_request_appointment_rpc';
