-- Task 168.5: Technician manual estimate approval.
--
-- Forward-only, apply-ready.
-- Purpose:
--   Allow an authenticated dashboard technician/dispatcher to record verbal or
--   face-to-face estimate approval without pretending the customer clicked the
--   public approval link.

alter table public.service_request_estimates
  add column if not exists approval_source text not null default 'customer';

alter table public.service_request_estimates
  add column if not exists approved_by_profile_id uuid
    references public.profiles(id)
    on delete set null;

alter table public.service_request_estimates
  drop constraint if exists service_request_estimates_approval_source_check;

alter table public.service_request_estimates
  add constraint service_request_estimates_approval_source_check
  check (approval_source in ('customer', 'technician_manual'));

comment on column public.service_request_estimates.approval_source is
  'Records whether approval came from the customer public flow or was manually recorded by a technician on behalf of the customer.';

comment on column public.service_request_estimates.approved_by_profile_id is
  'Dashboard profile that manually recorded approval when approval_source=technician_manual.';

create index if not exists service_request_estimates_approved_by_profile_idx
  on public.service_request_estimates (approved_by_profile_id)
  where approved_by_profile_id is not null;

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
  next_estimate_status text;
  next_request_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate was not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status not in ('draft', 'sent', 'approved') then
    raise exception 'Only draft, sent, or approved estimates can be sent to customers.'
      using errcode = '42501';
  end if;

  raw_token := replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  hashed_token := public.estimate_approval_token_hash(raw_token);
  next_estimate_status := case
    when estimate_row.estimate_status = 'approved' then 'approved'
    else 'sent'
  end;
  next_request_status := case
    when estimate_row.estimate_status = 'approved' then 'estimate_approved'
    else 'estimate_sent'
  end;

  update public.service_request_estimates
  set
    estimate_status = next_estimate_status,
    public_approval_token_hash = hashed_token,
    sent_at = now(),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set
    status = next_request_status,
    updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    estimate_row.service_request_id,
    auth.uid(),
    'estimate',
    case
      when next_estimate_status = 'approved'
        then 'Approved estimate ' || estimate_row.estimate_number ||
          ' was sent to the customer for records.'
      else 'Estimate ' || estimate_row.estimate_number ||
        ' was sent to the customer for approval.'
    end
  );

  if next_request_status = 'estimate_sent' then
    insert into public.service_request_notes (
      service_request_id,
      created_by_profile_id,
      note_type,
      body
    )
    values (
      estimate_row.service_request_id,
      auth.uid(),
      'status_change',
      'Job status automatically changed to Estimate Sent after estimate ' ||
        estimate_row.estimate_number || ' was sent.'
    );
  end if;

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'sent_at', estimate_row.sent_at,
    'service_request_status', next_request_status,
    'approval_token', raw_token
  );
end;
$$;

comment on function public.send_service_request_estimate_to_customer_rpc(uuid) is
  'Task 168.5. Authenticated send/resend action for draft, sent, or already-approved estimates.';

create or replace function public.approve_service_request_estimate_for_customer_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if p_estimate_id is null then
    raise exception 'Estimate id is required.'
      using errcode = '22023';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id
  limit 1;

  if not found then
    raise exception 'Estimate was not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status = 'declined' then
    raise exception 'Declined estimates cannot be manually approved.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status = 'void' then
    raise exception 'Voided estimates cannot be manually approved.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status <> 'approved' then
    update public.service_request_estimates
    set
      estimate_status = 'approved',
      approval_source = 'technician_manual',
      approved_by_profile_id = auth.uid(),
      customer_responded_at = coalesce(customer_responded_at, now()),
      updated_at = now()
    where id = estimate_row.id
    returning * into estimate_row;

    update public.service_requests
    set
      status = 'estimate_approved',
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
        'Estimate ' || estimate_row.estimate_number ||
          ' approved by technician on behalf of customer.'
      ),
      (
        estimate_row.service_request_id,
        auth.uid(),
        'status_change',
        'Job status automatically changed to Estimate Approved after technician recorded customer approval.'
      );
  end if;

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'service_request_status', 'estimate_approved',
    'customer_responded_at', estimate_row.customer_responded_at,
    'approval_source', estimate_row.approval_source,
    'approved_by_profile_id', estimate_row.approved_by_profile_id
  );
end;
$$;

comment on function public.approve_service_request_estimate_for_customer_rpc(uuid) is
  'Task 168.5. Authenticated manual approval path for technicians recording customer approval without using the public customer token flow.';

revoke all on function public.approve_service_request_estimate_for_customer_rpc(uuid) from public;
revoke all on function public.send_service_request_estimate_to_customer_rpc(uuid) from public;
grant execute on function public.approve_service_request_estimate_for_customer_rpc(uuid) to authenticated;
grant execute on function public.send_service_request_estimate_to_customer_rpc(uuid) to authenticated;
