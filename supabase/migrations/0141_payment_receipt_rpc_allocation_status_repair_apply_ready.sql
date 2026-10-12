-- JOB-CLOSE-10: Repair payment receipt creation for actual Finance V2 allocation schema.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Production service_request_payment_allocations uses allocation_status to
--   represent active allocation state. Migration 0140 referenced a missing
--   allocation-column dependency, which is not part of the current canonical
--   allocation schema and caused receipt creation to fail after successful
--   Stripe payment posting.

create or replace function public.ensure_service_request_payment_receipt_rpc(
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.service_request_payments;
  allocation_row public.service_request_payment_allocations;
  request_row public.service_requests;
  receipt_row public.service_request_payment_receipts;
  token_row public.service_request_payment_receipt_tokens;
  next_sequence integer;
  job_number_text text;
  token_text text;
  token_hash_text text;
  card_brand_text text;
  card_last4_text text;
begin
  if p_payment_id is null then
    raise exception 'Payment is required for receipt creation.' using errcode = '22023';
  end if;

  select *
  into payment_row
  from public.service_request_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment was not found.' using errcode = 'P0002';
  end if;

  if payment_row.payment_status <> 'succeeded'
    or payment_row.voided_at is not null
    or coalesce(payment_row.provider, '') <> 'stripe'
    or coalesce(payment_row.payment_method, '') <> 'card'
    or payment_row.amount <= 0 then
    raise exception 'Only successful Stripe card payments can create automatic receipts.'
      using errcode = '23514';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = payment_row.service_request_id
  for update;

  if not found or request_row.company_id is null then
    raise exception 'Payment Job is not available.' using errcode = '23514';
  end if;

  if request_row.company_id is distinct from payment_row.company_id then
    raise exception 'Payment company does not match the Job.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(payment_row.service_request_id::text, 302));

  select *
  into receipt_row
  from public.service_request_payment_receipts
  where payment_id = payment_row.id
  for update;

  if not found then
    select *
    into allocation_row
    from public.service_request_payment_allocations allocation
    where allocation.payment_id = payment_row.id
      and allocation.allocation_status = 'active'
    order by allocation.created_at asc
    limit 1;

    select coalesce(max(receipt_sequence), 0) + 1
    into next_sequence
    from public.service_request_payment_receipts
    where service_request_id = payment_row.service_request_id;

    job_number_text := coalesce(request_row.job_number::text, split_part(payment_row.service_request_id::text, '-', 1));
    token_text := encode(extensions.gen_random_bytes(32), 'hex');
    token_hash_text := public.estimate_approval_token_hash(token_text);
    card_brand_text := nullif(btrim(coalesce(payment_row.payment_metadata ->> 'card_brand', payment_row.payment_metadata ->> 'stripe_card_brand', '')), '');
    card_last4_text := nullif(btrim(coalesce(payment_row.payment_metadata ->> 'card_last4', payment_row.payment_metadata ->> 'stripe_card_last4', '')), '');

    if card_last4_text is not null and card_last4_text !~ '^[0-9]{4}$' then
      card_last4_text := null;
    end if;

    insert into public.service_request_payment_receipts (
      company_id, service_request_id, payment_id, invoice_id, estimate_id,
      receipt_sequence, receipt_number, amount, currency,
      payment_method, card_brand, card_last4, payment_status, paid_at,
      receipt_metadata
    )
    values (
      payment_row.company_id, payment_row.service_request_id, payment_row.id,
      coalesce(allocation_row.invoice_id, payment_row.invoice_id),
      allocation_row.estimate_id,
      next_sequence,
      'RCP-' || job_number_text || '-' || lpad(next_sequence::text, 3, '0'),
      payment_row.amount,
      'usd',
      coalesce(nullif(payment_row.payment_method, ''), 'card'),
      card_brand_text,
      card_last4_text,
      payment_row.payment_status,
      coalesce(payment_row.paid_at, payment_row.created_at, now()),
      jsonb_build_object(
        'provider', payment_row.provider,
        'provider_payment_id', payment_row.provider_payment_id,
        'provider_event_id', payment_row.provider_event_id,
        'payment_type', payment_row.payment_type,
        'target_invoice_id', coalesce(allocation_row.invoice_id, payment_row.invoice_id),
        'target_estimate_id', allocation_row.estimate_id
      )
    )
    returning * into receipt_row;

    insert into public.service_request_payment_receipt_tokens (
      company_id, service_request_id, receipt_id, token_hash, token_expires_at
    )
    values (
      receipt_row.company_id, receipt_row.service_request_id, receipt_row.id,
      token_hash_text, now() + interval '180 days'
    )
    returning * into token_row;
  else
    token_text := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.service_request_payment_receipt_tokens (
      company_id, service_request_id, receipt_id, token_hash, token_expires_at
    )
    values (
      receipt_row.company_id, receipt_row.service_request_id, receipt_row.id,
      public.estimate_approval_token_hash(token_text), now() + interval '180 days'
    )
    returning * into token_row;
  end if;

  return jsonb_build_object(
    'receipt_id', receipt_row.id,
    'receipt_number', receipt_row.receipt_number,
    'receipt_token', token_text,
    'idempotent', false
  );
end;
$$;

revoke all on function public.ensure_service_request_payment_receipt_rpc(uuid) from public;
revoke all on function public.ensure_service_request_payment_receipt_rpc(uuid) from anon;
revoke all on function public.ensure_service_request_payment_receipt_rpc(uuid) from authenticated;
grant execute on function public.ensure_service_request_payment_receipt_rpc(uuid) to service_role;
