-- FINANCE-V2-44: Align Stripe Estimate checkout and posting with Job-level balance.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Repair Estimate Stripe Checkout eligibility and successful webhook posting so
--   they use the canonical Finance V2 Job-level collectible balance:
--
--     current effective approved Job scope
--     - valid Job-level paid credit
--     - active checkout reservations
--
-- Safety:
--   - Does not create, move, rewrite, or delete Payments or Allocations.
--   - Preserves canonical Payment Ledger and provider-event idempotency.
--   - Keeps public/dashboard authorization checks in place.
--   - Keeps separate Estimate checkout blocked when that Estimate is already
--     represented by its current Invoice.

alter table public.service_request_payment_checkout_attempts
  drop constraint if exists service_request_payment_checkout_attempts_kind_check;

alter table public.service_request_payment_checkout_attempts
  add constraint service_request_payment_checkout_attempts_kind_check
  check (checkout_kind in ('deposit', 'pay_in_full', 'balance_due', 'custom_deposit'));

create or replace function public.get_service_request_payment_eligibility_rpc(
  p_target_type text,
  p_target_id uuid,
  p_revision_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
  estimate_row public.service_request_estimates;
  invoice_row public.service_request_invoices;
  request_row public.service_requests;
  revision_row public.service_request_estimate_revisions;
  invoice_redirect public.service_request_invoices;
  scope jsonb := '{}'::jsonb;
  approved_estimate_ids uuid[] := array[]::uuid[];
  approved_total numeric(10, 2) := 0;
  paid_credit numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  target_total numeric(10, 2) := 0;
  remaining_amount numeric(10, 2) := 0;
  deposit_target numeric(10, 2) := 0;
  deposit_due numeric(10, 2) := 0;
  actions jsonb := '[]'::jsonb;
begin
  if normalized_target_type = 'estimate' then
    select *
    into estimate_row
    from public.service_request_estimates
    where id = p_target_id;

    if not found then
      raise exception 'Estimate was not found.' using errcode = 'P0002';
    end if;

    if not public.can_view_service_request(estimate_row.service_request_id) then
      raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
    end if;

    select *
    into request_row
    from public.service_requests
    where id = estimate_row.service_request_id;

    select *
    into invoice_redirect
    from public.service_request_invoices invoice
    where invoice.logical_estimate_id = coalesce(estimate_row.logical_estimate_id, estimate_row.id)
      and invoice.invoice_status <> 'void'
      and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
    order by invoice.invoice_version desc nulls last, invoice.created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'target_type', 'estimate',
        'target_id', estimate_row.id,
        'service_request_id', estimate_row.service_request_id,
        'company_id', request_row.company_id,
        'status', 'blocked',
        'remaining_balance', 0,
        'paid', public.active_service_request_paid_credit(estimate_row.service_request_id),
        'reserved', public.active_service_request_checkout_reserved_amount(estimate_row.service_request_id),
        'invoice_redirect_id', invoice_redirect.id,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('estimate_has_active_invoice')
      );
    end if;

    if p_revision_id is not null then
      select *
      into revision_row
      from public.service_request_estimate_revisions
      where id = p_revision_id
        and estimate_id = estimate_row.id;

      if not found
        or revision_row.revision_status <> 'approved'
        or revision_row.token_revoked_at is not null
        or revision_row.customer_decision <> 'approved'
        or revision_row.token_expires_at <= now() then
        return jsonb_build_object(
          'target_type', 'estimate',
          'target_id', estimate_row.id,
          'service_request_id', estimate_row.service_request_id,
          'company_id', request_row.company_id,
          'status', 'blocked',
          'remaining_balance', 0,
          'paid', 0,
          'reserved', 0,
          'invoice_redirect_id', null,
          'actions', '[]'::jsonb,
          'reasons', jsonb_build_array('revision_not_current')
        );
      end if;
    end if;

    if estimate_row.estimate_status <> 'approved'
      or coalesce(estimate_row.revision_status, 'current') <> 'current' then
      return jsonb_build_object(
        'target_type', 'estimate',
        'target_id', estimate_row.id,
        'service_request_id', estimate_row.service_request_id,
        'company_id', request_row.company_id,
        'status', 'blocked',
        'remaining_balance', 0,
        'paid', 0,
        'reserved', 0,
        'invoice_redirect_id', null,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('estimate_not_current')
      );
    end if;

    scope := public.get_service_request_effective_approved_scope_rpc(estimate_row.service_request_id);
    approved_total := round(coalesce((scope ->> 'approved_total')::numeric, 0), 2);

    select coalesce(array_agg(approved_scope_estimate.value::uuid), array[]::uuid[])
    into approved_estimate_ids
    from jsonb_array_elements_text(coalesce(scope -> 'approved_estimate_ids', '[]'::jsonb)) as approved_scope_estimate(value);

    if not (estimate_row.id = any(approved_estimate_ids)) then
      return jsonb_build_object(
        'target_type', 'estimate',
        'target_id', estimate_row.id,
        'service_request_id', estimate_row.service_request_id,
        'company_id', request_row.company_id,
        'status', 'blocked',
        'remaining_balance', 0,
        'paid', 0,
        'reserved', 0,
        'invoice_redirect_id', null,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('estimate_not_in_current_scope')
      );
    end if;

    paid_credit := public.active_service_request_paid_credit(estimate_row.service_request_id);
    reserved_amount := public.active_service_request_checkout_reserved_amount(estimate_row.service_request_id);
    target_total := approved_total;
    remaining_amount := greatest(target_total - paid_credit - reserved_amount, 0);

    if remaining_amount <= 0 then
      return jsonb_build_object(
        'target_type', 'estimate',
        'target_id', estimate_row.id,
        'service_request_id', estimate_row.service_request_id,
        'company_id', request_row.company_id,
        'status', case when target_total - paid_credit <= 0 then 'paid' else 'blocked' end,
        'remaining_balance', 0,
        'paid', paid_credit,
        'reserved', reserved_amount,
        'invoice_redirect_id', null,
        'actions', '[]'::jsonb,
        'reasons', case
          when target_total - paid_credit <= 0 then jsonb_build_array('fully_paid')
          else jsonb_build_array('checkout_in_progress')
        end
      );
    end if;

    if estimate_row.deposit_type = 'fixed' then
      deposit_target := least(coalesce(estimate_row.deposit_value, 0), target_total);
    elsif estimate_row.deposit_type = 'percent' then
      deposit_target := least(round(estimate_row.total * coalesce(estimate_row.deposit_value, 0) / 100, 2), target_total);
    end if;

    deposit_due := least(deposit_target, remaining_amount);

    if deposit_due > 0 then
      actions := actions || jsonb_build_array(jsonb_build_object(
        'kind', 'deposit',
        'label', 'Pay Deposit',
        'amount', least(deposit_due, remaining_amount),
        'max_amount', least(deposit_due, remaining_amount)
      ));
    end if;

    actions := actions || jsonb_build_array(jsonb_build_object(
      'kind', 'pay_in_full',
      'label', 'Pay in Full',
      'amount', remaining_amount,
      'max_amount', remaining_amount
    ));

    return jsonb_build_object(
      'target_type', 'estimate',
      'target_id', estimate_row.id,
      'service_request_id', estimate_row.service_request_id,
      'company_id', request_row.company_id,
      'status', 'eligible',
      'remaining_balance', remaining_amount,
      'paid', paid_credit,
      'reserved', reserved_amount,
      'invoice_redirect_id', null,
      'actions', actions,
      'reasons', '[]'::jsonb
    );
  elsif normalized_target_type = 'invoice' then
    select *
    into invoice_row
    from public.service_request_invoices
    where id = p_target_id;

    if not found then
      raise exception 'Invoice was not found.' using errcode = 'P0002';
    end if;

    if not public.can_view_service_request(invoice_row.service_request_id) then
      raise exception 'Invoice is not accessible for this account.' using errcode = '42501';
    end if;

    select *
    into request_row
    from public.service_requests
    where id = invoice_row.service_request_id;

    if invoice_row.invoice_status = 'void'
      or coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then
      return jsonb_build_object(
        'target_type', 'invoice',
        'target_id', invoice_row.id,
        'service_request_id', invoice_row.service_request_id,
        'company_id', request_row.company_id,
        'status', 'blocked',
        'remaining_balance', 0,
        'paid', 0,
        'reserved', 0,
        'invoice_redirect_id', null,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('invoice_not_current')
      );
    end if;

    paid_credit := public.active_service_request_paid_credit(invoice_row.service_request_id);
    reserved_amount := public.active_service_request_checkout_reserved_amount(invoice_row.service_request_id);
    scope := public.get_service_request_effective_approved_scope_rpc(invoice_row.service_request_id);
    target_total := greatest(round(coalesce((scope ->> 'approved_total')::numeric, 0), 2), invoice_row.total);
    remaining_amount := greatest(target_total - paid_credit - reserved_amount, 0);

    if remaining_amount <= 0 then
      return jsonb_build_object(
        'target_type', 'invoice',
        'target_id', invoice_row.id,
        'service_request_id', invoice_row.service_request_id,
        'company_id', request_row.company_id,
        'status', case when target_total - paid_credit <= 0 then 'paid' else 'blocked' end,
        'remaining_balance', 0,
        'paid', paid_credit,
        'reserved', reserved_amount,
        'invoice_redirect_id', null,
        'actions', '[]'::jsonb,
        'reasons', case
          when target_total - paid_credit <= 0 then jsonb_build_array('fully_paid')
          else jsonb_build_array('checkout_in_progress')
        end
      );
    end if;

    actions := jsonb_build_array(jsonb_build_object(
      'kind', 'balance_due',
      'label', 'Pay Balance Due',
      'amount', remaining_amount,
      'max_amount', remaining_amount
    ));

    return jsonb_build_object(
      'target_type', 'invoice',
      'target_id', invoice_row.id,
      'service_request_id', invoice_row.service_request_id,
      'company_id', request_row.company_id,
      'status', 'eligible',
      'remaining_balance', remaining_amount,
      'paid', paid_credit,
      'reserved', reserved_amount,
      'invoice_redirect_id', null,
      'actions', actions,
      'reasons', '[]'::jsonb
    );
  else
    raise exception 'Choose an Estimate or Invoice payment target.'
      using errcode = '22023';
  end if;
end;
$$;

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
  current_invoice_row public.service_request_invoices;
  scope jsonb := '{}'::jsonb;
  approved_estimate_ids uuid[] := array[]::uuid[];
  target_invoice_id uuid := null;
  target_estimate_id uuid := null;
  allocation_source text := 'provider_webhook';
  allocation_amount numeric(10, 2);
  paid_credit numeric(10, 2) := 0;
  target_total numeric(10, 2) := 0;
  active_reserved_amount numeric(10, 2) := 0;
  other_reserved_amount numeric(10, 2) := 0;
  available_amount numeric(10, 2) := 0;
  v_conversation_id uuid := null;
begin
  if p_checkout_attempt_id is null then raise exception 'Checkout attempt is required.' using errcode = '22023'; end if;
  if clean_event_id is null or clean_event_type is null then raise exception 'Stripe provider event identity is required.' using errcode = '22023'; end if;
  if clean_payment_intent_id is null then raise exception 'Stripe PaymentIntent identity is required.' using errcode = '22023'; end if;
  if normalized_currency <> 'usd' then raise exception 'Only USD Stripe payments are supported.' using errcode = '22023'; end if;
  if normalized_status <> 'succeeded' then raise exception 'Only confirmed successful Stripe payments can be posted.' using errcode = '23514'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Stripe payment amount must be positive.' using errcode = '22023'; end if;
  if clean_digest is not null and clean_digest !~ '^[0-9a-f]{64}$' then raise exception 'Invalid provider payload digest.' using errcode = '22023'; end if;

  select * into attempt_row from public.service_request_payment_checkout_attempts where id = p_checkout_attempt_id for update;
  if not found then raise exception 'Checkout attempt was not found.' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended(attempt_row.service_request_id::text, 301));

  insert into public.service_request_payment_provider_events (
    company_id, service_request_id, checkout_attempt_id, provider, provider_event_id,
    provider_event_type, processing_status, payload_digest, event_metadata
  )
  values (
    attempt_row.company_id, attempt_row.service_request_id, attempt_row.id, 'stripe',
    clean_event_id, clean_event_type, 'received', clean_digest, coalesce(p_event_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do update
  set
    checkout_attempt_id = coalesce(public.service_request_payment_provider_events.checkout_attempt_id, excluded.checkout_attempt_id),
    company_id = coalesce(public.service_request_payment_provider_events.company_id, excluded.company_id),
    service_request_id = coalesce(public.service_request_payment_provider_events.service_request_id, excluded.service_request_id),
    event_metadata = public.service_request_payment_provider_events.event_metadata || excluded.event_metadata
  returning * into event_row;

  select * into event_row from public.service_request_payment_provider_events where provider = 'stripe' and provider_event_id = clean_event_id for update;
  if event_row.checkout_attempt_id is not null and event_row.checkout_attempt_id <> attempt_row.id then
    raise exception 'Stripe provider event belongs to a different checkout attempt.' using errcode = '23505';
  end if;
  if event_row.payment_id is not null and event_row.processing_status = 'processed' then
    return jsonb_build_object('idempotent', true, 'payment_id', event_row.payment_id, 'checkout_attempt_id', attempt_row.id, 'provider_event_id', event_row.provider_event_id);
  end if;

  if attempt_row.provider <> 'stripe' then raise exception 'Checkout attempt provider is not Stripe.' using errcode = '23514'; end if;
  if attempt_row.checkout_status in ('failed', 'expired', 'canceled') then raise exception 'Checkout attempt is no longer payable.' using errcode = '23514'; end if;

  allocation_amount := round(p_amount_cents::numeric / 100, 2);
  if allocation_amount <> round(attempt_row.amount, 2) then raise exception 'Stripe payment amount does not match checkout reservation.' using errcode = '23514'; end if;
  if attempt_row.currency <> normalized_currency then raise exception 'Stripe payment currency does not match checkout reservation.' using errcode = '23514'; end if;

  select * into existing_payment from public.service_request_payments payment where payment.provider = 'stripe' and payment.provider_payment_id = clean_payment_intent_id for update;
  if found then
    if existing_payment.service_request_id <> attempt_row.service_request_id or existing_payment.company_id is distinct from attempt_row.company_id then
      raise exception 'Stripe PaymentIntent was already posted to a different Job.' using errcode = '23505';
    end if;
    update public.service_request_payment_checkout_attempts set checkout_status = 'succeeded', provider_payment_intent_id = clean_payment_intent_id, succeeded_payment_id = existing_payment.id where id = attempt_row.id;
    update public.service_request_payment_provider_events set processing_status = 'processed', payment_id = existing_payment.id, processed_at = now() where id = event_row.id;
    return jsonb_build_object('idempotent', true, 'payment_id', existing_payment.id, 'checkout_attempt_id', attempt_row.id, 'provider_event_id', event_row.provider_event_id);
  end if;

  scope := public.get_service_request_effective_approved_scope_rpc(attempt_row.service_request_id);
  target_total := round(coalesce((scope ->> 'approved_total')::numeric, 0), 2);

  if attempt_row.target_type = 'estimate' then
    select * into estimate_row from public.service_request_estimates where id = attempt_row.estimate_id for update;
    if not found then raise exception 'Reserved Estimate was not found.' using errcode = 'P0002'; end if;
    if estimate_row.estimate_status <> 'approved' or coalesce(estimate_row.revision_status, 'current') <> 'current' then
      raise exception 'Cannot post payment to a stale Estimate revision.' using errcode = '23514';
    end if;

    select coalesce(array_agg(approved_scope_estimate.value::uuid), array[]::uuid[])
    into approved_estimate_ids
    from jsonb_array_elements_text(coalesce(scope -> 'approved_estimate_ids', '[]'::jsonb)) as approved_scope_estimate(value);

    if not (estimate_row.id = any(approved_estimate_ids)) then
      raise exception 'Cannot post payment to an Estimate outside the current approved Job scope.' using errcode = '23514';
    end if;

    select * into current_invoice_row
    from public.service_request_invoices invoice
    where invoice.logical_estimate_id = coalesce(estimate_row.logical_estimate_id, estimate_row.id)
      and invoice.invoice_status <> 'void'
      and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
    order by invoice.invoice_version desc nulls last, invoice.created_at desc
    limit 1
    for update;

    if found then
      target_invoice_id := current_invoice_row.id;
      allocation_source := 'provider_webhook';
    else
      target_estimate_id := estimate_row.id;
      allocation_source := 'estimate_deposit';
    end if;
  elsif attempt_row.target_type = 'invoice' then
    select * into invoice_row from public.service_request_invoices where id = attempt_row.invoice_id for update;
    if not found then raise exception 'Reserved Invoice was not found.' using errcode = 'P0002'; end if;
    if invoice_row.invoice_status = 'void' or coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then
      raise exception 'Cannot post payment to a stale or void Invoice.' using errcode = '23514';
    end if;
    target_invoice_id := invoice_row.id;
    target_total := greatest(target_total, invoice_row.total);
    allocation_source := 'provider_webhook';
  else
    raise exception 'Unsupported checkout target type.' using errcode = '22023';
  end if;

  paid_credit := public.active_service_request_paid_credit(attempt_row.service_request_id);
  active_reserved_amount := public.active_service_request_checkout_reserved_amount(attempt_row.service_request_id);
  other_reserved_amount := greatest(active_reserved_amount - attempt_row.amount, 0);
  available_amount := greatest(target_total - paid_credit - other_reserved_amount, 0);

  if allocation_amount > available_amount then
    raise exception 'Stripe payment exceeds the remaining obligation.' using errcode = '23514';
  end if;

  insert into public.service_request_payments (
    company_id, service_request_id, invoice_id, source_system, payment_status,
    payment_type, payment_method, amount, service_fee, net_amount, tip_amount,
    payment_date, paid_at, provider, provider_payment_id, provider_event_id,
    reference_code, description, payment_metadata, import_metadata
  )
  values (
    attempt_row.company_id, attempt_row.service_request_id, target_invoice_id, 'native',
    'succeeded', 'stripe_checkout', 'card', allocation_amount, 0, allocation_amount, 0,
    current_date, now(), 'stripe', clean_payment_intent_id, clean_event_id,
    clean_payment_intent_id, 'Stripe Checkout payment',
    jsonb_build_object(
      'stripe_payment_intent_id', clean_payment_intent_id,
      'checkout_attempt_id', attempt_row.id,
      'checkout_kind', attempt_row.checkout_kind,
      'provider_event_id', clean_event_id,
      'target_type', attempt_row.target_type,
      'finance_v2_job_paid_credit_before_posting', paid_credit,
      'finance_v2_target_total', target_total,
      'finance_v2_other_active_reserved_before_posting', other_reserved_amount,
      'stripe_sandbox_pilot', coalesce((attempt_row.checkout_metadata ->> 'stripe_sandbox_pilot')::boolean, false),
      'stripe_livemode', coalesce((attempt_row.checkout_metadata ->> 'stripe_livemode')::boolean, false)
    ),
    '{}'::jsonb
  )
  returning * into payment_row;

  insert into public.service_request_payment_allocations (
    company_id, service_request_id, payment_id, estimate_id, invoice_id,
    carried_from_estimate_id, allocation_amount, allocation_source, allocation_metadata
  )
  values (
    attempt_row.company_id, attempt_row.service_request_id, payment_row.id,
    target_estimate_id, target_invoice_id,
    case when target_invoice_id is not null and attempt_row.target_type = 'estimate' then attempt_row.estimate_id else null end,
    allocation_amount, allocation_source,
    jsonb_build_object('stripe_payment_intent_id', clean_payment_intent_id, 'checkout_attempt_id', attempt_row.id, 'provider_event_id', clean_event_id, 'finance_v2_job_credit_allocation', true)
  );

  update public.service_request_payment_checkout_attempts
  set checkout_status = 'succeeded', provider_payment_intent_id = clean_payment_intent_id, succeeded_payment_id = payment_row.id
  where id = attempt_row.id;

  update public.service_request_payment_provider_events
  set processing_status = 'processed', payment_id = payment_row.id, processed_at = now()
  where id = event_row.id;

  select conversation.id into v_conversation_id
  from public.communication_conversations conversation
  where conversation.service_request_id = attempt_row.service_request_id
  order by conversation.updated_at desc
  limit 1;

  if v_conversation_id is not null
    and not exists (
      select 1 from public.communication_timeline_events event
      where event.conversation_id = v_conversation_id
        and event.event_type = 'payment_received'
        and event.payment_reference = clean_payment_intent_id
    ) then
    insert into public.communication_timeline_events (
      conversation_id, event_type, title, body, event_time, service_request_id,
      estimate_id, invoice_id, payment_reference
    )
    values (
      v_conversation_id, 'payment_received', 'Payment received',
      'Stripe payment of $' || to_char(allocation_amount, 'FM999999990.00') || ' was confirmed.',
      now(), attempt_row.service_request_id, coalesce(target_estimate_id, attempt_row.estimate_id),
      target_invoice_id, clean_payment_intent_id
    );
  end if;

  return jsonb_build_object(
    'idempotent', false,
    'payment_id', payment_row.id,
    'checkout_attempt_id', attempt_row.id,
    'provider_event_id', event_row.provider_event_id,
    'allocation_amount', allocation_amount,
    'target_estimate_id', target_estimate_id,
    'target_invoice_id', target_invoice_id
  );
end;
$$;

revoke all on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) from public;
grant execute on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) to authenticated;

revoke all on function public.record_stripe_checkout_payment_rpc(
  uuid, text, text, text, integer, text, text, text, jsonb
) from public;
revoke all on function public.record_stripe_checkout_payment_rpc(
  uuid, text, text, text, integer, text, text, text, jsonb
) from anon;
revoke all on function public.record_stripe_checkout_payment_rpc(
  uuid, text, text, text, integer, text, text, text, jsonb
) from authenticated;
grant execute on function public.record_stripe_checkout_payment_rpc(
  uuid, text, text, text, integer, text, text, text, jsonb
) to service_role;

comment on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) is
  'FINANCE-V2-44. Computes Stripe Checkout eligibility from current Finance V2 Job-level collectible balance.';

comment on function public.record_stripe_checkout_payment_rpc(
  uuid, text, text, text, integer, text, text, text, jsonb
) is
  'FINANCE-V2-44. Posts confirmed Stripe payments against Finance V2 Job-level approved scope, excluding the completed reservation from active reservation checks.';
