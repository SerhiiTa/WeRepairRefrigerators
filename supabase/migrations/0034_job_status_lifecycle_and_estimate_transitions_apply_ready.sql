-- Task 132: Appliance repair job status lifecycle and estimate auto-transitions.
--
-- DEV/STAGING APPLY-READY.
-- Apply manually in Supabase SQL Editor after the estimate approval migrations
-- through 0027 and notes/status migrations through 0020 are already present.
--
-- Purpose:
--   - Expand service_requests.status for realistic appliance repair workflow.
--   - Keep status updates behind the existing narrow authenticated RPC.
--   - Automatically move job status when estimates are sent/responded to.
--   - Add timeline/status notes for manual and estimate-driven transitions.
--
-- Safety:
--   - No broad browser UPDATE grant is added.
--   - No RLS policy is weakened.
--   - Existing legacy/dev statuses are retained so older rows do not block.
--   - Estimate approval token hashing still uses the Task 101/0027 helper.

alter table public.service_requests
  drop constraint if exists service_requests_status_check;

alter table public.service_requests
  add constraint service_requests_status_check
  check (status in (
    'new',
    'contacted',
    'scheduled',
    'diagnosed',
    'estimate_sent',
    'estimate_approved',
    'parts_needed',
    'parts_ordered',
    'parts_received',
    'return_visit_scheduled',
    'completed',
    'closed',
    'waiting_customer',
    'canceled',
    -- Legacy/dev values retained for already-created rows.
    'estimate_declined',
    'reviewed',
    'lead_created',
    'archived',
    'spam'
  ));

create or replace function public.update_service_request_status_rpc(
  p_request_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_request public.service_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if p_next_status not in (
    'new',
    'contacted',
    'scheduled',
    'diagnosed',
    'estimate_sent',
    'estimate_approved',
    'parts_needed',
    'parts_ordered',
    'parts_received',
    'return_visit_scheduled',
    'completed',
    'closed',
    'waiting_customer',
    'canceled'
  ) then
    raise exception 'Invalid service request status.'
      using errcode = '22023';
  end if;

  if not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  update public.service_requests
  set
    status = p_next_status,
    updated_at = now()
  where id = p_request_id
  returning * into updated_request;

  if not found then
    raise exception 'Service request was not found.'
      using errcode = 'P0002';
  end if;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    updated_request.id,
    auth.uid(),
    'status_change',
    'Job status changed to ' ||
      initcap(replace(updated_request.status, '_', ' ')) || '.'
  );

  return jsonb_build_object(
    'id', updated_request.id,
    'status', updated_request.status,
    'updated_at', updated_request.updated_at
  );
end;
$$;

comment on function public.update_service_request_status_rpc(uuid, text) is
  'Task 132 RPC. Updates service_requests.status to the appliance repair lifecycle after checking authenticated dashboard visibility.';

create or replace function public.send_service_request_estimate_to_customer_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  raw_token text;
  hashed_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  if estimate_row.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be sent to customers.' using errcode = '42501';
  end if;

  raw_token := replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  hashed_token := public.estimate_approval_token_hash(raw_token);

  update public.service_request_estimates
  set
    estimate_status = 'sent',
    public_approval_token_hash = hashed_token,
    sent_at = now(),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set
    status = 'estimate_sent',
    updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values
    (
      estimate_row.service_request_id,
      auth.uid(),
      'estimate',
      'Estimate ' || estimate_row.estimate_number || ' was sent to the customer for approval.'
    ),
    (
      estimate_row.service_request_id,
      auth.uid(),
      'status_change',
      'Job status automatically changed to Estimate Sent after estimate ' ||
        estimate_row.estimate_number || ' was sent.'
    );

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'sent_at', estimate_row.sent_at,
    'service_request_status', 'estimate_sent',
    'approval_token', raw_token
  );
end;
$$;

comment on function public.send_service_request_estimate_to_customer_rpc(uuid) is
  'Task 132. Authenticated draft-only send action that moves the job to Estimate Sent while preserving Task 101/0027 token security.';

create or replace function public.respond_to_public_estimate_rpc(
  p_token text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text;
  estimate_row public.service_request_estimates;
  next_estimate_status text;
  next_request_status text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid estimate token.' using errcode = '22023';
  end if;

  if p_response is null or p_response not in ('approved', 'declined') then
    raise exception 'Invalid estimate response.' using errcode = '22023';
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);
  next_estimate_status := p_response;
  next_request_status := case
    when p_response = 'approved' then 'estimate_approved'
    else 'waiting_customer'
  end;

  select *
  into estimate_row
  from public.service_request_estimates
  where public_approval_token_hash = token_hash
  limit 1;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if estimate_row.estimate_status <> 'sent' then
    raise exception 'Only sent estimates can receive a customer response.' using errcode = '42501';
  end if;

  update public.service_request_estimates
  set
    estimate_status = next_estimate_status,
    customer_responded_at = now(),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set status = next_request_status, updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values
    (
      estimate_row.service_request_id,
      null,
      'estimate',
      'Customer ' || p_response || ' estimate ' || estimate_row.estimate_number || '.'
    ),
    (
      estimate_row.service_request_id,
      null,
      'status_change',
      case
        when p_response = 'approved'
          then 'Job status automatically changed to Estimate Approved after customer approval.'
        else 'Job status automatically changed to Waiting Customer after customer declined the estimate.'
      end
    );

  return jsonb_build_object(
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'service_request_status', next_request_status,
    'customer_responded_at', estimate_row.customer_responded_at
  );
end;
$$;

comment on function public.respond_to_public_estimate_rpc(text, text) is
  'Task 132. Public token-specific customer approve/decline mutation that moves the job to Estimate Approved or Waiting Customer.';

revoke all on function public.update_service_request_status_rpc(uuid, text) from public;
revoke all on function public.send_service_request_estimate_to_customer_rpc(uuid) from public;
revoke all on function public.respond_to_public_estimate_rpc(text, text) from public;

grant execute on function public.update_service_request_status_rpc(uuid, text) to authenticated;
grant execute on function public.send_service_request_estimate_to_customer_rpc(uuid) to authenticated;
grant execute on function public.respond_to_public_estimate_rpc(text, text) to anon, authenticated;
