-- STRIPE-PROD-04: Public Invoice Checkout token authorization repair.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Restore token-scoped public Invoice Checkout authorization after Finance V2
--   alignment while preserving job-level paid credit and reservation math.
--
-- Safety:
--   - Does not weaken dashboard authorization.
--   - Does not expose arbitrary Invoice IDs to anon callers.
--   - Does not rewrite payments, allocations, invoices, or delivery tokens.
--   - Keeps reservation idempotency and same-Job advisory locking.

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
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
  normalized_checkout_kind text := lower(btrim(coalesce(p_checkout_kind, '')));
  clean_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  clean_fingerprint text := lower(btrim(coalesce(p_request_fingerprint, '')));
  token_row public.service_request_invoice_delivery_tokens;
  invoice_row public.service_request_invoices;
  request_row public.service_requests;
  customer_row public.customers;
  existing_attempt public.service_request_payment_checkout_attempts;
  checkout_attempt public.service_request_payment_checkout_attempts;
  paid_credit numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  balance_due numeric(10, 2) := 0;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Payment link is invalid.' using errcode = '22023';
  end if;

  if normalized_target_type <> 'invoice' or normalized_checkout_kind <> 'balance_due' then
    raise exception 'Only Invoice balance payments are available for this link.'
      using errcode = '23514';
  end if;

  if clean_idempotency_key is null or length(clean_idempotency_key) < 12 then
    raise exception 'A valid checkout idempotency key is required.' using errcode = '22023';
  end if;

  if clean_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid request fingerprint is required.' using errcode = '22023';
  end if;

  clean_token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into token_row
  from public.service_request_invoice_delivery_tokens invoice_token
  where invoice_token.token_hash = clean_token_hash
  for update;

  if not found then
    raise exception 'Payment link was not found.' using errcode = 'P0002';
  end if;

  if token_row.token_revoked_at is not null or token_row.token_expires_at <= now() then
    raise exception 'This payment link is not eligible for checkout.' using errcode = '42501';
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = token_row.invoice_id
  for update;

  if not found then
    raise exception 'Invoice was not found.' using errcode = 'P0002';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = token_row.service_request_id
    and id = invoice_row.service_request_id
    and company_id = token_row.company_id;

  if not found or request_row.company_id is null then
    raise exception 'Payment target is not available.' using errcode = '23514';
  end if;

  if request_row.customer_id is null then
    raise exception 'Payment target customer is not available.' using errcode = '23514';
  end if;

  select *
  into customer_row
  from public.customers
  where id = request_row.customer_id
    and company_id = request_row.company_id;

  if not found then
    raise exception 'Payment target customer is not available.' using errcode = '23514';
  end if;

  if invoice_row.invoice_status = 'void'
    or coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then
    raise exception 'This payment link is not eligible for checkout.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 301));

  paid_credit := public.active_service_request_paid_credit(request_row.id);
  reserved_amount := public.active_service_request_checkout_reserved_amount(request_row.id);
  balance_due := greatest(invoice_row.total - paid_credit - reserved_amount, 0);

  if balance_due <= 0 then
    if invoice_row.total - paid_credit <= 0 then
      raise exception 'This Invoice is already paid.' using errcode = '23514';
    end if;

    raise exception 'Payment checkout already in progress.' using errcode = '23514';
  end if;

  select *
  into existing_attempt
  from public.service_request_payment_checkout_attempts attempt
  where attempt.company_id = request_row.company_id
    and attempt.provider = 'stripe'
    and attempt.idempotency_key = clean_idempotency_key;

  if found then
    if existing_attempt.service_request_id is distinct from request_row.id
      or existing_attempt.target_type is distinct from 'invoice'
      or existing_attempt.invoice_id is distinct from invoice_row.id
      or existing_attempt.checkout_kind is distinct from 'balance_due'
      or round(existing_attempt.amount, 2) is distinct from round(balance_due, 2)
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
    null,
    invoice_row.id,
    null,
    'invoice',
    'balance_due',
    'stripe',
    clean_idempotency_key,
    clean_fingerprint,
    'usd',
    balance_due,
    jsonb_build_object(
      'payment_lifecycle', 'STRIPE-PROD-04',
      'public_invoice_token', true,
      'invoice_token_id', token_row.id,
      'customer_id', customer_row.id,
      'finance_v2_job_paid_credit', paid_credit,
      'finance_v2_active_reservations', reserved_amount,
      'amount', balance_due
    )
  )
  returning * into checkout_attempt;

  return jsonb_build_object(
    'idempotent', false,
    'checkout_attempt', to_jsonb(checkout_attempt)
  );
end;
$$;

revoke all on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) from public;
grant execute on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) to anon, authenticated;

comment on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) is
  'STRIPE-PROD-04. Token-scoped public Invoice Checkout reservation using Finance V2 job-level paid credit without dashboard auth checks.';
