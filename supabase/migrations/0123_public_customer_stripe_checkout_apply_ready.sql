-- STRIPE-03: Public customer Checkout authorization for Estimate links.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Allow a valid customer Estimate revision token to initiate Stripe Checkout
--   reservations without dashboard authentication while preserving 0121 target
--   locks, idempotency, and canonical ledger posting through 0122.

create or replace function public.get_public_estimate_payment_options_rpc(
  p_token text
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
  invoice_row public.service_request_invoices;
  request_row public.service_requests;
  paid_amount numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  remaining_amount numeric(10, 2) := 0;
  deposit_target numeric(10, 2) := 0;
  deposit_due numeric(10, 2) := 0;
  actions jsonb := '[]'::jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'status', 'blocked',
      'target_type', null,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('invalid_token')
    );
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into revision_row
  from public.service_request_estimate_revisions
  where public_approval_token_hash = token_hash;

  if not found then
    return jsonb_build_object(
      'status', 'blocked',
      'target_type', null,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('not_found')
    );
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = revision_row.estimate_id;

  if not found then
    return jsonb_build_object(
      'status', 'blocked',
      'target_type', null,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('estimate_not_found')
    );
  end if;

  select *
  into request_row
  from public.service_requests
  where id = estimate_row.service_request_id;

  if not found or request_row.company_id is null or request_row.company_id <> revision_row.company_id then
    return jsonb_build_object(
      'status', 'blocked',
      'target_type', null,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('target_unavailable')
    );
  end if;

  if revision_row.token_revoked_at is not null then
    return jsonb_build_object(
      'status', 'blocked',
      'target_type', 'estimate',
      'estimate_number', estimate_row.estimate_number,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('token_revoked')
    );
  end if;

  if revision_row.token_expires_at <= now() then
    return jsonb_build_object(
      'status', 'blocked',
      'target_type', 'estimate',
      'estimate_number', estimate_row.estimate_number,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('token_expired')
    );
  end if;

  if revision_row.customer_decision <> 'approved'
    or revision_row.revision_status <> 'approved'
    or estimate_row.estimate_status <> 'approved' then
    return jsonb_build_object(
      'status', 'blocked',
      'target_type', 'estimate',
      'estimate_number', estimate_row.estimate_number,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('estimate_not_approved')
    );
  end if;

  select *
  into invoice_row
  from public.service_request_invoices invoice
  where invoice.estimate_id = estimate_row.id
    and invoice.invoice_status <> 'void'
  order by invoice.created_at desc
  limit 1;

  if found then
    select coalesce(sum(allocation.allocation_amount), 0)
    into paid_amount
    from public.service_request_payment_allocations allocation
    where allocation.invoice_id = invoice_row.id
      and allocation.allocation_status = 'active';

    reserved_amount := public.active_payment_checkout_reserved_amount('invoice', invoice_row.id);
    remaining_amount := greatest(invoice_row.total - paid_amount - reserved_amount, 0);

    if invoice_row.invoice_status = 'void' then
      return jsonb_build_object(
        'status', 'blocked',
        'target_type', 'invoice',
        'invoice_number', invoice_row.invoice_number,
        'total', invoice_row.total,
        'paid', paid_amount,
        'balance_due', remaining_amount,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('invoice_void')
      );
    end if;

    if remaining_amount <= 0 then
      return jsonb_build_object(
        'status', 'paid',
        'target_type', 'invoice',
        'invoice_number', invoice_row.invoice_number,
        'total', invoice_row.total,
        'paid', paid_amount,
        'reserved', reserved_amount,
        'balance_due', remaining_amount,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('fully_paid')
      );
    end if;

    return jsonb_build_object(
      'status', 'eligible',
      'target_type', 'invoice',
      'invoice_number', invoice_row.invoice_number,
      'total', invoice_row.total,
      'paid', paid_amount,
      'reserved', reserved_amount,
      'balance_due', remaining_amount,
      'actions', jsonb_build_array(
        jsonb_build_object(
          'kind', 'balance_due',
          'label', 'Pay Balance Due',
          'amount', remaining_amount,
          'max_amount', remaining_amount
        )
      ),
      'reasons', '[]'::jsonb
    );
  end if;

  select coalesce(sum(allocation.allocation_amount), 0)
  into paid_amount
  from public.service_request_payment_allocations allocation
  where allocation.estimate_id = estimate_row.id
    and allocation.allocation_status = 'active';

  reserved_amount := public.active_payment_checkout_reserved_amount('estimate', estimate_row.id);
  remaining_amount := greatest(estimate_row.total - paid_amount - reserved_amount, 0);

  if remaining_amount <= 0 then
    return jsonb_build_object(
      'status', 'paid',
      'target_type', 'estimate',
      'estimate_number', estimate_row.estimate_number,
      'total', estimate_row.total,
      'paid', paid_amount,
      'reserved', reserved_amount,
      'balance_due', remaining_amount,
      'actions', '[]'::jsonb,
      'reasons', jsonb_build_array('fully_paid')
    );
  end if;

  if estimate_row.deposit_type = 'fixed' then
    deposit_target := least(estimate_row.deposit_value, estimate_row.total);
  elsif estimate_row.deposit_type = 'percent' then
    deposit_target := least(round(estimate_row.total * estimate_row.deposit_value / 100, 2), estimate_row.total);
  end if;

  deposit_due := greatest(deposit_target - paid_amount - reserved_amount, 0);

  if deposit_due > 0 then
    actions := actions || jsonb_build_array(
      jsonb_build_object(
        'kind', 'deposit',
        'label', 'Pay Deposit',
        'amount', least(deposit_due, remaining_amount),
        'max_amount', least(deposit_due, remaining_amount)
      )
    );
  end if;

  actions := actions || jsonb_build_array(
    jsonb_build_object(
      'kind', 'pay_in_full',
      'label', 'Pay in Full',
      'amount', remaining_amount,
      'max_amount', remaining_amount
    )
  );

  return jsonb_build_object(
    'status', 'eligible',
    'target_type', 'estimate',
    'estimate_number', estimate_row.estimate_number,
    'total', estimate_row.total,
    'paid', paid_amount,
    'reserved', reserved_amount,
    'balance_due', remaining_amount,
    'actions', actions,
    'reasons', '[]'::jsonb
  );
end;
$$;

comment on function public.get_public_estimate_payment_options_rpc(text) is
  'STRIPE-03. Read-only payment options for customer Estimate revision links.';

revoke all on function public.get_public_estimate_payment_options_rpc(text) from public;
grant execute on function public.get_public_estimate_payment_options_rpc(text) to anon, authenticated;

create or replace function public.reserve_public_estimate_payment_checkout_rpc(
  p_token text,
  p_target_type text,
  p_checkout_kind text,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text;
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
  normalized_checkout_kind text := lower(btrim(coalesce(p_checkout_kind, '')));
  clean_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  clean_fingerprint text := lower(btrim(coalesce(p_request_fingerprint, '')));
  revision_row public.service_request_estimate_revisions;
  estimate_row public.service_request_estimates;
  invoice_row public.service_request_invoices;
  request_row public.service_requests;
  existing_attempt public.service_request_payment_checkout_attempts;
  checkout_attempt public.service_request_payment_checkout_attempts;
  paid_amount numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  target_total numeric(10, 2) := 0;
  remaining_amount numeric(10, 2) := 0;
  deposit_target numeric(10, 2) := 0;
  deposit_due numeric(10, 2) := 0;
  eligible_amount numeric(10, 2) := null;
  target_id uuid;
  payment_options jsonb;
  action_row jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Payment link is invalid.' using errcode = '22023';
  end if;

  if clean_idempotency_key is null or length(clean_idempotency_key) < 12 then
    raise exception 'A valid checkout idempotency key is required.' using errcode = '22023';
  end if;

  if clean_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid request fingerprint is required.' using errcode = '22023';
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into revision_row
  from public.service_request_estimate_revisions
  where public_approval_token_hash = token_hash
  for update;

  if not found then
    raise exception 'Payment link was not found.' using errcode = 'P0002';
  end if;

  if revision_row.token_revoked_at is not null
    or revision_row.token_expires_at <= now()
    or revision_row.customer_decision <> 'approved'
    or revision_row.revision_status <> 'approved' then
    raise exception 'This payment link is not eligible for checkout.' using errcode = '42501';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = revision_row.estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if estimate_row.estimate_status <> 'approved' then
    raise exception 'Only approved estimates can be paid from this link.' using errcode = '42501';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = estimate_row.service_request_id;

  if not found or request_row.company_id is null or request_row.company_id <> revision_row.company_id then
    raise exception 'Payment target is not available.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 301));

  select *
  into invoice_row
  from public.service_request_invoices invoice
  where invoice.estimate_id = estimate_row.id
    and invoice.invoice_status <> 'void'
  order by invoice.created_at desc
  limit 1
  for update;

  if normalized_target_type = 'estimate' then
    if found then
      raise exception 'This Estimate now has an Invoice. Pay the Invoice balance instead.'
        using errcode = '23514';
    end if;

    if normalized_checkout_kind not in ('deposit', 'pay_in_full') then
      raise exception 'That payment action is not available for this Estimate.'
        using errcode = '23514';
    end if;

    target_id := estimate_row.id;
    target_total := estimate_row.total;

    select coalesce(sum(allocation.allocation_amount), 0)
    into paid_amount
    from public.service_request_payment_allocations allocation
    where allocation.estimate_id = estimate_row.id
      and allocation.allocation_status = 'active';

    reserved_amount := public.active_payment_checkout_reserved_amount('estimate', estimate_row.id);
    remaining_amount := greatest(target_total - paid_amount - reserved_amount, 0);

    if remaining_amount <= 0 then
      raise exception 'This Estimate is already paid.' using errcode = '23514';
    end if;

    payment_options := public.get_public_estimate_payment_options_rpc(p_token);

    for action_row in
      select value
      from jsonb_array_elements(coalesce(payment_options -> 'actions', '[]'::jsonb))
    loop
      if payment_options ->> 'target_type' = 'estimate'
        and action_row ->> 'kind' = normalized_checkout_kind then
        eligible_amount := (action_row ->> 'max_amount')::numeric;
      end if;
    end loop;
  elsif normalized_target_type = 'invoice' then
    if invoice_row.id is null then
      raise exception 'Invoice was not found for this payment link.' using errcode = 'P0002';
    end if;

    if normalized_checkout_kind <> 'balance_due' then
      raise exception 'Only Invoice balance payments are available for this link.'
        using errcode = '23514';
    end if;

    target_id := invoice_row.id;
    target_total := invoice_row.total;

    select coalesce(sum(allocation.allocation_amount), 0)
    into paid_amount
    from public.service_request_payment_allocations allocation
    where allocation.invoice_id = invoice_row.id
      and allocation.allocation_status = 'active';

    reserved_amount := public.active_payment_checkout_reserved_amount('invoice', invoice_row.id);
    remaining_amount := greatest(target_total - paid_amount - reserved_amount, 0);

    if remaining_amount <= 0 then
      raise exception 'This Invoice is already paid.' using errcode = '23514';
    end if;

    payment_options := public.get_public_estimate_payment_options_rpc(p_token);

    for action_row in
      select value
      from jsonb_array_elements(coalesce(payment_options -> 'actions', '[]'::jsonb))
    loop
      if payment_options ->> 'target_type' = 'invoice'
        and action_row ->> 'kind' = normalized_checkout_kind then
        eligible_amount := (action_row ->> 'max_amount')::numeric;
      end if;
    end loop;
  else
    raise exception 'Choose an Estimate or Invoice payment target.' using errcode = '22023';
  end if;

  select *
  into existing_attempt
  from public.service_request_payment_checkout_attempts attempt
  where attempt.company_id = request_row.company_id
    and attempt.provider = 'stripe'
    and attempt.idempotency_key = clean_idempotency_key;

  if found then
    if existing_attempt.service_request_id is distinct from request_row.id
      or existing_attempt.target_type is distinct from normalized_target_type
      or existing_attempt.estimate_id is distinct from (case when normalized_target_type = 'estimate' then target_id else null end)
      or existing_attempt.invoice_id is distinct from (case when normalized_target_type = 'invoice' then target_id else null end)
      or existing_attempt.checkout_kind is distinct from normalized_checkout_kind
      or (
        eligible_amount is not null
        and round(existing_attempt.amount, 2) is distinct from round(eligible_amount, 2)
      )
      or existing_attempt.currency is distinct from 'usd'
      or existing_attempt.request_fingerprint is distinct from clean_fingerprint then
      raise exception 'This idempotency key was already used for a different checkout request.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'checkout_attempt', to_jsonb(existing_attempt)
    );
  end if;

  if eligible_amount is null or eligible_amount <= 0 then
    raise exception 'That payment action is not available for this link.'
      using errcode = '23514';
  end if;

  insert into public.service_request_payment_checkout_attempts (
    company_id,
    service_request_id,
    estimate_id,
    invoice_id,
    estimate_revision_id,
    target_type,
    checkout_kind,
    provider,
    idempotency_key,
    request_fingerprint,
    currency,
    amount,
    checkout_metadata
  )
  values (
    request_row.company_id,
    request_row.id,
    case when normalized_target_type = 'estimate' then target_id else null end,
    case when normalized_target_type = 'invoice' then target_id else null end,
    revision_row.id,
    normalized_target_type,
    normalized_checkout_kind,
    'stripe',
    clean_idempotency_key,
    clean_fingerprint,
    'usd',
    eligible_amount,
    jsonb_build_object(
      'payment_lifecycle', 'STRIPE-03',
      'public_customer_token', true,
      'estimate_revision_id', revision_row.id,
      'amount', eligible_amount
    )
  )
  returning * into checkout_attempt;

  return jsonb_build_object(
    'idempotent', false,
    'checkout_attempt', to_jsonb(checkout_attempt)
  );
end;
$$;

comment on function public.reserve_public_estimate_payment_checkout_rpc(text, text, text, text, text) is
  'STRIPE-03. Token-aware customer checkout reservation for approved Estimate links and linked Invoice balances.';

revoke all on function public.reserve_public_estimate_payment_checkout_rpc(text, text, text, text, text) from public;
grant execute on function public.reserve_public_estimate_payment_checkout_rpc(text, text, text, text, text) to anon, authenticated;
