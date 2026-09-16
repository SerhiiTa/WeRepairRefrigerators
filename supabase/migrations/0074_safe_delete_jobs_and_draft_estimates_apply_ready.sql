-- Task: Safe hard delete for draft estimates and disposable jobs.
-- Scope: add guarded RPCs only. No schema changes.

create or replace function public.delete_draft_service_request_estimate_rpc(
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

  if estimate_row.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be deleted.'
      using errcode = '42501';
  end if;

  if estimate_row.sent_at is not null
    or estimate_row.customer_responded_at is not null
    or estimate_row.public_approval_token_hash is not null
    or estimate_row.approved_by_profile_id is not null then
    raise exception 'This estimate already contains customer or approval history.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoices invoice
    where invoice.estimate_id = estimate_row.id
  ) then
    raise exception 'This estimate already has an invoice.'
      using errcode = '42501';
  end if;

  if to_regclass('public.communication_conversations') is not null
    and exists (
      select 1
      from public.communication_conversations conversation
      where conversation.estimate_id = estimate_row.id
    ) then
    raise exception 'This estimate already contains customer communication history.'
      using errcode = '42501';
  end if;

  if to_regclass('public.communication_timeline_events') is not null
    and exists (
      select 1
      from public.communication_timeline_events event
      where event.estimate_id = estimate_row.id
    ) then
    raise exception 'This estimate already contains customer timeline history.'
      using errcode = '42501';
  end if;

  delete from public.service_request_estimates
  where id = estimate_row.id;

  return jsonb_build_object(
    'id', estimate_row.id,
    'service_request_id', estimate_row.service_request_id,
    'deleted', true
  );
end;
$$;

comment on function public.delete_draft_service_request_estimate_rpc(uuid) is
  'Hard-deletes only disposable draft service request estimates. Non-draft estimates and estimates with customer/financial history are rejected server-side.';

revoke all on function public.delete_draft_service_request_estimate_rpc(uuid) from public;
grant execute on function public.delete_draft_service_request_estimate_rpc(uuid) to authenticated;

create or replace function public.delete_safe_service_request_rpc(
  p_service_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id;

  if not found then
    raise exception 'Job was not found.'
      using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(request_row.id) then
    raise exception 'Job is not accessible for this account.'
      using errcode = '42501';
  end if;

  if request_row.company_id is not null
    and not public.user_can_access_company(request_row.company_id) then
    raise exception 'Job is not accessible for this company.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_estimates estimate
    where estimate.service_request_id = request_row.id
      and (
        estimate.estimate_status <> 'draft'
        or estimate.sent_at is not null
        or estimate.customer_responded_at is not null
        or estimate.public_approval_token_hash is not null
        or estimate.approved_by_profile_id is not null
      )
  ) then
    raise exception 'This job cannot be deleted because it already contains financial or customer history.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoices invoice
    where invoice.service_request_id = request_row.id
  ) then
    raise exception 'This job cannot be deleted because it already contains financial or customer history.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.appointments appointment
    where appointment.service_request_id = request_row.id
  ) then
    raise exception 'This job cannot be deleted because it already contains financial or customer history.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_notes note
    where note.service_request_id = request_row.id
  ) then
    raise exception 'This job cannot be deleted because it already contains financial or customer history.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_photos photo
    where photo.service_request_id = request_row.id
  ) then
    raise exception 'This job cannot be deleted because it already contains financial or customer history.'
      using errcode = '42501';
  end if;

  if to_regclass('public.communication_conversations') is not null
    and exists (
      select 1
      from public.communication_conversations conversation
      where conversation.service_request_id = request_row.id
    ) then
    raise exception 'This job cannot be deleted because it already contains financial or customer history.'
      using errcode = '42501';
  end if;

  if to_regclass('public.communication_timeline_events') is not null
    and exists (
      select 1
      from public.communication_timeline_events event
      where event.service_request_id = request_row.id
    ) then
    raise exception 'This job cannot be deleted because it already contains financial or customer history.'
      using errcode = '42501';
  end if;

  delete from public.service_requests
  where id = request_row.id;

  return jsonb_build_object(
    'id', request_row.id,
    'customer_id', request_row.customer_id,
    'deleted', true
  );
end;
$$;

comment on function public.delete_safe_service_request_rpc(uuid) is
  'Hard-deletes only disposable jobs. Jobs with invoices, non-draft estimates, appointments, notes, photos, or customer communication/timeline history are rejected server-side.';

revoke all on function public.delete_safe_service_request_rpc(uuid) from public;
grant execute on function public.delete_safe_service_request_rpc(uuid) to authenticated;
