-- ESTIMATE-LIFECYCLE-03.12: Undo Approval compatibility for customer-approved revisions.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Repair undo_service_request_estimate_approval_rpc after ESTIMATE-LIFECYCLE-03
--   customer revision approval links were introduced.
--
-- Safety:
--   - Does not modify records when applied.
--   - Preserves all Payment, Allocation and Invoice dependency blockers.
--   - Revokes customer approval links before returning an eligible Estimate to Draft.
--   - Preserves customer decision history in immutable revision rows and lifecycle events.
--   - Does not change Job operational status.

create or replace function public.undo_service_request_estimate_approval_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  updated_estimate public.service_request_estimates;
  revoked_revision_count integer := 0;
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
  for update;

  if not found then
    raise exception 'Estimate was not found.'
      using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 216));

  if not public.can_record_service_request_payment(estimate_row.service_request_id) then
    raise exception 'This account is not allowed to edit that estimate.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status = 'draft' then
    return jsonb_build_object(
      'id', estimate_row.id,
      'estimate_number', estimate_row.estimate_number,
      'estimate_status', estimate_row.estimate_status,
      'service_request_id', estimate_row.service_request_id,
      'changed', false
    );
  end if;

  if estimate_row.estimate_status <> 'approved' then
    raise exception 'Only approved estimates can have approval undone.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_payment_allocations allocation
    where allocation.estimate_id = estimate_row.id
       or allocation.carried_from_estimate_id = estimate_row.id
  ) then
    raise exception 'Approval cannot be undone because this estimate has payment history.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoices invoice
    where invoice.estimate_id = estimate_row.id
  ) then
    raise exception 'Approval cannot be undone because this estimate is linked to an invoice.'
      using errcode = '42501';
  end if;

  if to_regclass('public.service_request_invoice_estimates') is not null
    and exists (
      select 1
      from public.service_request_invoice_estimates membership
      where membership.estimate_id = estimate_row.id
    ) then
    raise exception 'Approval cannot be undone because this estimate is linked to an invoice.'
      using errcode = '42501';
  end if;

  if to_regclass('public.service_request_estimate_revisions') is not null then
    update public.service_request_estimate_revisions
    set
      revision_status = case
        when revision_status in ('sent', 'approved') then 'revoked'
        else revision_status
      end,
      token_revoked_at = coalesce(token_revoked_at, now()),
      customer_decision_metadata = customer_decision_metadata || jsonb_build_object(
        'approval_undone_at', now(),
        'approval_undone_by_profile_id', auth.uid(),
        'approval_undo_preserves_customer_decision', true
      ),
      updated_at = now()
    where estimate_id = estimate_row.id
      and token_revoked_at is null
      and (
        revision_status in ('sent', 'approved')
        or customer_decision = 'approved'
      );

    get diagnostics revoked_revision_count = row_count;
  end if;

  insert into public.service_request_estimate_lifecycle_events (
    company_id,
    service_request_id,
    estimate_id,
    event_type,
    from_status,
    to_status,
    created_by_profile_id,
    event_metadata
  )
  select
    sr.company_id,
    estimate_row.service_request_id,
    estimate_row.id,
    'undo_approval',
    estimate_row.estimate_status,
    'draft',
    auth.uid(),
    jsonb_build_object(
      'previous_approval_source', estimate_row.approval_source,
      'previous_approved_by_profile_id', estimate_row.approved_by_profile_id,
      'previous_customer_responded_at', estimate_row.customer_responded_at,
      'previous_sent_at', estimate_row.sent_at,
      'revoked_revision_count', revoked_revision_count,
      'preserves_approval_history', true
    )
  from public.service_requests sr
  where sr.id = estimate_row.service_request_id;

  update public.service_request_estimates
  set
    estimate_status = 'draft',
    approval_source = 'customer',
    approved_by_profile_id = null,
    customer_responded_at = null,
    public_approval_token_hash = null,
    updated_at = now()
  where id = estimate_row.id
  returning * into updated_estimate;

  return jsonb_build_object(
    'id', updated_estimate.id,
    'estimate_number', updated_estimate.estimate_number,
    'estimate_status', updated_estimate.estimate_status,
    'service_request_id', updated_estimate.service_request_id,
    'approval_source', updated_estimate.approval_source,
    'approved_by_profile_id', updated_estimate.approved_by_profile_id,
    'customer_responded_at', updated_estimate.customer_responded_at,
    'revoked_revision_count', revoked_revision_count,
    'changed', true
  );
end;
$$;

comment on function public.undo_service_request_estimate_approval_rpc(uuid) is
  'ESTIMATE-LIFECYCLE-03.12. Returns an approved Estimate to Draft only when no Payment, Allocation, or Invoice dependency exists. Revokes current customer revision links, preserves prior approval details in lifecycle audit events, and does not change Job status.';

revoke all on function public.undo_service_request_estimate_approval_rpc(uuid) from public;
grant execute on function public.undo_service_request_estimate_approval_rpc(uuid) to authenticated;
