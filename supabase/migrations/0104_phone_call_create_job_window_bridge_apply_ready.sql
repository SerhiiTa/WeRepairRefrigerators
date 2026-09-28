-- COMM-09A Production follow-up: phone call Create Job bridge.
--
-- Purpose:
-- - Preserve the existing Communications -> technical Intake -> convert_intake_request_rpc
--   Job conversion engine.
-- - Prevent Retell/phone call request details from being treated as a scheduled
--   appointment during Communications Create Job.
--
-- Root cause:
-- - Retell call ingestion can populate appointment_date/window_start_time/
--   window_end_time on the technical intake.
-- - convert_intake_request_rpc correctly requires an assigned technician when
--   an intake has a full appointment window.
-- - For inbound calls, that window is a requested/preferred customer window,
--   not a dispatcher-confirmed appointment.
--
-- Safety:
-- - Forward-only.
-- - Does not modify convert_intake_request_rpc.
-- - Does not change website booking conversion.
-- - Does not delete Intake data. It clears only exact window_start_time and
--   window_end_time on phone/Retell technical intakes immediately before
--   Communications Create Job conversion; appointment_date and
--   preferred_appointment_window remain available as request details.

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
    where id = conversation_row.intake_request_id
    for update;

    if found then
      if intake_row.source_type in ('phone', 'retell_ai')
         and (intake_row.window_start_time is not null or intake_row.window_end_time is not null) then
        update public.intake_requests
        set
          window_start_time = null,
          window_end_time = null,
          updated_by = auth.uid()
        where id = intake_row.id
        returning * into intake_row;
      end if;

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
  'COMM-09A follow-up: creates or reuses the internal technical intake_request needed for Communications Create Job, and treats phone/Retell call windows as preferred request details rather than scheduled appointment slots.';

revoke execute on function public.ensure_communication_job_intake_rpc(uuid) from public;
grant execute on function public.ensure_communication_job_intake_rpc(uuid) to authenticated;
