-- COM-07H: Universal Communications/Intake actions for Create Lead or Create Job.
--
-- 0091, 0092, and 0093 are applied Production history. This migration adds a
-- minimal CRM lead record for Communications without reusing the older
-- marketplace-preview public.leads table, which requires preview/job-like fields
-- that partial communications may not have. It also generalizes the COM-07G Job
-- conversion path so trusted website intakes can create Jobs based on complete
-- operational data, not event_type alone.

create table if not exists public.communication_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  intake_request_id uuid references public.intake_requests(id) on delete set null,
  conversation_id uuid references public.communication_conversations(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  inbound_source_id uuid references public.inbound_sources(id) on delete set null,
  source_account_id uuid references public.communication_source_accounts(id) on delete set null,
  source_type text,
  source_name text,
  source_identifier text,
  customer_name text,
  customer_first_name text,
  customer_last_name text,
  customer_phone text,
  customer_email text,
  service_address text,
  unit text,
  city text,
  state text,
  zip_code text,
  appliance_type text,
  brand text,
  problem_description text,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'converted', 'closed', 'spam', 'archived')),
  attribution jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_leads_has_origin_check
    check (intake_request_id is not null or conversation_id is not null)
);

comment on table public.communication_leads is
  'COM-07H company CRM leads created explicitly from Communications/Intake. Leads may exist without Customers and do not create Customers, Jobs, or Customer Addresses.';

create unique index if not exists communication_leads_intake_unique_idx
  on public.communication_leads (intake_request_id)
  where intake_request_id is not null;

create unique index if not exists communication_leads_conversation_unique_idx
  on public.communication_leads (conversation_id)
  where conversation_id is not null;

create index if not exists communication_leads_company_status_idx
  on public.communication_leads (company_id, status, created_at desc);

create index if not exists communication_leads_service_request_idx
  on public.communication_leads (service_request_id)
  where service_request_id is not null;

alter table public.communication_leads enable row level security;

revoke all on public.communication_leads from public;
revoke all on public.communication_leads from anon;
grant select on public.communication_leads to authenticated;

drop trigger if exists set_communication_leads_updated_at on public.communication_leads;
create trigger set_communication_leads_updated_at
before update on public.communication_leads
for each row
execute function public.set_updated_at();

create or replace function public.can_access_communication_lead(target_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_leads lead
    where lead.id = target_lead_id
      and auth.uid() is not null
      and public.user_can_access_company(lead.company_id)
  );
$$;

revoke execute on function public.can_access_communication_lead(uuid) from public;
grant execute on function public.can_access_communication_lead(uuid) to authenticated;

drop policy if exists "communication_leads_dashboard_select" on public.communication_leads;
create policy "communication_leads_dashboard_select"
on public.communication_leads
for select
to authenticated
using (public.can_access_communication_lead(id));

create or replace function public.create_communication_lead_rpc(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.communication_conversations;
  intake_row public.intake_requests;
  lead_row public.communication_leads;
  effective_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into conversation_row
  from public.communication_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;

  if not public.can_access_communication_conversation(p_conversation_id) then
    raise exception 'Conversation is not accessible for this account.' using errcode = '42501';
  end if;

  if conversation_row.intake_request_id is not null then
    select * into intake_row
    from public.intake_requests
    where id = conversation_row.intake_request_id;
  end if;

  effective_company_id := coalesce(conversation_row.company_id, intake_row.company_id);

  if effective_company_id is null or not public.user_can_access_company(effective_company_id) then
    raise exception 'A company context is required before creating a Lead.' using errcode = '42501';
  end if;

  select *
  into lead_row
  from public.communication_leads lead
  where (conversation_row.intake_request_id is not null and lead.intake_request_id = conversation_row.intake_request_id)
     or lead.conversation_id = conversation_row.id
  order by lead.created_at
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'ok', true,
      'lead_id', lead_row.id,
      'already_created', true
    );
  end if;

  insert into public.communication_leads (
    company_id,
    intake_request_id,
    conversation_id,
    service_request_id,
    customer_id,
    inbound_source_id,
    source_account_id,
    source_type,
    source_name,
    source_identifier,
    customer_name,
    customer_first_name,
    customer_last_name,
    customer_phone,
    customer_email,
    service_address,
    unit,
    city,
    state,
    zip_code,
    appliance_type,
    brand,
    problem_description,
    status,
    attribution,
    raw_payload,
    created_by,
    updated_by
  ) values (
    effective_company_id,
    intake_row.id,
    conversation_row.id,
    null,
    null,
    intake_row.inbound_source_id,
    intake_row.source_account_id,
    coalesce(intake_row.source_type, conversation_row.primary_source_type),
    intake_row.source_name,
    intake_row.source_identifier,
    coalesce(nullif(trim(coalesce(intake_row.customer_name, '')), ''), conversation_row.customer_display_name),
    intake_row.customer_first_name,
    intake_row.customer_last_name,
    coalesce(nullif(trim(coalesce(intake_row.customer_phone, '')), ''), conversation_row.customer_phone),
    coalesce(nullif(trim(coalesce(intake_row.customer_email, '')), ''), conversation_row.customer_email),
    coalesce(nullif(trim(coalesce(intake_row.service_address, '')), ''), conversation_row.service_address),
    intake_row.unit,
    intake_row.city,
    intake_row.state,
    intake_row.zip_code,
    intake_row.appliance_type,
    intake_row.brand,
    coalesce(nullif(trim(coalesce(intake_row.problem_description, '')), ''), conversation_row.summary),
    'open',
    coalesce(intake_row.attribution, conversation_row.attribution, '{}'::jsonb),
    coalesce(intake_row.raw_payload, '{}'::jsonb),
    auth.uid(),
    auth.uid()
  )
  returning * into lead_row;

  return jsonb_build_object(
    'ok', true,
    'lead_id', lead_row.id,
    'already_created', false
  );
end;
$$;

revoke execute on function public.create_communication_lead_rpc(uuid) from public;
grant execute on function public.create_communication_lead_rpc(uuid) to authenticated;

create or replace function public.update_intake_operational_details_rpc(
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
  allowed_keys text[] := array[
    'customer_first_name',
    'customer_last_name',
    'customer_name',
    'customer_phone',
    'customer_email',
    'service_address',
    'unit',
    'city',
    'state',
    'zip_code',
    'appliance_type',
    'brand',
    'problem_description',
    'preferred_appointment_window',
    'appointment_date',
    'window_start_time',
    'window_end_time'
  ];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not public.can_access_intake_request(p_intake_request_id) then
    raise exception 'Intake request is not accessible for this account.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) key
    where key <> all(allowed_keys)
  ) then
    raise exception 'Unsupported intake detail field.' using errcode = '22023';
  end if;

  update public.intake_requests
  set
    customer_first_name = case when p_payload ? 'customer_first_name' then nullif(trim(p_payload->>'customer_first_name'), '') else customer_first_name end,
    customer_last_name = case when p_payload ? 'customer_last_name' then nullif(trim(p_payload->>'customer_last_name'), '') else customer_last_name end,
    customer_name = case when p_payload ? 'customer_name' then nullif(trim(p_payload->>'customer_name'), '') else customer_name end,
    customer_phone = case when p_payload ? 'customer_phone' then nullif(trim(p_payload->>'customer_phone'), '') else customer_phone end,
    customer_email = case when p_payload ? 'customer_email' then nullif(lower(trim(p_payload->>'customer_email')), '') else customer_email end,
    service_address = case when p_payload ? 'service_address' then nullif(trim(p_payload->>'service_address'), '') else service_address end,
    unit = case when p_payload ? 'unit' then nullif(trim(p_payload->>'unit'), '') else unit end,
    city = case when p_payload ? 'city' then nullif(trim(p_payload->>'city'), '') else city end,
    state = case when p_payload ? 'state' then coalesce(nullif(upper(trim(p_payload->>'state')), ''), 'TX') else state end,
    zip_code = case when p_payload ? 'zip_code' then nullif(regexp_replace(p_payload->>'zip_code', '[^0-9]', '', 'g'), '') else zip_code end,
    appliance_type = case when p_payload ? 'appliance_type' then nullif(trim(p_payload->>'appliance_type'), '') else appliance_type end,
    brand = case when p_payload ? 'brand' then nullif(trim(p_payload->>'brand'), '') else brand end,
    problem_description = case when p_payload ? 'problem_description' then nullif(trim(p_payload->>'problem_description'), '') else problem_description end,
    preferred_appointment_window = case when p_payload ? 'preferred_appointment_window' then nullif(trim(p_payload->>'preferred_appointment_window'), '') else preferred_appointment_window end,
    appointment_date = case when p_payload ? 'appointment_date' and nullif(trim(p_payload->>'appointment_date'), '') is not null then (p_payload->>'appointment_date')::date when p_payload ? 'appointment_date' then null else appointment_date end,
    window_start_time = case when p_payload ? 'window_start_time' and nullif(trim(p_payload->>'window_start_time'), '') is not null then (p_payload->>'window_start_time')::time when p_payload ? 'window_start_time' then null else window_start_time end,
    window_end_time = case when p_payload ? 'window_end_time' and nullif(trim(p_payload->>'window_end_time'), '') is not null then (p_payload->>'window_end_time')::time when p_payload ? 'window_end_time' then null else window_end_time end,
    status = case when status in ('new', 'needs_info', 'reviewed') then 'reviewed' else status end,
    updated_by = auth.uid()
  where id = p_intake_request_id
  returning * into updated_row;

  if not found then
    raise exception 'Intake request not found.' using errcode = 'P0002';
  end if;

  update public.communication_leads
  set
    customer_name = updated_row.customer_name,
    customer_first_name = updated_row.customer_first_name,
    customer_last_name = updated_row.customer_last_name,
    customer_phone = updated_row.customer_phone,
    customer_email = updated_row.customer_email,
    service_address = updated_row.service_address,
    unit = updated_row.unit,
    city = updated_row.city,
    state = updated_row.state,
    zip_code = updated_row.zip_code,
    appliance_type = updated_row.appliance_type,
    brand = updated_row.brand,
    problem_description = updated_row.problem_description,
    updated_by = auth.uid()
  where intake_request_id = updated_row.id
    and status in ('open', 'reviewed');

  return jsonb_build_object(
    'ok', true,
    'intake_request_id', updated_row.id
  );
end;
$$;

revoke execute on function public.update_intake_operational_details_rpc(uuid, jsonb) from public;
grant execute on function public.update_intake_operational_details_rpc(uuid, jsonb) to authenticated;

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
  default_technician_row public.technician_profiles;
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
  trusted_website_value boolean := false;
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

    update public.communication_leads
    set
      service_request_id = coalesce(service_request_id, intake_row.linked_service_request_id),
      customer_id = coalesce(customer_id, intake_row.linked_customer_id),
      status = case when status in ('spam', 'archived') then status else 'converted' end,
      converted_at = coalesce(converted_at, intake_row.converted_at, now()),
      updated_by = auth.uid()
    where intake_request_id = p_intake_request_id
       or conversation_id in (
         select cc.id
         from public.communication_conversations cc
         where cc.intake_request_id = p_intake_request_id
       );

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
  trusted_website_value := intake_row.source_type = 'website_form'
    and intake_row.inbound_source_id is not null;

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

  if trusted_website_value then
    if nullif(trim(coalesce(intake_row.service_address, '')), '') is null then
      raise exception 'Service address is required before creating a job from this trusted website request.'
        using errcode = '22023';
    end if;

    customer_phone_value := public.normalize_customer_crm_phone(intake_row.customer_phone);

    if customer_phone_value is null then
      raise exception 'A usable customer phone number is required before creating a job from this trusted website request.'
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
  else
    select *
    into default_technician_row
    from public.technician_profiles
    where profile_id = auth.uid()
      and archived_at is null
    order by
      case
        when technician_status = 'verified' then 0
        else 1
      end,
      created_at desc
    limit 1;

    if found then
      technician_row := default_technician_row;
      intake_row.assigned_technician_id := default_technician_row.id;
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

  if trusted_website_value and effective_company_id is null then
    raise exception 'A company context is required before creating a job from this trusted website request.'
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
            trusted_website_value
            and effective_company_id is not null
            and c.company_id = effective_company_id
          )
          or (
            not trusted_website_value
            and (effective_company_id is null or c.company_id = effective_company_id or c.company_id is null)
          )
        )
    ) then
      raise exception 'Linked customer is not accessible for this intake.'
        using errcode = '42501';
    end if;
  elsif trusted_website_value then
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
          'label', case when trusted_website_value then 'Service Address' else 'Customer Primary Address' end,
          'street_address', nullif(trim(coalesce(intake_row.service_address, '')), ''),
          'unit', nullif(trim(coalesce(intake_row.unit, '')), ''),
          'city', nullif(trim(coalesce(intake_row.city, '')), ''),
          'state', coalesce(nullif(public.normalize_customer_address_match_value(intake_row.state, 'state'), ''), 'TX'),
          'zip_code', trim(intake_row.zip_code),
          'country', coalesce(nullif(trim(coalesce(intake_row.country, '')), ''), 'US'),
          'latitude', intake_row.latitude,
          'longitude', intake_row.longitude,
          'place_id', nullif(trim(coalesce(intake_row.place_id, '')), ''),
          'is_primary', case when trusted_website_value and not created_customer_value then false else true end
        ));

        customer_address_id_value := nullif(customer_address_result->>'address_id', '')::uuid;
      end if;
    exception when others then
      if trusted_website_value then
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

  update public.communication_leads
  set
    service_request_id = coalesce(service_request_id, service_request_id_value),
    customer_id = coalesce(customer_id, customer_id_value),
    status = case when status in ('spam', 'archived') then status else 'converted' end,
    converted_at = coalesce(converted_at, now()),
    updated_by = auth.uid()
  where intake_request_id = p_intake_request_id
     or conversation_id in (
       select cc.id
       from public.communication_conversations cc
       where cc.intake_request_id = p_intake_request_id
     );

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
  'COM-07H conversion update: trusted website intakes of any event type can create Jobs when required data is complete; Customer identity remains company-scoped canonical phone, email is contact info only, and Customer-scoped service address linkage is preserved.';

revoke execute on function public.convert_intake_request_rpc(uuid, boolean) from public;
grant execute on function public.convert_intake_request_rpc(uuid, boolean) to authenticated;
