-- Task 147: Customer asset-to-service-request booking foundation.
--
-- Forward-only apply-ready migration for dev/staging.
--
-- Purpose:
--   Let an authenticated customer create a service request from one of their
--   saved appliances and schedule the first appointment with a public
--   marketplace technician, without exposing raw technician/contact internals
--   or allowing browser-side appointment writes.

create or replace function public.get_public_technician_booking_windows_rpc(
  p_technician_slug text,
  p_requested_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  technician_row public.technician_profiles;
  requested_day integer;
  requested_date date := coalesce(p_requested_date, current_date + 1);
  windows jsonb;
begin
  select *
  into technician_row
  from public.technician_profiles tp
  where (
    trim(
      both '-' from lower(
        regexp_replace(
          coalesce(nullif(tp.business_name, ''), nullif(tp.display_name, ''), 'houston-refrigeration-technician'),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        )
      )
    )
    || '-'
    || substring(md5(tp.id::text) from 1 for 8)
  ) = lower(trim(p_technician_slug))
    and tp.public_profile_ready = true
    and tp.marketplace_enabled = true
    and tp.technician_status = 'verified'
    and tp.archived_at is null
    and tp.rejected_at is null
    and tp.suspended_at is null
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Technician is not available for customer booking.'
    );
  end if;

  requested_day := extract(dow from requested_date)::integer;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', requested_date,
        'start_time', availability.start_time,
        'end_time', availability.end_time,
        'source', 'availability_rule'
      )
      order by availability.start_time
    ),
    '[]'::jsonb
  )
  into windows
  from public.technician_availability_rules availability
  where availability.technician_profile_id = technician_row.id
    and availability.is_available is true
    and availability.day_of_week = requested_day;

  if jsonb_array_length(windows) = 0 then
    windows := jsonb_build_array(
      jsonb_build_object('date', requested_date, 'start_time', '09:00:00', 'end_time', '12:00:00', 'source', 'controlled_window'),
      jsonb_build_object('date', requested_date, 'start_time', '12:00:00', 'end_time', '15:00:00', 'source', 'controlled_window'),
      jsonb_build_object('date', requested_date, 'start_time', '15:00:00', 'end_time', '18:00:00', 'source', 'controlled_window')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'technician_slug', lower(trim(p_technician_slug)),
    'requested_date', requested_date,
    'windows', windows
  );
end;
$$;

create or replace function public.create_customer_asset_booking_rpc(
  p_customer_appliance_id uuid,
  p_problem_description text,
  p_preferred_contact_method text,
  p_notes text,
  p_service_zip_code text,
  p_service_city text,
  p_service_state text,
  p_selected_technician_slug text,
  p_appointment_date date,
  p_window_start_time time,
  p_window_end_time time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_row public.customers;
  appliance_row public.customer_appliances;
  technician_row public.technician_profiles;
  request_row public.service_requests;
  inserted_appointment public.appointments;
  appointment_day integer;
  clean_zip text;
  issue_body text;
  selected_business_name text;
  has_rules boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  clean_zip := regexp_replace(coalesce(p_service_zip_code, ''), '[^0-9]', '', 'g');

  if length(clean_zip) <> 5 then
    raise exception 'A valid 5-digit service ZIP is required.'
      using errcode = '22023';
  end if;

  if nullif(trim(p_problem_description), '') is null then
    raise exception 'Problem description is required.'
      using errcode = '22023';
  end if;

  if p_window_start_time >= p_window_end_time then
    raise exception 'Appointment window start must be before end.'
      using errcode = '22023';
  end if;

  select *
  into customer_row
  from public.customers
  where auth_user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Customer account is not linked.'
      using errcode = '42501';
  end if;

  select *
  into appliance_row
  from public.customer_appliances
  where id = p_customer_appliance_id
    and customer_id = customer_row.id
  for update;

  if not found then
    raise exception 'Customer appliance is not accessible.'
      using errcode = '42501';
  end if;

  select *
  into technician_row
  from public.technician_profiles tp
  where (
    trim(
      both '-' from lower(
        regexp_replace(
          coalesce(nullif(tp.business_name, ''), nullif(tp.display_name, ''), 'houston-refrigeration-technician'),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        )
      )
    )
    || '-'
    || substring(md5(tp.id::text) from 1 for 8)
  ) = lower(trim(p_selected_technician_slug))
    and tp.public_profile_ready = true
    and tp.marketplace_enabled = true
    and tp.technician_status = 'verified'
    and tp.archived_at is null
    and tp.rejected_at is null
    and tp.suspended_at is null
  for update;

  if not found then
    raise exception 'Selected technician is not available for marketplace booking.'
      using errcode = '42501';
  end if;

  if not (clean_zip = any(coalesce(technician_row.service_zip_codes, array[]::text[]))) then
    raise exception 'Selected technician does not cover this service ZIP.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_requests sr
    where sr.customer_appliance_id = appliance_row.id
      and sr.status not in ('completed', 'closed', 'canceled', 'archived', 'spam')
      and sr.appointment_id is not null
  ) then
    raise exception 'This appliance already has an active repair appointment.'
      using errcode = '23505';
  end if;

  appointment_day := extract(dow from p_appointment_date)::integer;

  select exists (
    select 1
    from public.technician_availability_rules availability
    where availability.technician_profile_id = technician_row.id
      and availability.is_available is true
  )
  into has_rules;

  if has_rules and not exists (
    select 1
    from public.technician_availability_rules availability
    where availability.technician_profile_id = technician_row.id
      and availability.is_available is true
      and availability.day_of_week = appointment_day
      and availability.start_time <= p_window_start_time
      and availability.end_time >= p_window_end_time
  ) then
    raise exception 'Technician is not available for the selected window.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.appointments overlapping
    where overlapping.technician_profile_id = technician_row.id
      and overlapping.appointment_date = p_appointment_date
      and overlapping.status in ('scheduled', 'confirmed', 'en_route')
      and overlapping.window_start_time < p_window_end_time
      and overlapping.window_end_time > p_window_start_time
  ) then
    raise exception 'Technician already has an appointment in that window.'
      using errcode = '23P01';
  end if;

  issue_body := trim(p_problem_description);

  if nullif(trim(p_notes), '') is not null then
    issue_body := issue_body || E'\n\nCustomer notes: ' || trim(p_notes);
  end if;

  selected_business_name :=
    nullif(trim(coalesce(technician_row.business_name, technician_row.display_name, '')), '');

  insert into public.service_requests (
    customer_id,
    customer_appliance_id,
    customer_name,
    customer_phone,
    customer_email,
    appliance_type,
    appliance_brand,
    appliance_model,
    issue_description,
    zip_code,
    city,
    state,
    preferred_time_window,
    selected_technician_slug,
    selected_technician_business_name,
    assigned_technician_profile_id,
    request_source,
    status
  )
  values (
    customer_row.id,
    appliance_row.id,
    customer_row.full_name,
    customer_row.phone,
    customer_row.email,
    appliance_row.appliance_type,
    appliance_row.brand,
    appliance_row.model_number,
    issue_body,
    clean_zip,
    nullif(trim(p_service_city), ''),
    coalesce(nullif(trim(p_service_state), ''), 'TX'),
    coalesce(nullif(trim(p_preferred_contact_method), ''), customer_row.preferred_contact_method::text),
    lower(trim(p_selected_technician_slug)),
    selected_business_name,
    technician_row.id,
    'schedule_service',
    'new'
  )
  returning * into request_row;

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
    request_row.id,
    technician_row.id,
    p_appointment_date,
    p_window_start_time,
    p_window_end_time,
    'scheduled',
    'manual',
    null,
    auth.uid()
  )
  returning * into inserted_appointment;

  update public.service_requests
  set
    appointment_id = inserted_appointment.id,
    scheduled_date = p_appointment_date,
    scheduled_window_start_time = p_window_start_time,
    scheduled_window_end_time = p_window_end_time,
    status = 'scheduled',
    updated_at = now()
  where id = request_row.id
  returning * into request_row;

  return jsonb_build_object(
    'ok', true,
    'service_request_id', request_row.id,
    'appointment_id', inserted_appointment.id,
    'customer_id', customer_row.id,
    'customer_appliance_id', appliance_row.id,
    'technician_slug', lower(trim(p_selected_technician_slug)),
    'technician_name', selected_business_name,
    'appointment_date', inserted_appointment.appointment_date,
    'window_start_time', inserted_appointment.window_start_time,
    'window_end_time', inserted_appointment.window_end_time,
    'status', request_row.status
  );
end;
$$;

comment on function public.create_customer_asset_booking_rpc(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  time,
  time
) is
  'Task 147. Authenticated customer asset-to-service-request-to-appointment booking RPC. Resolves public technician slug internally and preserves appointment overlap/availability checks.';

revoke execute on function public.get_public_technician_booking_windows_rpc(text, date) from public;
grant execute on function public.get_public_technician_booking_windows_rpc(text, date) to authenticated;

revoke execute on function public.create_customer_asset_booking_rpc(uuid, text, text, text, text, text, text, text, date, time, time) from public;
grant execute on function public.create_customer_asset_booking_rpc(uuid, text, text, text, text, text, text, text, date, time, time) to authenticated;
