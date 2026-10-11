-- FINANCE-V2-25 Stage 2: Job-level approved scope and combined Invoice sync.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Establish the backend foundation for:
--     One Job -> multiple effective Approved Estimates -> one current Invoice.
--
-- Safety:
--   - Does not delete historical Invoices, Estimates, Payments, or Allocations.
--   - Does not repair existing Production duplicate-current-Invoice data automatically.
--   - Does not install the final one-current-Invoice unique index yet; existing
--     Production rows must be reconciled first.
--   - Preserves canonical Job-level paid credit and payment allocation history.

create extension if not exists pgcrypto with schema extensions;

alter table public.service_request_invoice_items
  add column if not exists source_logical_estimate_id uuid
    references public.service_request_estimates(id)
    on delete set null,
  add column if not exists source_approved_estimate_id uuid
    references public.service_request_estimates(id)
    on delete set null,
  add column if not exists item_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists service_request_invoice_items_invoice_source_item_uidx
  on public.service_request_invoice_items (invoice_id, source_estimate_item_id)
  where source_estimate_item_id is not null;

create index if not exists service_request_invoices_request_current_idx
  on public.service_request_invoices (service_request_id, invoice_lifecycle_status, invoice_status, updated_at desc);

comment on column public.service_request_invoice_items.source_logical_estimate_id is
  'FINANCE-V2-25. Logical Estimate family that contributed this combined Job Invoice item.';
comment on column public.service_request_invoice_items.source_approved_estimate_id is
  'FINANCE-V2-25. Effective Approved Estimate revision that contributed this combined Job Invoice item.';
comment on column public.service_request_invoice_items.item_metadata is
  'FINANCE-V2-25. Non-ledger Invoice item provenance and sync metadata.';

create or replace function public.get_service_request_effective_approved_scope_rpc(
  p_service_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  scope_row record;
  estimate_ids uuid[] := array[]::uuid[];
  logical_estimate_ids uuid[] := array[]::uuid[];
  item_count integer := 0;
  items_json jsonb := '[]'::jsonb;
begin
  if p_service_request_id is null then
    raise exception 'Job is required.' using errcode = '22023';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  with effective_estimates as (
    select *
    from (
      select
        estimate.*,
        coalesce(estimate.logical_estimate_id, estimate.id) as effective_logical_estimate_id,
        row_number() over (
          partition by coalesce(estimate.logical_estimate_id, estimate.id)
          order by
            coalesce(estimate.revision_number, 1) desc,
            estimate.updated_at desc,
            estimate.created_at desc,
            estimate.id desc
        ) as rn
      from public.service_request_estimates estimate
      where estimate.service_request_id = request_row.id
        and estimate.estimate_status = 'approved'
        and coalesce(estimate.revision_status, 'current') = 'current'
        and estimate.archived_at is null
    ) ranked
    where ranked.rn = 1
  ),
  item_rows as (
    select
      item.id,
      item.estimate_id,
      effective.id as approved_estimate_id,
      effective.effective_logical_estimate_id as logical_estimate_id,
      item.item_title,
      item.quantity,
      item.unit_price,
      item.line_total,
      item.notes,
      item.created_at
    from effective_estimates effective
    join public.service_request_estimate_items item
      on item.estimate_id = effective.id
  )
  select
    coalesce(round(sum(effective.subtotal), 2), 0) as subtotal,
    coalesce(round(sum(coalesce(effective.discount_amount, 0)), 2), 0) as discount_amount,
    coalesce(round(sum(coalesce(effective.taxable_amount, 0)), 2), 0) as taxable_amount,
    coalesce(round(sum(coalesce(effective.non_taxable_amount, 0)), 2), 0) as non_taxable_amount,
    coalesce(round(sum(coalesce(effective.tax, 0)), 2), 0) as tax,
    coalesce(round(sum(effective.total), 2), 0) as total,
    coalesce(array_agg(effective.id order by effective.created_at, effective.id), array[]::uuid[]) as approved_estimate_ids,
    coalesce(array_agg(effective.effective_logical_estimate_id order by effective.created_at, effective.id), array[]::uuid[]) as approved_logical_estimate_ids,
    coalesce((select count(*) from item_rows), 0) as line_count,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source_estimate_item_id', item_rows.id,
          'source_approved_estimate_id', item_rows.approved_estimate_id,
          'source_logical_estimate_id', item_rows.logical_estimate_id,
          'item_title', item_rows.item_title,
          'quantity', item_rows.quantity,
          'unit_price', item_rows.unit_price,
          'line_total', item_rows.line_total,
          'notes', item_rows.notes
        )
        order by item_rows.created_at, item_rows.id
      )
      from item_rows
    ), '[]'::jsonb) as items
  into scope_row
  from effective_estimates effective;

  estimate_ids := coalesce(scope_row.approved_estimate_ids, array[]::uuid[]);
  logical_estimate_ids := coalesce(scope_row.approved_logical_estimate_ids, array[]::uuid[]);
  item_count := coalesce(scope_row.line_count, 0);
  items_json := coalesce(scope_row.items, '[]'::jsonb);

  return jsonb_build_object(
    'service_request_id', request_row.id,
    'approved_total', coalesce(scope_row.total, 0),
    'approved_subtotal', coalesce(scope_row.subtotal, 0),
    'discount_amount', coalesce(scope_row.discount_amount, 0),
    'taxable_amount', coalesce(scope_row.taxable_amount, 0),
    'non_taxable_amount', coalesce(scope_row.non_taxable_amount, 0),
    'tax', coalesce(scope_row.tax, 0),
    'approved_estimate_ids', to_jsonb(estimate_ids),
    'approved_logical_estimate_ids', to_jsonb(logical_estimate_ids),
    'approved_estimate_count', coalesce(array_length(estimate_ids, 1), 0),
    'line_count', item_count,
    'items', items_json
  );
end;
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
  scope jsonb;
  current_invoice public.service_request_invoices;
  current_invoice_count integer := 0;
  approved_total numeric(10, 2) := 0;
  paid_credit numeric(10, 2) := 0;
  invoice_sync_required boolean := false;
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

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 127));

  scope := public.get_service_request_effective_approved_scope_rpc(request_row.id);
  approved_total := round(coalesce((scope ->> 'approved_total')::numeric, 0), 2);

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
    and invoice.invoice_status <> 'void'
    and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
  order by invoice.updated_at desc, invoice.created_at desc, invoice.id desc
  limit 1;

  paid_credit := public.active_service_request_paid_credit(request_row.id);
  invoice_sync_required := (
    approved_total > 0
    and (
      current_invoice.id is null
      or current_invoice_count <> 1
      or round(coalesce(current_invoice.total, 0), 2) <> approved_total
    )
  );

  return jsonb_build_object(
    'service_request_id', request_row.id,
    'current_invoice_id', current_invoice.id,
    'current_invoice_count', current_invoice_count,
    'invoice_total', coalesce(current_invoice.total, 0),
    'approved_total', approved_total,
    'paid_credit', paid_credit,
    'paid_total', paid_credit,
    'balance_due', greatest(approved_total - paid_credit, 0),
    'overpayment', greatest(paid_credit - approved_total, 0),
    'invoice_sync_required', invoice_sync_required,
    'contributing_approved_estimate_ids', coalesce(scope -> 'approved_estimate_ids', '[]'::jsonb),
    'contributing_logical_estimate_ids', coalesce(scope -> 'approved_logical_estimate_ids', '[]'::jsonb),
    'financial_state', case
      when approved_total <= 0 then 'not_ready'
      when paid_credit <= 0 then 'unpaid'
      when paid_credit >= approved_total then 'paid'
      else 'partially_paid'
    end
  );
end;
$$;

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

revoke all on function public.get_service_request_effective_approved_scope_rpc(uuid) from public;
revoke all on function public.get_service_request_finance_v2_summary_rpc(uuid) from public;
revoke all on function public.sync_job_invoice_from_approved_estimates_rpc(uuid) from public;

grant execute on function public.get_service_request_finance_v2_summary_rpc(uuid) to authenticated;
grant execute on function public.sync_job_invoice_from_approved_estimates_rpc(uuid) to authenticated;

comment on function public.get_service_request_effective_approved_scope_rpc(uuid) is
  'FINANCE-V2-25 Stage 2. Resolves one effective Approved revision per logical Estimate and aggregates Job approved scope.';
comment on function public.sync_job_invoice_from_approved_estimates_rpc(uuid) is
  'FINANCE-V2-25 Stage 2. Creates or synchronizes the single current Job Invoice from all effective Approved Estimates.';

create or replace function public.validate_invoice_checkout_matches_job_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.service_request_invoices;
  scope jsonb;
  approved_total numeric(10, 2) := 0;
  current_invoice_count integer := 0;
begin
  if new.target_type <> 'invoice'
    or new.invoice_id is null
    or new.checkout_status not in ('initiated', 'processing') then
    return new;
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = new.invoice_id;

  if not found then
    raise exception 'Reserved Invoice was not found.' using errcode = 'P0002';
  end if;

  if invoice_row.invoice_status = 'void'
    or coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then
    raise exception 'Invoice is not payable.' using errcode = '23514';
  end if;

  scope := public.get_service_request_effective_approved_scope_rpc(invoice_row.service_request_id);
  approved_total := round(coalesce((scope ->> 'approved_total')::numeric, 0), 2);

  select count(*)
  into current_invoice_count
  from public.service_request_invoices invoice
  where invoice.service_request_id = invoice_row.service_request_id
    and invoice.invoice_status <> 'void'
    and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current';

  if current_invoice_count <> 1
    or round(coalesce(invoice_row.total, 0), 2) <> approved_total then
    raise exception 'Invoice must be synchronized before checkout.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_invoice_checkout_matches_job_scope
  on public.service_request_payment_checkout_attempts;
create trigger validate_invoice_checkout_matches_job_scope
before insert or update of invoice_id, checkout_status, amount
on public.service_request_payment_checkout_attempts
for each row
execute function public.validate_invoice_checkout_matches_job_scope();

comment on function public.validate_invoice_checkout_matches_job_scope() is
  'FINANCE-V2-25 Stage 2. Prevents Checkout reservations against stale current Invoices whose totals no longer match Job approved scope.';

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
  effective_estimate public.service_request_estimates;
  updated_estimate public.service_request_estimates;
  revoked_revision_count integer := 0;
  logical_id uuid;
  summary jsonb;
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

  logical_id := coalesce(estimate_row.logical_estimate_id, estimate_row.id);

  if estimate_row.estimate_status = 'draft' then
    return jsonb_build_object(
      'id', estimate_row.id,
      'estimate_number', estimate_row.estimate_number,
      'estimate_status', estimate_row.estimate_status,
      'revision_status', estimate_row.revision_status,
      'service_request_id', estimate_row.service_request_id,
      'changed', false
    );
  end if;

  select *
  into effective_estimate
  from public.service_request_estimates estimate
  where estimate.service_request_id = estimate_row.service_request_id
    and coalesce(estimate.logical_estimate_id, estimate.id) = logical_id
    and estimate.estimate_status = 'approved'
    and coalesce(estimate.revision_status, 'current') = 'current'
    and estimate.archived_at is null
  order by coalesce(estimate.revision_number, 1) desc, estimate.updated_at desc, estimate.created_at desc, estimate.id desc
  limit 1
  for update;

  if not found then
    raise exception 'Only approved estimates can have approval undone.'
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
        'approval_undo_preserves_customer_decision', true,
        'finance_v2_job_invoice_sync_required', true
      ),
      updated_at = now()
    where estimate_id = effective_estimate.id
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
    effective_estimate.service_request_id,
    effective_estimate.id,
    'undo_approval',
    effective_estimate.estimate_status,
    'draft',
    auth.uid(),
    jsonb_build_object(
      'previous_approval_source', effective_estimate.approval_source,
      'previous_approved_by_profile_id', effective_estimate.approved_by_profile_id,
      'previous_customer_responded_at', effective_estimate.customer_responded_at,
      'previous_sent_at', effective_estimate.sent_at,
      'revoked_revision_count', revoked_revision_count,
      'finance_v2_removes_logical_estimate_from_scope', true,
      'finance_v2_invoice_sync_required', true,
      'preserves_payment_history', true
    )
  from public.service_requests sr
  where sr.id = effective_estimate.service_request_id;

  update public.service_request_estimates
  set
    estimate_status = 'draft',
    revision_status = 'draft',
    approval_source = 'customer',
    approved_by_profile_id = null,
    customer_responded_at = null,
    public_approval_token_hash = null,
    updated_at = now()
  where id = effective_estimate.id
  returning * into updated_estimate;

  summary := public.get_service_request_finance_v2_summary_rpc(updated_estimate.service_request_id);

  return jsonb_build_object(
    'id', updated_estimate.id,
    'estimate_number', updated_estimate.estimate_number,
    'estimate_status', updated_estimate.estimate_status,
    'revision_status', updated_estimate.revision_status,
    'service_request_id', updated_estimate.service_request_id,
    'approval_source', updated_estimate.approval_source,
    'approved_by_profile_id', updated_estimate.approved_by_profile_id,
    'customer_responded_at', updated_estimate.customer_responded_at,
    'revoked_revision_count', revoked_revision_count,
    'invoice_sync_required', coalesce((summary ->> 'invoice_sync_required')::boolean, false),
    'changed', true
  );
end;
$$;

comment on function public.undo_service_request_estimate_approval_rpc(uuid) is
  'FINANCE-V2-25 Stage 3. Removes one logical Estimate from Job approved scope without deleting payments or silently rewriting the current Job Invoice. Invoice synchronization is explicit.';

revoke all on function public.undo_service_request_estimate_approval_rpc(uuid) from public;
grant execute on function public.undo_service_request_estimate_approval_rpc(uuid) to authenticated;
