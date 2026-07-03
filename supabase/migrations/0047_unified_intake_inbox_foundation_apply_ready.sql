-- Task 150: Unified Intake Inbox foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Store incoming requests from phone, SMS, website forms, email, Yelp,
--   Google, Retell AI, manual entry, and future channels in one shared
--   intake pipeline before converting them into WRA service requests.
--
-- Safety model:
--   - This does not modify authentication, auth settings, or environment keys.
--   - This does not integrate Telnyx, Retell, SMS, email, Yelp, Google
--     Business Messages, payments, or external provider calls.
--   - Browser clients do not get broad INSERT/UPDATE grants. Dashboard writes
--     go through narrow authenticated RPCs.
--   - Conversion creates real service_requests and optionally appointments
--     through existing appointment validation when enough scheduling fields
--     are present.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.intake_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  source_type text not null default 'manual'
    check (source_type in (
      'phone',
      'sms',
      'website_form',
      'email',
      'yelp',
      'google',
      'retell_ai',
      'manual',
      'other'
    )),
  source_name text,
  source_identifier text,
  customer_name text,
  customer_phone text,
  customer_email text,
  service_address text,
  city text,
  state text not null default 'TX',
  zip_code text,
  appliance_type text,
  brand text,
  model_number text,
  serial_number text,
  problem_description text,
  preferred_appointment_window text,
  appointment_date date,
  window_start_time time,
  window_end_time time,
  raw_message text,
  transcript text,
  raw_payload jsonb not null default '{}'::jsonb,
  extracted_data jsonb not null default '{}'::jsonb,
  extraction_confidence numeric(5, 2),
  status text not null default 'new'
    check (status in (
      'new',
      'reviewed',
      'needs_info',
      'customer_matched',
      'ready_to_convert',
      'converted',
      'dismissed'
    )),
  linked_customer_id uuid,
  linked_service_request_id uuid references public.service_requests(id) on delete set null,
  linked_appointment_id uuid references public.appointments(id) on delete set null,
  assigned_technician_id uuid references public.technician_profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint intake_requests_zip_code_format_check
    check (zip_code is null or zip_code ~ '^[0-9]{5}$'),
  constraint intake_requests_confidence_check
    check (
      extraction_confidence is null
      or (extraction_confidence >= 0 and extraction_confidence <= 1)
    ),
  constraint intake_requests_window_order_check
    check (
      window_start_time is null
      or window_end_time is null
      or window_start_time < window_end_time
    )
);

comment on table public.intake_requests is
  'Task 150 unified intake records for all future pre-job channels. Not source-specific leads, provider calls, SMS, or telephony integration.';
comment on column public.intake_requests.raw_payload is
  'Raw internal payload from a form/webhook/manual entry. Must not contain secrets.';
comment on column public.intake_requests.extracted_data is
  'Structured extraction output from local/server AI extraction. Creation must still work when extraction is empty.';
comment on column public.intake_requests.source_identifier is
  'Future channel/source mapping foundation such as phone number, website URL, campaign, or external conversation id.';

create index if not exists intake_requests_company_status_created_idx
  on public.intake_requests (company_id, status, created_at desc)
  where company_id is not null;
create index if not exists intake_requests_owner_status_created_idx
  on public.intake_requests (owner_profile_id, status, created_at desc)
  where owner_profile_id is not null;
create index if not exists intake_requests_source_created_idx
  on public.intake_requests (source_type, created_at desc);
create index if not exists intake_requests_linked_service_request_idx
  on public.intake_requests (linked_service_request_id)
  where linked_service_request_id is not null;
create index if not exists intake_requests_status_created_idx
  on public.intake_requests (status, created_at desc);

drop trigger if exists set_intake_requests_updated_at on public.intake_requests;
create trigger set_intake_requests_updated_at
before update on public.intake_requests
for each row
execute function public.set_updated_at();

alter table public.intake_requests enable row level security;

revoke all on public.intake_requests from public;
revoke all on public.intake_requests from anon;
grant select on public.intake_requests to authenticated;

create or replace function public.can_access_intake_request(
  target_intake_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.intake_requests intake
    where intake.id = target_intake_request_id
      and auth.uid() is not null
      and (
        intake.owner_profile_id = auth.uid()
        or intake.created_by = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = intake.company_id
            and cm.profile_id = auth.uid()
            and cm.member_status = 'active'
            and cm.archived_at is null
        )
      )
  );
$$;

comment on function public.can_access_intake_request(uuid) is
  'Task 150 helper. Checks whether the authenticated dashboard user can read/update an intake request.';

revoke execute on function public.can_access_intake_request(uuid) from public;
grant execute on function public.can_access_intake_request(uuid) to authenticated;

drop policy if exists "intake_requests_dashboard_select" on public.intake_requests;
create policy "intake_requests_dashboard_select"
on public.intake_requests
for select
to authenticated
using (public.can_access_intake_request(id));

create or replace function public.normalize_intake_source_type(
  value text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(value, '')) in (
      'phone',
      'sms',
      'website_form',
      'email',
      'yelp',
      'google',
      'retell_ai',
      'manual',
      'other'
    )
      then lower(value)
    else 'other'
  end;
$$;

create or replace function public.normalize_intake_status(
  value text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(value, '')) in (
      'new',
      'reviewed',
      'needs_info',
      'customer_matched',
      'ready_to_convert',
      'converted',
      'dismissed'
    )
      then lower(value)
    else 'new'
  end;
$$;

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

  insert into public.intake_requests (
    company_id,
    owner_profile_id,
    source_type,
    source_name,
    source_identifier,
    customer_name,
    customer_phone,
    customer_email,
    service_address,
    city,
    state,
    zip_code,
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
    nullif(trim(p_payload->>'customer_name'), ''),
    nullif(trim(p_payload->>'customer_phone'), ''),
    nullif(lower(trim(p_payload->>'customer_email')), ''),
    nullif(trim(p_payload->>'service_address'), ''),
    nullif(trim(p_payload->>'city'), ''),
    coalesce(nullif(trim(p_payload->>'state'), ''), 'TX'),
    nullif(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), ''),
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

comment on function public.create_intake_request_rpc(jsonb) is
  'Task 150 RPC. Creates one authenticated unified intake request with normalized source/status and company ownership.';

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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_access_intake_request(p_intake_request_id) then
    raise exception 'Intake request is not accessible for this account.'
      using errcode = '42501';
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
    customer_name = coalesce(nullif(trim(p_payload->>'customer_name'), ''), customer_name),
    customer_phone = coalesce(nullif(trim(p_payload->>'customer_phone'), ''), customer_phone),
    customer_email = coalesce(nullif(lower(trim(p_payload->>'customer_email')), ''), customer_email),
    service_address = coalesce(nullif(trim(p_payload->>'service_address'), ''), service_address),
    city = coalesce(nullif(trim(p_payload->>'city'), ''), city),
    state = coalesce(nullif(trim(p_payload->>'state'), ''), state),
    zip_code = coalesce(nullif(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), ''), zip_code),
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

comment on function public.update_intake_request_rpc(uuid, jsonb) is
  'Task 150 RPC. Updates reviewed extracted intake fields and status for an authorized dashboard user.';

revoke execute on function public.update_intake_request_rpc(uuid, jsonb) from public;
grant execute on function public.update_intake_request_rpc(uuid, jsonb) to authenticated;

create or replace function public.convert_intake_request_rpc(
  p_intake_request_id uuid
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

  if nullif(trim(coalesce(intake_row.customer_name, '')), '') is null then
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

  if to_regprocedure('public.find_or_create_customer_for_request_rpc(text,text,text,text)') is not null then
    execute 'select public.find_or_create_customer_for_request_rpc($1, $2, $3, $4)'
      into customer_id_value
      using intake_row.customer_name, null, intake_row.customer_phone, intake_row.customer_email;
  end if;

  customer_name_value := trim(intake_row.customer_name);

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
    preferred_time_window,
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
    'US',
    nullif(trim(coalesce(intake_row.preferred_appointment_window, '')), ''),
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
    converted_at = now(),
    updated_by = auth.uid()
  where id = p_intake_request_id;

  return jsonb_build_object(
    'ok', true,
    'intake_request_id', p_intake_request_id,
    'customer_id', customer_id_value,
    'service_request_id', service_request_id_value,
    'appointment_id', appointment_id_value
  );
end;
$$;

comment on function public.convert_intake_request_rpc(uuid) is
  'Task 150 RPC. Converts an authorized intake request into a real service_request and optionally an appointment when scheduling fields are complete.';

revoke execute on function public.convert_intake_request_rpc(uuid) from public;
grant execute on function public.convert_intake_request_rpc(uuid) to authenticated;
