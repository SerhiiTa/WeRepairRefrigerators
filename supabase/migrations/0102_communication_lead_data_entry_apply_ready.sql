-- COM-07H.3: Communication Lead data entry and conversation-owned lead fixes.
--
-- Keeps Communication Leads valid without Intake, prevents unknown phone labels
-- from being persisted as customer names, and lets Lead edits sync any linked
-- technical Intake without making Intake user-facing.

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
  conversation_display_name_value text;
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

  conversation_display_name_value := nullif(trim(coalesce(conversation_row.customer_display_name, '')), '');

  if conversation_display_name_value is not null
     and public.normalize_customer_crm_phone(conversation_display_name_value)
       is not distinct from public.normalize_customer_crm_phone(conversation_row.customer_phone) then
    conversation_display_name_value := null;
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
    coalesce(nullif(trim(coalesce(intake_row.customer_name, '')), ''), conversation_display_name_value),
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

create or replace function public.update_communication_lead_operational_details_rpc(
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.communication_leads;
  updated_lead_row public.communication_leads;
  updated_intake_row public.intake_requests;
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
    'preferred_appointment_window'
  ];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into lead_row
  from public.communication_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if not public.can_access_communication_lead(p_lead_id) then
    raise exception 'Lead is not accessible for this account.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) key
    where key <> all(allowed_keys)
  ) then
    raise exception 'Unsupported lead detail field.' using errcode = '22023';
  end if;

  update public.communication_leads
  set
    customer_first_name = case when p_payload ? 'customer_first_name' then nullif(trim(p_payload->>'customer_first_name'), '') else customer_first_name end,
    customer_last_name = case when p_payload ? 'customer_last_name' then nullif(trim(p_payload->>'customer_last_name'), '') else customer_last_name end,
    customer_name = case when p_payload ? 'customer_name' then nullif(trim(p_payload->>'customer_name'), '') else customer_name end,
    customer_phone = case when p_payload ? 'customer_phone' then nullif(trim(p_payload->>'customer_phone'), '') else customer_phone end,
    customer_email = case when p_payload ? 'customer_email' then nullif(lower(trim(p_payload->>'customer_email')), '') else customer_email end,
    service_address = case when p_payload ? 'service_address' then nullif(trim(p_payload->>'service_address'), '') else service_address end,
    unit = case when p_payload ? 'unit' then nullif(trim(p_payload->>'unit'), '') else unit end,
    city = case when p_payload ? 'city' then nullif(trim(p_payload->>'city'), '') else city end,
    state = case when p_payload ? 'state' then nullif(upper(trim(p_payload->>'state')), '') else state end,
    zip_code = case when p_payload ? 'zip_code' then nullif(regexp_replace(p_payload->>'zip_code', '[^0-9]', '', 'g'), '') else zip_code end,
    appliance_type = case when p_payload ? 'appliance_type' then nullif(trim(p_payload->>'appliance_type'), '') else appliance_type end,
    brand = case when p_payload ? 'brand' then nullif(trim(p_payload->>'brand'), '') else brand end,
    problem_description = case when p_payload ? 'problem_description' then nullif(trim(p_payload->>'problem_description'), '') else problem_description end,
    updated_by = auth.uid()
  where id = p_lead_id
  returning * into updated_lead_row;

  if updated_lead_row.intake_request_id is not null then
    update public.intake_requests
    set
      customer_first_name = updated_lead_row.customer_first_name,
      customer_last_name = updated_lead_row.customer_last_name,
      customer_name = updated_lead_row.customer_name,
      customer_phone = updated_lead_row.customer_phone,
      customer_email = updated_lead_row.customer_email,
      service_address = updated_lead_row.service_address,
      unit = updated_lead_row.unit,
      city = updated_lead_row.city,
      state = coalesce(updated_lead_row.state, state),
      zip_code = updated_lead_row.zip_code,
      appliance_type = updated_lead_row.appliance_type,
      brand = updated_lead_row.brand,
      problem_description = updated_lead_row.problem_description,
      preferred_appointment_window = case when p_payload ? 'preferred_appointment_window' then nullif(trim(p_payload->>'preferred_appointment_window'), '') else preferred_appointment_window end,
      status = case when status in ('new', 'needs_info', 'reviewed') then 'reviewed' else status end,
      updated_by = auth.uid()
    where id = updated_lead_row.intake_request_id
    returning * into updated_intake_row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead_id', updated_lead_row.id,
    'intake_request_id', updated_lead_row.intake_request_id
  );
end;
$$;

revoke execute on function public.update_communication_lead_operational_details_rpc(uuid, jsonb) from public;
grant execute on function public.update_communication_lead_operational_details_rpc(uuid, jsonb) to authenticated;

create or replace function public.ensure_communication_job_intake_rpc(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.communication_conversations;
  lead_row public.communication_leads;
  intake_row public.intake_requests;
  effective_company_id uuid;
  source_type_value text;
  raw_payload_value jsonb;
  lead_customer_name_value text;
  conversation_display_name_value text;
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
    select *
    into intake_row
    from public.intake_requests
    where id = conversation_row.intake_request_id;

    if found then
      return jsonb_build_object(
        'ok', true,
        'intake_request_id', intake_row.id,
        'already_exists', true
      );
    end if;
  end if;

  select *
  into lead_row
  from public.communication_leads lead
  where lead.conversation_id = conversation_row.id
  order by lead.created_at
  limit 1
  for update;

  effective_company_id := coalesce(conversation_row.company_id, lead_row.company_id);

  if effective_company_id is null or not public.user_can_access_company(effective_company_id) then
    raise exception 'A company context is required before creating a Job.'
      using errcode = '42501';
  end if;

  source_type_value := case conversation_row.primary_source_type
    when 'phone' then 'phone'
    when 'sms' then 'sms'
    when 'website_form' then 'website_form'
    when 'email' then 'email'
    else 'other'
  end;

  lead_customer_name_value := nullif(
    trim(
      concat_ws(
        ' ',
        nullif(trim(coalesce(lead_row.customer_first_name, '')), ''),
        nullif(trim(coalesce(lead_row.customer_last_name, '')), '')
      )
    ),
    ''
  );

  if lead_customer_name_value is null then
    lead_customer_name_value := nullif(trim(coalesce(lead_row.customer_name, '')), '');
  end if;

  if lead_customer_name_value is null then
    conversation_display_name_value := nullif(trim(coalesce(conversation_row.customer_display_name, '')), '');

    if conversation_display_name_value is not null
       and public.normalize_customer_crm_phone(conversation_display_name_value)
         is not distinct from public.normalize_customer_crm_phone(conversation_row.customer_phone) then
      conversation_display_name_value := null;
    end if;

    lead_customer_name_value := conversation_display_name_value;
  end if;

  raw_payload_value := jsonb_build_object(
    'source', 'communications_create_job',
    'conversation_id', conversation_row.id,
    'lead_id', lead_row.id
  );

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
    unit,
    city,
    state,
    zip_code,
    appliance_type,
    brand,
    problem_description,
    preferred_appointment_window,
    raw_message,
    raw_payload,
    extracted_data,
    duplicate_candidate,
    status,
    linked_customer_id,
    inbound_source_id,
    source_account_id,
    attribution,
    created_by,
    updated_by
  ) values (
    effective_company_id,
    auth.uid(),
    source_type_value,
    coalesce(lead_row.source_name, conversation_row.provider_name, 'Communications'),
    coalesce(lead_row.source_identifier, conversation_row.customer_phone),
    lead_row.customer_first_name,
    lead_row.customer_last_name,
    lead_customer_name_value,
    coalesce(nullif(trim(coalesce(lead_row.customer_phone, '')), ''), conversation_row.customer_phone),
    coalesce(nullif(trim(coalesce(lead_row.customer_email, '')), ''), conversation_row.customer_email),
    coalesce(nullif(trim(coalesce(lead_row.service_address, '')), ''), conversation_row.service_address),
    lead_row.unit,
    lead_row.city,
    coalesce(nullif(trim(coalesce(lead_row.state, '')), ''), 'TX'),
    lead_row.zip_code,
    lead_row.appliance_type,
    lead_row.brand,
    coalesce(nullif(trim(coalesce(lead_row.problem_description, '')), ''), conversation_row.summary),
    null,
    conversation_row.summary,
    raw_payload_value,
    jsonb_build_object(
      'source', 'communications_create_job',
      'conversation_id', conversation_row.id,
      'lead_id', lead_row.id
    ),
    '{}'::jsonb,
    'new',
    coalesce(conversation_row.customer_id, lead_row.customer_id),
    coalesce(conversation_row.inbound_source_id, lead_row.inbound_source_id),
    coalesce(conversation_row.source_account_id, lead_row.source_account_id),
    coalesce(lead_row.attribution, conversation_row.attribution, '{}'::jsonb),
    auth.uid(),
    auth.uid()
  )
  returning * into intake_row;

  update public.communication_conversations
  set
    intake_request_id = intake_row.id,
    updated_by = auth.uid()
  where id = conversation_row.id
    and intake_request_id is null;

  update public.communication_leads
  set
    intake_request_id = coalesce(intake_request_id, intake_row.id),
    updated_by = auth.uid()
  where id = lead_row.id
    and intake_request_id is null;

  return jsonb_build_object(
    'ok', true,
    'intake_request_id', intake_row.id,
    'already_exists', false
  );
end;
$$;

comment on function public.ensure_communication_job_intake_rpc(uuid) is
  'Creates or reuses the internal technical intake_request needed for Communications Create Job, using Lead data as the editable source of truth.';

revoke execute on function public.ensure_communication_job_intake_rpc(uuid) from public;
grant execute on function public.ensure_communication_job_intake_rpc(uuid) to authenticated;
