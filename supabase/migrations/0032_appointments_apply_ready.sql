-- Task 123: Real appointment booking foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Create the first real appointment records from dispatcher recommendations.
--
-- Safety model:
--   - This does not integrate Google Calendar, Google Maps, Twilio, Telnyx,
--     Retell, SMS, email, phone calls, AI calls, or provider webhooks.
--   - Browser clients do not get broad appointment INSERT/UPDATE/DELETE.
--   - Booking uses a narrow authenticated RPC that validates request access,
--     technician authority, recurring availability rules, overlap prevention,
--     and duplicate active appointments.
--   - Customer and technician phone numbers stay out of appointment rows.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies(id)
    on delete set null,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  technician_profile_id uuid not null
    references public.technician_profiles(id)
    on delete restrict,
  appointment_date date not null,
  window_start_time time not null,
  window_end_time time not null,
  status text not null default 'scheduled'
    check (status in (
      'scheduled',
      'confirmed',
      'en_route',
      'completed',
      'canceled',
      'no_show'
    )),
  source text not null default 'dispatcher'
    check (source in (
      'dispatcher',
      'manual',
      'ai_dispatcher'
    )),
  dispatcher_snapshot_id uuid
    references public.dispatcher_preview_snapshots(id)
    on delete set null,
  created_by uuid
    references public.profiles(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint appointments_window_order_check
    check (window_start_time < window_end_time)
);

comment on table public.appointments is
  'Task 123 appointment records created from internal dispatcher/manual booking flows. Not calendar sync, SMS, calls, or provider bookings.';
comment on column public.appointments.dispatcher_snapshot_id is
  'Optional internal dispatcher preview snapshot used when the appointment was booked.';
comment on column public.appointments.source is
  'Internal source label only. ai_dispatcher is reserved for a future provider-free AI Dispatcher booking path.';

alter table public.service_requests
  add column if not exists assigned_technician_profile_id uuid
    references public.technician_profiles(id)
    on delete set null,
  add column if not exists appointment_id uuid
    references public.appointments(id)
    on delete set null,
  add column if not exists scheduled_date date,
  add column if not exists scheduled_window_start_time time,
  add column if not exists scheduled_window_end_time time;

comment on column public.service_requests.assigned_technician_profile_id is
  'Task 123 assignment reference set by trusted appointment booking. Does not expose technician private contact data.';
comment on column public.service_requests.appointment_id is
  'Task 123 active/latest appointment reference set by trusted booking.';
comment on column public.service_requests.scheduled_date is
  'Task 123 scheduled appointment date copied from the active appointment for quick CRM display.';
comment on column public.service_requests.scheduled_window_start_time is
  'Task 123 scheduled service window start time copied from the active appointment.';
comment on column public.service_requests.scheduled_window_end_time is
  'Task 123 scheduled service window end time copied from the active appointment.';

create index if not exists appointments_service_request_idx
  on public.appointments (service_request_id, created_at desc);
create index if not exists appointments_technician_date_idx
  on public.appointments (
    technician_profile_id,
    appointment_date,
    window_start_time
  );
create index if not exists appointments_company_date_idx
  on public.appointments (company_id, appointment_date, window_start_time)
  where company_id is not null;
create index if not exists appointments_status_date_idx
  on public.appointments (status, appointment_date);
create unique index if not exists appointments_one_active_per_request_idx
  on public.appointments (service_request_id)
  where status in ('scheduled', 'confirmed', 'en_route');

create index if not exists service_requests_assigned_technician_idx
  on public.service_requests (assigned_technician_profile_id)
  where assigned_technician_profile_id is not null;
create index if not exists service_requests_appointment_idx
  on public.service_requests (appointment_id)
  where appointment_id is not null;
create index if not exists service_requests_scheduled_date_idx
  on public.service_requests (scheduled_date)
  where scheduled_date is not null;

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
before update on public.appointments
for each row
execute function public.set_updated_at();

alter table public.appointments enable row level security;

revoke all on public.appointments from public;
revoke all on public.appointments from anon;
grant select on public.appointments to authenticated;

drop policy if exists "appointments_dashboard_select" on public.appointments;
create policy "appointments_dashboard_select"
on public.appointments
for select
to authenticated
using (
  public.can_view_service_request(service_request_id)
  or public.can_manage_technician_profile(technician_profile_id)
);

-- No direct INSERT/UPDATE/DELETE grants. Booking/lifecycle changes must go
-- through narrow RPCs so availability and overlap rules cannot be skipped.

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

  if not exists (
    select 1
    from public.technician_availability_rules availability
    where availability.technician_profile_id = p_technician_profile_id
      and availability.is_available is true
      and availability.day_of_week = appointment_day
      and availability.start_time <= p_window_start_time
      and availability.end_time >= p_window_end_time
  ) then
    raise exception 'Technician is not available for that appointment window.'
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
  'Task 123 RPC. Books one active appointment for an accessible service request and managed technician, validating availability and overlap. Does not call providers or expose phone numbers.';

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
