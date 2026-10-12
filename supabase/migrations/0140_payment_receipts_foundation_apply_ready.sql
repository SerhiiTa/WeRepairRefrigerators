-- JOB-CLOSE-02: Individual payment receipts and receipt SMS outbox.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Create one receipt for each canonical successful Stripe payment, preserve
--   per-Job receipt numbering, expose a narrow public receipt token, and record
--   explicit staff-triggered receipt deliveries.

create table if not exists public.service_request_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  payment_id uuid not null references public.service_request_payments(id) on delete restrict,
  invoice_id uuid references public.service_request_invoices(id) on delete set null,
  estimate_id uuid references public.service_request_estimates(id) on delete set null,
  receipt_sequence integer not null,
  receipt_number text not null,
  amount numeric(10, 2) not null,
  currency text not null default 'usd',
  payment_method text not null,
  card_brand text,
  card_last4 text,
  payment_status text not null,
  paid_at timestamptz not null,
  receipt_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_request_payment_receipts_amount_check check (amount > 0),
  constraint service_request_payment_receipts_currency_check check (currency = lower(currency) and currency ~ '^[a-z]{3}$'),
  constraint service_request_payment_receipts_sequence_check check (receipt_sequence > 0),
  constraint service_request_payment_receipts_last4_check check (card_last4 is null or card_last4 ~ '^[0-9]{4}$')
);

create unique index if not exists service_request_payment_receipts_payment_uidx
  on public.service_request_payment_receipts (payment_id);

create unique index if not exists service_request_payment_receipts_request_sequence_uidx
  on public.service_request_payment_receipts (service_request_id, receipt_sequence);

create unique index if not exists service_request_payment_receipts_number_uidx
  on public.service_request_payment_receipts (company_id, receipt_number);

create index if not exists service_request_payment_receipts_request_created_idx
  on public.service_request_payment_receipts (service_request_id, created_at desc);

drop trigger if exists set_service_request_payment_receipts_updated_at
  on public.service_request_payment_receipts;
create trigger set_service_request_payment_receipts_updated_at
before update on public.service_request_payment_receipts
for each row execute function public.set_updated_at();

create table if not exists public.service_request_payment_receipt_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  receipt_id uuid not null references public.service_request_payment_receipts(id) on delete cascade,
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  token_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_request_payment_receipt_tokens_receipt_idx
  on public.service_request_payment_receipt_tokens (receipt_id, token_revoked_at, token_expires_at);

drop trigger if exists set_service_request_payment_receipt_tokens_updated_at
  on public.service_request_payment_receipt_tokens;
create trigger set_service_request_payment_receipt_tokens_updated_at
before update on public.service_request_payment_receipt_tokens
for each row execute function public.set_updated_at();

create table if not exists public.service_request_payment_receipt_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  payment_id uuid not null references public.service_request_payments(id) on delete restrict,
  receipt_id uuid not null references public.service_request_payment_receipts(id) on delete cascade,
  communication_message_id uuid references public.communication_messages(id) on delete set null,
  initiated_by_profile_id uuid references public.profiles(id) on delete set null,
  delivery_channel text not null,
  recipient text not null,
  delivery_status text not null default 'pending',
  provider text,
  provider_message_id text,
  provider_status text,
  provider_error text,
  idempotency_key text not null,
  delivery_attempt_count integer not null default 0,
  queued_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  delivery_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_request_payment_receipt_deliveries_channel_check check (delivery_channel in ('sms', 'email')),
  constraint service_request_payment_receipt_deliveries_status_check check (delivery_status in ('pending', 'sent', 'delivered', 'failed')),
  constraint service_request_payment_receipt_deliveries_attempt_count_check check (delivery_attempt_count between 0 and 5),
  constraint service_request_payment_receipt_deliveries_idempotency_check check (length(btrim(idempotency_key)) >= 12),
  constraint service_request_payment_receipt_deliveries_recipient_check check (length(btrim(recipient)) between 3 and 320)
);

create unique index if not exists service_request_payment_receipt_deliveries_idempotency_uidx
  on public.service_request_payment_receipt_deliveries (company_id, idempotency_key);

create index if not exists service_request_payment_receipt_deliveries_pending_idx
  on public.service_request_payment_receipt_deliveries (delivery_status, next_attempt_at, queued_at)
  where delivery_status = 'pending';

drop trigger if exists set_service_request_payment_receipt_deliveries_updated_at
  on public.service_request_payment_receipt_deliveries;
create trigger set_service_request_payment_receipt_deliveries_updated_at
before update on public.service_request_payment_receipt_deliveries
for each row execute function public.set_updated_at();

alter table public.service_request_payment_receipts enable row level security;
alter table public.service_request_payment_receipt_tokens enable row level security;
alter table public.service_request_payment_receipt_deliveries enable row level security;

revoke all on public.service_request_payment_receipts from public;
revoke all on public.service_request_payment_receipt_tokens from public;
revoke all on public.service_request_payment_receipt_deliveries from public;

grant select on public.service_request_payment_receipts to authenticated;
grant select on public.service_request_payment_receipt_tokens to authenticated;
grant select on public.service_request_payment_receipt_deliveries to authenticated;
grant select, insert, update on table public.service_request_payment_receipts to service_role;
grant select, insert, update on table public.service_request_payment_receipt_tokens to service_role;
grant select, insert, update on table public.service_request_payment_receipt_deliveries to service_role;

drop policy if exists "service_request_payment_receipts_dashboard_select"
  on public.service_request_payment_receipts;
create policy "service_request_payment_receipts_dashboard_select"
on public.service_request_payment_receipts
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_payment_receipt_tokens_dashboard_select"
  on public.service_request_payment_receipt_tokens;
create policy "service_request_payment_receipt_tokens_dashboard_select"
on public.service_request_payment_receipt_tokens
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_payment_receipt_deliveries_dashboard_select"
  on public.service_request_payment_receipt_deliveries;
create policy "service_request_payment_receipt_deliveries_dashboard_select"
on public.service_request_payment_receipt_deliveries
for select
to authenticated
using (public.can_view_service_request(service_request_id));

create or replace function public.finalize_service_request_payment_receipt_delivery_rpc(
  p_delivery_id uuid,
  p_success boolean,
  p_communication_message_id uuid default null,
  p_provider_message_id text default null,
  p_provider_status text default null,
  p_provider_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row public.service_request_payment_receipt_deliveries;
  sanitized_provider_status text := nullif(btrim(coalesce(p_provider_status, '')), '');
  sanitized_provider_error text := left(nullif(btrim(coalesce(p_provider_error, '')), ''), 300);
begin
  if p_delivery_id is null then
    raise exception 'Receipt delivery is required.' using errcode = '22023';
  end if;

  select *
  into delivery_row
  from public.service_request_payment_receipt_deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'Receipt delivery was not found.' using errcode = 'P0002';
  end if;

  if delivery_row.delivery_status in ('sent', 'delivered') then
    return jsonb_build_object(
      'delivery_id', delivery_row.id,
      'delivery_status', delivery_row.delivery_status,
      'idempotent', true
    );
  end if;

  if p_success then
    update public.service_request_payment_receipt_deliveries
    set delivery_status = 'sent',
        communication_message_id = coalesce(p_communication_message_id, communication_message_id),
        provider = coalesce(provider, 'telnyx'),
        provider_message_id = coalesce(nullif(btrim(coalesce(p_provider_message_id, '')), ''), provider_message_id),
        provider_status = coalesce(sanitized_provider_status, 'accepted'),
        provider_error = null,
        locked_until = null,
        sent_at = coalesce(sent_at, now()),
        failed_at = null,
        delivery_metadata = delivery_metadata || jsonb_build_object('last_finalized_at', now())
    where id = delivery_row.id
    returning * into delivery_row;
  else
    update public.service_request_payment_receipt_deliveries
    set delivery_status = case when delivery_attempt_count >= 3 then 'failed' else 'pending' end,
        communication_message_id = coalesce(p_communication_message_id, communication_message_id),
        provider = coalesce(provider, 'telnyx'),
        provider_status = sanitized_provider_status,
        provider_error = sanitized_provider_error,
        locked_until = null,
        next_attempt_at = case
          when delivery_attempt_count >= 3 then next_attempt_at
          else now() + (delivery_attempt_count * interval '5 minutes')
        end,
        failed_at = case when delivery_attempt_count >= 3 then now() else failed_at end,
        delivery_metadata = delivery_metadata || jsonb_build_object('last_finalized_at', now())
    where id = delivery_row.id
    returning * into delivery_row;
  end if;

  return jsonb_build_object(
    'delivery_id', delivery_row.id,
    'delivery_status', delivery_row.delivery_status,
    'attempt_count', delivery_row.delivery_attempt_count
  );
end;
$$;

revoke all on function public.finalize_service_request_payment_receipt_delivery_rpc(uuid, boolean, uuid, text, text, text) from public;
revoke all on function public.finalize_service_request_payment_receipt_delivery_rpc(uuid, boolean, uuid, text, text, text) from anon;
revoke all on function public.finalize_service_request_payment_receipt_delivery_rpc(uuid, boolean, uuid, text, text, text) from authenticated;
grant execute on function public.finalize_service_request_payment_receipt_delivery_rpc(uuid, boolean, uuid, text, text, text) to service_role;

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
      and allocation.voided_at is null
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

create or replace function public.get_public_payment_receipt_by_token_rpc(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_token text := lower(btrim(coalesce(p_token, '')));
  clean_token_hash text;
  token_row public.service_request_payment_receipt_tokens;
  receipt_row public.service_request_payment_receipts;
  request_row public.service_requests;
  invoice_number_text text := null;
  estimate_number_text text := null;
begin
  if clean_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Receipt is not accessible.' using errcode = '42501';
  end if;

  clean_token_hash := public.estimate_approval_token_hash(clean_token);

  select *
  into token_row
  from public.service_request_payment_receipt_tokens
  where token_hash = clean_token_hash
    and token_revoked_at is null
    and token_expires_at > now();

  if not found then
    raise exception 'Receipt is not accessible.' using errcode = '42501';
  end if;

  select *
  into receipt_row
  from public.service_request_payment_receipts
  where id = token_row.receipt_id;

  if not found then
    raise exception 'Receipt is not accessible.' using errcode = '42501';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = receipt_row.service_request_id;

  if receipt_row.invoice_id is not null then
    select invoice_number
    into invoice_number_text
    from public.service_request_invoices
    where id = receipt_row.invoice_id;
  end if;

  if receipt_row.estimate_id is not null then
    select estimate_number
    into estimate_number_text
    from public.service_request_estimates
    where id = receipt_row.estimate_id;
  end if;

  return jsonb_build_object(
    'receipt', jsonb_build_object(
      'receipt_number', receipt_row.receipt_number,
      'job_number', request_row.job_number,
      'amount', receipt_row.amount,
      'currency', receipt_row.currency,
      'payment_method', receipt_row.payment_method,
      'card_brand', receipt_row.card_brand,
      'card_last4', receipt_row.card_last4,
      'payment_status', receipt_row.payment_status,
      'paid_at', receipt_row.paid_at,
      'invoice_number', invoice_number_text,
      'estimate_number', estimate_number_text
    )
  );
end;
$$;

revoke all on function public.get_public_payment_receipt_by_token_rpc(text) from public;
grant execute on function public.get_public_payment_receipt_by_token_rpc(text) to anon, authenticated, service_role;
