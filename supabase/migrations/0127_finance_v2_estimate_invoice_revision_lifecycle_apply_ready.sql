-- FINANCE-V2-01: Estimate / Invoice revision lifecycle.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Allow one logical Estimate to progress through immutable approved
--   revisions, replacement Invoices, and additional-balance collection without
--   rewriting historical Estimate, Invoice, Payment, or Allocation records.
--
-- Safety:
--   - Does not drop or truncate existing business data.
--   - Does not create a second Payment Ledger.
--   - Preserves original payment and allocation document references.
--   - Replaces V1 RPC behavior forward-only.
--   - Uses same-Job advisory locks for revision and invoice lifecycle changes.

create extension if not exists pgcrypto with schema extensions;

alter table public.service_request_estimates
  add column if not exists logical_estimate_id uuid
    references public.service_request_estimates(id)
    on delete set null,
  add column if not exists revision_number integer,
  add column if not exists revision_status text not null default 'current',
  add column if not exists superseded_by_estimate_id uuid
    references public.service_request_estimates(id)
    on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists approved_revision_total numeric(10, 2),
  add column if not exists approved_revision_at timestamptz,
  add column if not exists approval_method text;

alter table public.service_request_estimates
  drop constraint if exists service_request_estimates_revision_number_check,
  add constraint service_request_estimates_revision_number_check
    check (revision_number is null or revision_number > 0),
  drop constraint if exists service_request_estimates_revision_status_check,
  add constraint service_request_estimates_revision_status_check
    check (revision_status in ('draft', 'current', 'superseded', 'declined', 'void')),
  drop constraint if exists service_request_estimates_approval_method_check,
  add constraint service_request_estimates_approval_method_check
    check (approval_method is null or approval_method in ('customer', 'technician_manual', 'phone', 'in_person'));

update public.service_request_estimates estimate
set
  logical_estimate_id = coalesce(estimate.logical_estimate_id, estimate.id),
  revision_number = coalesce(estimate.revision_number, 1),
  revision_status = case
    when estimate.estimate_status = 'draft' then 'draft'
    when estimate.estimate_status = 'declined' then 'declined'
    when estimate.estimate_status = 'void' then 'void'
    else 'current'
  end,
  approved_revision_total = case
    when estimate.estimate_status = 'approved' then coalesce(estimate.approved_revision_total, estimate.total)
    else estimate.approved_revision_total
  end,
  approved_revision_at = case
    when estimate.estimate_status = 'approved' then coalesce(estimate.approved_revision_at, estimate.customer_responded_at, estimate.updated_at)
    else estimate.approved_revision_at
  end,
  approval_method = case
    when estimate.estimate_status = 'approved' then coalesce(estimate.approval_method, estimate.approval_source)
    else estimate.approval_method
  end
where estimate.logical_estimate_id is null
   or estimate.revision_number is null
   or estimate.revision_status is distinct from case
      when estimate.estimate_status = 'draft' then 'draft'
      when estimate.estimate_status = 'declined' then 'declined'
      when estimate.estimate_status = 'void' then 'void'
      else estimate.revision_status
    end;

alter table public.service_request_estimates
  alter column logical_estimate_id set not null,
  alter column revision_number set not null;

create index if not exists service_request_estimates_logical_revision_idx
  on public.service_request_estimates (service_request_id, logical_estimate_id, revision_number desc);

drop index if exists public.service_request_estimates_estimate_number_idx;

create index if not exists service_request_estimates_estimate_number_idx
  on public.service_request_estimates (estimate_number);

create unique index if not exists service_request_estimates_logical_revision_uidx
  on public.service_request_estimates (logical_estimate_id, revision_number);

create unique index if not exists service_request_estimates_logical_current_uidx
  on public.service_request_estimates (logical_estimate_id)
  where revision_status = 'current'
    and estimate_status in ('approved', 'sent', 'draft');

create index if not exists service_request_estimates_superseded_by_idx
  on public.service_request_estimates (superseded_by_estimate_id)
  where superseded_by_estimate_id is not null;

alter table public.service_request_estimate_lifecycle_events
  drop constraint if exists service_request_estimate_lifecycle_events_type_check,
  add constraint service_request_estimate_lifecycle_events_type_check
    check (event_type in (
      'manual_approval',
      'customer_approval',
      'undo_approval',
      'draft_delete',
      'invoice_inclusion',
      'void',
      'refund_reallocation',
      'system_backfill',
      'revision_created',
      'revision_superseded'
    ));

alter table public.service_request_invoices
  add column if not exists logical_estimate_id uuid
    references public.service_request_estimates(id)
    on delete set null,
  add column if not exists invoice_version integer,
  add column if not exists invoice_lifecycle_status text not null default 'current',
  add column if not exists replaces_invoice_id uuid
    references public.service_request_invoices(id)
    on delete set null,
  add column if not exists replaced_by_invoice_id uuid
    references public.service_request_invoices(id)
    on delete set null,
  add column if not exists replaced_at timestamptz;

alter table public.service_request_invoices
  drop constraint if exists service_request_invoices_invoice_version_check,
  add constraint service_request_invoices_invoice_version_check
    check (invoice_version is null or invoice_version > 0),
  drop constraint if exists service_request_invoices_lifecycle_status_check,
  add constraint service_request_invoices_lifecycle_status_check
    check (invoice_lifecycle_status in ('current', 'superseded', 'void'));

update public.service_request_invoices invoice
set
  logical_estimate_id = coalesce(invoice.logical_estimate_id, estimate.logical_estimate_id, invoice.estimate_id),
  invoice_version = coalesce(invoice.invoice_version, 1),
  invoice_lifecycle_status = case
    when invoice.invoice_status = 'void' then 'void'
    else coalesce(invoice.invoice_lifecycle_status, 'current')
  end
from public.service_request_estimates estimate
where estimate.id = invoice.estimate_id
  and (
    invoice.logical_estimate_id is null
    or invoice.invoice_version is null
    or (invoice.invoice_status = 'void' and invoice.invoice_lifecycle_status <> 'void')
  );

create index if not exists service_request_invoices_logical_estimate_idx
  on public.service_request_invoices (service_request_id, logical_estimate_id, invoice_version desc)
  where logical_estimate_id is not null;

create unique index if not exists service_request_invoices_logical_version_uidx
  on public.service_request_invoices (logical_estimate_id, invoice_version)
  where logical_estimate_id is not null;

create unique index if not exists service_request_invoices_logical_current_uidx
  on public.service_request_invoices (logical_estimate_id)
  where logical_estimate_id is not null
    and invoice_lifecycle_status = 'current'
    and invoice_status <> 'void';

create or replace function public.active_service_request_paid_credit(
  p_service_request_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(allocation.allocation_amount), 0)::numeric(10, 2)
  from public.service_request_payment_allocations allocation
  join public.service_request_payments payment
    on payment.id = allocation.payment_id
  where allocation.service_request_id = p_service_request_id
    and allocation.allocation_status = 'active'
    and payment.service_request_id = p_service_request_id
    and payment.payment_status in ('paid', 'succeeded', 'imported', 'partially_refunded')
    and payment.voided_at is null
    and coalesce((payment.payment_metadata ->> 'stripe_refund_status'), '') not in ('refunded', 'disputed');
$$;

create or replace function public.get_service_request_finance_v2_summary_rpc(
  p_service_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  current_estimate public.service_request_estimates;
  current_invoice public.service_request_invoices;
  invoice_source_estimate public.service_request_estimates;
  approved_total numeric(10, 2) := 0;
  paid_credit numeric(10, 2) := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(request_row.id) then
    raise exception 'Job is not accessible for this account.' using errcode = '42501';
  end if;

  select *
  into current_invoice
  from public.service_request_invoices invoice
  where invoice.service_request_id = request_row.id
    and invoice.invoice_status <> 'void'
    and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
  order by invoice.created_at desc, invoice.id desc
  limit 1;

  select *
  into current_estimate
  from public.service_request_estimates estimate
  where estimate.service_request_id = request_row.id
    and estimate.estimate_status = 'approved'
    and estimate.archived_at is null
    and coalesce(estimate.revision_status, 'current') = 'current'
  order by estimate.revision_number desc, estimate.created_at desc, estimate.id desc
  limit 1;

  if current_invoice.id is not null and current_invoice.estimate_id is not null then
    select *
    into invoice_source_estimate
    from public.service_request_estimates
    where id = current_invoice.estimate_id;
  end if;

  approved_total := case
    when current_estimate.id is not null
      and (
        current_invoice.id is null
        or (
          coalesce(current_invoice.logical_estimate_id, current_invoice.estimate_id) =
            coalesce(current_estimate.logical_estimate_id, current_estimate.id)
          and current_invoice.estimate_id is distinct from current_estimate.id
          and coalesce(current_estimate.revision_number, 0) >
            coalesce(invoice_source_estimate.revision_number, 0)
        )
      )
      then current_estimate.total
    else coalesce(current_invoice.total, current_estimate.total, 0)
  end;
  paid_credit := public.active_service_request_paid_credit(request_row.id);

  return jsonb_build_object(
    'service_request_id', request_row.id,
    'current_estimate_id', current_estimate.id,
    'current_invoice_id', current_invoice.id,
    'approved_total', approved_total,
    'paid_credit', paid_credit,
    'balance_due', greatest(approved_total - paid_credit, 0),
    'financial_state', case
      when approved_total <= 0 then 'not_ready'
      when paid_credit <= 0 then 'unpaid'
      when paid_credit >= approved_total then 'paid'
      else 'partially_paid'
    end
  );
end;
$$;

create or replace function public.revise_service_request_estimate_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  logical_root_id uuid;
  draft_row public.service_request_estimates;
  next_revision_number integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_record_service_request_payment(estimate_row.service_request_id) then
    raise exception 'This account is not allowed to revise that estimate.'
      using errcode = '42501';
  end if;

  if estimate_row.estimate_status not in ('approved', 'sent', 'declined') then
    raise exception 'Only approved, sent, or declined estimates can be revised.'
      using errcode = '42501';
  end if;

  logical_root_id := coalesce(estimate_row.logical_estimate_id, estimate_row.id);
  perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 127));

  select *
  into draft_row
  from public.service_request_estimates draft
  where draft.logical_estimate_id = logical_root_id
    and draft.estimate_status = 'draft'
    and draft.revision_status = 'draft'
  order by draft.revision_number desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id', draft_row.id,
      'estimate_number', draft_row.estimate_number,
      'estimate_status', draft_row.estimate_status,
      'logical_estimate_id', draft_row.logical_estimate_id,
      'revision_number', draft_row.revision_number,
      'revision_status', draft_row.revision_status,
      'reused_existing_draft', true
    );
  end if;

  select coalesce(max(revision_number), 0) + 1
  into next_revision_number
  from public.service_request_estimates
  where logical_estimate_id = logical_root_id;

  insert into public.service_request_estimates (
    service_request_id,
    created_by_profile_id,
    estimate_type,
    parent_estimate_id,
    customer_appliance_id,
    logical_estimate_id,
    revision_number,
    revision_status,
    subtotal,
    discount_type,
    discount_value,
    discount_amount,
    tax_rate,
    taxable_amount,
    non_taxable_amount,
    tax,
    total,
    internal_cost_total,
    gross_profit,
    margin_percent,
    estimate_status,
    estimate_number,
    customer_preview_notes,
    warranty_text,
    disclaimer_text,
    approval_source,
    source_system,
    import_metadata
  )
  values (
    estimate_row.service_request_id,
    auth.uid(),
    estimate_row.estimate_type,
    estimate_row.id,
    estimate_row.customer_appliance_id,
    logical_root_id,
    next_revision_number,
    'draft',
    estimate_row.subtotal,
    estimate_row.discount_type,
    estimate_row.discount_value,
    estimate_row.discount_amount,
    estimate_row.tax_rate,
    estimate_row.taxable_amount,
    estimate_row.non_taxable_amount,
    estimate_row.tax,
    estimate_row.total,
    estimate_row.internal_cost_total,
    estimate_row.gross_profit,
    estimate_row.margin_percent,
    'draft',
    estimate_row.estimate_number,
    estimate_row.customer_preview_notes,
    estimate_row.warranty_text,
    estimate_row.disclaimer_text,
    'customer',
    'native',
    jsonb_build_object('finance_v2_cloned_from_estimate_id', estimate_row.id)
  )
  returning * into draft_row;

  insert into public.service_request_estimate_items (
    estimate_id,
    pricing_catalog_item_id,
    item_title,
    quantity,
    unit_price,
    line_total,
    technician_cost,
    taxable,
    warranty_text,
    line_type,
    internal_name,
    customer_name,
    public_description,
    internal_cost,
    sell_price,
    service_catalog_repair_item_id,
    estimate_template_line_id,
    notes
  )
  select
    draft_row.id,
    item.pricing_catalog_item_id,
    item.item_title,
    item.quantity,
    item.unit_price,
    item.line_total,
    item.technician_cost,
    item.taxable,
    item.warranty_text,
    item.line_type,
    item.internal_name,
    item.customer_name,
    item.public_description,
    item.internal_cost,
    item.sell_price,
    item.service_catalog_repair_item_id,
    item.estimate_template_line_id,
    item.notes
  from public.service_request_estimate_items item
  where item.estimate_id = estimate_row.id
  order by item.created_at asc;

  update public.service_request_estimate_revisions revision
  set
    revision_status = case when revision_status = 'sent' then 'revoked' else revision_status end,
    token_revoked_at = coalesce(token_revoked_at, now()),
    updated_at = now()
  where revision.estimate_id = estimate_row.id
    and revision.token_revoked_at is null
    and revision.customer_decision is null;

  insert into public.service_request_estimate_lifecycle_events (
    estimate_id,
    event_type,
    from_status,
    to_status,
    created_by_profile_id,
    event_metadata
  )
  values (
    draft_row.id,
    'revision_created',
    estimate_row.estimate_status,
    'draft',
    auth.uid(),
    jsonb_build_object(
      'logical_estimate_id', logical_root_id,
      'source_estimate_id', estimate_row.id,
      'revision_number', next_revision_number,
      'source_revision_number', estimate_row.revision_number
    )
  );

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
    'Estimate ' || estimate_row.estimate_number ||
      ' revision ' || next_revision_number ||
      ' was created for additional work. Previous approvals and payments remain preserved.'
  );

  return jsonb_build_object(
    'id', draft_row.id,
    'estimate_number', draft_row.estimate_number,
    'estimate_status', draft_row.estimate_status,
    'logical_estimate_id', draft_row.logical_estimate_id,
    'revision_number', draft_row.revision_number,
    'revision_status', draft_row.revision_status,
    'source_estimate_id', estimate_row.id
  );
end;
$$;

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
  logical_root_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if p_estimate_id is null then
    raise exception 'Estimate id is required.' using errcode = '22023';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_record_service_request_payment(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  if estimate_row.estimate_status in ('declined', 'void') then
    raise exception 'Declined or voided estimates cannot be manually approved.'
      using errcode = '42501';
  end if;

  logical_root_id := coalesce(estimate_row.logical_estimate_id, estimate_row.id);
  perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 127));

  update public.service_request_estimates prior
  set
    revision_status = 'superseded',
    superseded_by_estimate_id = estimate_row.id,
    superseded_at = coalesce(prior.superseded_at, now()),
    updated_at = now()
  where prior.logical_estimate_id = logical_root_id
    and prior.id <> estimate_row.id
    and prior.revision_status = 'current'
    and prior.estimate_status = 'approved';

  update public.service_request_estimates
  set
    estimate_status = 'approved',
    revision_status = 'current',
    approval_source = 'technician_manual',
    approval_method = 'technician_manual',
    approved_by_profile_id = auth.uid(),
    customer_responded_at = coalesce(customer_responded_at, now()),
    approved_revision_at = coalesce(approved_revision_at, now()),
    approved_revision_total = total,
    public_approval_token_hash = null,
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set
    status = 'estimate_approved',
    updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.service_request_estimate_lifecycle_events (
    estimate_id,
    event_type,
    from_status,
    to_status,
    created_by_profile_id,
    event_metadata
  )
  values (
    estimate_row.id,
    'manual_approval',
    'draft',
    'approved',
    auth.uid(),
    jsonb_build_object(
      'approval_method', 'technician_manual',
      'approved_revision', estimate_row.revision_number,
      'approved_total', estimate_row.total,
      'logical_estimate_id', logical_root_id
    )
  );

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
    'Estimate ' || estimate_row.estimate_number ||
      ' revision ' || estimate_row.revision_number ||
      ' approved by technician on behalf of customer for ' ||
      to_char(estimate_row.total, 'FM$999,999,990.00') || '.'
  );

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'service_request_status', 'estimate_approved',
    'customer_responded_at', estimate_row.customer_responded_at,
    'approval_source', estimate_row.approval_source,
    'approved_by_profile_id', estimate_row.approved_by_profile_id,
    'logical_estimate_id', estimate_row.logical_estimate_id,
    'revision_number', estimate_row.revision_number,
    'revision_status', estimate_row.revision_status,
    'approved_total', estimate_row.total
  );
end;
$$;

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
  revision_row public.service_request_estimate_revisions;
  estimate_row public.service_request_estimates;
  request_row public.service_requests;
  next_request_status text;
  logical_root_id uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Estimate link is invalid.' using errcode = '22023';
  end if;

  if p_response not in ('approved', 'declined') then
    raise exception 'Choose approve or decline.' using errcode = '22023';
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into revision_row
  from public.service_request_estimate_revisions
  where public_approval_token_hash = token_hash
  for update;

  if not found then
    raise exception 'Estimate link was not found.' using errcode = 'P0002';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = revision_row.estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = revision_row.service_request_id;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if revision_row.token_revoked_at is not null then
    raise exception 'This estimate has been updated. Ask the technician for the newest estimate link.'
      using errcode = '42501';
  end if;

  if revision_row.token_expires_at <= now() then
    update public.service_request_estimate_revisions
    set revision_status = 'expired', updated_at = now()
    where id = revision_row.id;

    raise exception 'This estimate link has expired. Ask the technician for a new estimate link.'
      using errcode = '42501';
  end if;

  if revision_row.customer_decision is not null then
    return jsonb_build_object(
      'id', estimate_row.id,
      'estimate_number', estimate_row.estimate_number,
      'estimate_status', revision_row.customer_decision,
      'revision_id', revision_row.id,
      'revision_number', revision_row.revision_number,
      'customer_responded_at', revision_row.customer_decision_at,
      'idempotent', true
    );
  end if;

  if estimate_row.estimate_status <> 'sent' then
    raise exception 'Only the current sent estimate revision can receive a customer response.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoices invoice
    where invoice.estimate_id = estimate_row.id
      and invoice.invoice_status <> 'void'
  ) then
    raise exception 'This estimate is already linked to an invoice.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoice_estimates membership
    where membership.estimate_id = estimate_row.id
      and membership.membership_status = 'active'
  ) then
    raise exception 'This estimate is already linked to an invoice.'
      using errcode = '42501';
  end if;

  logical_root_id := coalesce(estimate_row.logical_estimate_id, estimate_row.id);
  perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 127));

  next_request_status := case
    when p_response = 'approved' then 'estimate_approved'
    else 'estimate_declined'
  end;

  update public.service_request_estimate_revisions
  set
    revision_status = p_response,
    customer_decision = p_response,
    customer_decision_at = now(),
    customer_decision_channel = 'public_link',
    customer_decision_metadata = jsonb_build_object(
      'decision_source', 'customer_public_link',
      'token_hash', token_hash,
      'logical_estimate_id', logical_root_id,
      'approved_total', case when p_response = 'approved' then estimate_row.total else null end
    ),
    updated_at = now()
  where id = revision_row.id
  returning * into revision_row;

  if p_response = 'approved' then
    update public.service_request_estimates prior
    set
      revision_status = 'superseded',
      superseded_by_estimate_id = estimate_row.id,
      superseded_at = coalesce(prior.superseded_at, now()),
      updated_at = now()
    where prior.logical_estimate_id = logical_root_id
      and prior.id <> estimate_row.id
      and prior.revision_status = 'current'
      and prior.estimate_status = 'approved';
  end if;

  update public.service_request_estimates
  set
    estimate_status = p_response,
    revision_status = case when p_response = 'approved' then 'current' else 'declined' end,
    customer_responded_at = revision_row.customer_decision_at,
    approval_source = case when p_response = 'approved' then 'customer' else approval_source end,
    approval_method = case when p_response = 'approved' then 'customer' else approval_method end,
    approved_revision_at = case when p_response = 'approved' then revision_row.customer_decision_at else approved_revision_at end,
    approved_revision_total = case when p_response = 'approved' then total else approved_revision_total end,
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set status = next_request_status, updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.service_request_estimate_lifecycle_events (
    estimate_id,
    event_type,
    from_status,
    to_status,
    created_by_profile_id,
    event_metadata
  )
  values (
    estimate_row.id,
    case when p_response = 'approved' then 'customer_approval' else 'revision_superseded' end,
    'sent',
    p_response,
    null,
    jsonb_build_object(
      'approval_method', 'customer_public_link',
      'approved_revision', estimate_row.revision_number,
      'approved_total', case when p_response = 'approved' then estimate_row.total else null end,
      'logical_estimate_id', logical_root_id,
      'revision_snapshot_id', revision_row.id
    )
  );

  insert into public.communication_timeline_events (
    conversation_id,
    event_type,
    title,
    body,
    event_time,
    service_request_id,
    estimate_id
  )
  select
    conversation.id,
    case when p_response = 'approved' then 'estimate_approved' else 'estimate_declined' end,
    case when p_response = 'approved' then 'Estimate approved' else 'Estimate declined' end,
    'Customer ' || case when p_response = 'approved' then 'approved' else 'declined' end ||
      ' estimate ' || estimate_row.estimate_number ||
      ' revision ' || revision_row.revision_number || '.',
    revision_row.customer_decision_at,
    estimate_row.service_request_id,
    estimate_row.id
  from public.communication_conversations conversation
  where conversation.service_request_id = estimate_row.service_request_id
    and conversation.company_id = revision_row.company_id
  order by
    case when conversation.customer_id = request_row.customer_id then 0 else 1 end,
    conversation.updated_at desc
  limit 1;

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
      'Customer ' || case when p_response = 'approved' then 'approved' else 'declined' end ||
        ' estimate ' || estimate_row.estimate_number ||
        ' revision ' || revision_row.revision_number || '.'
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
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'revision_id', revision_row.id,
    'revision_number', revision_row.revision_number,
    'service_request_status', next_request_status,
    'customer_responded_at', estimate_row.customer_responded_at,
    'approval_source', estimate_row.approval_source,
    'logical_estimate_id', logical_root_id,
    'revision_status', estimate_row.revision_status
  );
end;
$$;

create or replace function public.create_invoice_from_estimate_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  prior_invoice public.service_request_invoices;
  invoice_row public.service_request_invoices;
  line_count integer := 0;
  next_invoice_version integer := 1;
  paid_credit numeric(10, 2) := 0;
  balance_due numeric(10, 2) := 0;
  financial_state text := 'unpaid';
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_record_service_request_payment(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  if estimate_row.estimate_status <> 'approved'
    or coalesce(estimate_row.revision_status, 'current') <> 'current' then
    raise exception 'Invoice can only be created from the current approved estimate revision.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 127));

  select count(*)
  into line_count
  from public.service_request_estimate_items
  where estimate_id = estimate_row.id;

  if line_count = 0 then
    raise exception 'Approved estimate has no line items to invoice.' using errcode = '22023';
  end if;

  select *
  into prior_invoice
  from public.service_request_invoices invoice
  where invoice.logical_estimate_id = estimate_row.logical_estimate_id
    and invoice.invoice_status <> 'void'
    and invoice.invoice_lifecycle_status = 'current'
  order by invoice.invoice_version desc, invoice.created_at desc
  limit 1
  for update;

  if found and prior_invoice.estimate_id = estimate_row.id and prior_invoice.invoice_status = 'draft' then
    return jsonb_build_object(
      'id', prior_invoice.id,
      'invoice_number', prior_invoice.invoice_number,
      'service_request_id', prior_invoice.service_request_id,
      'estimate_id', prior_invoice.estimate_id,
      'logical_estimate_id', prior_invoice.logical_estimate_id,
      'invoice_version', prior_invoice.invoice_version,
      'invoice_lifecycle_status', prior_invoice.invoice_lifecycle_status,
      'subtotal', prior_invoice.subtotal,
      'tax', prior_invoice.tax,
      'total', prior_invoice.total,
      'invoice_status', prior_invoice.invoice_status,
      'created_at', prior_invoice.created_at,
      'updated_at', prior_invoice.updated_at,
      'line_count', (select count(*) from public.service_request_invoice_items where invoice_id = prior_invoice.id),
      'allocated_paid', public.active_service_request_paid_credit(prior_invoice.service_request_id),
      'balance_due', greatest(prior_invoice.total - public.active_service_request_paid_credit(prior_invoice.service_request_id), 0),
      'financial_state', case
        when public.active_service_request_paid_credit(prior_invoice.service_request_id) <= 0 then 'unpaid'
        when public.active_service_request_paid_credit(prior_invoice.service_request_id) >= prior_invoice.total then 'paid'
        else 'partially_paid'
      end,
      'reused_existing_draft', true
    );
  end if;

  if found then
    update public.service_request_invoices
    set
      invoice_lifecycle_status = case when invoice_status = 'void' then 'void' else 'superseded' end,
      replaced_at = coalesce(replaced_at, now()),
      updated_at = now()
    where id = prior_invoice.id;

    update public.service_request_invoice_estimates membership
    set
      membership_status = 'void',
      voided_at = coalesce(voided_at, now()),
      updated_at = now(),
      membership_metadata = coalesce(membership_metadata, '{}'::jsonb) ||
        jsonb_build_object('superseded_by_estimate_id', estimate_row.id)
    where membership.invoice_id = prior_invoice.id
      and membership.membership_status = 'active';

    next_invoice_version := coalesce(prior_invoice.invoice_version, 1) + 1;
  else
    select coalesce(max(invoice_version), 0) + 1
    into next_invoice_version
    from public.service_request_invoices
    where logical_estimate_id = estimate_row.logical_estimate_id;
  end if;

  insert into public.service_request_invoices (
    service_request_id,
    estimate_id,
    logical_estimate_id,
    invoice_version,
    invoice_lifecycle_status,
    replaces_invoice_id,
    created_by_profile_id,
    invoice_number,
    subtotal,
    tax,
    total,
    invoice_status
  )
  values (
    estimate_row.service_request_id,
    estimate_row.id,
    estimate_row.logical_estimate_id,
    next_invoice_version,
    'current',
    prior_invoice.id,
    auth.uid(),
    'INV-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
    estimate_row.subtotal,
    estimate_row.tax,
    estimate_row.total,
    'draft'
  )
  returning * into invoice_row;

  if prior_invoice.id is not null then
    update public.service_request_invoices
    set replaced_by_invoice_id = invoice_row.id
    where id = prior_invoice.id;
  end if;

  insert into public.service_request_invoice_items (
    invoice_id,
    source_estimate_item_id,
    item_title,
    quantity,
    unit_price,
    line_total,
    notes
  )
  select
    invoice_row.id,
    item.id,
    item.item_title,
    item.quantity,
    item.unit_price,
    item.line_total,
    item.notes
  from public.service_request_estimate_items item
  where item.estimate_id = estimate_row.id
  order by item.created_at asc;

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
    request.company_id,
    invoice_row.service_request_id,
    invoice_row.id,
    estimate_row.id,
    'active',
    'conversion',
    auth.uid(),
    now(),
    jsonb_build_object(
      'logical_estimate_id', estimate_row.logical_estimate_id,
      'estimate_revision_number', estimate_row.revision_number,
      'invoice_version', next_invoice_version,
      'finance_v2_current_membership', true
    )
  from public.service_requests request
  where request.id = invoice_row.service_request_id;

  paid_credit := public.active_service_request_paid_credit(invoice_row.service_request_id);
  balance_due := greatest(invoice_row.total - paid_credit, 0);
  financial_state := case
    when paid_credit <= 0 then 'unpaid'
    when balance_due <= 0 then 'paid'
    else 'partially_paid'
  end;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    invoice_row.service_request_id,
    auth.uid(),
    'estimate',
    'Invoice ' || invoice_row.invoice_number || ' version ' || next_invoice_version ||
      ' was created from approved estimate ' || estimate_row.estimate_number ||
      ' revision ' || estimate_row.revision_number || '. Existing payments remain credited.'
  );

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'service_request_id', invoice_row.service_request_id,
    'estimate_id', invoice_row.estimate_id,
    'logical_estimate_id', invoice_row.logical_estimate_id,
    'invoice_version', invoice_row.invoice_version,
    'invoice_lifecycle_status', invoice_row.invoice_lifecycle_status,
    'subtotal', invoice_row.subtotal,
    'tax', invoice_row.tax,
    'total', invoice_row.total,
    'invoice_status', invoice_row.invoice_status,
    'created_at', invoice_row.created_at,
    'updated_at', invoice_row.updated_at,
    'line_count', line_count,
    'allocated_paid', paid_credit,
    'balance_due', balance_due,
    'financial_state', financial_state
  );
end;
$$;

create or replace function public.void_service_request_invoice_rpc(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.service_request_invoices;
  allocation_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice was not found.' using errcode = 'P0002';
  end if;

  if not public.can_record_service_request_payment(invoice_row.service_request_id) then
    raise exception 'Invoice is not accessible for this account.' using errcode = '42501';
  end if;

  select count(*)
  into allocation_count
  from public.service_request_payment_allocations allocation
  where allocation.invoice_id = invoice_row.id
    and allocation.allocation_status = 'active';

  if allocation_count > 0 then
    raise exception 'Invoices with payment history cannot be voided automatically.'
      using errcode = '42501';
  end if;

  if invoice_row.invoice_status <> 'void' then
    update public.service_request_invoices
    set
      invoice_status = 'void',
      invoice_lifecycle_status = 'void',
      voided_at = coalesce(voided_at, now()),
      updated_at = now()
    where id = invoice_row.id
    returning * into invoice_row;

    update public.service_request_invoice_estimates membership
    set
      membership_status = 'void',
      voided_at = coalesce(voided_at, now()),
      updated_at = now()
    where membership.invoice_id = invoice_row.id
      and membership.membership_status = 'active';

    insert into public.service_request_notes (
      service_request_id,
      created_by_profile_id,
      note_type,
      body
    )
    values (
      invoice_row.service_request_id,
      auth.uid(),
      'estimate',
      'Invoice ' || invoice_row.invoice_number ||
        ' was voided. Its history is preserved and replacement invoicing is allowed.'
    );
  end if;

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'invoice_status', invoice_row.invoice_status,
    'invoice_lifecycle_status', invoice_row.invoice_lifecycle_status,
    'voided_at', invoice_row.voided_at
  );
end;
$$;

revoke all on function public.active_service_request_paid_credit(uuid) from public;
revoke all on function public.get_service_request_finance_v2_summary_rpc(uuid) from public;
revoke all on function public.revise_service_request_estimate_rpc(uuid) from public;
revoke all on function public.approve_service_request_estimate_for_customer_rpc(uuid) from public;
revoke all on function public.create_invoice_from_estimate_rpc(uuid) from public;
revoke all on function public.void_service_request_invoice_rpc(uuid) from public;
revoke all on function public.respond_to_public_estimate_rpc(text, text) from public;

grant execute on function public.get_service_request_finance_v2_summary_rpc(uuid) to authenticated;
grant execute on function public.revise_service_request_estimate_rpc(uuid) to authenticated;
grant execute on function public.approve_service_request_estimate_for_customer_rpc(uuid) to authenticated;
grant execute on function public.create_invoice_from_estimate_rpc(uuid) to authenticated;
grant execute on function public.void_service_request_invoice_rpc(uuid) to authenticated;
grant execute on function public.respond_to_public_estimate_rpc(text, text) to anon, authenticated;

comment on function public.revise_service_request_estimate_rpc(uuid) is
  'FINANCE-V2-01. Creates or reuses an editable draft revision for an approved/sent/declined logical Estimate without modifying prior approved revisions.';

comment on function public.create_invoice_from_estimate_rpc(uuid) is
  'FINANCE-V2-01. Creates a current replacement Invoice snapshot from the current approved Estimate revision without overwriting historical Invoice line items.';

comment on function public.void_service_request_invoice_rpc(uuid) is
  'FINANCE-V2-01. Voids unpaid invoices, inactivates current membership, preserves history, and permits replacement invoicing.';

comment on function public.get_service_request_finance_v2_summary_rpc(uuid) is
  'FINANCE-V2-01. Job-level approved total, valid paid credit, and additional balance summary for revised Estimates and replacement Invoices.';
