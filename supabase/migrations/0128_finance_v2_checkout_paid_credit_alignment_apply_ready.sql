-- FINANCE-V2-02: Align Stripe Checkout with Finance V2 job-level paid credit.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Make dashboard Checkout, public Estimate Checkout, public Invoice Checkout,
--   and atomic Stripe posting use the same balance rule as Finance V2:
--   current approved billing scope total minus valid Job-level paid credit.
--
-- Safety:
--   - Reuses service_request_payments and service_request_payment_allocations.
--   - Does not move or rewrite historical allocations.
--   - Preserves original payment-to-document audit references.
--   - Reservations remain target-specific but availability is Job-scoped.

create or replace function public.active_service_request_checkout_reserved_amount(
  p_service_request_id uuid
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(attempt.amount), 0)::numeric(10, 2)
  from public.service_request_payment_checkout_attempts attempt
  where attempt.service_request_id = p_service_request_id
    and attempt.checkout_status in ('initiated', 'processing')
    and attempt.reserved_until > now();
$$;

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

    paid_credit := public.active_service_request_paid_credit(estimate_row.service_request_id);
    reserved_amount := public.active_service_request_checkout_reserved_amount(estimate_row.service_request_id);
    target_total := estimate_row.total;
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
      deposit_target := least(estimate_row.deposit_value, target_total);
    elsif estimate_row.deposit_type = 'percent' then
      deposit_target := least(round(target_total * estimate_row.deposit_value / 100, 2), target_total);
    end if;

    deposit_due := greatest(deposit_target - paid_credit - reserved_amount, 0);

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
    target_total := invoice_row.total;
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
  options jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'blocked', 'target_type', null, 'actions', '[]'::jsonb, 'reasons', jsonb_build_array('invalid_token'));
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into revision_row
  from public.service_request_estimate_revisions
  where public_approval_token_hash = token_hash;

  if not found then
    return jsonb_build_object('status', 'blocked', 'target_type', null, 'actions', '[]'::jsonb, 'reasons', jsonb_build_array('not_found'));
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = revision_row.estimate_id;

  if not found then
    return jsonb_build_object('status', 'blocked', 'target_type', null, 'actions', '[]'::jsonb, 'reasons', jsonb_build_array('estimate_not_found'));
  end if;

  select *
  into request_row
  from public.service_requests
  where id = estimate_row.service_request_id;

  if not found or request_row.company_id is null or request_row.company_id <> revision_row.company_id then
    return jsonb_build_object('status', 'blocked', 'target_type', null, 'actions', '[]'::jsonb, 'reasons', jsonb_build_array('target_unavailable'));
  end if;

  if revision_row.token_revoked_at is not null then
    return jsonb_build_object('status', 'blocked', 'target_type', 'estimate', 'estimate_number', estimate_row.estimate_number, 'actions', '[]'::jsonb, 'reasons', jsonb_build_array('token_revoked'));
  end if;

  if revision_row.token_expires_at <= now() then
    return jsonb_build_object('status', 'blocked', 'target_type', 'estimate', 'estimate_number', estimate_row.estimate_number, 'actions', '[]'::jsonb, 'reasons', jsonb_build_array('token_expired'));
  end if;

  if revision_row.customer_decision <> 'approved'
    or revision_row.revision_status <> 'approved'
    or estimate_row.estimate_status <> 'approved'
    or coalesce(estimate_row.revision_status, 'current') <> 'current' then
    return jsonb_build_object('status', 'blocked', 'target_type', 'estimate', 'estimate_number', estimate_row.estimate_number, 'actions', '[]'::jsonb, 'reasons', jsonb_build_array('estimate_not_current'));
  end if;

  select *
  into invoice_row
  from public.service_request_invoices invoice
  where invoice.logical_estimate_id = coalesce(estimate_row.logical_estimate_id, estimate_row.id)
    and invoice.invoice_status <> 'void'
    and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
  order by invoice.invoice_version desc nulls last, invoice.created_at desc
  limit 1;

  if found then
    options := public.get_service_request_payment_eligibility_rpc('invoice', invoice_row.id, revision_row.id);
    return options || jsonb_build_object(
      'invoice_number', invoice_row.invoice_number,
      'total', invoice_row.total,
      'balance_due', options -> 'remaining_balance'
    );
  end if;

  options := public.get_service_request_payment_eligibility_rpc('estimate', estimate_row.id, revision_row.id);
  return options || jsonb_build_object(
    'estimate_number', estimate_row.estimate_number,
    'total', estimate_row.total,
    'balance_due', options -> 'remaining_balance'
  );
end;
$$;

create or replace function public.reserve_service_request_payment_checkout_rpc(
  p_target_type text,
  p_target_id uuid,
  p_checkout_kind text,
  p_amount numeric,
  p_currency text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_revision_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
  normalized_checkout_kind text := lower(btrim(coalesce(p_checkout_kind, '')));
  normalized_currency text := lower(btrim(coalesce(p_currency, 'usd')));
  clean_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  clean_fingerprint text := lower(btrim(coalesce(p_request_fingerprint, '')));
  eligibility jsonb;
  request_row public.service_requests;
  estimate_row public.service_request_estimates;
  invoice_row public.service_request_invoices;
  existing_attempt public.service_request_payment_checkout_attempts;
  checkout_attempt public.service_request_payment_checkout_attempts;
  action_row jsonb;
  eligible_amount numeric(10, 2) := null;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if clean_idempotency_key is null or length(clean_idempotency_key) < 12 then
    raise exception 'A valid idempotency key is required.' using errcode = '22023';
  end if;

  if clean_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid request fingerprint is required.' using errcode = '22023';
  end if;

  if normalized_currency <> 'usd' then
    raise exception 'Only USD payments are supported.' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then
    raise exception 'Enter a valid payment amount.' using errcode = '22023';
  end if;

  if normalized_target_type = 'estimate' then
    select * into estimate_row from public.service_request_estimates where id = p_target_id for update;
    if not found then raise exception 'Estimate was not found.' using errcode = 'P0002'; end if;
    perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 301));
    select * into request_row from public.service_requests where id = estimate_row.service_request_id;
  elsif normalized_target_type = 'invoice' then
    select * into invoice_row from public.service_request_invoices where id = p_target_id for update;
    if not found then raise exception 'Invoice was not found.' using errcode = 'P0002'; end if;
    perform pg_advisory_xact_lock(hashtextextended(invoice_row.service_request_id::text, 301));
    select * into request_row from public.service_requests where id = invoice_row.service_request_id;
  else
    raise exception 'Choose an Estimate or Invoice payment target.' using errcode = '22023';
  end if;

  if request_row.id is null or request_row.company_id is null then
    raise exception 'Payment target requires a company-scoped Job.' using errcode = '23514';
  end if;

  if not public.can_view_service_request(request_row.id) then
    raise exception 'Payment target is not accessible for this account.' using errcode = '42501';
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
      or existing_attempt.estimate_id is distinct from (case when normalized_target_type = 'estimate' then p_target_id else null end)
      or existing_attempt.invoice_id is distinct from (case when normalized_target_type = 'invoice' then p_target_id else null end)
      or existing_attempt.checkout_kind is distinct from normalized_checkout_kind
      or round(existing_attempt.amount, 2) is distinct from round(p_amount, 2)
      or existing_attempt.currency is distinct from normalized_currency
      or existing_attempt.request_fingerprint is distinct from clean_fingerprint then
      raise exception 'This idempotency key was already used for a different checkout request.'
        using errcode = '23505';
    end if;

    return jsonb_build_object('idempotent', true, 'checkout_attempt', to_jsonb(existing_attempt));
  end if;

  eligibility := public.get_service_request_payment_eligibility_rpc(normalized_target_type, p_target_id, p_revision_id);

  if eligibility ->> 'status' <> 'eligible' then
    raise exception 'This payment target is not eligible for checkout.' using errcode = '23514';
  end if;

  for action_row in select value from jsonb_array_elements(eligibility -> 'actions') loop
    if action_row ->> 'kind' = normalized_checkout_kind then
      eligible_amount := (action_row ->> 'max_amount')::numeric;
    end if;
  end loop;

  if eligible_amount is null then
    raise exception 'That payment action is not available for this target.' using errcode = '23514';
  end if;

  if round(p_amount, 2) is distinct from round(eligible_amount, 2) then
    raise exception 'Payment amount must match the current eligible balance.'
      using errcode = '23514';
  end if;

  insert into public.service_request_payment_checkout_attempts (
    company_id, service_request_id, estimate_id, invoice_id, estimate_revision_id,
    target_type, checkout_kind, provider, idempotency_key, request_fingerprint,
    currency, amount, created_by_profile_id, checkout_metadata
  )
  values (
    request_row.company_id, request_row.id,
    case when normalized_target_type = 'estimate' then p_target_id else null end,
    case when normalized_target_type = 'invoice' then p_target_id else null end,
    p_revision_id, normalized_target_type, normalized_checkout_kind, 'stripe',
    clean_idempotency_key, clean_fingerprint, normalized_currency, p_amount, auth.uid(),
    jsonb_build_object('payment_lifecycle', 'FINANCE-V2-02', 'eligibility', eligibility)
  )
  returning * into checkout_attempt;

  return jsonb_build_object('idempotent', false, 'checkout_attempt', to_jsonb(checkout_attempt), 'eligibility', eligibility);
end;
$$;

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
  payment_options jsonb;
  action_row jsonb;
  eligible_amount numeric(10, 2) := null;
  target_id uuid;
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
  normalized_checkout_kind text := lower(btrim(coalesce(p_checkout_kind, '')));
  token_hash text;
  revision_row public.service_request_estimate_revisions;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Payment link is invalid.' using errcode = '22023';
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);
  select * into revision_row from public.service_request_estimate_revisions where public_approval_token_hash = token_hash for update;
  if not found then raise exception 'Payment link was not found.' using errcode = 'P0002'; end if;

  payment_options := public.get_public_estimate_payment_options_rpc(p_token);
  if payment_options ->> 'status' <> 'eligible'
    or payment_options ->> 'target_type' is distinct from normalized_target_type then
    raise exception 'This payment link is not eligible for checkout.' using errcode = '42501';
  end if;

  target_id := (payment_options ->> 'target_id')::uuid;

  for action_row in select value from jsonb_array_elements(coalesce(payment_options -> 'actions', '[]'::jsonb)) loop
    if action_row ->> 'kind' = normalized_checkout_kind then
      eligible_amount := (action_row ->> 'max_amount')::numeric;
    end if;
  end loop;

  if eligible_amount is null or eligible_amount <= 0 then
    raise exception 'That payment action is not available for this link.' using errcode = '23514';
  end if;

  return public.reserve_service_request_payment_checkout_rpc(
    normalized_target_type,
    target_id,
    normalized_checkout_kind,
    eligible_amount,
    'usd',
    p_idempotency_key,
    p_request_fingerprint,
    revision_row.id
  );
end;
$$;

create or replace function public.get_public_invoice_by_token_rpc(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_token_hash text;
  token_row public.service_request_invoice_delivery_tokens;
  invoice_row public.service_request_invoices;
  request_row public.service_requests;
  company_row public.companies;
  paid_credit numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  actual_balance_due numeric(10, 2) := 0;
  available_checkout_amount numeric(10, 2) := 0;
  invoice_items jsonb := '[]'::jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('link_state', 'invalid');
  end if;

  clean_token_hash := public.estimate_approval_token_hash(p_token);
  select * into token_row from public.service_request_invoice_delivery_tokens invoice_token where invoice_token.token_hash = clean_token_hash;
  if not found then return jsonb_build_object('link_state', 'not_found'); end if;

  select * into invoice_row from public.service_request_invoices where id = token_row.invoice_id;
  if not found then return jsonb_build_object('link_state', 'unavailable'); end if;

  select * into request_row from public.service_requests where id = token_row.service_request_id and id = invoice_row.service_request_id and company_id = token_row.company_id;
  if not found then return jsonb_build_object('link_state', 'unavailable'); end if;

  select * into company_row from public.companies where id = token_row.company_id;

  paid_credit := public.active_service_request_paid_credit(request_row.id);
  reserved_amount := public.active_service_request_checkout_reserved_amount(request_row.id);
  actual_balance_due := greatest(invoice_row.total - paid_credit, 0);
  available_checkout_amount := greatest(actual_balance_due - reserved_amount, 0);

  select coalesce(
    jsonb_agg(jsonb_build_object('id', item.id, 'title', item.item_title, 'quantity', item.quantity, 'unit_price', item.unit_price, 'line_total', item.line_total, 'notes', item.notes) order by item.created_at, item.id),
    '[]'::jsonb
  )
  into invoice_items
  from public.service_request_invoice_items item
  where item.invoice_id = invoice_row.id;

  return jsonb_build_object(
    'link_state', case
      when token_row.token_revoked_at is not null then 'revoked'
      when token_row.token_expires_at <= now() then 'expired'
      when invoice_row.invoice_status = 'void' then 'void'
      when coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then 'superseded'
      else 'active'
    end,
    'company', jsonb_build_object('id', company_row.id, 'name', coalesce(company_row.name, 'HomeFix Appliance Repair')),
    'job', jsonb_build_object('id', request_row.id, 'job_number', request_row.job_number),
    'customer', jsonb_build_object('name', request_row.customer_name, 'email', request_row.customer_email, 'phone', request_row.customer_phone, 'service_address', request_row.full_address),
    'invoice', jsonb_build_object(
      'id', invoice_row.id,
      'invoice_number', invoice_row.invoice_number,
      'invoice_status', invoice_row.invoice_status,
      'source_estimate_id', invoice_row.estimate_id,
      'subtotal', invoice_row.subtotal,
      'tax', coalesce(invoice_row.tax, 0),
      'discount_amount', coalesce(invoice_row.discount_amount, 0),
      'total', invoice_row.total,
      'paid', paid_credit,
      'reserved', reserved_amount,
      'balance_due', actual_balance_due,
      'checkout_available', available_checkout_amount,
      'sent_at', invoice_row.sent_at,
      'created_at', invoice_row.created_at,
      'items', invoice_items
    ),
    'payment', jsonb_build_object(
      'status', case
        when invoice_row.invoice_status = 'void' or coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then 'blocked'
        when actual_balance_due <= 0 then 'paid'
        when token_row.token_revoked_at is not null or token_row.token_expires_at <= now() then 'blocked'
        when available_checkout_amount <= 0 then 'blocked'
        else 'eligible'
      end,
      'target_type', 'invoice',
      'checkout_kind', 'balance_due',
      'amount', available_checkout_amount,
      'balance_due', actual_balance_due,
      'reserved', reserved_amount,
      'reasons', case
        when actual_balance_due > 0 and available_checkout_amount <= 0 then jsonb_build_array('checkout_in_progress')
        else '[]'::jsonb
      end
    )
  );
end;
$$;

create or replace function public.reserve_public_invoice_payment_checkout_rpc(
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
  clean_token_hash text;
  token_row public.service_request_invoice_delivery_tokens;
  invoice_row public.service_request_invoices;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Payment link is invalid.' using errcode = '22023';
  end if;

  if lower(btrim(coalesce(p_target_type, ''))) <> 'invoice'
    or lower(btrim(coalesce(p_checkout_kind, ''))) <> 'balance_due' then
    raise exception 'Only Invoice balance payments are available for this link.' using errcode = '23514';
  end if;

  clean_token_hash := public.estimate_approval_token_hash(p_token);
  select * into token_row from public.service_request_invoice_delivery_tokens where token_hash = clean_token_hash for update;
  if not found then raise exception 'Payment link was not found.' using errcode = 'P0002'; end if;

  if token_row.token_revoked_at is not null or token_row.token_expires_at <= now() then
    raise exception 'This payment link is not eligible for checkout.' using errcode = '42501';
  end if;

  select * into invoice_row from public.service_request_invoices where id = token_row.invoice_id for update;
  if not found then raise exception 'Invoice was not found.' using errcode = 'P0002'; end if;

  return public.reserve_service_request_payment_checkout_rpc(
    'invoice',
    invoice_row.id,
    'balance_due',
    ((public.get_service_request_payment_eligibility_rpc('invoice', invoice_row.id) -> 'actions' -> 0 ->> 'max_amount')::numeric),
    'usd',
    p_idempotency_key,
    p_request_fingerprint,
    null
  );
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
  target_invoice_id uuid := null;
  target_estimate_id uuid := null;
  allocation_source text := 'provider_webhook';
  allocation_amount numeric(10, 2);
  paid_credit numeric(10, 2) := 0;
  target_total numeric(10, 2) := 0;
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

  if attempt_row.target_type = 'estimate' then
    select * into estimate_row from public.service_request_estimates where id = attempt_row.estimate_id for update;
    if not found then raise exception 'Reserved Estimate was not found.' using errcode = 'P0002'; end if;
    if estimate_row.estimate_status <> 'approved' or coalesce(estimate_row.revision_status, 'current') <> 'current' then
      raise exception 'Cannot post payment to a stale Estimate revision.' using errcode = '23514';
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
      target_total := current_invoice_row.total;
      allocation_source := 'provider_webhook';
    else
      target_estimate_id := estimate_row.id;
      target_total := estimate_row.total;
      allocation_source := 'estimate_deposit';
    end if;
  elsif attempt_row.target_type = 'invoice' then
    select * into invoice_row from public.service_request_invoices where id = attempt_row.invoice_id for update;
    if not found then raise exception 'Reserved Invoice was not found.' using errcode = 'P0002'; end if;
    if invoice_row.invoice_status = 'void' or coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then
      raise exception 'Cannot post payment to a stale or void Invoice.' using errcode = '23514';
    end if;
    target_invoice_id := invoice_row.id;
    target_total := invoice_row.total;
    allocation_source := 'provider_webhook';
  else
    raise exception 'Unsupported checkout target type.' using errcode = '22023';
  end if;

  paid_credit := public.active_service_request_paid_credit(attempt_row.service_request_id);
  available_amount := greatest(target_total - paid_credit, 0);

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

revoke all on function public.active_service_request_checkout_reserved_amount(uuid) from public;
grant execute on function public.active_service_request_checkout_reserved_amount(uuid) to authenticated, service_role;

revoke all on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) from public;
revoke all on function public.reserve_service_request_payment_checkout_rpc(text, uuid, text, numeric, text, text, text, uuid) from public;
revoke all on function public.get_public_estimate_payment_options_rpc(text) from public;
revoke all on function public.reserve_public_estimate_payment_checkout_rpc(text, text, text, text, text) from public;
revoke all on function public.get_public_invoice_by_token_rpc(text) from public;
revoke all on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) from public;

grant execute on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) to authenticated;
grant execute on function public.reserve_service_request_payment_checkout_rpc(text, uuid, text, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.get_public_estimate_payment_options_rpc(text) to anon, authenticated;
grant execute on function public.reserve_public_estimate_payment_checkout_rpc(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_public_invoice_by_token_rpc(text) to anon, authenticated;
grant execute on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) to anon, authenticated;

comment on function public.active_service_request_checkout_reserved_amount(uuid) is
  'FINANCE-V2-02. Active Stripe Checkout reservation amount for one Job, used with job-level paid credit to prevent overcollection across revised Estimate and Invoice versions.';
