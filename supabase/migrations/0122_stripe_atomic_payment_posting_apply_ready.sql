-- STRIPE-02: Atomic Stripe Checkout payment posting.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Convert one confirmed Stripe PaymentIntent for one existing checkout
--   reservation into the canonical Finance V1 Payment Ledger atomically.
--
-- Safety:
--   - Does not call Stripe.
--   - Does not rewrite historical Payments or Allocations.
--   - Intended for trusted server/webhook usage only through service_role.

create or replace function public.record_stripe_checkout_payment_rpc(
  p_checkout_attempt_id uuid,
  p_provider_event_id text,
  p_provider_event_type text,
  p_provider_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_payment_status text,
  p_payload_digest text default null,
  p_event_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_event_id text := nullif(btrim(coalesce(p_provider_event_id, '')), '');
  clean_event_type text := nullif(btrim(coalesce(p_provider_event_type, '')), '');
  clean_payment_intent_id text := nullif(btrim(coalesce(p_provider_payment_intent_id, '')), '');
  normalized_currency text := lower(btrim(coalesce(p_currency, '')));
  normalized_status text := lower(btrim(coalesce(p_payment_status, '')));
  clean_digest text := lower(nullif(btrim(coalesce(p_payload_digest, '')), ''));
  attempt_row public.service_request_payment_checkout_attempts;
  event_row public.service_request_payment_provider_events;
  existing_payment public.service_request_payments;
  payment_row public.service_request_payments;
  estimate_row public.service_request_estimates;
  invoice_row public.service_request_invoices;
  converted_invoice_row public.service_request_invoices;
  target_invoice_id uuid := null;
  target_estimate_id uuid := null;
  allocation_source text := 'provider_webhook';
  allocation_amount numeric(10, 2);
  paid_amount numeric(10, 2) := 0;
  target_total numeric(10, 2) := 0;
  available_amount numeric(10, 2) := 0;
  v_conversation_id uuid := null;
begin
  if p_checkout_attempt_id is null then
    raise exception 'Checkout attempt is required.' using errcode = '22023';
  end if;

  if clean_event_id is null or clean_event_type is null then
    raise exception 'Stripe provider event identity is required.' using errcode = '22023';
  end if;

  if clean_payment_intent_id is null then
    raise exception 'Stripe PaymentIntent identity is required.' using errcode = '22023';
  end if;

  if normalized_currency <> 'usd' then
    raise exception 'Only USD Stripe payments are supported.' using errcode = '22023';
  end if;

  if normalized_status <> 'succeeded' then
    raise exception 'Only confirmed successful Stripe payments can be posted.' using errcode = '23514';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Stripe payment amount must be positive.' using errcode = '22023';
  end if;

  if clean_digest is not null and clean_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid provider payload digest.' using errcode = '22023';
  end if;

  select *
  into attempt_row
  from public.service_request_payment_checkout_attempts
  where id = p_checkout_attempt_id
  for update;

  if not found then
    raise exception 'Checkout attempt was not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(attempt_row.service_request_id::text, 301));

  insert into public.service_request_payment_provider_events (
    company_id,
    service_request_id,
    checkout_attempt_id,
    provider,
    provider_event_id,
    provider_event_type,
    processing_status,
    payload_digest,
    event_metadata
  )
  values (
    attempt_row.company_id,
    attempt_row.service_request_id,
    attempt_row.id,
    'stripe',
    clean_event_id,
    clean_event_type,
    'received',
    clean_digest,
    coalesce(p_event_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do update
  set
    checkout_attempt_id = coalesce(public.service_request_payment_provider_events.checkout_attempt_id, excluded.checkout_attempt_id),
    company_id = coalesce(public.service_request_payment_provider_events.company_id, excluded.company_id),
    service_request_id = coalesce(public.service_request_payment_provider_events.service_request_id, excluded.service_request_id),
    event_metadata = public.service_request_payment_provider_events.event_metadata || excluded.event_metadata
  returning * into event_row;

  select *
  into event_row
  from public.service_request_payment_provider_events
  where provider = 'stripe'
    and provider_event_id = clean_event_id
  for update;

  if event_row.checkout_attempt_id is not null
    and event_row.checkout_attempt_id <> attempt_row.id then
    raise exception 'Stripe provider event belongs to a different checkout attempt.'
      using errcode = '23505';
  end if;

  if event_row.payment_id is not null
    and event_row.processing_status = 'processed' then
    return jsonb_build_object(
      'idempotent', true,
      'payment_id', event_row.payment_id,
      'checkout_attempt_id', attempt_row.id,
      'provider_event_id', event_row.provider_event_id
    );
  end if;

  if attempt_row.provider <> 'stripe' then
    raise exception 'Checkout attempt provider is not Stripe.' using errcode = '23514';
  end if;

  if attempt_row.checkout_status in ('failed', 'expired', 'canceled') then
    raise exception 'Checkout attempt is no longer payable.' using errcode = '23514';
  end if;

  allocation_amount := round(p_amount_cents::numeric / 100, 2);

  if allocation_amount <> round(attempt_row.amount, 2) then
    raise exception 'Stripe payment amount does not match checkout reservation.'
      using errcode = '23514';
  end if;

  if attempt_row.currency <> normalized_currency then
    raise exception 'Stripe payment currency does not match checkout reservation.'
      using errcode = '23514';
  end if;

  select *
  into existing_payment
  from public.service_request_payments payment
  where payment.provider = 'stripe'
    and payment.provider_payment_id = clean_payment_intent_id
  for update;

  if found then
    if existing_payment.service_request_id <> attempt_row.service_request_id
      or existing_payment.company_id is distinct from attempt_row.company_id then
      raise exception 'Stripe PaymentIntent was already posted to a different Job.'
        using errcode = '23505';
    end if;

    update public.service_request_payment_checkout_attempts
    set
      checkout_status = 'succeeded',
      provider_payment_intent_id = clean_payment_intent_id,
      succeeded_payment_id = existing_payment.id
    where id = attempt_row.id;

    update public.service_request_payment_provider_events
    set
      processing_status = 'processed',
      payment_id = existing_payment.id,
      processed_at = now()
    where id = event_row.id;

    return jsonb_build_object(
      'idempotent', true,
      'payment_id', existing_payment.id,
      'checkout_attempt_id', attempt_row.id,
      'provider_event_id', event_row.provider_event_id
    );
  end if;

  if attempt_row.target_type = 'estimate' then
    select *
    into estimate_row
    from public.service_request_estimates
    where id = attempt_row.estimate_id
    for update;

    if not found then
      raise exception 'Reserved Estimate was not found.' using errcode = 'P0002';
    end if;

    select *
    into converted_invoice_row
    from public.service_request_invoices invoice
    where invoice.estimate_id = estimate_row.id
      and invoice.invoice_status <> 'void'
    order by invoice.created_at desc
    limit 1
    for update;

    if found then
      target_invoice_id := converted_invoice_row.id;
      target_total := converted_invoice_row.total;
      allocation_source := 'provider_webhook';

      select coalesce(sum(allocation.allocation_amount), 0)
      into paid_amount
      from public.service_request_payment_allocations allocation
      where allocation.invoice_id = converted_invoice_row.id
        and allocation.allocation_status = 'active';
    else
      target_estimate_id := estimate_row.id;
      target_total := estimate_row.total;
      allocation_source := 'estimate_deposit';

      select coalesce(sum(allocation.allocation_amount), 0)
      into paid_amount
      from public.service_request_payment_allocations allocation
      where allocation.estimate_id = estimate_row.id
        and allocation.allocation_status = 'active';
    end if;
  elsif attempt_row.target_type = 'invoice' then
    select *
    into invoice_row
    from public.service_request_invoices
    where id = attempt_row.invoice_id
    for update;

    if not found then
      raise exception 'Reserved Invoice was not found.' using errcode = 'P0002';
    end if;

    if invoice_row.invoice_status = 'void' then
      raise exception 'Cannot post payment to a void Invoice.' using errcode = '23514';
    end if;

    target_invoice_id := invoice_row.id;
    target_total := invoice_row.total;
    allocation_source := 'provider_webhook';

    select coalesce(sum(allocation.allocation_amount), 0)
    into paid_amount
    from public.service_request_payment_allocations allocation
    where allocation.invoice_id = invoice_row.id
      and allocation.allocation_status = 'active';
  else
    raise exception 'Unsupported checkout target type.' using errcode = '22023';
  end if;

  available_amount := greatest(target_total - paid_amount, 0);

  if allocation_amount > available_amount then
    raise exception 'Stripe payment exceeds the remaining obligation.'
      using errcode = '23514';
  end if;

  insert into public.service_request_payments (
    company_id,
    service_request_id,
    invoice_id,
    source_system,
    payment_status,
    payment_type,
    payment_method,
    amount,
    service_fee,
    net_amount,
    tip_amount,
    payment_date,
    paid_at,
    provider,
    provider_payment_id,
    provider_event_id,
    reference_code,
    description,
    payment_metadata,
    import_metadata
  )
  values (
    attempt_row.company_id,
    attempt_row.service_request_id,
    target_invoice_id,
    'native',
    'succeeded',
    'stripe_checkout',
    'card',
    allocation_amount,
    0,
    allocation_amount,
    0,
    current_date,
    now(),
    'stripe',
    clean_payment_intent_id,
    clean_event_id,
    clean_payment_intent_id,
    'Stripe Checkout payment',
    jsonb_build_object(
      'stripe_payment_intent_id', clean_payment_intent_id,
      'checkout_attempt_id', attempt_row.id,
      'checkout_kind', attempt_row.checkout_kind,
      'provider_event_id', clean_event_id,
      'target_type', attempt_row.target_type,
      'converted_estimate_invoice_id', converted_invoice_row.id
    ),
    '{}'::jsonb
  )
  returning * into payment_row;

  insert into public.service_request_payment_allocations (
    company_id,
    service_request_id,
    payment_id,
    estimate_id,
    invoice_id,
    carried_from_estimate_id,
    allocation_amount,
    allocation_source,
    allocation_metadata
  )
  values (
    attempt_row.company_id,
    attempt_row.service_request_id,
    payment_row.id,
    target_estimate_id,
    target_invoice_id,
    case
      when target_invoice_id is not null and attempt_row.target_type = 'estimate'
      then attempt_row.estimate_id
      else null
    end,
    allocation_amount,
    allocation_source,
    jsonb_build_object(
      'stripe_payment_intent_id', clean_payment_intent_id,
      'checkout_attempt_id', attempt_row.id,
      'provider_event_id', clean_event_id
    )
  );

  update public.service_request_payment_checkout_attempts
  set
    checkout_status = 'succeeded',
    provider_payment_intent_id = clean_payment_intent_id,
    succeeded_payment_id = payment_row.id
  where id = attempt_row.id;

  update public.service_request_payment_provider_events
  set
    processing_status = 'processed',
    payment_id = payment_row.id,
    processed_at = now()
  where id = event_row.id;

  select conversation.id
  into v_conversation_id
  from public.communication_conversations conversation
  where conversation.service_request_id = attempt_row.service_request_id
  order by conversation.updated_at desc
  limit 1;

  if v_conversation_id is not null
    and not exists (
      select 1
      from public.communication_timeline_events event
      where event.conversation_id = v_conversation_id
        and event.event_type = 'payment_received'
        and event.payment_reference = clean_payment_intent_id
    ) then
    insert into public.communication_timeline_events (
      conversation_id,
      event_type,
      title,
      body,
      event_time,
      service_request_id,
      estimate_id,
      invoice_id,
      payment_reference
    )
    values (
      v_conversation_id,
      'payment_received',
      'Payment received',
      'Stripe payment of $' || to_char(allocation_amount, 'FM999999990.00') || ' was confirmed.',
      now(),
      attempt_row.service_request_id,
      coalesce(target_estimate_id, attempt_row.estimate_id),
      target_invoice_id,
      clean_payment_intent_id
    );
  end if;

  return jsonb_build_object(
    'idempotent', false,
    'payment_id', payment_row.id,
    'checkout_attempt_id', attempt_row.id,
    'provider_event_id', clean_event_id,
    'allocation_amount', allocation_amount,
    'target_estimate_id', target_estimate_id,
    'target_invoice_id', target_invoice_id
  );
exception
  when others then
    raise;
end;
$$;

comment on function public.record_stripe_checkout_payment_rpc(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  jsonb
) is
  'STRIPE-02. Trusted-server atomic posting of confirmed Stripe Checkout payments into canonical Finance V1 Payment and Allocation ledgers.';

revoke all on function public.record_stripe_checkout_payment_rpc(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  jsonb
) from public;
revoke all on function public.record_stripe_checkout_payment_rpc(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  jsonb
) from anon;
revoke all on function public.record_stripe_checkout_payment_rpc(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  jsonb
) from authenticated;

grant execute on function public.record_stripe_checkout_payment_rpc(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  jsonb
) to service_role;
