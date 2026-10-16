begin;
alter table public.appointments alter column technician_profile_id drop not null;
create table public.manual_dispatch_overrides (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 service_request_id uuid not null references public.service_requests(id), appointment_id uuid not null references public.appointments(id),
 actor_id uuid not null references public.profiles(id), conflicting_appointment_ids uuid[] not null,
 operation text not null, reason text not null check(length(trim(reason)) between 1 and 500),
 before_state jsonb, after_state jsonb not null, created_at timestamptz not null default now()
);
alter table public.manual_dispatch_overrides enable row level security;
revoke all on public.manual_dispatch_overrides from public, anon, authenticated;
grant select on public.manual_dispatch_overrides to authenticated;
create policy manual_dispatch_overrides_read on public.manual_dispatch_overrides for select to authenticated
 using (public.user_can_access_company(company_id));

create or replace function public.manual_dispatch_rpc(
 p_service_request_id uuid, p_operation text,
 p_technician_profile_id uuid default null, p_appointment_date date default null,
 p_window_start_time time default null, p_window_end_time time default null,
 p_appointment_id uuid default null, p_override_conflict boolean default false,
 p_override_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.service_requests; a public.appointments; t public.technician_profiles;
 tid uuid; conflicts uuid[]; previous jsonb; created boolean:=false;
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='28000'; end if;
 if p_operation is null or p_operation not in ('schedule','assign','book') then raise exception 'Invalid dispatch operation.' using errcode='22023'; end if;
 select * into j from public.service_requests where id=p_service_request_id for update;
 if not found or j.company_id is null or not public.can_view_service_request(j.id) or not exists(
   select 1 from public.company_members m join public.profiles p on p.id=m.profile_id
   join public.companies c on c.id=m.company_id
   where m.company_id=j.company_id and m.profile_id=auth.uid() and m.member_status='active'
   and m.archived_at is null and m.member_role in ('owner','manager','dispatcher')
   and p.status='active' and c.status='active' and c.archived_at is null
 ) then raise exception 'Authorized company dispatcher required.' using errcode='42501'; end if;
 select * into a from public.appointments where service_request_id=j.id and status in ('scheduled','confirmed','en_route') for update;
 if p_appointment_id is not null and p_appointment_id is distinct from a.id then raise exception 'Appointment linkage changed. Reload the Job.' using errcode='40001'; end if;
 if a.id is not null and a.company_id is distinct from j.company_id then raise exception 'Appointment company mismatch.' using errcode='42501'; end if;
 if p_operation='book' and a.id is not null then raise exception 'Job already has an active appointment.' using errcode='23505'; end if;
 -- A SELECT with no row leaves a null-field composite, not a persisted record.
 previous:=case when a.id is null then null else to_jsonb(a) end;
 tid:=case when p_operation in ('assign','book') then p_technician_profile_id else case when a.id is not null then a.technician_profile_id else j.assigned_technician_profile_id end end;
 -- All dispatch operations lock Job first, then technician rows in stable order.
 perform id from public.technician_profiles where id in (tid,a.technician_profile_id,j.assigned_technician_profile_id) order by id for update;
 if tid is not null then
   select * into t from public.technician_profiles where id=tid;
   if not found or t.company_id is distinct from j.company_id or t.archived_at is not null or t.suspended_at is not null or t.rejected_at is not null or t.technician_status in ('suspended','rejected','archived')
     or not exists(select 1 from public.company_members m join public.profiles p on p.id=m.profile_id where m.company_id=j.company_id and m.profile_id=t.profile_id and m.member_status='active' and m.archived_at is null and m.member_role in ('owner','manager','dispatcher','technician') and p.status='active')
   then raise exception 'Technician is not active in this company.' using errcode='42501'; end if;
 end if;
 if p_operation in ('schedule','book') then
   if p_appointment_date is null or p_window_start_time is null or p_window_end_time is null or p_window_start_time>=p_window_end_time then raise exception 'Valid same-day appointment window required.' using errcode='22023'; end if;
   a.appointment_date:=p_appointment_date; a.window_start_time:=p_window_start_time; a.window_end_time:=p_window_end_time;
 end if;
 if tid is not null and a.appointment_date is not null then
   select array_agg(id order by id) into conflicts from public.appointments
   where technician_profile_id=tid and service_request_id<>j.id and appointment_date=a.appointment_date
   and status in ('scheduled','confirmed','en_route') and window_start_time<a.window_end_time and window_end_time>a.window_start_time;
   if cardinality(conflicts)>0 then
     if not coalesce(p_override_conflict,false) then return jsonb_build_object('conflict',true,'message','Technician has overlapping appointments. Confirm a manual override.'); end if;
     if nullif(trim(p_override_reason),'') is null or length(p_override_reason)>500 then raise exception 'Override reason required (1–500 characters).' using errcode='22023'; end if;
   end if;
 end if;
 if a.id is null and p_operation<>'assign' then
   insert into public.appointments(company_id,service_request_id,technician_profile_id,appointment_date,window_start_time,window_end_time,status,source,created_by)
   values(j.company_id,j.id,tid,a.appointment_date,a.window_start_time,a.window_end_time,'scheduled','manual',auth.uid()) returning * into a;
   created:=true;
 elsif a.id is not null then
   update public.appointments set technician_profile_id=tid,appointment_date=a.appointment_date,window_start_time=a.window_start_time,window_end_time=a.window_end_time,updated_at=now() where id=a.id returning * into a;
 end if;
 update public.service_requests set assigned_technician_profile_id=tid,
 selected_technician_slug=case when p_operation in ('assign','book') then null else selected_technician_slug end,
 selected_technician_business_name=case when p_operation in ('assign','book') then coalesce(t.business_name,t.display_name) else selected_technician_business_name end,
 appointment_id=case when a.id is not null then a.id else appointment_id end,
 scheduled_date=case when a.id is not null then a.appointment_date else scheduled_date end,
 scheduled_window_start_time=case when a.id is not null then a.window_start_time else scheduled_window_start_time end,
 scheduled_window_end_time=case when a.id is not null then a.window_end_time else scheduled_window_end_time end,
 status=case when created then 'scheduled' else status end,updated_at=now() where id=j.id;
 if cardinality(conflicts)>0 then
   insert into public.manual_dispatch_overrides(company_id,service_request_id,appointment_id,actor_id,conflicting_appointment_ids,operation,reason,before_state,after_state)
   values(j.company_id,j.id,a.id,auth.uid(),conflicts,p_operation,trim(p_override_reason),previous,to_jsonb(a));
 end if;
 return jsonb_build_object('operation',case when p_operation='assign' then 'assigned' when created then 'created' else 'updated' end,'appointment',case when a.id is null then null else to_jsonb(a) end,
 'technician',case when tid is null then null else jsonb_build_object('id',tid,'displayName',coalesce(t.display_name,t.business_name),'businessName',t.business_name,'avatarColor',t.avatar_color) end);
end; $$;
revoke all on function public.manual_dispatch_rpc(uuid,text,uuid,date,time,time,uuid,boolean,text) from public,anon;
grant execute on function public.manual_dispatch_rpc(uuid,text,uuid,date,time,time,uuid,boolean,text) to authenticated;

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
  manual_result jsonb;
  available_rule_count integer := 0;
  has_matching_available_rule boolean := false;
  has_blocking_unavailable_rule boolean := false;
  default_business_start time := time '08:00:00';
  default_business_end time := time '17:00:00';
  is_same_company_member_dispatch boolean := false;
begin
  if p_source='manual' then
    manual_result:=public.manual_dispatch_rpc(p_service_request_id,'book',p_technician_profile_id,p_appointment_date,p_window_start_time,p_window_end_time);
    if coalesce((manual_result->>'conflict')::boolean,false) then raise exception 'Technician appointment conflict; create with Schedule Later and use manual dispatch override.' using errcode='23P01'; end if;
    return manual_result->'appointment';
  end if;
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

  is_same_company_member_dispatch :=
    (
      request_row.company_id is not null
      and exists (
        select 1
        from public.company_members membership
        where membership.company_id = request_row.company_id
          and membership.profile_id = technician_row.profile_id
          and membership.member_status = 'active'
          and membership.archived_at is null
          and membership.removed_at is null
          and membership.suspended_at is null
      )
    )
    or (
      technician_row.affiliation_type = 'company_member'
      and technician_row.company_id is not null
      and request_row.company_id = technician_row.company_id
    );

  if not is_same_company_member_dispatch
     and not (
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
     and intake_row.window_end_time is not null then
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

create or replace function public.save_conversation_job_rpc(
  p_conversation_id uuid,
  p_fields jsonb default '{}'::jsonb,
  p_allow_possible_duplicate boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c public.communication_conversations;
  r public.intake_requests;
  edited public.intake_requests;
  l public.communication_leads;
  request_id uuid;
  customer_id_value uuid;
  job_id uuid;
  result jsonb;
  patch jsonb := p_fields;
  mode text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  select * into c from public.communication_conversations where id = p_conversation_id for update;
  if not found then raise exception 'Conversation not found.' using errcode = 'P0002'; end if;
  if not public.can_access_communication_conversation(c.id)
     or c.company_id is null or not public.user_can_access_company(c.company_id) then
    raise exception 'Conversation is not accessible.' using errcode = '42501';
  end if;
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'Wizard fields must be an object.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(patch) e where e.key <> all(array['linked_customer_id','customer_first_name','customer_last_name','customer_name','customer_phone','customer_email','service_address','unit','city','state','zip_code','appliance_type','brand','model_number','serial_number','problem_description','appointment_date','window_start_time','window_end_time','assigned_technician_id','schedule_mode'])
     or jsonb_typeof(e.value) not in ('string','null') or length(e.value #>> '{}') > 2000) then
    raise exception 'Invalid Wizard fields.' using errcode = '22023';
  end if;
  -- Retry after successful navigation failure returns the canonical Job, without edits.
  if c.service_request_id is not null then
    if not exists(select 1 from public.service_requests where id=c.service_request_id and company_id=c.company_id) then
      raise exception 'Linked Job is not accessible.' using errcode='42501';
    end if;
    return jsonb_build_object('service_request_id',c.service_request_id,'intake_request_id',c.intake_request_id,'already_converted',true);
  end if;
  -- Lock an existing source before ensure: phone/Retell ensure may edit its windows.
  -- Keep Conversation -> source -> Lead ordering; never run ensure on converted sources.
  request_id := c.intake_request_id;
  if request_id is not null then
    select * into r from public.intake_requests where id=request_id for update;
    if not found or r.company_id is distinct from c.company_id or not public.can_access_intake_request(request_id) then
      raise exception 'Source request is not accessible.' using errcode='42501';
    end if;
    if r.linked_service_request_id is null and r.status in ('converted','archived','dismissed') then
      raise exception 'Source request is read-only.' using errcode='22023';
    end if;
  end if;
  if r.linked_service_request_id is null then
    request_id := (public.ensure_communication_job_intake_rpc(c.id)->>'intake_request_id')::uuid;
  end if;
  select * into r from public.intake_requests where id=request_id for update;
  if not found or r.company_id is distinct from c.company_id or not public.can_access_intake_request(request_id) then
    raise exception 'Source request is not accessible.' using errcode='42501';
  end if;
  if exists(select 1 from public.communication_conversations where intake_request_id=request_id and id<>c.id) then
    raise exception 'Source request belongs to another Conversation.' using errcode='22023';
  end if;
  if (select count(*) from public.communication_leads where conversation_id=c.id or intake_request_id=request_id) > 1 then
    raise exception 'Multiple Lead associations need review.' using errcode='22023';
  end if;
  select * into l from public.communication_leads where conversation_id=c.id or intake_request_id=request_id for update;
  if found and (l.company_id is distinct from c.company_id or (l.conversation_id is not null and l.conversation_id<>c.id) or (l.intake_request_id is not null and l.intake_request_id<>request_id)) then
    raise exception 'Lead association conflicts with Conversation.' using errcode='42501';
  end if;
  if r.linked_service_request_id is not null and (
    (c.customer_id is not null and c.customer_id is distinct from r.linked_customer_id)
    or (l.customer_id is not null and l.customer_id is distinct from r.linked_customer_id)
    or (l.service_request_id is not null and l.service_request_id is distinct from r.linked_service_request_id)
  ) then raise exception 'Existing Job linkage needs review.' using errcode='22023'; end if;
  if r.linked_service_request_id is not null then
    if not exists(select 1 from public.service_requests where id=r.linked_service_request_id and company_id=c.company_id
                  and customer_id is not distinct from r.linked_customer_id)
       or (r.linked_customer_id is not null and not exists(select 1 from public.customers where id=r.linked_customer_id and company_id=c.company_id)) then
      raise exception 'Linked Job or Customer is not accessible.' using errcode='42501';
    end if;
    -- Pure recovery: no ensure, conversion, source update or linkage reconciliation.
    -- Avoid firing synchronization triggers on any already-converted record.
    return jsonb_build_object('service_request_id',r.linked_service_request_id,'intake_request_id',request_id,'appointment_id',r.linked_appointment_id,'already_converted',true);
  else
    if r.status in ('converted','archived','dismissed') then
      raise exception 'Source request is read-only.' using errcode='22023';
    end if;
    if l.service_request_id is not null then
      raise exception 'Lead already has a Job; association needs review.' using errcode='22023';
    end if;
    customer_id_value := coalesce(c.customer_id,r.linked_customer_id,l.customer_id);
    if (c.customer_id is not null and c.customer_id is distinct from customer_id_value)
       or (r.linked_customer_id is not null and r.linked_customer_id is distinct from customer_id_value)
       or (l.customer_id is not null and l.customer_id is distinct from customer_id_value)
       or (patch ? 'linked_customer_id' and customer_id_value is not null and (patch->>'linked_customer_id')::uuid is distinct from customer_id_value) then
      raise exception 'Cannot switch the canonical Customer.' using errcode='22023';
    end if;
    if customer_id_value is null then customer_id_value := (patch->>'linked_customer_id')::uuid; end if;
    if customer_id_value is not null and not exists(select 1 from public.customers where id=customer_id_value and company_id=c.company_id) then
      raise exception 'Customer is not accessible.' using errcode='42501';
    end if;
    patch := patch || jsonb_build_object('linked_customer_id',customer_id_value);
    mode := patch->>'schedule_mode';
    if patch ? 'schedule_mode' and (mode is null or mode not in ('now','later')) then
      raise exception 'Choose Schedule Now or Later.' using errcode='22023';
    end if;
    if mode='later' then
      patch := patch || '{"appointment_date":null,"window_start_time":null,"window_end_time":null,"assigned_technician_id":null}'::jsonb;
    end if;
    edited := jsonb_populate_record(r,patch - 'schedule_mode');
    if (mode='now' or edited.appointment_date is not null or edited.window_start_time is not null or edited.window_end_time is not null)
       and (edited.appointment_date is null or edited.window_start_time is null or edited.window_end_time is null) then
      raise exception 'Schedule Now requires date and start/end time.' using errcode='22023';
    end if;
    if edited.window_start_time >= edited.window_end_time then
      raise exception 'Appointment end time must be after start time.' using errcode='22023';
    end if;
    if edited.assigned_technician_id is not null and not exists(
      select 1 from public.technician_profiles where id=edited.assigned_technician_id and company_id=c.company_id and archived_at is null
    ) then raise exception 'Technician is not accessible.' using errcode='42501'; end if;
    -- Existing conversion validates required fields and booking availability.
    update public.intake_requests set linked_customer_id=edited.linked_customer_id,
      customer_first_name=edited.customer_first_name,
      customer_last_name=edited.customer_last_name,
      customer_name=edited.customer_name,
      customer_phone=edited.customer_phone,
      customer_email=edited.customer_email,
      service_address=edited.service_address,
      unit=edited.unit,
      city=edited.city,
      state=edited.state,
      zip_code=edited.zip_code,
      appliance_type=edited.appliance_type,
      brand=edited.brand,
      model_number=edited.model_number,
      serial_number=edited.serial_number,
      problem_description=edited.problem_description,
      appointment_date=edited.appointment_date,
      window_start_time=edited.window_start_time,
      window_end_time=edited.window_end_time,
      assigned_technician_id=edited.assigned_technician_id, updated_by=auth.uid() where id=request_id;
    result := public.convert_intake_request_rpc(request_id,p_allow_possible_duplicate);
  end if;
  job_id := (result->>'service_request_id')::uuid;
  select * into r from public.intake_requests where id=request_id;
  if job_id is null or not exists(select 1 from public.service_requests where id=job_id and company_id=c.company_id)
     or (r.linked_customer_id is not null and not exists(select 1 from public.customers where id=r.linked_customer_id and company_id=c.company_id)) then
    raise exception 'Conversion returned invalid company linkage.' using errcode='42501';
  end if;
  update public.communication_conversations set service_request_id=job_id,customer_id=r.linked_customer_id where id=c.id;
  if l.id is not null then
    update public.communication_leads set service_request_id=job_id,customer_id=r.linked_customer_id,status='converted',updated_by=auth.uid() where id=l.id;
  end if;
  return result;
end;
$$;

commit;
