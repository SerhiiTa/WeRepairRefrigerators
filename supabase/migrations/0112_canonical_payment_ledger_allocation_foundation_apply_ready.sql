-- PAYMENTS-02: Canonical payment ledger and allocation foundation.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Evolve service_request_payments from historical Workiz payment storage into
--   the canonical provider-neutral HomeFixOS money-event table, and add the
--   allocation layer that determines which estimate deposit or invoice balance a
--   payment satisfies.
--
-- Allocation model decision:
--   This migration intentionally uses one strongly relational allocation table
--   with explicit nullable foreign keys:
--
--     service_request_payment_allocations.payment_id
--     service_request_payment_allocations.estimate_id nullable
--     service_request_payment_allocations.invoice_id nullable
--
--   A CHECK constraint requires exactly one active target column on each row.
--   This avoids a polymorphic target_id while keeping a single canonical
--   allocation ledger. Estimate-stage deposits are represented as allocations to
--   service_request_estimates. When an invoice is created from that estimate, the
--   same allocation row is carried forward to the invoice by replacing
--   estimate_id with invoice_id and preserving carried_from_estimate_id. No
--   duplicate payment row is created and the deposit cannot count twice.
--
-- This migration does not integrate Stripe, create payment links, call any
-- provider, import Workiz data, or change operational job status coupling.

create extension if not exists pgcrypto with schema extensions;

alter table public.service_request_payments
  add column if not exists provider text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_event_id text,
  add column if not exists recorded_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  add column if not exists payment_metadata jsonb not null default '{}'::jsonb;

comment on table public.service_request_payments is
  'Canonical service-request payment records. A payment is a real money event or attempted money event; invoice satisfaction is determined by allocations, not by invoice.status alone.';
comment on column public.service_request_payments.amount is
  'Gross customer payment amount / customer charge. Do not subtract tips or processor fees from this value.';
comment on column public.service_request_payments.tip_amount is
  'Tip portion of the gross customer payment. Tips do not satisfy invoice principal unless explicitly allocated by a future workflow.';
comment on column public.service_request_payments.service_fee is
  'Processor/service fee. Fees reduce settlement, not customer invoice satisfaction.';
comment on column public.service_request_payments.net_amount is
  'Net settlement amount after fees or external adjustments when known. Not used for customer balance.';
comment on column public.service_request_payments.provider is
  'Provider-neutral processor/manual source identifier such as manual, stripe, workiz, zelle, cash, check, venmo, or cash_app.';
comment on column public.service_request_payments.provider_payment_id is
  'Provider-neutral external transaction/payment identifier for future idempotency. Not Stripe-specific.';
comment on column public.service_request_payments.payment_metadata is
  'Provider-neutral non-secret payment metadata. Never store full card numbers, CVV, API keys, or payment credentials.';

alter table public.service_request_payments
  drop constraint if exists service_request_payments_status_check,
  add constraint service_request_payments_status_check
    check (payment_status in (
      'pending',
      'processing',
      'succeeded',
      'failed',
      'canceled',
      'paid',
      'refunded',
      'partially_refunded',
      'void',
      'imported'
    )),
  drop constraint if exists service_request_payments_provider_not_blank_check,
  add constraint service_request_payments_provider_not_blank_check
    check (provider is null or length(btrim(provider)) > 0),
  drop constraint if exists service_request_payments_provider_payment_not_blank_check,
  add constraint service_request_payments_provider_payment_not_blank_check
    check (provider_payment_id is null or length(btrim(provider_payment_id)) > 0),
  drop constraint if exists service_request_payments_provider_event_not_blank_check,
  add constraint service_request_payments_provider_event_not_blank_check
    check (provider_event_id is null or length(btrim(provider_event_id)) > 0);

create unique index if not exists service_request_payments_provider_payment_uidx
  on public.service_request_payments (provider, provider_payment_id)
  where provider is not null and provider_payment_id is not null;

create unique index if not exists service_request_payments_provider_event_uidx
  on public.service_request_payments (provider, provider_event_id)
  where provider is not null and provider_event_id is not null;

create table if not exists public.service_request_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id)
    on delete restrict,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  payment_id uuid not null
    references public.service_request_payments(id)
    on delete cascade,
  estimate_id uuid
    references public.service_request_estimates(id)
    on delete restrict,
  invoice_id uuid
    references public.service_request_invoices(id)
    on delete restrict,
  carried_from_estimate_id uuid
    references public.service_request_estimates(id)
    on delete set null,
  allocation_amount numeric(10, 2) not null,
  allocation_status text not null default 'active',
  allocation_source text not null default 'manual',
  created_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  carried_forward_at timestamptz,
  allocation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_request_payment_allocations_one_target_check
    check (
      ((estimate_id is not null)::integer + (invoice_id is not null)::integer) = 1
    ),
  constraint service_request_payment_allocations_amount_check
    check (allocation_amount > 0 and allocation_amount <= 100000),
  constraint service_request_payment_allocations_status_check
    check (allocation_status in ('active', 'void')),
  constraint service_request_payment_allocations_source_check
    check (allocation_source in (
      'manual',
      'payment_request',
      'estimate_deposit',
      'estimate_deposit_carry_forward',
      'provider_webhook',
      'import',
      'system'
    ))
);

comment on table public.service_request_payment_allocations is
  'Canonical allocation ledger. Each active row says this amount of one payment satisfies one estimate deposit or one invoice obligation.';
comment on column public.service_request_payment_allocations.allocation_amount is
  'Amount of gross successful payment principal applied to the target. Tips and processor fees do not automatically satisfy invoice principal.';
comment on column public.service_request_payment_allocations.carried_from_estimate_id is
  'When an estimate-stage deposit is carried forward to an invoice, the original estimate is preserved here while invoice_id becomes the active target.';

create index if not exists service_request_payment_allocations_payment_idx
  on public.service_request_payment_allocations (payment_id, allocation_status);
create index if not exists service_request_payment_allocations_estimate_idx
  on public.service_request_payment_allocations (estimate_id, allocation_status)
  where estimate_id is not null;
create index if not exists service_request_payment_allocations_invoice_idx
  on public.service_request_payment_allocations (invoice_id, allocation_status)
  where invoice_id is not null;
create index if not exists service_request_payment_allocations_request_idx
  on public.service_request_payment_allocations (service_request_id, created_at desc);

-- Prevent accidental duplicate carry-forward/allocation rows for the common
-- one-payment/one-target path while still allowing multiple independent
-- partial allocations from the same payment when amounts or targets differ.
create unique index if not exists service_request_payment_allocations_active_estimate_uidx
  on public.service_request_payment_allocations (payment_id, estimate_id)
  where allocation_status = 'active' and estimate_id is not null;

create unique index if not exists service_request_payment_allocations_active_invoice_uidx
  on public.service_request_payment_allocations (payment_id, invoice_id)
  where allocation_status = 'active' and invoice_id is not null;

drop trigger if exists set_service_request_payment_allocations_updated_at
  on public.service_request_payment_allocations;
create trigger set_service_request_payment_allocations_updated_at
before update on public.service_request_payment_allocations
for each row
execute function public.set_updated_at();

create or replace function public.service_request_payment_principal_amount(
  p_payment_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        case
          when payment.payment_status in ('paid', 'succeeded', 'imported', 'partially_refunded') then
            greatest(payment.amount - coalesce(payment.tip_amount, 0), 0)
          else 0
        end
      from public.service_request_payments payment
      where payment.id = p_payment_id
    ),
    0
  )::numeric(10, 2);
$$;

comment on function public.service_request_payment_principal_amount(uuid) is
  'Returns successful gross payment principal available for obligation allocation. Tip is excluded; processor fees are ignored for customer balance.';

create or replace function public.validate_service_request_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.service_request_payments;
  request_company_id uuid;
  target_request_id uuid;
  available_amount numeric(10, 2);
  allocated_amount numeric(10, 2);
begin
  if new.allocation_status <> 'active' then
    return new;
  end if;

  select *
  into payment_row
  from public.service_request_payments
  where id = new.payment_id
  for update;

  if not found then
    raise exception 'Payment was not found.' using errcode = '23503';
  end if;

  if payment_row.service_request_id is distinct from new.service_request_id then
    raise exception 'Payment allocation must use the same service request as the payment.'
      using errcode = '23514';
  end if;

  select company_id
  into request_company_id
  from public.service_requests
  where id = new.service_request_id;

  if request_company_id is null then
    raise exception 'Payment allocation requires a company-scoped service request.'
      using errcode = '23514';
  end if;

  if new.company_id is distinct from request_company_id then
    raise exception 'Payment allocation company must match the service request company.'
      using errcode = '23514';
  end if;

  if payment_row.company_id is not null and payment_row.company_id is distinct from new.company_id then
    raise exception 'Payment allocation company must match the payment company.'
      using errcode = '23514';
  end if;

  if new.estimate_id is not null then
    select estimate.service_request_id
    into target_request_id
    from public.service_request_estimates estimate
    where estimate.id = new.estimate_id;

    if target_request_id is null then
      raise exception 'Estimate allocation target was not found.' using errcode = '23503';
    end if;

    if target_request_id is distinct from new.service_request_id then
      raise exception 'Estimate allocation target must belong to the same service request.'
        using errcode = '23514';
    end if;
  end if;

  if new.invoice_id is not null then
    select invoice.service_request_id
    into target_request_id
    from public.service_request_invoices invoice
    where invoice.id = new.invoice_id;

    if target_request_id is null then
      raise exception 'Invoice allocation target was not found.' using errcode = '23503';
    end if;

    if target_request_id is distinct from new.service_request_id then
      raise exception 'Invoice allocation target must belong to the same service request.'
        using errcode = '23514';
    end if;
  end if;

  available_amount := public.service_request_payment_principal_amount(new.payment_id);

  select coalesce(sum(allocation.allocation_amount), 0)
  into allocated_amount
  from public.service_request_payment_allocations allocation
  where allocation.payment_id = new.payment_id
    and allocation.allocation_status = 'active'
    and allocation.id is distinct from new.id;

  if allocated_amount + new.allocation_amount > available_amount then
    raise exception 'Payment allocation exceeds available payment principal.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_service_request_payment_allocation
  on public.service_request_payment_allocations;
create trigger validate_service_request_payment_allocation
before insert or update on public.service_request_payment_allocations
for each row
execute function public.validate_service_request_payment_allocation();

alter table public.service_request_payment_allocations enable row level security;
revoke all on public.service_request_payment_allocations from public;
grant select on public.service_request_payment_allocations to authenticated;

drop policy if exists "service_request_payment_allocations_dashboard_select"
  on public.service_request_payment_allocations;
create policy "service_request_payment_allocations_dashboard_select"
on public.service_request_payment_allocations
for select
to authenticated
using (public.can_view_service_request(service_request_id));

create or replace function public.get_service_request_estimate_financial_summary_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  deposit_paid numeric(10, 2);
  remaining_amount numeric(10, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  select coalesce(sum(allocation.allocation_amount), 0)
  into deposit_paid
  from public.service_request_payment_allocations allocation
  where allocation.estimate_id = estimate_row.id
    and allocation.allocation_status = 'active';

  remaining_amount := greatest(estimate_row.total - deposit_paid, 0);

  return jsonb_build_object(
    'estimate_id', estimate_row.id,
    'service_request_id', estimate_row.service_request_id,
    'estimate_total', estimate_row.total,
    'deposit_paid', deposit_paid,
    'remaining_estimated_amount', remaining_amount
  );
end;
$$;

create or replace function public.get_service_request_invoice_financial_summary_rpc(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.service_request_invoices;
  allocated_paid numeric(10, 2);
  balance_due numeric(10, 2);
  financial_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(invoice_row.service_request_id) then
    raise exception 'Invoice is not accessible for this account.' using errcode = '42501';
  end if;

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
    'invoice_id', invoice_row.id,
    'service_request_id', invoice_row.service_request_id,
    'invoice_total', invoice_row.total,
    'allocated_paid', allocated_paid,
    'balance_due', balance_due,
    'financial_state', financial_state
  );
end;
$$;

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
  where id = p_estimate_id;

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
  'PAYMENTS-02. Creates or returns a draft invoice snapshot from an accessible approved estimate and atomically carries estimate deposit allocations forward to the invoice without duplicating payment rows.';

revoke all on function public.service_request_payment_principal_amount(uuid) from public;
revoke all on function public.validate_service_request_payment_allocation() from public;
revoke all on function public.get_service_request_estimate_financial_summary_rpc(uuid) from public;
revoke all on function public.get_service_request_invoice_financial_summary_rpc(uuid) from public;

grant execute on function public.get_service_request_estimate_financial_summary_rpc(uuid) to authenticated;
grant execute on function public.get_service_request_invoice_financial_summary_rpc(uuid) to authenticated;
