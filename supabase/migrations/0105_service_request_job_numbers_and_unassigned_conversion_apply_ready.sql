-- COMM-09A final data cleanup: durable Job Numbers and unassigned Communications jobs.
--
-- Migrations through 0104 are already applied in Production. Do not edit them.
--
-- This migration:
-- - Adds company-scoped human-readable service_requests.job_number values.
-- - Backfills existing Jobs deterministically from created_at + id, starting at 1001
--   within each company scope.
-- - Adds a row-locked counter table and BEFORE INSERT trigger so every future Job
--   creation path receives the next number without relying on MAX(job_number) + 1.
-- - Replaces convert_intake_request_rpc only to remove the legacy fallback that
--   silently assigned the current user's technician profile when the Intake had no
--   explicit assigned_technician_id. Existing explicit assignments are preserved.

alter table public.service_requests
  add column if not exists job_number integer;

create table if not exists public.service_request_job_number_counters (
  company_id uuid primary key,
  next_job_number integer not null default 1001 check (next_job_number >= 1001),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.service_request_job_number_counters is
  'Company-scoped counters for human-readable service request Job Numbers. Uses the zero UUID as an internal legacy scope for rows without company_id.';

comment on column public.service_requests.job_number is
  'Human-readable company-scoped Job Number. UUID id remains the internal primary key and route identifier.';

with ordered_requests as (
  select
    id,
    1000 + row_number() over (
      partition by coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by created_at, id
    ) as assigned_job_number
  from public.service_requests
  where job_number is null
)
update public.service_requests sr
set job_number = ordered_requests.assigned_job_number
from ordered_requests
where sr.id = ordered_requests.id;

alter table public.service_requests
  alter column job_number set not null;

create unique index if not exists service_requests_company_job_number_unique_idx
  on public.service_requests (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    job_number
  );

insert into public.service_request_job_number_counters (company_id, next_job_number)
select
  coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid) as company_id,
  greatest(coalesce(max(job_number), 1000) + 1, 1001) as next_job_number
from public.service_requests
group by coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
on conflict (company_id) do update
set
  next_job_number = greatest(
    public.service_request_job_number_counters.next_job_number,
    excluded.next_job_number
  ),
  updated_at = now();

create or replace function public.assign_service_request_job_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  counter_company_id uuid := coalesce(
    new.company_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
  assigned_job_number integer;
begin
  if new.job_number is not null then
    return new;
  end if;

  insert into public.service_request_job_number_counters (company_id, next_job_number)
  values (counter_company_id, 1001)
  on conflict (company_id) do nothing;

  update public.service_request_job_number_counters
  set
    next_job_number = next_job_number + 1,
    updated_at = now()
  where company_id = counter_company_id
  returning next_job_number - 1 into assigned_job_number;

  new.job_number := assigned_job_number;
  return new;
end;
$$;

drop trigger if exists assign_service_request_job_number on public.service_requests;
create trigger assign_service_request_job_number
before insert on public.service_requests
for each row
execute function public.assign_service_request_job_number();

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
  profile_company_id uuid;
  membership_company_id uuid;
  effective_company_id uuid;
  duplicate_service_request_count integer := 0;
  duplicate_intake_count integer := 0;
  duplicate_payload jsonb;
  customer_address_id_value uuid;
  customer_address_result jsonb;
  trusted_booking_value boolean := false;
  customer_phone_value text;
  first_name_value text;
  last_name_value text;
  full_name_value text;
  created_customer_value boolean := false;
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

  if intake_row.linked_service_request_id is not null then
    update public.intake_requests
    set
      status = case when status = 'archived' then status else 'converted' end,
      converted_at = coalesce(converted_at, now()),
      updated_by = auth.uid()
    where id = p_intake_request_id
    returning * into intake_row;

    return jsonb_build_object(
      'ok', true,
      'intake_request_id', intake_row.id,
      'service_request_id', intake_row.linked_service_request_id,
      'appointment_id', intake_row.linked_appointment_id,
      'already_converted', true,
      'duplicate_candidate', coalesce(intake_row.duplicate_candidate, '{}'::jsonb)
    );
  end if;

  if intake_row.status in ('converted', 'dismissed', 'archived') then
    raise exception 'This intake cannot be converted from its current lifecycle status.'
      using errcode = '22023';
  end if;

  trusted_booking_value := intake_row.source_type = 'website_form'
    and intake_row.raw_payload->>'event_type' = 'booking_request';

  customer_name_value := nullif(
    trim(
      concat_ws(
        ' ',
        nullif(trim(coalesce(intake_row.customer_first_name, '')), ''),
        nullif(trim(coalesce(intake_row.customer_last_name, '')), '')
      )
    ),
    ''
  );

  if customer_name_value is null then
    customer_name_value := nullif(trim(coalesce(intake_row.customer_name, '')), '');
  end if;

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

  if trusted_booking_value then
    if nullif(trim(coalesce(intake_row.service_address, '')), '') is null then
      raise exception 'Service address is required before creating a job from this trusted booking.'
        using errcode = '22023';
    end if;

    customer_phone_value := public.normalize_customer_crm_phone(intake_row.customer_phone);

    if customer_phone_value is null then
      raise exception 'A usable customer phone number is required before creating a job from this trusted booking.'
        using errcode = '22023';
    end if;
  end if;

  if intake_row.assigned_technician_id is not null then
    select *
    into technician_row
    from public.technician_profiles
    where id = intake_row.assigned_technician_id
      and archived_at is null;

    if not found then
      raise exception 'Assigned technician profile is no longer available.'
        using errcode = '22023';
    end if;
  end if;

  select p.company_id
  into profile_company_id
  from public.profiles p
  where p.id = auth.uid();

  select cm.company_id
  into membership_company_id
  from public.company_members cm
  where cm.profile_id = auth.uid()
    and cm.member_status = 'active'
    and cm.archived_at is null
  order by
    case when cm.member_role in ('owner', 'manager', 'dispatcher') then 0 else 1 end,
    cm.created_at desc
  limit 1;

  if technician_row.id is not null then
    selected_technician_slug_value :=
      public.public_technician_profile_slug_for_profile(technician_row.profile_id);
    selected_business_name_value :=
      nullif(trim(coalesce(technician_row.business_name, technician_row.display_name, '')), '');
  end if;

  effective_company_id := coalesce(
    intake_row.company_id,
    technician_row.company_id,
    profile_company_id,
    membership_company_id
  );

  if effective_company_id is not null and not public.user_can_access_company(effective_company_id) then
    raise exception 'This account cannot convert intake for the resolved company.'
      using errcode = '42501';
  end if;

  if effective_company_id is null and selected_technician_slug_value is null then
    raise exception 'Choose an assigned technician or use an account with company access before converting.'
      using errcode = '22023';
  end if;

  if trusted_booking_value and effective_company_id is null then
    raise exception 'A company context is required before creating a job from this trusted booking.'
      using errcode = '42501';
  end if;

  if intake_row.appointment_date is not null
     and intake_row.window_start_time is not null
     and intake_row.window_end_time is not null
     and intake_row.assigned_technician_id is null then
    raise exception 'Assign a technician before converting an intake with an appointment window.'
      using errcode = '22023';
  end if;

  select count(*)
  into duplicate_service_request_count
  from public.service_requests sr
  where sr.created_at >= now() - interval '30 days'
    and sr.status not in ('completed', 'closed', 'canceled', 'archived', 'spam')
    and lower(sr.appliance_type) = lower(intake_row.appliance_type)
    and (
      (
        nullif(coalesce(intake_row.customer_phone, ''), '') is not null
        and sr.customer_phone = intake_row.customer_phone
      )
      or (
        nullif(coalesce(intake_row.service_address, ''), '') is not null
        and public.normalize_customer_address_match_value(coalesce(sr.street_address, sr.full_address), 'street') = public.normalize_customer_address_match_value(intake_row.service_address, 'street')
        and public.normalize_customer_address_match_value(sr.unit, 'unit') = public.normalize_customer_address_match_value(intake_row.unit, 'unit')
        and public.normalize_customer_address_match_value(sr.zip_code, 'zip') = public.normalize_customer_address_match_value(intake_row.zip_code, 'zip')
      )
      or (
        coalesce(intake_row.zip_code, '') <> ''
        and sr.zip_code = intake_row.zip_code
        and lower(coalesce(sr.appliance_brand, '')) = lower(coalesce(intake_row.brand, ''))
      )
    );

  select count(*)
  into duplicate_intake_count
  from public.intake_requests other
  where other.id <> intake_row.id
    and other.created_at >= now() - interval '30 days'
    and other.status in ('new', 'reviewed', 'needs_info', 'customer_matched', 'ready_to_convert')
    and lower(coalesce(other.appliance_type, '')) = lower(coalesce(intake_row.appliance_type, ''))
    and (
      (
        nullif(coalesce(intake_row.customer_phone, ''), '') is not null
        and other.customer_phone = intake_row.customer_phone
      )
      or (
        nullif(coalesce(intake_row.service_address, ''), '') is not null
        and public.normalize_customer_address_match_value(other.service_address, 'street') = public.normalize_customer_address_match_value(intake_row.service_address, 'street')
        and public.normalize_customer_address_match_value(other.unit, 'unit') = public.normalize_customer_address_match_value(intake_row.unit, 'unit')
        and public.normalize_customer_address_match_value(other.zip_code, 'zip') = public.normalize_customer_address_match_value(intake_row.zip_code, 'zip')
      )
      or (
        coalesce(intake_row.zip_code, '') <> ''
        and other.zip_code = intake_row.zip_code
        and lower(coalesce(other.brand, '')) = lower(coalesce(intake_row.brand, ''))
      )
    );

  duplicate_payload := jsonb_build_object(
    'intake_matches', duplicate_intake_count,
    'service_request_matches', duplicate_service_request_count,
    'checked_at', now(),
    'criteria', jsonb_build_array('phone', 'address_unit', 'appliance', 'brand', 'recent_active')
  );

  if (duplicate_service_request_count + duplicate_intake_count) > 0
     and not p_allow_possible_duplicate then
    update public.intake_requests
    set
      status = 'needs_info',
      duplicate_candidate = duplicate_payload,
      updated_by = auth.uid()
    where id = p_intake_request_id;

    raise exception 'Possible duplicate job found. Confirm duplicate review before converting.'
      using errcode = '22023';
  end if;

  customer_id_value := intake_row.linked_customer_id;

  if customer_id_value is not null then
    if not exists (
      select 1
      from public.customers c
      where c.id = customer_id_value
        and (
          (
            trusted_booking_value
            and effective_company_id is not null
            and c.company_id = effective_company_id
          )
          or (
            not trusted_booking_value
            and (effective_company_id is null or c.company_id = effective_company_id or c.company_id is null)
          )
        )
    ) then
      raise exception 'Linked customer is not accessible for this intake.'
        using errcode = '42501';
    end if;
  elsif trusted_booking_value then
    perform pg_advisory_xact_lock(
      hashtextextended(effective_company_id::text || ':' || customer_phone_value, 0)
    );

    select c.id
    into customer_id_value
    from public.customers c
    where c.company_id = effective_company_id
      and public.normalize_customer_crm_phone(c.phone) = customer_phone_value
    order by c.created_at
    limit 1;

    if customer_id_value is null then
      first_name_value := nullif(trim(coalesce(intake_row.customer_first_name, '')), '');
      last_name_value := nullif(trim(coalesce(intake_row.customer_last_name, '')), '');
      full_name_value := nullif(trim(coalesce(customer_name_value, '')), '');

      if first_name_value is null and last_name_value is null and full_name_value is not null then
        first_name_value := nullif(split_part(full_name_value, ' ', 1), '');
        last_name_value := nullif(trim(substr(full_name_value, length(coalesce(first_name_value, '')) + 1)), '');
      end if;

      insert into public.customers (
        company_id,
        first_name,
        last_name,
        full_name,
        phone,
        email,
        customer_status
      )
      values (
        effective_company_id,
        first_name_value,
        last_name_value,
        coalesce(full_name_value, customer_phone_value, 'Customer'),
        customer_phone_value,
        public.normalize_customer_crm_email(intake_row.customer_email),
        'active'
      )
      returning id into customer_id_value;

      created_customer_value := true;
    end if;
  elsif to_regprocedure('public.find_or_create_customer_for_request_rpc(text,text,text,text)') is not null then
    execute 'select public.find_or_create_customer_for_request_rpc($1, $2, $3, $4)'
      into customer_id_value
      using coalesce(nullif(trim(coalesce(intake_row.customer_first_name, '')), ''), split_part(customer_name_value, ' ', 1)),
            nullif(trim(coalesce(intake_row.customer_last_name, '')), ''),
            intake_row.customer_phone,
            intake_row.customer_email;
  end if;

  if customer_id_value is not null and effective_company_id is not null then
    update public.customers
    set company_id = coalesce(company_id, effective_company_id)
    where id = customer_id_value;
  end if;

  if customer_id_value is not null
     and nullif(trim(coalesce(intake_row.service_address, '')), '') is not null then
    begin
      select ca.id
      into customer_address_id_value
      from public.customer_addresses ca
      where ca.customer_id = customer_id_value
        and (
          (
            nullif(trim(coalesce(intake_row.place_id, '')), '') is not null
            and ca.place_id is not null
            and ca.place_id = nullif(trim(coalesce(intake_row.place_id, '')), '')
          )
          or (
            public.normalize_customer_address_match_value(ca.street_address, 'street') = public.normalize_customer_address_match_value(intake_row.service_address, 'street')
            and public.normalize_customer_address_match_value(ca.unit, 'unit') = public.normalize_customer_address_match_value(intake_row.unit, 'unit')
            and public.normalize_customer_address_match_value(ca.city, 'city') = public.normalize_customer_address_match_value(intake_row.city, 'city')
            and public.normalize_customer_address_match_value(ca.state, 'state') = public.normalize_customer_address_match_value(intake_row.state, 'state')
            and public.normalize_customer_address_match_value(ca.zip_code, 'zip') = public.normalize_customer_address_match_value(intake_row.zip_code, 'zip')
          )
        )
      order by ca.is_primary desc, ca.updated_at desc
      limit 1;

      if customer_address_id_value is null then
        customer_address_result := public.upsert_customer_address_rpc(customer_id_value, null, jsonb_build_object(
          'label', case when trusted_booking_value then 'Service Address' else 'Customer Primary Address' end,
          'street_address', nullif(trim(coalesce(intake_row.service_address, '')), ''),
          'unit', nullif(trim(coalesce(intake_row.unit, '')), ''),
          'city', nullif(trim(coalesce(intake_row.city, '')), ''),
          'state', coalesce(nullif(public.normalize_customer_address_match_value(intake_row.state, 'state'), ''), 'TX'),
          'zip_code', trim(intake_row.zip_code),
          'country', coalesce(nullif(trim(coalesce(intake_row.country, '')), ''), 'US'),
          'latitude', intake_row.latitude,
          'longitude', intake_row.longitude,
          'place_id', nullif(trim(coalesce(intake_row.place_id, '')), ''),
          'is_primary', case when trusted_booking_value and not created_customer_value then false else true end
        ));

        customer_address_id_value := nullif(customer_address_result->>'address_id', '')::uuid;
      end if;
    exception when others then
      if trusted_booking_value then
        raise;
      end if;

      raise notice 'Customer address sync skipped after intake conversion: %', sqlerrm;
      customer_address_id_value := null;
    end;
  end if;

  insert into public.service_requests (
    id,
    company_id,
    customer_id,
    customer_address_id,
    customer_name,
    customer_phone,
    customer_email,
    appliance_type,
    appliance_brand,
    appliance_model,
    issue_description,
    full_address,
    street_address,
    unit,
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
    inbound_source_id,
    source_account_id,
    attribution,
    status
  )
  values (
    service_request_id_value,
    effective_company_id,
    customer_id_value,
    customer_address_id_value,
    customer_name_value,
    nullif(trim(coalesce(intake_row.customer_phone, '')), ''),
    nullif(lower(trim(coalesce(intake_row.customer_email, ''))), ''),
    trim(intake_row.appliance_type),
    nullif(trim(coalesce(intake_row.brand, '')), ''),
    nullif(trim(coalesce(intake_row.model_number, '')), ''),
    trim(intake_row.problem_description),
    nullif(trim(coalesce(intake_row.service_address, '')), ''),
    nullif(trim(coalesce(intake_row.service_address, '')), ''),
    nullif(trim(coalesce(intake_row.unit, '')), ''),
    trim(intake_row.zip_code),
    nullif(trim(coalesce(intake_row.city, '')), ''),
    coalesce(nullif(public.normalize_customer_address_match_value(intake_row.state, 'state'), ''), 'TX'),
    coalesce(nullif(trim(coalesce(intake_row.country, '')), ''), 'US'),
    intake_row.latitude,
    intake_row.longitude,
    nullif(trim(coalesce(intake_row.place_id, '')), ''),
    nullif(trim(coalesce(intake_row.preferred_appointment_window, '')), ''),
    selected_technician_slug_value,
    selected_business_name_value,
    intake_row.assigned_technician_id,
    'other',
    intake_row.inbound_source_id,
    intake_row.source_account_id,
    intake_row.attribution,
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
    company_id = coalesce(company_id, effective_company_id),
    status = 'converted',
    linked_customer_id = customer_id_value,
    linked_service_request_id = service_request_id_value,
    linked_appointment_id = appointment_id_value,
    assigned_technician_id = intake_row.assigned_technician_id,
    duplicate_candidate = duplicate_payload,
    duplicate_confirmed_at = case
      when (duplicate_service_request_count + duplicate_intake_count) > 0
        then coalesce(duplicate_confirmed_at, now())
      else duplicate_confirmed_at
    end,
    duplicate_confirmed_by = case
      when (duplicate_service_request_count + duplicate_intake_count) > 0
        then coalesce(duplicate_confirmed_by, auth.uid())
      else duplicate_confirmed_by
    end,
    converted_at = now(),
    updated_by = auth.uid()
  where id = p_intake_request_id;

  update public.communication_conversations
  set
    service_request_id = coalesce(service_request_id, service_request_id_value),
    customer_id = coalesce(customer_id, customer_id_value)
  where intake_request_id = p_intake_request_id;

  return jsonb_build_object(
    'ok', true,
    'intake_request_id', p_intake_request_id,
    'customer_id', customer_id_value,
    'service_request_id', service_request_id_value,
    'appointment_id', appointment_id_value,
    'duplicate_candidate', duplicate_payload,
    'already_converted', false
  );
end;
$$;

comment on function public.convert_intake_request_rpc(uuid, boolean) is
  'COMM-09A conversion cleanup: preserves trusted booking Customer/address conversion while preventing implicit technician assignment when no Intake technician was explicitly selected.';

revoke execute on function public.convert_intake_request_rpc(uuid, boolean) from public;
grant execute on function public.convert_intake_request_rpc(uuid, boolean) to authenticated;
