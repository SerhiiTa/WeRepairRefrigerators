-- PAYMENT-LIFECYCLE-01: Payment eligibility, checkout reservations and Stripe webhook readiness.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Add the minimum database foundation required for future Stripe Checkout
--   initiation and webhook accounting while preserving the Finance V1 canonical
--   service_request_payments and service_request_payment_allocations ledger.
--
-- Safety:
--   - This migration is NOT applied automatically by Codex.
--   - Does not create Stripe charges or provider calls.
--   - Does not rewrite existing Payments or Allocations.
--   - Existing manual payment and Invoice conversion RPCs remain authoritative
--     for posted ledger entries until STRIPE-01 implements provider posting.

create extension if not exists pgcrypto with schema extensions;

alter table public.service_request_estimates
  add column if not exists deposit_type text,
  add column if not exists deposit_value numeric(10, 2);

alter table public.service_request_estimates
  drop constraint if exists service_request_estimates_deposit_type_check,
  add constraint service_request_estimates_deposit_type_check
    check (deposit_type is null or deposit_type in ('fixed', 'percent')),
  drop constraint if exists service_request_estimates_deposit_value_check,
  add constraint service_request_estimates_deposit_value_check
    check (
      deposit_value is null
      or (
        deposit_type = 'fixed'
        and deposit_value >= 0
        and deposit_value <= 100000
      )
      or (
        deposit_type = 'percent'
        and deposit_value >= 0
        and deposit_value <= 100
      )
    ),
  drop constraint if exists service_request_estimates_deposit_pair_check,
  add constraint service_request_estimates_deposit_pair_check
    check (
      (deposit_type is null and deposit_value is null)
      or (deposit_type is not null and deposit_value is not null)
    );

comment on column public.service_request_estimates.deposit_type is
  'PAYMENT-LIFECYCLE-01. Optional deposit rule for customer payment eligibility: fixed or percent.';
comment on column public.service_request_estimates.deposit_value is
  'PAYMENT-LIFECYCLE-01. Fixed dollar deposit or percentage value, depending on deposit_type.';

create table if not exists public.service_request_payment_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id)
    on delete restrict,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  estimate_id uuid
    references public.service_request_estimates(id)
    on delete restrict,
  invoice_id uuid
    references public.service_request_invoices(id)
    on delete restrict,
  estimate_revision_id uuid
    references public.service_request_estimate_revisions(id)
    on delete set null,
  target_type text not null,
  checkout_kind text not null,
  checkout_status text not null default 'initiated',
  provider text not null default 'stripe',
  provider_checkout_session_id text,
  provider_payment_intent_id text,
  idempotency_key text not null,
  request_fingerprint text not null,
  currency text not null default 'usd',
  amount numeric(10, 2) not null,
  reserved_until timestamptz not null default (now() + interval '30 minutes'),
  succeeded_payment_id uuid
    references public.service_request_payments(id)
    on delete set null,
  failure_reason text,
  created_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  checkout_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_request_payment_checkout_attempts_target_check
    check (
      (target_type = 'estimate' and estimate_id is not null and invoice_id is null)
      or (target_type = 'invoice' and invoice_id is not null and estimate_id is null)
    ),
  constraint service_request_payment_checkout_attempts_kind_check
    check (checkout_kind in ('deposit', 'pay_in_full', 'balance_due')),
  constraint service_request_payment_checkout_attempts_status_check
    check (checkout_status in (
      'initiated',
      'processing',
      'succeeded',
      'failed',
      'expired',
      'canceled'
    )),
  constraint service_request_payment_checkout_attempts_amount_check
    check (amount > 0 and amount <= 100000),
  constraint service_request_payment_checkout_attempts_currency_check
    check (currency = lower(currency) and currency ~ '^[a-z]{3}$'),
  constraint service_request_payment_checkout_attempts_idempotency_key_check
    check (length(btrim(idempotency_key)) between 12 and 160),
  constraint service_request_payment_checkout_attempts_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

comment on table public.service_request_payment_checkout_attempts is
  'PAYMENT-LIFECYCLE-01. Provider checkout initiation and reservation records. They reserve eligibility but do not replace the canonical Payment Ledger.';

create unique index if not exists service_request_payment_checkout_attempts_idempotency_uidx
  on public.service_request_payment_checkout_attempts (company_id, provider, idempotency_key);

create unique index if not exists service_request_payment_checkout_attempts_provider_session_uidx
  on public.service_request_payment_checkout_attempts (provider, provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create unique index if not exists service_request_payment_checkout_attempts_provider_intent_uidx
  on public.service_request_payment_checkout_attempts (provider, provider_payment_intent_id)
  where provider_payment_intent_id is not null;

create index if not exists service_request_payment_checkout_attempts_active_estimate_idx
  on public.service_request_payment_checkout_attempts (estimate_id, checkout_status, reserved_until)
  where estimate_id is not null;

create index if not exists service_request_payment_checkout_attempts_active_invoice_idx
  on public.service_request_payment_checkout_attempts (invoice_id, checkout_status, reserved_until)
  where invoice_id is not null;

drop trigger if exists set_service_request_payment_checkout_attempts_updated_at
  on public.service_request_payment_checkout_attempts;
create trigger set_service_request_payment_checkout_attempts_updated_at
before update on public.service_request_payment_checkout_attempts
for each row
execute function public.set_updated_at();

create table if not exists public.service_request_payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies(id)
    on delete set null,
  service_request_id uuid
    references public.service_requests(id)
    on delete set null,
  checkout_attempt_id uuid
    references public.service_request_payment_checkout_attempts(id)
    on delete set null,
  payment_id uuid
    references public.service_request_payments(id)
    on delete set null,
  provider text not null default 'stripe',
  provider_event_id text not null,
  provider_event_type text not null,
  processing_status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_digest text,
  failure_reason text,
  event_metadata jsonb not null default '{}'::jsonb,

  constraint service_request_payment_provider_events_status_check
    check (processing_status in ('received', 'processed', 'ignored_duplicate', 'failed')),
  constraint service_request_payment_provider_events_digest_check
    check (payload_digest is null or payload_digest ~ '^[0-9a-f]{64}$')
);

comment on table public.service_request_payment_provider_events is
  'PAYMENT-LIFECYCLE-01. Provider webhook event ledger for signature-verified deduplication and audit. Successful events post to canonical Payments exactly once in STRIPE-01.';

create unique index if not exists service_request_payment_provider_events_provider_uidx
  on public.service_request_payment_provider_events (provider, provider_event_id);

create index if not exists service_request_payment_provider_events_attempt_idx
  on public.service_request_payment_provider_events (checkout_attempt_id, received_at desc)
  where checkout_attempt_id is not null;

alter table public.service_request_payment_checkout_attempts enable row level security;
alter table public.service_request_payment_provider_events enable row level security;

revoke all on public.service_request_payment_checkout_attempts from public;
revoke all on public.service_request_payment_provider_events from public;

grant select on public.service_request_payment_checkout_attempts to authenticated;
grant select on public.service_request_payment_provider_events to authenticated;

drop policy if exists "service_request_payment_checkout_attempts_dashboard_select"
  on public.service_request_payment_checkout_attempts;
create policy "service_request_payment_checkout_attempts_dashboard_select"
on public.service_request_payment_checkout_attempts
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_payment_provider_events_dashboard_select"
  on public.service_request_payment_provider_events;
create policy "service_request_payment_provider_events_dashboard_select"
on public.service_request_payment_provider_events
for select
to authenticated
using (
  service_request_id is not null
  and public.can_view_service_request(service_request_id)
);

create or replace function public.active_payment_checkout_reserved_amount(
  p_target_type text,
  p_target_id uuid
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(attempt.amount), 0)
  from public.service_request_payment_checkout_attempts attempt
  where attempt.checkout_status in ('initiated', 'processing')
    and attempt.reserved_until > now()
    and (
      (lower(btrim(p_target_type)) = 'estimate' and attempt.estimate_id = p_target_id)
      or (lower(btrim(p_target_type)) = 'invoice' and attempt.invoice_id = p_target_id)
    );
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
  paid_amount numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  target_total numeric(10, 2) := 0;
  remaining_amount numeric(10, 2) := 0;
  deposit_target numeric(10, 2) := 0;
  deposit_due numeric(10, 2) := 0;
  actions jsonb := '[]'::jsonb;
  reason text := null;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

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
    where invoice.estimate_id = estimate_row.id
      and invoice.invoice_status <> 'void'
    order by invoice.created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'target_type', 'estimate',
        'target_id', estimate_row.id,
        'service_request_id', estimate_row.service_request_id,
        'company_id', request_row.company_id,
        'status', 'direct_to_invoice',
        'remaining_balance', greatest(estimate_row.total, 0),
        'paid', 0,
        'reserved', 0,
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
        or revision_row.revision_status <> 'sent'
        or revision_row.token_revoked_at is not null
        or revision_row.customer_decision is not null
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

    if estimate_row.estimate_status <> 'approved' then
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
        'reasons', jsonb_build_array('estimate_' || estimate_row.estimate_status)
      );
    end if;

    select coalesce(sum(allocation.allocation_amount), 0)
    into paid_amount
    from public.service_request_payment_allocations allocation
    where allocation.estimate_id = estimate_row.id
      and allocation.allocation_status = 'active';

    reserved_amount := public.active_payment_checkout_reserved_amount('estimate', estimate_row.id);
    target_total := estimate_row.total;
    remaining_amount := greatest(target_total - paid_amount - reserved_amount, 0);

    if remaining_amount <= 0 then
      return jsonb_build_object(
        'target_type', 'estimate',
        'target_id', estimate_row.id,
        'service_request_id', estimate_row.service_request_id,
        'company_id', request_row.company_id,
        'status', 'paid',
        'remaining_balance', 0,
        'paid', paid_amount,
        'reserved', reserved_amount,
        'invoice_redirect_id', null,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('fully_paid')
      );
    end if;

    if estimate_row.deposit_type = 'fixed' then
      deposit_target := least(estimate_row.deposit_value, target_total);
    elsif estimate_row.deposit_type = 'percent' then
      deposit_target := least(round(target_total * estimate_row.deposit_value / 100, 2), target_total);
    end if;

    deposit_due := greatest(deposit_target - paid_amount - reserved_amount, 0);

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
      'paid', paid_amount,
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

    if invoice_row.invoice_status = 'void' then
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
        'reasons', jsonb_build_array('void_invoice')
      );
    end if;

    select coalesce(sum(allocation.allocation_amount), 0)
    into paid_amount
    from public.service_request_payment_allocations allocation
    where allocation.invoice_id = invoice_row.id
      and allocation.allocation_status = 'active';

    reserved_amount := public.active_payment_checkout_reserved_amount('invoice', invoice_row.id);
    target_total := invoice_row.total;
    remaining_amount := greatest(target_total - paid_amount - reserved_amount, 0);

    if remaining_amount <= 0 then
      return jsonb_build_object(
        'target_type', 'invoice',
        'target_id', invoice_row.id,
        'service_request_id', invoice_row.service_request_id,
        'company_id', request_row.company_id,
        'status', 'paid',
        'remaining_balance', 0,
        'paid', paid_amount,
        'reserved', reserved_amount,
        'invoice_redirect_id', null,
        'actions', '[]'::jsonb,
        'reasons', jsonb_build_array('fully_paid')
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
      'paid', paid_amount,
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
    select *
    into estimate_row
    from public.service_request_estimates
    where id = p_target_id
    for update;

    if not found then
      raise exception 'Estimate was not found.' using errcode = 'P0002';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 301));

    select *
    into request_row
    from public.service_requests
    where id = estimate_row.service_request_id;
  elsif normalized_target_type = 'invoice' then
    select *
    into invoice_row
    from public.service_request_invoices
    where id = p_target_id
    for update;

    if not found then
      raise exception 'Invoice was not found.' using errcode = 'P0002';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(invoice_row.service_request_id::text, 301));

    select *
    into request_row
    from public.service_requests
    where id = invoice_row.service_request_id;
  else
    raise exception 'Choose an Estimate or Invoice payment target.'
      using errcode = '22023';
  end if;

  if request_row.id is null or request_row.company_id is null then
    raise exception 'Payment target requires a company-scoped Job.'
      using errcode = '23514';
  end if;

  if not public.can_view_service_request(request_row.id) then
    raise exception 'Payment target is not accessible for this account.'
      using errcode = '42501';
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

    return jsonb_build_object(
      'idempotent', true,
      'checkout_attempt', to_jsonb(existing_attempt)
    );
  end if;

  eligibility := public.get_service_request_payment_eligibility_rpc(
    normalized_target_type,
    p_target_id,
    p_revision_id
  );

  if eligibility ->> 'status' <> 'eligible' then
    raise exception 'This payment target is not eligible for checkout.'
      using errcode = '23514';
  end if;

  for action_row in
    select value
    from jsonb_array_elements(eligibility -> 'actions')
  loop
    if action_row ->> 'kind' = normalized_checkout_kind then
      eligible_amount := (action_row ->> 'max_amount')::numeric;
    end if;
  end loop;

  if eligible_amount is null then
    raise exception 'That payment action is not available for this target.'
      using errcode = '23514';
  end if;

  if p_amount > eligible_amount then
    raise exception 'Payment amount exceeds the selected eligible balance.'
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
    created_by_profile_id,
    checkout_metadata
  )
  values (
    request_row.company_id,
    request_row.id,
    case when normalized_target_type = 'estimate' then p_target_id else null end,
    case when normalized_target_type = 'invoice' then p_target_id else null end,
    p_revision_id,
    normalized_target_type,
    normalized_checkout_kind,
    'stripe',
    clean_idempotency_key,
    clean_fingerprint,
    normalized_currency,
    p_amount,
    auth.uid(),
    jsonb_build_object(
      'payment_lifecycle', 'PAYMENT-LIFECYCLE-01',
      'eligibility', eligibility
    )
  )
  returning * into checkout_attempt;

  return jsonb_build_object(
    'idempotent', false,
    'checkout_attempt', to_jsonb(checkout_attempt),
    'eligibility', eligibility
  );
exception
  when unique_violation then
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

      return jsonb_build_object(
        'idempotent', true,
        'checkout_attempt', to_jsonb(existing_attempt)
      );
    end if;

    raise;
end;
$$;

comment on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) is
  'PAYMENT-LIFECYCLE-01. Server-side payment eligibility and amount calculation for future Stripe Checkout entry points. Reads canonical allocations and active checkout reservations.';

comment on function public.reserve_service_request_payment_checkout_rpc(text, uuid, text, numeric, text, text, text, uuid) is
  'PAYMENT-LIFECYCLE-01. Atomically reserves an eligible Estimate or Invoice checkout amount using target row locks and strict idempotency. Does not create a canonical Payment.';

revoke all on function public.active_payment_checkout_reserved_amount(text, uuid) from public;
revoke all on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) from public;
revoke all on function public.reserve_service_request_payment_checkout_rpc(text, uuid, text, numeric, text, text, text, uuid) from public;

grant execute on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) to authenticated;
grant execute on function public.reserve_service_request_payment_checkout_rpc(text, uuid, text, numeric, text, text, text, uuid) to authenticated;
