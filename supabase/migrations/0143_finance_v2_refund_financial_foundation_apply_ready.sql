-- FINANCE-V2-REFUND-02: Refund financial foundation.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Add an auditable refund ledger linked to one original canonical payment.
--   Refunds preserve original payment, allocation, and receipt rows. Only
--   succeeded refunds reduce net paid credit; pending refunds reserve
--   refundable capacity to prevent concurrent over-refunds.
--
-- Safety:
--   - Does not call Stripe.
--   - Does not modify webhook processing.
--   - Does not rewrite existing payments, allocations, invoices, estimates, or receipts.
--   - Does not replace existing Finance V2 paid-credit RPCs in this migration.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.service_request_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id)
    on delete restrict,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  payment_id uuid not null
    references public.service_request_payments(id)
    on delete restrict,
  refund_type text not null,
  refund_amount numeric(10, 2) not null,
  refund_status text not null default 'pending',
  refund_reason text not null,
  provider_refund_id text,
  provider_event_id text,
  idempotency_key text not null,
  created_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint service_request_payment_refunds_type_check
    check (refund_type in ('stripe', 'manual')),
  constraint service_request_payment_refunds_status_check
    check (refund_status in ('pending', 'succeeded', 'failed', 'canceled')),
  constraint service_request_payment_refunds_amount_check
    check (refund_amount > 0 and refund_amount <= 100000),
  constraint service_request_payment_refunds_reason_check
    check (length(btrim(refund_reason)) >= 3),
  constraint service_request_payment_refunds_provider_refund_check
    check (provider_refund_id is null or length(btrim(provider_refund_id)) > 0),
  constraint service_request_payment_refunds_provider_event_check
    check (provider_event_id is null or length(btrim(provider_event_id)) > 0),
  constraint service_request_payment_refunds_idempotency_check
    check (length(btrim(idempotency_key)) between 12 and 160)
);

comment on table public.service_request_payment_refunds is
  'FINANCE-V2-REFUND-02. Auditable refund ledger. Each refund belongs to exactly one original canonical payment. Original payment and receipt rows remain immutable.';
comment on column public.service_request_payment_refunds.refund_amount is
  'Gross principal returned to the customer. Only succeeded refunds reduce net paid credit.';
comment on column public.service_request_payment_refunds.metadata is
  'Non-secret refund metadata. Never store Stripe secrets, full card numbers, or bearer receipt URLs.';

create unique index if not exists service_request_payment_refunds_provider_uidx
  on public.service_request_payment_refunds (refund_type, provider_refund_id)
  where provider_refund_id is not null;

create unique index if not exists service_request_payment_refunds_idempotency_uidx
  on public.service_request_payment_refunds (company_id, refund_type, idempotency_key);

create index if not exists service_request_payment_refunds_payment_idx
  on public.service_request_payment_refunds (payment_id, refund_status, created_at desc);

create index if not exists service_request_payment_refunds_request_idx
  on public.service_request_payment_refunds (service_request_id, created_at desc);

create table if not exists public.service_request_payment_refund_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id)
    on delete restrict,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  refund_id uuid not null
    references public.service_request_payment_refunds(id)
    on delete cascade,
  payment_id uuid not null
    references public.service_request_payments(id)
    on delete restrict,
  payment_allocation_id uuid not null
    references public.service_request_payment_allocations(id)
    on delete restrict,
  refund_amount numeric(10, 2) not null,
  refund_allocation_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint service_request_payment_refund_allocations_amount_check
    check (refund_amount > 0 and refund_amount <= 100000),
  constraint service_request_payment_refund_allocations_status_check
    check (refund_allocation_status in ('pending', 'succeeded', 'failed', 'canceled'))
);

comment on table public.service_request_payment_refund_allocations is
  'FINANCE-V2-REFUND-02. Explicit refund attribution to original active payment allocations. Original allocations are not rewritten or deleted.';

create unique index if not exists service_request_payment_refund_allocations_refund_allocation_uidx
  on public.service_request_payment_refund_allocations (refund_id, payment_allocation_id);

create index if not exists service_request_payment_refund_allocations_payment_idx
  on public.service_request_payment_refund_allocations (payment_id, refund_allocation_status);

drop trigger if exists set_service_request_payment_refunds_updated_at
  on public.service_request_payment_refunds;
create trigger set_service_request_payment_refunds_updated_at
before update on public.service_request_payment_refunds
for each row
execute function public.set_updated_at();

drop trigger if exists set_service_request_payment_refund_allocations_updated_at
  on public.service_request_payment_refund_allocations;
create trigger set_service_request_payment_refund_allocations_updated_at
before update on public.service_request_payment_refund_allocations
for each row
execute function public.set_updated_at();

create or replace function public.service_request_payment_refunded_amount(
  p_payment_id uuid,
  p_include_pending boolean default false
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(refund.refund_amount), 0)::numeric(10, 2)
  from public.service_request_payment_refunds refund
  where refund.payment_id = p_payment_id
    and (
      refund.refund_status = 'succeeded'
      or (p_include_pending and refund.refund_status = 'pending')
    );
$$;

create or replace function public.service_request_payment_refundable_amount(
  p_payment_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    public.service_request_payment_principal_amount(p_payment_id)
      - public.service_request_payment_refunded_amount(p_payment_id, true),
    0
  )::numeric(10, 2);
$$;

create or replace function public.active_service_request_net_paid_credit(
  p_service_request_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with paid_allocations as (
    select coalesce(sum(allocation.allocation_amount), 0)::numeric(10, 2) as amount
    from public.service_request_payment_allocations allocation
    join public.service_request_payments payment
      on payment.id = allocation.payment_id
    where allocation.service_request_id = p_service_request_id
      and allocation.allocation_status = 'active'
      and payment.service_request_id = p_service_request_id
      and payment.payment_status in ('paid', 'succeeded', 'imported', 'partially_refunded', 'refunded')
      and payment.voided_at is null
      and coalesce((payment.payment_metadata ->> 'stripe_refund_status'), '') not in ('refunded', 'disputed')
  ),
  succeeded_refunds as (
    select coalesce(sum(refund_allocation.refund_amount), 0)::numeric(10, 2) as amount
    from public.service_request_payment_refund_allocations refund_allocation
    join public.service_request_payment_refunds refund
      on refund.id = refund_allocation.refund_id
    where refund_allocation.service_request_id = p_service_request_id
      and refund_allocation.refund_allocation_status = 'succeeded'
      and refund.refund_status = 'succeeded'
  )
  select greatest(
    (select amount from paid_allocations) - (select amount from succeeded_refunds),
    0
  )::numeric(10, 2);
$$;

create or replace function public.validate_service_request_payment_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.service_request_payments;
  reserved_or_succeeded numeric(10, 2);
  allocation_total numeric(10, 2);
  mismatched_allocation_count integer;
begin
  if tg_op = 'UPDATE' and old.refund_status in ('succeeded', 'failed', 'canceled') then
    if new.refund_status is distinct from old.refund_status
      or new.refund_amount is distinct from old.refund_amount
      or new.payment_id is distinct from old.payment_id
      or new.service_request_id is distinct from old.service_request_id
      or new.company_id is distinct from old.company_id
      or new.refund_type is distinct from old.refund_type
      or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'Terminal refunds are immutable.' using errcode = '23514';
    end if;
  end if;

  select *
  into payment_row
  from public.service_request_payments
  where id = new.payment_id
  for update;

  if not found then
    raise exception 'Original payment was not found.' using errcode = '23503';
  end if;

  if payment_row.company_id is distinct from new.company_id
    or payment_row.service_request_id is distinct from new.service_request_id then
    raise exception 'Refund must belong to the same company and Job as the original payment.'
      using errcode = '23514';
  end if;

  if payment_row.voided_at is not null or payment_row.payment_status = 'void' then
    raise exception 'Voided payments cannot be refunded.' using errcode = '23514';
  end if;

  if public.service_request_payment_principal_amount(payment_row.id) <= 0 then
    raise exception 'Only successful paid principal can be refunded.' using errcode = '23514';
  end if;

  if new.refund_type = 'manual'
    and coalesce(payment_row.provider, '') = 'stripe' then
    raise exception 'Manual refunds cannot be recorded against Stripe payments.'
      using errcode = '23514';
  end if;

  if new.refund_type = 'stripe'
    and coalesce(payment_row.provider, '') <> 'stripe' then
    raise exception 'Stripe refunds require a Stripe payment.' using errcode = '23514';
  end if;

  select coalesce(sum(refund.refund_amount), 0)
  into reserved_or_succeeded
  from public.service_request_payment_refunds refund
  where refund.payment_id = new.payment_id
    and refund.id is distinct from new.id
    and refund.refund_status in ('pending', 'succeeded');

  if reserved_or_succeeded + new.refund_amount > public.service_request_payment_principal_amount(payment_row.id) then
    raise exception 'Refund amount exceeds refundable payment balance.'
      using errcode = '23514';
  end if;

  if new.refund_status in ('succeeded', 'failed', 'canceled') then
    select
      coalesce(sum(allocation.refund_amount), 0),
      count(*) filter (where allocation.refund_allocation_status is distinct from new.refund_status)
    into allocation_total, mismatched_allocation_count
    from public.service_request_payment_refund_allocations allocation
    where allocation.refund_id = new.id;

    if allocation_total is null or allocation_total <= 0 then
      raise exception 'Terminal refunds require allocation adjustments.'
        using errcode = '23514';
    end if;

    if round(allocation_total, 2) <> new.refund_amount then
      raise exception 'Refund allocation adjustments must equal the refund amount.'
        using errcode = '23514';
    end if;

    if mismatched_allocation_count > 0 then
      raise exception 'Refund allocation statuses must match the terminal parent refund status.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_service_request_payment_refund
  on public.service_request_payment_refunds;
create trigger validate_service_request_payment_refund
before insert or update of company_id, service_request_id, payment_id, refund_type, refund_amount, refund_status
on public.service_request_payment_refunds
for each row
execute function public.validate_service_request_payment_refund();

create or replace function public.validate_service_request_payment_refund_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_row public.service_request_payment_refunds;
  allocation_row public.service_request_payment_allocations;
  existing_refunded numeric(10, 2);
begin
  if tg_op = 'UPDATE' and old.refund_allocation_status in ('succeeded', 'failed', 'canceled') then
    if new.refund_allocation_status is distinct from old.refund_allocation_status
      or new.refund_amount is distinct from old.refund_amount
      or new.payment_id is distinct from old.payment_id
      or new.payment_allocation_id is distinct from old.payment_allocation_id
      or new.refund_id is distinct from old.refund_id
      or new.service_request_id is distinct from old.service_request_id
      or new.company_id is distinct from old.company_id then
      raise exception 'Terminal refund allocations are immutable.'
        using errcode = '23514';
    end if;
  end if;

  select *
  into refund_row
  from public.service_request_payment_refunds
  where id = new.refund_id
  for update;

  if not found then
    raise exception 'Refund was not found.' using errcode = '23503';
  end if;

  select *
  into allocation_row
  from public.service_request_payment_allocations
  where id = new.payment_allocation_id
  for update;

  if not found then
    raise exception 'Original payment allocation was not found.' using errcode = '23503';
  end if;

  if refund_row.company_id is distinct from new.company_id
    or refund_row.service_request_id is distinct from new.service_request_id
    or refund_row.payment_id is distinct from new.payment_id then
    raise exception 'Refund allocation must match its refund company, Job, and payment.'
      using errcode = '23514';
  end if;

  if allocation_row.company_id is distinct from new.company_id
    or allocation_row.service_request_id is distinct from new.service_request_id
    or allocation_row.payment_id is distinct from new.payment_id
    or allocation_row.allocation_status <> 'active' then
    raise exception 'Refund allocation must target an active allocation from the original payment.'
      using errcode = '23514';
  end if;

  if refund_row.refund_status = 'pending'
    and new.refund_allocation_status in ('failed', 'canceled', 'succeeded')
    and (tg_op = 'INSERT' or old.refund_allocation_status = 'pending') then
    -- Parent RPCs update child allocation statuses first, then atomically move
    -- the parent refund to the same terminal state.
    null;
  elsif new.refund_allocation_status is distinct from refund_row.refund_status then
    raise exception 'Refund allocation status must match the parent refund status.'
      using errcode = '23514';
  end if;

  select coalesce(sum(prior.refund_amount), 0)
  into existing_refunded
  from public.service_request_payment_refund_allocations prior
  join public.service_request_payment_refunds refund
    on refund.id = prior.refund_id
  where prior.payment_allocation_id = new.payment_allocation_id
    and prior.id is distinct from new.id
    and prior.refund_allocation_status in ('pending', 'succeeded')
    and refund.refund_status in ('pending', 'succeeded');

  if existing_refunded + new.refund_amount > allocation_row.allocation_amount then
    raise exception 'Refund allocation exceeds the original allocation refundable balance.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_service_request_payment_refund_allocation
  on public.service_request_payment_refund_allocations;
create trigger validate_service_request_payment_refund_allocation
before insert or update of company_id, service_request_id, refund_id, payment_id, payment_allocation_id, refund_amount, refund_allocation_status
on public.service_request_payment_refund_allocations
for each row
execute function public.validate_service_request_payment_refund_allocation();

create or replace function public.create_refund_allocation_rows(
  p_refund_id uuid,
  p_allocation_adjustments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_row public.service_request_payment_refunds;
  active_allocation_count integer;
  only_allocation public.service_request_payment_allocations;
  total_adjusted numeric(10, 2) := 0;
  adjustment jsonb;
  adjustment_allocation_id uuid;
  adjustment_amount numeric(10, 2);
begin
  select *
  into refund_row
  from public.service_request_payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund was not found.' using errcode = 'P0002';
  end if;

  select count(*)
  into active_allocation_count
  from public.service_request_payment_allocations allocation
  where allocation.payment_id = refund_row.payment_id
    and allocation.allocation_status = 'active';

  if active_allocation_count <= 0 then
    raise exception 'Refund requires an active original payment allocation.'
      using errcode = '23514';
  end if;

  if p_allocation_adjustments is null then
    if active_allocation_count <> 1 then
      raise exception 'Refund attribution requires explicit allocation adjustments for multi-allocation payments.'
        using errcode = '22023';
    end if;

    select *
    into only_allocation
    from public.service_request_payment_allocations allocation
    where allocation.payment_id = refund_row.payment_id
      and allocation.allocation_status = 'active'
    limit 1;

    insert into public.service_request_payment_refund_allocations (
      company_id, service_request_id, refund_id, payment_id, payment_allocation_id,
      refund_amount, refund_allocation_status
    )
    values (
      refund_row.company_id, refund_row.service_request_id, refund_row.id,
      refund_row.payment_id, only_allocation.id, refund_row.refund_amount,
      refund_row.refund_status
    );
    return;
  end if;

  if jsonb_typeof(p_allocation_adjustments) <> 'array' then
    raise exception 'Refund allocation adjustments must be an array.'
      using errcode = '22023';
  end if;

  for adjustment in
    select value from jsonb_array_elements(p_allocation_adjustments)
  loop
    adjustment_allocation_id := nullif(adjustment ->> 'payment_allocation_id', '')::uuid;
    adjustment_amount := round((adjustment ->> 'refund_amount')::numeric, 2);

    if adjustment_allocation_id is null
      or adjustment_amount is null
      or adjustment_amount <= 0 then
      raise exception 'Each refund allocation adjustment requires a payment_allocation_id and positive refund_amount.'
        using errcode = '22023';
    end if;

    total_adjusted := total_adjusted + adjustment_amount;

    insert into public.service_request_payment_refund_allocations (
      company_id, service_request_id, refund_id, payment_id, payment_allocation_id,
      refund_amount, refund_allocation_status
    )
    values (
      refund_row.company_id, refund_row.service_request_id, refund_row.id,
      refund_row.payment_id, adjustment_allocation_id, adjustment_amount,
      refund_row.refund_status
    );
  end loop;

  if round(total_adjusted, 2) <> refund_row.refund_amount then
    raise exception 'Refund allocation adjustments must equal the refund amount.'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.reserve_service_request_payment_refund_rpc(
  p_service_request_id uuid,
  p_payment_id uuid,
  p_refund_type text,
  p_refund_amount numeric,
  p_refund_reason text,
  p_idempotency_key text,
  p_allocation_adjustments jsonb default null,
  p_provider_refund_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  payment_row public.service_request_payments;
  existing_refund public.service_request_payment_refunds;
  refund_row public.service_request_payment_refunds;
  clean_type text := lower(btrim(coalesce(p_refund_type, '')));
  clean_reason text := nullif(btrim(coalesce(p_refund_reason, '')), '');
  clean_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  clean_provider_refund_id text := nullif(btrim(coalesce(p_provider_refund_id, '')), '');
  refund_amount numeric(10, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if clean_type not in ('stripe', 'manual') then
    raise exception 'Choose a valid refund type.' using errcode = '22023';
  end if;

  if clean_reason is null or length(clean_reason) < 3 then
    raise exception 'Refund reason is required.' using errcode = '22023';
  end if;

  if clean_idempotency_key is null or length(clean_idempotency_key) < 12 then
    raise exception 'A valid refund idempotency key is required.' using errcode = '22023';
  end if;

  if p_refund_amount is null or p_refund_amount <= 0 or round(p_refund_amount, 2) <> p_refund_amount then
    raise exception 'Enter a valid refund amount.' using errcode = '22023';
  end if;

  refund_amount := round(p_refund_amount, 2);

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if request_row.company_id is null then
    raise exception 'Refunds require a company-scoped job.' using errcode = '23514';
  end if;

  if not public.can_record_service_request_payment(request_row.id) then
    raise exception 'This account is not allowed to refund payments for that job.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 507));

  select *
  into payment_row
  from public.service_request_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment was not found.' using errcode = 'P0002';
  end if;

  if payment_row.service_request_id is distinct from request_row.id
    or payment_row.company_id is distinct from request_row.company_id then
    raise exception 'Payment must belong to the selected Job and company.'
      using errcode = '23514';
  end if;

  select *
  into existing_refund
  from public.service_request_payment_refunds
  where company_id = request_row.company_id
    and refund_type = clean_type
    and idempotency_key = clean_idempotency_key;

  if found then
    if existing_refund.service_request_id is distinct from request_row.id
      or existing_refund.payment_id is distinct from payment_row.id
      or existing_refund.refund_amount is distinct from refund_amount then
      raise exception 'This refund idempotency key was already used for a different refund.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'refund_id', existing_refund.id,
      'refund_status', existing_refund.refund_status,
      'refundable_remaining', public.service_request_payment_refundable_amount(payment_row.id)
    );
  end if;

  insert into public.service_request_payment_refunds (
    company_id, service_request_id, payment_id, refund_type, refund_amount,
    refund_status, refund_reason, provider_refund_id, idempotency_key,
    created_by_profile_id
  )
  values (
    request_row.company_id, request_row.id, payment_row.id, clean_type,
    refund_amount, 'pending', clean_reason, clean_provider_refund_id,
    clean_idempotency_key, auth.uid()
  )
  returning * into refund_row;

  perform public.create_refund_allocation_rows(refund_row.id, p_allocation_adjustments);

  return jsonb_build_object(
    'idempotent', false,
    'refund_id', refund_row.id,
    'refund_status', refund_row.refund_status,
    'refund_amount', refund_row.refund_amount,
    'refundable_remaining', public.service_request_payment_refundable_amount(payment_row.id)
  );
end;
$$;

create or replace function public.confirm_service_request_payment_refund_rpc(
  p_refund_id uuid,
  p_provider_refund_id text default null,
  p_provider_event_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_row public.service_request_payment_refunds;
  clean_provider_refund_id text := nullif(btrim(coalesce(p_provider_refund_id, '')), '');
  clean_provider_event_id text := nullif(btrim(coalesce(p_provider_event_id, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into refund_row
  from public.service_request_payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund was not found.' using errcode = 'P0002';
  end if;

  if not public.can_record_service_request_payment(refund_row.service_request_id) then
    raise exception 'This account is not allowed to confirm refunds for that job.'
      using errcode = '42501';
  end if;

  if refund_row.refund_status = 'succeeded' then
    return jsonb_build_object('idempotent', true, 'refund_id', refund_row.id, 'refund_status', refund_row.refund_status);
  end if;

  if refund_row.refund_status <> 'pending' then
    raise exception 'Only pending refunds can be confirmed.' using errcode = '23514';
  end if;

  if refund_row.refund_type <> 'manual' then
    raise exception 'Stripe refunds can only be confirmed from trusted provider confirmation.'
      using errcode = '42501';
  end if;

  update public.service_request_payment_refund_allocations
  set refund_allocation_status = 'succeeded'
  where refund_id = refund_row.id
    and refund_allocation_status = 'pending';

  update public.service_request_payment_refunds
  set
    refund_status = 'succeeded',
    provider_refund_id = coalesce(clean_provider_refund_id, provider_refund_id),
    provider_event_id = coalesce(clean_provider_event_id, provider_event_id),
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = refund_row.id
  returning * into refund_row;

  update public.service_request_payments payment
  set
    payment_status = case
      when public.service_request_payment_refunded_amount(payment.id, false) >= public.service_request_payment_principal_amount(payment.id)
        then 'refunded'
      else 'partially_refunded'
    end,
    payment_metadata = coalesce(payment.payment_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'refund_status', case
          when public.service_request_payment_refunded_amount(payment.id, false) >= public.service_request_payment_principal_amount(payment.id)
            then 'refunded'
          else 'partially_refunded'
        end
      )
  where payment.id = refund_row.payment_id
    and payment.payment_status in ('paid', 'succeeded', 'imported', 'partially_refunded');

  return jsonb_build_object(
    'idempotent', false,
    'refund_id', refund_row.id,
    'refund_status', refund_row.refund_status,
    'net_paid', public.active_service_request_net_paid_credit(refund_row.service_request_id)
  );
end;
$$;

create or replace function public.confirm_stripe_service_request_payment_refund_rpc(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_event_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_row public.service_request_payment_refunds;
  clean_provider_refund_id text := nullif(btrim(coalesce(p_provider_refund_id, '')), '');
  clean_provider_event_id text := nullif(btrim(coalesce(p_provider_event_id, '')), '');
begin
  if clean_provider_refund_id is null or clean_provider_event_id is null then
    raise exception 'Stripe refund confirmation requires provider refund and event identity.'
      using errcode = '22023';
  end if;

  select *
  into refund_row
  from public.service_request_payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund was not found.' using errcode = 'P0002';
  end if;

  if refund_row.refund_type <> 'stripe' then
    raise exception 'Trusted provider confirmation is only for Stripe refunds.'
      using errcode = '23514';
  end if;

  if refund_row.refund_status = 'succeeded' then
    if refund_row.provider_refund_id is distinct from clean_provider_refund_id then
      raise exception 'Stripe refund confirmation conflicts with existing provider refund identity.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'refund_id', refund_row.id,
      'refund_status', refund_row.refund_status
    );
  end if;

  if refund_row.refund_status <> 'pending' then
    raise exception 'Only pending Stripe refunds can be confirmed.'
      using errcode = '23514';
  end if;

  update public.service_request_payment_refund_allocations
  set refund_allocation_status = 'succeeded'
  where refund_id = refund_row.id
    and refund_allocation_status = 'pending';

  update public.service_request_payment_refunds
  set
    refund_status = 'succeeded',
    provider_refund_id = clean_provider_refund_id,
    provider_event_id = clean_provider_event_id,
    metadata = coalesce(metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('trusted_provider_confirmation', true)
  where id = refund_row.id
  returning * into refund_row;

  update public.service_request_payments payment
  set
    payment_status = case
      when public.service_request_payment_refunded_amount(payment.id, false) >= public.service_request_payment_principal_amount(payment.id)
        then 'refunded'
      else 'partially_refunded'
    end,
    payment_metadata = coalesce(payment.payment_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'refund_status', case
          when public.service_request_payment_refunded_amount(payment.id, false) >= public.service_request_payment_principal_amount(payment.id)
            then 'refunded'
          else 'partially_refunded'
        end
      )
  where payment.id = refund_row.payment_id
    and payment.payment_status in ('paid', 'succeeded', 'imported', 'partially_refunded');

  return jsonb_build_object(
    'idempotent', false,
    'refund_id', refund_row.id,
    'refund_status', refund_row.refund_status,
    'net_paid', public.active_service_request_net_paid_credit(refund_row.service_request_id)
  );
end;
$$;

create or replace function public.record_failed_service_request_payment_refund_rpc(
  p_refund_id uuid,
  p_refund_status text,
  p_failure_reason text,
  p_provider_event_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_row public.service_request_payment_refunds;
  clean_status text := lower(btrim(coalesce(p_refund_status, '')));
  clean_failure_reason text := nullif(btrim(coalesce(p_failure_reason, '')), '');
  clean_provider_event_id text := nullif(btrim(coalesce(p_provider_event_id, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if clean_status not in ('failed', 'canceled') then
    raise exception 'Refund failure status must be failed or canceled.' using errcode = '22023';
  end if;

  select *
  into refund_row
  from public.service_request_payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund was not found.' using errcode = 'P0002';
  end if;

  if not public.can_record_service_request_payment(refund_row.service_request_id) then
    raise exception 'This account is not allowed to update refunds for that job.'
      using errcode = '42501';
  end if;

  if refund_row.refund_status <> 'pending' then
    raise exception 'Only pending refunds can be failed or canceled.' using errcode = '23514';
  end if;

  update public.service_request_payment_refund_allocations
  set refund_allocation_status = clean_status
  where refund_id = refund_row.id
    and refund_allocation_status = 'pending';

  update public.service_request_payment_refunds
  set
    refund_status = clean_status,
    provider_event_id = coalesce(clean_provider_event_id, provider_event_id),
    metadata = coalesce(metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('failure_reason', clean_failure_reason)
  where id = refund_row.id
  returning * into refund_row;

  return jsonb_build_object(
    'refund_id', refund_row.id,
    'refund_status', refund_row.refund_status,
    'refundable_remaining', public.service_request_payment_refundable_amount(refund_row.payment_id)
  );
end;
$$;

create or replace function public.record_stripe_service_request_payment_refund_failure_rpc(
  p_refund_id uuid,
  p_refund_status text,
  p_failure_reason text,
  p_provider_event_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_row public.service_request_payment_refunds;
  clean_status text := lower(btrim(coalesce(p_refund_status, '')));
  clean_failure_reason text := nullif(btrim(coalesce(p_failure_reason, '')), '');
  clean_provider_event_id text := nullif(btrim(coalesce(p_provider_event_id, '')), '');
begin
  if clean_status not in ('failed', 'canceled') then
    raise exception 'Refund failure status must be failed or canceled.' using errcode = '22023';
  end if;

  select *
  into refund_row
  from public.service_request_payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund was not found.' using errcode = 'P0002';
  end if;

  if refund_row.refund_type <> 'stripe' then
    raise exception 'Trusted provider failure is only for Stripe refunds.'
      using errcode = '23514';
  end if;

  if refund_row.refund_status = clean_status then
    return jsonb_build_object(
      'idempotent', true,
      'refund_id', refund_row.id,
      'refund_status', refund_row.refund_status
    );
  end if;

  if refund_row.refund_status <> 'pending' then
    raise exception 'Only pending Stripe refunds can be failed or canceled.'
      using errcode = '23514';
  end if;

  update public.service_request_payment_refund_allocations
  set refund_allocation_status = clean_status
  where refund_id = refund_row.id
    and refund_allocation_status = 'pending';

  update public.service_request_payment_refunds
  set
    refund_status = clean_status,
    provider_event_id = coalesce(clean_provider_event_id, provider_event_id),
    metadata = coalesce(metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'failure_reason', clean_failure_reason,
        'trusted_provider_failure', true
      )
  where id = refund_row.id
  returning * into refund_row;

  return jsonb_build_object(
    'idempotent', false,
    'refund_id', refund_row.id,
    'refund_status', refund_row.refund_status,
    'refundable_remaining', public.service_request_payment_refundable_amount(refund_row.payment_id)
  );
end;
$$;

create or replace function public.record_manual_service_request_payment_refund_rpc(
  p_service_request_id uuid,
  p_payment_id uuid,
  p_refund_amount numeric,
  p_refund_reason text,
  p_idempotency_key text,
  p_money_returned_confirmed boolean,
  p_allocation_adjustments jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved jsonb;
  refund_id uuid;
begin
  if p_money_returned_confirmed is not true then
    raise exception 'Manual refund requires explicit confirmation that money was actually returned.'
      using errcode = '22023';
  end if;

  reserved := public.reserve_service_request_payment_refund_rpc(
    p_service_request_id,
    p_payment_id,
    'manual',
    p_refund_amount,
    p_refund_reason,
    p_idempotency_key,
    p_allocation_adjustments,
    null
  );

  refund_id := (reserved ->> 'refund_id')::uuid;

  if (reserved ->> 'refund_status') = 'succeeded' then
    return reserved;
  end if;

  return public.confirm_service_request_payment_refund_rpc(
    refund_id,
    null,
    null,
    jsonb_build_object('manual_refund_confirmed', true)
  );
end;
$$;

alter table public.service_request_payment_refunds enable row level security;
alter table public.service_request_payment_refund_allocations enable row level security;

revoke all on public.service_request_payment_refunds from public;
revoke all on public.service_request_payment_refund_allocations from public;

grant select on public.service_request_payment_refunds to authenticated;
grant select on public.service_request_payment_refund_allocations to authenticated;
grant select, update on public.service_request_payment_refunds to service_role;

drop policy if exists "service_request_payment_refunds_dashboard_select"
  on public.service_request_payment_refunds;
create policy "service_request_payment_refunds_dashboard_select"
on public.service_request_payment_refunds
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_payment_refund_allocations_dashboard_select"
  on public.service_request_payment_refund_allocations;
create policy "service_request_payment_refund_allocations_dashboard_select"
on public.service_request_payment_refund_allocations
for select
to authenticated
using (public.can_view_service_request(service_request_id));

revoke all on function public.service_request_payment_refunded_amount(uuid, boolean) from public;
revoke all on function public.service_request_payment_refundable_amount(uuid) from public;
revoke all on function public.active_service_request_net_paid_credit(uuid) from public;
revoke all on function public.validate_service_request_payment_refund() from public;
revoke all on function public.validate_service_request_payment_refund_allocation() from public;
revoke all on function public.create_refund_allocation_rows(uuid, jsonb) from public;

revoke all on function public.reserve_service_request_payment_refund_rpc(uuid, uuid, text, numeric, text, text, jsonb, text) from public;
revoke all on function public.reserve_service_request_payment_refund_rpc(uuid, uuid, text, numeric, text, text, jsonb, text) from anon;
revoke all on function public.reserve_service_request_payment_refund_rpc(uuid, uuid, text, numeric, text, text, jsonb, text) from authenticated;

revoke all on function public.confirm_service_request_payment_refund_rpc(uuid, text, text, jsonb) from public;
revoke all on function public.confirm_service_request_payment_refund_rpc(uuid, text, text, jsonb) from anon;
revoke all on function public.confirm_service_request_payment_refund_rpc(uuid, text, text, jsonb) from authenticated;

revoke all on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) from public;
revoke all on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) from anon;
revoke all on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) from authenticated;
revoke all on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) from service_role;

revoke all on function public.record_failed_service_request_payment_refund_rpc(uuid, text, text, text, jsonb) from public;
revoke all on function public.record_failed_service_request_payment_refund_rpc(uuid, text, text, text, jsonb) from anon;
revoke all on function public.record_failed_service_request_payment_refund_rpc(uuid, text, text, text, jsonb) from authenticated;

revoke all on function public.record_stripe_service_request_payment_refund_failure_rpc(uuid, text, text, text, jsonb) from public;
revoke all on function public.record_stripe_service_request_payment_refund_failure_rpc(uuid, text, text, text, jsonb) from anon;
revoke all on function public.record_stripe_service_request_payment_refund_failure_rpc(uuid, text, text, text, jsonb) from authenticated;
revoke all on function public.record_stripe_service_request_payment_refund_failure_rpc(uuid, text, text, text, jsonb) from service_role;

revoke all on function public.record_manual_service_request_payment_refund_rpc(uuid, uuid, numeric, text, text, boolean, jsonb) from public;
revoke all on function public.record_manual_service_request_payment_refund_rpc(uuid, uuid, numeric, text, text, boolean, jsonb) from anon;
revoke all on function public.record_manual_service_request_payment_refund_rpc(uuid, uuid, numeric, text, text, boolean, jsonb) from authenticated;

grant execute on function public.reserve_service_request_payment_refund_rpc(uuid, uuid, text, numeric, text, text, jsonb, text) to authenticated;
grant execute on function public.confirm_service_request_payment_refund_rpc(uuid, text, text, jsonb) to authenticated;
grant execute on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) to service_role;
grant execute on function public.record_failed_service_request_payment_refund_rpc(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.record_stripe_service_request_payment_refund_failure_rpc(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.record_manual_service_request_payment_refund_rpc(uuid, uuid, numeric, text, text, boolean, jsonb) to authenticated;

comment on function public.service_request_payment_refunded_amount(uuid, boolean) is
  'FINANCE-V2-REFUND-02. Returns succeeded refund principal for a payment, optionally including pending refunds as reserved refundable capacity.';
comment on function public.service_request_payment_refundable_amount(uuid) is
  'FINANCE-V2-REFUND-02. Returns original paid principal minus pending and succeeded refund principal.';
comment on function public.active_service_request_net_paid_credit(uuid) is
  'FINANCE-V2-REFUND-02. Canonical foundation helper for net paid credit: active paid allocations minus succeeded refund allocation adjustments.';
comment on function public.reserve_service_request_payment_refund_rpc(uuid, uuid, text, numeric, text, text, jsonb, text) is
  'FINANCE-V2-REFUND-02. Creates a pending refund reservation linked to one original payment and explicit original allocation attribution.';
comment on function public.confirm_service_request_payment_refund_rpc(uuid, text, text, jsonb) is
  'FINANCE-V2-REFUND-02. Authenticated staff confirmation for manual pending refunds only. Stripe refunds require trusted provider confirmation.';
comment on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) is
  'FINANCE-V2-REFUND-02. Service-role-only trusted provider confirmation for pending Stripe refunds after provider confirmation.';
comment on function public.record_failed_service_request_payment_refund_rpc(uuid, text, text, text, jsonb) is
  'FINANCE-V2-REFUND-02. Fails or cancels a pending refund and releases reserved refundable capacity.';
comment on function public.record_stripe_service_request_payment_refund_failure_rpc(uuid, text, text, text, jsonb) is
  'FINANCE-V2-REFUND-03. Service-role-only provider failure path that releases pending Stripe refund capacity from trusted webhook/API evidence.';
comment on function public.record_manual_service_request_payment_refund_rpc(uuid, uuid, numeric, text, text, boolean, jsonb) is
  'FINANCE-V2-REFUND-02. Records an already-completed manual refund for an eligible non-Stripe original payment after explicit money-return confirmation.';
