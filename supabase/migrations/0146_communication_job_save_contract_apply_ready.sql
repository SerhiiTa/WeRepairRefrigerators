-- Atomic reviewed Wizard save + existing canonical conversion. No new Job model.
begin;
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
       and (edited.appointment_date is null or edited.window_start_time is null or edited.window_end_time is null or edited.assigned_technician_id is null) then
      raise exception 'Schedule Now requires date, start/end time and technician.' using errcode='22023';
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
revoke all on function public.save_conversation_job_rpc(uuid,jsonb,boolean) from public, anon;
grant execute on function public.save_conversation_job_rpc(uuid,jsonb,boolean) to authenticated;
commit;
