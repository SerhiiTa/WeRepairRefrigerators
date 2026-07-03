-- Task 150.1: Intake Inbox QA fixes and conversion hardening.
--
-- DEV/STAGING APPLY-READY.
--
-- Purpose:
--   Harden the Task 150 unified intake foundation after live QA:
--   - support first/last customer names;
--   - preserve address metadata from autocomplete;
--   - record possible duplicate metadata;
--   - convert only into service_requests that the current dashboard user can
--     actually access through the existing can_view_service_request() policy;
--   - avoid marking intake converted after partial conversion failure.
--
-- Safety:
--   - Forward-only patch. Do not edit 0047 after it has been applied.
--   - Does not change auth, Supabase Auth settings, API keys, or providers.
--   - Does not integrate production Telnyx/Retell/SMS/calls.

alter table public.intake_requests
  add column if not exists customer_first_name text,
  add column if not exists customer_last_name text,
  add column if not exists country text not null default 'US',
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists place_id text,
  add column if not exists duplicate_candidate jsonb not null default '{}'::jsonb,
  add column if not exists duplicate_confirmed_at timestamptz,
  add column if not exists duplicate_confirmed_by uuid references public.profiles(id) on delete set null;

comment on column public.intake_requests.customer_first_name is
  'Task 150.1 split customer first name for customer/profile matching.';
comment on column public.intake_requests.customer_last_name is
  'Task 150.1 split customer last name for customer/profile matching.';
comment on column public.intake_requests.duplicate_candidate is
  'Task 150.1 possible duplicate metadata from intake/service request checks. Review before conversion.';

create index if not exists intake_requests_duplicate_candidate_idx
  on public.intake_requests using gin (duplicate_candidate);
create index if not exists intake_requests_phone_zip_created_idx
  on public.intake_requests (customer_phone, zip_code, created_at desc)
  where customer_phone is not null;

create or replace function public.create_intake_request_rpc(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_row public.intake_requests;
  profile_company_id uuid;
  payload_company_id uuid;
  full_name_value text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  select p.company_id
  into profile_company_id
  from public.profiles p
  where p.id = auth.uid();

  if nullif(p_payload->>'company_id', '') is not null then
    payload_company_id := (p_payload->>'company_id')::uuid;

    if not exists (
      select 1
      from public.company_members cm
      where cm.company_id = payload_company_id
        and cm.profile_id = auth.uid()
        and cm.member_status = 'active'
        and cm.archived_at is null
    ) then
      raise exception 'This account cannot create intake for that company.'
        using errcode = '42501';
    end if;
  end if;

  full_name_value := nullif(trim(p_payload->>'customer_name'), '');
  if full_name_value is null then
    full_name_value := nullif(
      trim(
        concat_ws(
          ' ',
          nullif(trim(coalesce(p_payload->>'customer_first_name', '')), ''),
          nullif(trim(coalesce(p_payload->>'customer_last_name', '')), '')
        )
      ),
      ''
    );
  end if;

  insert into public.intake_requests (
    company_id,
    owner_profile_id,
    source_type,
    source_name,
    source_identifier,
    customer_first_name,
    customer_last_name,
    customer_name,
    customer_phone,
    customer_email,
    service_address,
    city,
    state,
    zip_code,
    country,
    latitude,
    longitude,
    place_id,
    appliance_type,
    brand,
    model_number,
    serial_number,
    problem_description,
    preferred_appointment_window,
    appointment_date,
    window_start_time,
    window_end_time,
    raw_message,
    transcript,
    raw_payload,
    extracted_data,
    duplicate_candidate,
    duplicate_confirmed_at,
    duplicate_confirmed_by,
    extraction_confidence,
    status,
    assigned_technician_id,
    created_by,
    updated_by
  )
  values (
    coalesce(payload_company_id, profile_company_id),
    auth.uid(),
    public.normalize_intake_source_type(p_payload->>'source_type'),
    nullif(trim(p_payload->>'source_name'), ''),
    nullif(trim(p_payload->>'source_identifier'), ''),
    nullif(trim(p_payload->>'customer_first_name'), ''),
    nullif(trim(p_payload->>'customer_last_name'), ''),
    full_name_value,
    nullif(trim(p_payload->>'customer_phone'), ''),
    nullif(lower(trim(p_payload->>'customer_email')), ''),
    nullif(trim(p_payload->>'service_address'), ''),
    nullif(trim(p_payload->>'city'), ''),
    coalesce(nullif(trim(p_payload->>'state'), ''), 'TX'),
    nullif(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), ''),
    coalesce(nullif(trim(p_payload->>'country'), ''), 'US'),
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    nullif(trim(p_payload->>'place_id'), ''),
    nullif(trim(p_payload->>'appliance_type'), ''),
    nullif(trim(p_payload->>'brand'), ''),
    nullif(trim(p_payload->>'model_number'), ''),
    nullif(trim(p_payload->>'serial_number'), ''),
    nullif(trim(p_payload->>'problem_description'), ''),
    nullif(trim(p_payload->>'preferred_appointment_window'), ''),
    nullif(p_payload->>'appointment_date', '')::date,
    nullif(p_payload->>'window_start_time', '')::time,
    nullif(p_payload->>'window_end_time', '')::time,
    nullif(trim(p_payload->>'raw_message'), ''),
    nullif(trim(p_payload->>'transcript'), ''),
    coalesce(p_payload->'raw_payload', '{}'::jsonb),
    coalesce(p_payload->'extracted_data', '{}'::jsonb),
    coalesce(p_payload->'duplicate_candidate', '{}'::jsonb),
    case
      when lower(coalesce(p_payload->>'duplicate_confirmed', 'false')) = 'true'
        then now()
      else null
    end,
    case
      when lower(coalesce(p_payload->>'duplicate_confirmed', 'false')) = 'true'
        then auth.uid()
      else null
    end,
    nullif(p_payload->>'extraction_confidence', '')::numeric,
    public.normalize_intake_status(p_payload->>'status'),
    nullif(p_payload->>'assigned_technician_id', '')::uuid,
    auth.uid(),
    auth.uid()
  )
  returning * into inserted_row;

  return to_jsonb(inserted_row);
end;
$$;

revoke execute on function public.create_intake_request_rpc(jsonb) from public;
grant execute on function public.create_intake_request_rpc(jsonb) to authenticated;

create or replace function public.update_intake_request_rpc(
  p_intake_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.intake_requests;
  full_name_value text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_access_intake_request(p_intake_request_id) then
    raise exception 'Intake request is not accessible for this account.'
      using errcode = '42501';
  end if;

  full_name_value := nullif(trim(p_payload->>'customer_name'), '');
  if full_name_value is null then
    full_name_value := nullif(
      trim(
        concat_ws(
          ' ',
          nullif(trim(coalesce(p_payload->>'customer_first_name', '')), ''),
          nullif(trim(coalesce(p_payload->>'customer_last_name', '')), '')
        )
      ),
      ''
    );
  end if;

  update public.intake_requests
  set
    source_type = case
      when p_payload ? 'source_type'
        then public.normalize_intake_source_type(p_payload->>'source_type')
      else source_type
    end,
    source_name = coalesce(nullif(trim(p_payload->>'source_name'), ''), source_name),
    source_identifier = coalesce(nullif(trim(p_payload->>'source_identifier'), ''), source_identifier),
    customer_first_name = coalesce(nullif(trim(p_payload->>'customer_first_name'), ''), customer_first_name),
    customer_last_name = coalesce(nullif(trim(p_payload->>'customer_last_name'), ''), customer_last_name),
    customer_name = coalesce(full_name_value, customer_name),
    customer_phone = coalesce(nullif(trim(p_payload->>'customer_phone'), ''), customer_phone),
    customer_email = coalesce(nullif(lower(trim(p_payload->>'customer_email')), ''), customer_email),
    service_address = coalesce(nullif(trim(p_payload->>'service_address'), ''), service_address),
    city = coalesce(nullif(trim(p_payload->>'city'), ''), city),
    state = coalesce(nullif(trim(p_payload->>'state'), ''), state),
    zip_code = coalesce(nullif(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), ''), zip_code),
    country = coalesce(nullif(trim(p_payload->>'country'), ''), country),
    latitude = coalesce(nullif(p_payload->>'latitude', '')::numeric, latitude),
    longitude = coalesce(nullif(p_payload->>'longitude', '')::numeric, longitude),
    place_id = coalesce(nullif(trim(p_payload->>'place_id'), ''), place_id),
    appliance_type = coalesce(nullif(trim(p_payload->>'appliance_type'), ''), appliance_type),
    brand = coalesce(nullif(trim(p_payload->>'brand'), ''), brand),
    model_number = coalesce(nullif(trim(p_payload->>'model_number'), ''), model_number),
    serial_number = coalesce(nullif(trim(p_payload->>'serial_number'), ''), serial_number),
    problem_description = coalesce(nullif(trim(p_payload->>'problem_description'), ''), problem_description),
    preferred_appointment_window = coalesce(nullif(trim(p_payload->>'preferred_appointment_window'), ''), preferred_appointment_window),
    appointment_date = coalesce(nullif(p_payload->>'appointment_date', '')::date, appointment_date),
    window_start_time = coalesce(nullif(p_payload->>'window_start_time', '')::time, window_start_time),
    window_end_time = coalesce(nullif(p_payload->>'window_end_time', '')::time, window_end_time),
    raw_message = coalesce(nullif(trim(p_payload->>'raw_message'), ''), raw_message),
    transcript = coalesce(nullif(trim(p_payload->>'transcript'), ''), transcript),
    raw_payload = coalesce(p_payload->'raw_payload', raw_payload),
    extracted_data = coalesce(p_payload->'extracted_data', extracted_data),
    duplicate_candidate = coalesce(p_payload->'duplicate_candidate', duplicate_candidate),
    duplicate_confirmed_at = case
      when lower(coalesce(p_payload->>'duplicate_confirmed', 'false')) = 'true'
        then coalesce(duplicate_confirmed_at, now())
      else duplicate_confirmed_at
    end,
    duplicate_confirmed_by = case
      when lower(coalesce(p_payload->>'duplicate_confirmed', 'false')) = 'true'
        then coalesce(duplicate_confirmed_by, auth.uid())
      else duplicate_confirmed_by
    end,
    extraction_confidence = coalesce(nullif(p_payload->>'extraction_confidence', '')::numeric, extraction_confidence),
    status = case
      when p_payload ? 'status'
        then public.normalize_intake_status(p_payload->>'status')
      else status
    end,
    assigned_technician_id = coalesce(nullif(p_payload->>'assigned_technician_id', '')::uuid, assigned_technician_id),
    updated_by = auth.uid()
  where id = p_intake_request_id
  returning * into updated_row;

  if not found then
    raise exception 'Intake request not found.'
      using errcode = 'P0002';
  end if;

  return to_jsonb(updated_row);
end;
$$;

revoke execute on function public.update_intake_request_rpc(uuid, jsonb) from public;
grant execute on function public.update_intake_request_rpc(uuid, jsonb) to authenticated;

create or replace function public.convert_intake_request_rpc(
  p_intake_request_id uuid,
  p_allow_possible_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  intake_row public.intake_requests;
  customer_id_value uuid;
  service_request_id_value uuid := gen_random_uuid();
  service_request_row public.service_requests;
  appointment_result jsonb;
  appointment_id_value uuid;
  customer_name_value text;
  technician_row public.technician_profiles;
  selected_technician_slug_value text;
  selected_business_name_value text;
  duplicate_count integer := 0;
  duplicate_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  select *
  into intake_row
  from public.intake_requests
  where id = p_intake_request_id
  for update;

  if not found then
    raise exception 'Intake request not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_access_intake_request(p_intake_request_id) then
    raise exception 'Intake request is not accessible for this account.'
      using errcode = '42501';
  end if;

  if intake_row.status = 'converted' and intake_row.linked_service_request_id is not null then
    return jsonb_build_object(
      'ok', true,
      'intake_request_id', intake_row.id,
      'service_request_id', intake_row.linked_service_request_id,
      'appointment_id', intake_row.linked_appointment_id,
      'already_converted', true
    );
  end if;

  customer_name_value := nullif(
    trim(
      coalesce(
        intake_row.customer_name,
        concat_ws(' ', intake_row.customer_first_name, intake_row.customer_last_name)
      )
    ),
    ''
  );

  if customer_name_value is null then
    raise exception 'Customer name is required before conversion.'
      using errcode = '22023';
  end if;

  if nullif(trim(coalesce(intake_row.appliance_type, '')), '') is null then
    raise exception 'Appliance type is required before conversion.'
      using errcode = '22023';
  end if;

  if nullif(trim(coalesce(intake_row.problem_description, '')), '') is null then
    raise exception 'Problem description is required before conversion.'
      using errcode = '22023';
  end if;

  if coalesce(intake_row.zip_code, '') !~ '^[0-9]{5}$' then
    raise exception 'A valid 5 digit ZIP code is required before conversion.'
      using errcode = '22023';
  end if;

  if intake_row.window_start_time is not null
     and intake_row.window_end_time is not null
     and intake_row.window_start_time >= intake_row.window_end_time then
    raise exception 'Appointment end time must be after start time.'
      using errcode = '22023';
  end if;

  select count(*)
  into duplicate_count
  from public.service_requests sr
  where sr.created_at >= now() - interval '30 days'
    and sr.status not in ('completed', 'closed', 'canceled')
    and (
      (
        nullif(coalesce(intake_row.customer_phone, ''), '') is not null
        and sr.customer_phone = intake_row.customer_phone
      )
      or (
        nullif(coalesce(intake_row.service_address, ''), '') is not null
        and lower(coalesce(sr.street_address, sr.full_address, '')) = lower(intake_row.service_address)
      )
    )
    and lower(sr.appliance_type) = lower(intake_row.appliance_type);

  duplicate_payload := jsonb_build_object(
    'service_request_matches', duplicate_count,
    'checked_at', now(),
    'criteria', jsonb_build_array('phone', 'address', 'appliance', 'recent_active')
  );

  if duplicate_count > 0 and not p_allow_possible_duplicate then
    update public.intake_requests
    set
      status = 'needs_info',
      duplicate_candidate = duplicate_payload,
      updated_by = auth.uid()
    where id = p_intake_request_id;

    raise exception 'Possible duplicate job found. Confirm duplicate review before converting.'
      using errcode = '22023';
  end if;

  if intake_row.assigned_technician_id is not null then
    select *
    into technician_row
    from public.technician_profiles
    where id = intake_row.assigned_technician_id;

    if found then
      selected_technician_slug_value := public.public_technician_profile_slug_for_profile(technician_row.profile_id);
      selected_business_name_value :=
        nullif(trim(coalesce(technician_row.business_name, technician_row.display_name, '')), '');

      if intake_row.company_id is not null
         and technician_row.company_id is not null
         and intake_row.company_id <> technician_row.company_id then
        raise exception 'Assigned technician does not belong to this intake company.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if to_regprocedure('public.find_or_create_customer_for_request_rpc(text,text,text,text)') is not null then
    execute 'select public.find_or_create_customer_for_request_rpc($1, $2, $3, $4)'
      into customer_id_value
      using coalesce(nullif(trim(coalesce(intake_row.customer_first_name, '')), ''), split_part(customer_name_value, ' ', 1)),
            nullif(trim(coalesce(intake_row.customer_last_name, '')), ''),
            intake_row.customer_phone,
            intake_row.customer_email;
  end if;

  insert into public.service_requests (
    id,
    company_id,
    customer_id,
    customer_name,
    customer_phone,
    customer_email,
    appliance_type,
    appliance_brand,
    appliance_model,
    issue_description,
    full_address,
    street_address,
    zip_code,
    city,
    state,
    country,
    latitude,
    longitude,
    place_id,
    preferred_time_window,
    selected_technician_slug,
    selected_technician_business_name,
    assigned_technician_profile_id,
    request_source,
    status
  )
  values (
    service_request_id_value,
    intake_row.company_id,
    customer_id_value,
    customer_name_value,
    nullif(trim(coalesce(intake_row.customer_phone, '')), ''),
    nullif(lower(trim(coalesce(intake_row.customer_email, ''))), ''),
    trim(intake_row.appliance_type),
    nullif(trim(coalesce(intake_row.brand, '')), ''),
    nullif(trim(coalesce(intake_row.model_number, '')), ''),
    trim(intake_row.problem_description),
    nullif(trim(coalesce(intake_row.service_address, '')), ''),
    nullif(trim(coalesce(intake_row.service_address, '')), ''),
    trim(intake_row.zip_code),
    nullif(trim(coalesce(intake_row.city, '')), ''),
    coalesce(nullif(trim(coalesce(intake_row.state, '')), ''), 'TX'),
    coalesce(nullif(trim(coalesce(intake_row.country, '')), ''), 'US'),
    intake_row.latitude,
    intake_row.longitude,
    nullif(trim(coalesce(intake_row.place_id, '')), ''),
    nullif(trim(coalesce(intake_row.preferred_appointment_window, '')), ''),
    selected_technician_slug_value,
    selected_business_name_value,
    intake_row.assigned_technician_id,
    'other',
    case
      when intake_row.appointment_date is not null
        and intake_row.window_start_time is not null
        and intake_row.window_end_time is not null
        and intake_row.assigned_technician_id is not null
        then 'scheduled'
      else 'new'
    end
  )
  returning * into service_request_row;

  if not public.can_view_service_request(service_request_id_value) then
    raise exception 'Converted job was created without dashboard access. Check company or assigned technician profile before converting.'
      using errcode = '42501';
  end if;

  if intake_row.appointment_date is not null
     and intake_row.window_start_time is not null
     and intake_row.window_end_time is not null
     and intake_row.assigned_technician_id is not null then
    appointment_result := public.book_service_request_appointment_rpc(
      service_request_id_value,
      intake_row.assigned_technician_id,
      intake_row.appointment_date,
      intake_row.window_start_time,
      intake_row.window_end_time,
      null,
      'manual'
    );

    appointment_id_value := nullif(appointment_result->>'id', '')::uuid;
  end if;

  update public.intake_requests
  set
    status = 'converted',
    linked_customer_id = customer_id_value,
    linked_service_request_id = service_request_id_value,
    linked_appointment_id = appointment_id_value,
    duplicate_candidate = duplicate_payload,
    duplicate_confirmed_at = case
      when duplicate_count > 0 then coalesce(duplicate_confirmed_at, now())
      else duplicate_confirmed_at
    end,
    duplicate_confirmed_by = case
      when duplicate_count > 0 then coalesce(duplicate_confirmed_by, auth.uid())
      else duplicate_confirmed_by
    end,
    converted_at = now(),
    updated_by = auth.uid()
  where id = p_intake_request_id;

  return jsonb_build_object(
    'ok', true,
    'intake_request_id', p_intake_request_id,
    'customer_id', customer_id_value,
    'service_request_id', service_request_id_value,
    'appointment_id', appointment_id_value,
    'duplicate_candidate', duplicate_payload
  );
end;
$$;

comment on function public.convert_intake_request_rpc(uuid, boolean) is
  'Task 150.1 hardened conversion. Converts only when the created job remains visible to the converter and duplicate review has been confirmed when needed.';

revoke execute on function public.convert_intake_request_rpc(uuid, boolean) from public;
grant execute on function public.convert_intake_request_rpc(uuid, boolean) to authenticated;
