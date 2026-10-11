-- FINANCE-V2-28: Repair Job Invoice sync authorization.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Allow authorized internal company staff with existing Finance write access
--   to synchronize the Job Invoice from current approved Estimate scope. Invoice
--   synchronization is a financial document write and must not use read-only Job
--   visibility authorization.
--
-- Safety:
--   - Does not weaken manual payment, Stripe checkout, webhook, or ledger rules.
--   - Does not modify payments or allocations.
--   - Preserves the one-current-Job-Invoice synchronization behavior from 0131.

create or replace function public.sync_job_invoice_from_approved_estimates_rpc(
  p_service_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  scope jsonb;
  approved_total numeric(10, 2) := 0;
  approved_subtotal numeric(10, 2) := 0;
  approved_tax numeric(10, 2) := 0;
  current_invoice public.service_request_invoices;
  target_invoice public.service_request_invoices;
  primary_estimate_id uuid;
  primary_logical_estimate_id uuid;
  next_invoice_version integer := 1;
  current_invoice_count integer := 0;
  paid_credit numeric(10, 2) := 0;
  replaced_invoice_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if p_service_request_id is null then
    raise exception 'Job is required.' using errcode = '22023';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if not public.can_record_service_request_payment(request_row.id) then
    raise exception 'Job is not accessible for this account.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 127));

  scope := public.get_service_request_effective_approved_scope_rpc(request_row.id);
  approved_total := round(coalesce((scope ->> 'approved_total')::numeric, 0), 2);
  approved_subtotal := round(coalesce((scope ->> 'approved_subtotal')::numeric, 0), 2);
  approved_tax := round(coalesce((scope ->> 'tax')::numeric, 0), 2);

  if approved_total <= 0 then
    return jsonb_build_object(
      'status', 'no_approved_scope',
      'service_request_id', request_row.id,
      'approved_total', approved_total,
      'invoice_sync_required', true
    );
  end if;

  select (jsonb_array_elements_text(scope -> 'approved_estimate_ids'))::uuid
  into primary_estimate_id
  limit 1;

  select coalesce(estimate.logical_estimate_id, estimate.id)
  into primary_logical_estimate_id
  from public.service_request_estimates estimate
  where estimate.id = primary_estimate_id;

  if primary_estimate_id is null then
    raise exception 'Approved scope has no source Estimate.' using errcode = '23514';
  end if;

  select count(*)
  into current_invoice_count
  from public.service_request_invoices invoice
  where invoice.service_request_id = request_row.id
    and invoice.invoice_status <> 'void'
    and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current';

  select *
  into current_invoice
  from public.service_request_invoices invoice
  where invoice.service_request_id = request_row.id
    and invoice.invoice_status = 'draft'
    and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
  order by invoice.updated_at desc, invoice.created_at desc, invoice.id desc
  limit 1
  for update;

  if found then
    target_invoice := current_invoice;
  else
    if exists (
      select 1
      from public.service_request_payment_checkout_attempts attempt
      join public.service_request_invoices invoice
        on invoice.id = attempt.invoice_id
      where invoice.service_request_id = request_row.id
        and invoice.invoice_status <> 'void'
        and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
        and attempt.checkout_status in ('initiated', 'processing')
        and attempt.reserved_until > now()
    ) then
      raise exception 'Active checkout must finish or expire before updating the Job Invoice.'
        using errcode = '23514';
    end if;

    select coalesce(max(invoice.invoice_version), 0) + 1
    into next_invoice_version
    from public.service_request_invoices invoice
    where invoice.service_request_id = request_row.id;

    insert into public.service_request_invoices (
      service_request_id,
      estimate_id,
      logical_estimate_id,
      invoice_version,
      invoice_lifecycle_status,
      created_by_profile_id,
      invoice_number,
      subtotal,
      tax,
      total,
      invoice_status
    )
    values (
      request_row.id,
      primary_estimate_id,
      primary_logical_estimate_id,
      next_invoice_version,
      'current',
      auth.uid(),
      'INV-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
      approved_subtotal,
      approved_tax,
      approved_total,
      'draft'
    )
    returning * into target_invoice;
  end if;

  select coalesce(array_agg(invoice.id), array[]::uuid[])
  into replaced_invoice_ids
  from public.service_request_invoices invoice
  where invoice.service_request_id = request_row.id
    and invoice.id <> target_invoice.id
    and invoice.invoice_status <> 'void'
    and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current';

  update public.service_request_invoices invoice
  set
    invoice_lifecycle_status = 'superseded',
    replaced_by_invoice_id = target_invoice.id,
    replaced_at = coalesce(invoice.replaced_at, now()),
    updated_at = now()
  where invoice.id = any(replaced_invoice_ids);

  update public.service_request_invoice_estimates membership
  set
    membership_status = 'void',
    voided_at = coalesce(membership.voided_at, now()),
    updated_at = now(),
    membership_metadata = coalesce(membership.membership_metadata, '{}'::jsonb) ||
      jsonb_build_object('voided_by_job_invoice_sync', true, 'replacement_invoice_id', target_invoice.id)
  where membership.service_request_id = request_row.id
    and membership.membership_status = 'active'
    and membership.invoice_id <> target_invoice.id;

  update public.service_request_invoices
  set
    estimate_id = primary_estimate_id,
    logical_estimate_id = primary_logical_estimate_id,
    subtotal = approved_subtotal,
    tax = approved_tax,
    total = approved_total,
    updated_at = now()
  where id = target_invoice.id
  returning * into target_invoice;

  delete from public.service_request_invoice_items
  where invoice_id = target_invoice.id;

  update public.service_request_invoice_estimates membership
  set
    membership_status = 'void',
    voided_at = coalesce(membership.voided_at, now()),
    updated_at = now(),
    membership_metadata = coalesce(membership.membership_metadata, '{}'::jsonb) ||
      jsonb_build_object('refreshed_by_job_invoice_sync', true)
  where membership.invoice_id = target_invoice.id
    and membership.membership_status = 'active';

  insert into public.service_request_invoice_items (
    invoice_id,
    source_estimate_item_id,
    source_logical_estimate_id,
    source_approved_estimate_id,
    item_title,
    quantity,
    unit_price,
    line_total,
    notes,
    item_metadata
  )
  select
    target_invoice.id,
    (item.value ->> 'source_estimate_item_id')::uuid,
    (item.value ->> 'source_logical_estimate_id')::uuid,
    (item.value ->> 'source_approved_estimate_id')::uuid,
    item.value ->> 'item_title',
    (item.value ->> 'quantity')::integer,
    (item.value ->> 'unit_price')::numeric,
    (item.value ->> 'line_total')::numeric,
    nullif(item.value ->> 'notes', ''),
    jsonb_build_object('finance_v2_job_invoice_sync', true)
  from jsonb_array_elements(scope -> 'items') as item(value);

  insert into public.service_request_invoice_estimates (
    company_id,
    service_request_id,
    invoice_id,
    estimate_id,
    membership_status,
    source_type,
    included_by_profile_id,
    included_at,
    membership_metadata
  )
  select
    request_row.company_id,
    request_row.id,
    target_invoice.id,
    estimate.id,
    'active',
    'consolidated_conversion',
    auth.uid(),
    now(),
    jsonb_build_object(
      'logical_estimate_id', coalesce(estimate.logical_estimate_id, estimate.id),
      'estimate_revision_number', estimate.revision_number,
      'finance_v2_job_invoice_sync', true
    )
  from public.service_request_estimates estimate
  where estimate.id in (
    select (jsonb_array_elements_text(scope -> 'approved_estimate_ids'))::uuid
  );

  paid_credit := public.active_service_request_paid_credit(request_row.id);

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    request_row.id,
    auth.uid(),
    'estimate',
    'Job Invoice ' || target_invoice.invoice_number ||
      ' was synchronized from current approved Estimate scope. Existing payments remain credited.'
  );

  return jsonb_build_object(
    'status', 'synced',
    'id', target_invoice.id,
    'invoice_id', target_invoice.id,
    'invoice_number', target_invoice.invoice_number,
    'service_request_id', target_invoice.service_request_id,
    'invoice_status', target_invoice.invoice_status,
    'invoice_lifecycle_status', target_invoice.invoice_lifecycle_status,
    'subtotal', target_invoice.subtotal,
    'tax', target_invoice.tax,
    'total', target_invoice.total,
    'approved_total', approved_total,
    'allocated_paid', paid_credit,
    'balance_due', greatest(approved_total - paid_credit, 0),
    'overpayment', greatest(paid_credit - approved_total, 0),
    'replaced_invoice_ids', to_jsonb(replaced_invoice_ids),
    'contributing_approved_estimate_ids', scope -> 'approved_estimate_ids',
    'line_count', jsonb_array_length(scope -> 'items'),
    'current_invoice_count_before_sync', current_invoice_count
  );
end;
$$;

revoke all on function public.sync_job_invoice_from_approved_estimates_rpc(uuid) from public;
grant execute on function public.sync_job_invoice_from_approved_estimates_rpc(uuid) to authenticated;

comment on function public.sync_job_invoice_from_approved_estimates_rpc(uuid) is
  'FINANCE-V2-28. Synchronizes the single current Job Invoice from current approved Estimate scope using the existing internal Finance write authorization predicate.';
