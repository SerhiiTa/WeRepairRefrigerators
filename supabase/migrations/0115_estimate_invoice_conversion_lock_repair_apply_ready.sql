-- PAYMENTS-03.7: Estimate-to-Invoice conversion lock repair.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Repair the already-deployed create_invoice_from_estimate_rpc from migration
--   0112 so conversion locks the approved Estimate before checking state,
--   creating/returning the Invoice, and carrying deposits forward.
--
-- Safety:
--   - Does not modify 0112.
--   - Does not change table grants or RLS policies.
--   - Preserves original Payment IDs and allocation carry-forward semantics.
--   - Uses the same lock order as manual payment collection:
--       Estimate row -> Payment rows in deterministic order -> Allocation rows.

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
  invoice_row public.service_request_invoices;
  line_count integer := 0;
  allocated_paid numeric(10, 2);
  balance_due numeric(10, 2);
  financial_state text;
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

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  if estimate_row.estimate_status <> 'approved' then
    raise exception 'Invoice can only be created from an approved estimate.' using errcode = '42501';
  end if;

  select count(*)
  into line_count
  from public.service_request_estimate_items
  where estimate_id = estimate_row.id;

  if line_count = 0 then
    raise exception 'Approved estimate has no line items to invoice.' using errcode = '22023';
  end if;

  insert into public.service_request_invoices (
    service_request_id,
    estimate_id,
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
    auth.uid(),
    'INV-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
    estimate_row.subtotal,
    estimate_row.tax,
    estimate_row.total,
    'draft'
  )
  on conflict (estimate_id)
  do update
  set updated_at = public.service_request_invoices.updated_at
  returning * into invoice_row;

  if not exists (
    select 1
    from public.service_request_invoice_items
    where invoice_id = invoice_row.id
  ) then
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

    insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
    values (
      invoice_row.service_request_id,
      auth.uid(),
      'estimate',
      'Invoice ' || invoice_row.invoice_number || ' was created from approved estimate '
        || estimate_row.estimate_number || '.'
    );
  end if;

  perform 1
  from public.service_request_payments payment
  where payment.id in (
    select distinct allocation.payment_id
    from public.service_request_payment_allocations allocation
    where allocation.estimate_id = estimate_row.id
      and allocation.invoice_id is null
      and allocation.allocation_status = 'active'
  )
  order by payment.id
  for update;

  update public.service_request_payment_allocations allocation
  set
    invoice_id = invoice_row.id,
    carried_from_estimate_id = coalesce(allocation.carried_from_estimate_id, estimate_row.id),
    estimate_id = null,
    allocation_source = 'estimate_deposit_carry_forward',
    carried_forward_at = coalesce(allocation.carried_forward_at, now()),
    updated_at = now()
  where allocation.estimate_id = estimate_row.id
    and allocation.invoice_id is null
    and allocation.allocation_status = 'active';

  select coalesce(sum(allocation.allocation_amount), 0)
  into allocated_paid
  from public.service_request_payment_allocations allocation
  where allocation.invoice_id = invoice_row.id
    and allocation.allocation_status = 'active';

  balance_due := greatest(invoice_row.total - allocated_paid, 0);
  financial_state := case
    when allocated_paid <= 0 then 'unpaid'
    when balance_due <= 0 then 'paid'
    else 'partially_paid'
  end;

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'service_request_id', invoice_row.service_request_id,
    'estimate_id', invoice_row.estimate_id,
    'subtotal', invoice_row.subtotal,
    'tax', invoice_row.tax,
    'total', invoice_row.total,
    'invoice_status', invoice_row.invoice_status,
    'created_at', invoice_row.created_at,
    'updated_at', invoice_row.updated_at,
    'line_count', line_count,
    'allocated_paid', allocated_paid,
    'balance_due', balance_due,
    'financial_state', financial_state
  );
end;
$$;

comment on function public.create_invoice_from_estimate_rpc(uuid) is
  'PAYMENTS-03.7. Creates or returns a draft invoice snapshot from an accessible approved estimate after locking the Estimate row, then atomically carries estimate deposits forward without duplicating payments.';

revoke all on function public.create_invoice_from_estimate_rpc(uuid) from public;
grant execute on function public.create_invoice_from_estimate_rpc(uuid) to authenticated;
