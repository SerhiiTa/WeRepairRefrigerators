-- FINANCE-V2-41: Technician custom deposit Stripe Checkout.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Allow authenticated dashboard users to reserve an exact custom deposit amount
--   for Stripe Checkout, bounded by the current Finance V2 collectible balance.
--
-- Safety:
--   - Reuses the canonical checkout attempt table and Payment Ledger.
--   - Keeps public customer Checkout unchanged.
--   - Preserves advisory locking, idempotency, tenant checks, and Finance V2
--     eligibility checks.

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
  max_collectible_amount numeric(10, 2) := null;
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

    if normalized_checkout_kind = 'custom_deposit'
      and (
        (normalized_target_type = 'estimate' and action_row ->> 'kind' = 'pay_in_full')
        or (normalized_target_type = 'invoice' and action_row ->> 'kind' = 'balance_due')
      ) then
      max_collectible_amount := (action_row ->> 'max_amount')::numeric;
    end if;
  end loop;

  if normalized_checkout_kind = 'custom_deposit' then
    if max_collectible_amount is null or max_collectible_amount <= 0 then
      raise exception 'That payment action is not available for this target.' using errcode = '23514';
    end if;

    if round(p_amount, 2) > round(max_collectible_amount, 2) then
      raise exception 'Custom deposit exceeds the current collectible balance.'
        using errcode = '23514';
    end if;
  else
    if eligible_amount is null then
      raise exception 'That payment action is not available for this target.' using errcode = '23514';
    end if;

    if round(p_amount, 2) is distinct from round(eligible_amount, 2) then
      raise exception 'Payment amount must match the current eligible balance.'
        using errcode = '23514';
    end if;
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
    jsonb_build_object(
      'payment_lifecycle', 'FINANCE-V2-41',
      'eligibility', eligibility,
      'custom_deposit_authorized', normalized_checkout_kind = 'custom_deposit',
      'custom_deposit_max_collectible', max_collectible_amount
    )
  )
  returning * into checkout_attempt;

  return jsonb_build_object('idempotent', false, 'checkout_attempt', to_jsonb(checkout_attempt), 'eligibility', eligibility);
end;
$$;

comment on function public.reserve_service_request_payment_checkout_rpc(text, uuid, text, numeric, text, text, text, uuid) is
  'Reserves authenticated dashboard Stripe Checkout attempts, including Finance V2 custom deposits bounded by current collectible balance.';
