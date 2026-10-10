-- INVOICE-DELIVERY-01: Secure public Invoice delivery and customer payment links.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Add revocable public Invoice tokens, provider delivery audit records, public
--   Invoice read/payment RPCs, and direct Invoice Checkout reservations while
--   reusing the canonical Finance V1 payment ledger and Stripe webhook posting.

create table if not exists public.service_request_invoice_delivery_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  invoice_id uuid not null references public.service_request_invoices(id) on delete cascade,
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  token_revoked_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_request_invoice_delivery_tokens_invoice_idx
  on public.service_request_invoice_delivery_tokens (invoice_id, token_revoked_at, token_expires_at);

create index if not exists service_request_invoice_delivery_tokens_request_idx
  on public.service_request_invoice_delivery_tokens (service_request_id, created_at desc);

drop trigger if exists set_service_request_invoice_delivery_tokens_updated_at
  on public.service_request_invoice_delivery_tokens;
create trigger set_service_request_invoice_delivery_tokens_updated_at
before update on public.service_request_invoice_delivery_tokens
for each row execute function public.set_updated_at();

create table if not exists public.service_request_invoice_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  invoice_id uuid not null references public.service_request_invoices(id) on delete cascade,
  invoice_token_id uuid references public.service_request_invoice_delivery_tokens(id) on delete set null,
  communication_message_id uuid references public.communication_messages(id) on delete set null,
  delivery_channel text not null,
  recipient text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  delivery_status text not null default 'pending',
  provider text,
  provider_message_id text,
  provider_status text,
  provider_error text,
  sent_by_profile_id uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  delivery_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_request_invoice_deliveries_channel_check
    check (delivery_channel in ('sms', 'email')),
  constraint service_request_invoice_deliveries_status_check
    check (delivery_status in ('pending', 'sent', 'delivered', 'failed')),
  constraint service_request_invoice_deliveries_idempotency_check
    check (length(btrim(idempotency_key)) >= 12),
  constraint service_request_invoice_deliveries_fingerprint_check
    check (length(btrim(request_fingerprint)) >= 12)
);

create unique index if not exists service_request_invoice_deliveries_idempotency_uidx
  on public.service_request_invoice_deliveries (company_id, idempotency_key);

create index if not exists service_request_invoice_deliveries_invoice_idx
  on public.service_request_invoice_deliveries (invoice_id, created_at desc);

drop trigger if exists set_service_request_invoice_deliveries_updated_at
  on public.service_request_invoice_deliveries;
create trigger set_service_request_invoice_deliveries_updated_at
before update on public.service_request_invoice_deliveries
for each row execute function public.set_updated_at();

alter table public.service_request_invoice_delivery_tokens enable row level security;
alter table public.service_request_invoice_deliveries enable row level security;

revoke all on public.service_request_invoice_delivery_tokens from public;
revoke all on public.service_request_invoice_deliveries from public;

grant select on public.service_request_invoice_delivery_tokens to authenticated;
grant select on public.service_request_invoice_deliveries to authenticated;

drop policy if exists "service_request_invoice_delivery_tokens_dashboard_select"
  on public.service_request_invoice_delivery_tokens;
create policy "service_request_invoice_delivery_tokens_dashboard_select"
on public.service_request_invoice_delivery_tokens
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_invoice_deliveries_dashboard_select"
  on public.service_request_invoice_deliveries;
create policy "service_request_invoice_deliveries_dashboard_select"
on public.service_request_invoice_deliveries
for select
to authenticated
using (public.can_view_service_request(service_request_id));

create or replace function public.send_service_request_invoice_to_customer_rpc(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.service_request_invoices;
  request_row public.service_requests;
  clean_token text;
  clean_token_hash text;
  token_row public.service_request_invoice_delivery_tokens;
  actor_profile_id uuid := auth.uid();
begin
  if p_invoice_id is null then
    raise exception 'Choose a valid Invoice to send.' using errcode = '22023';
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice was not found.' using errcode = 'P0002';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = invoice_row.service_request_id
  for update;

  if not found or request_row.company_id is null then
    raise exception 'Invoice Job is not available.' using errcode = '23514';
  end if;

  if not public.can_record_service_request_payment(request_row.id) then
    raise exception 'This account is not allowed to send that Invoice.' using errcode = '42501';
  end if;

  if invoice_row.source_system <> 'native' then
    raise exception 'Imported invoices cannot be sent through customer payment links.'
      using errcode = '23514';
  end if;

  if invoice_row.invoice_status = 'void' then
    raise exception 'Voided invoices cannot be sent.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 301));

  clean_token := replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  clean_token_hash := public.estimate_approval_token_hash(clean_token);

  update public.service_request_invoice_delivery_tokens
  set token_revoked_at = coalesce(token_revoked_at, now())
  where invoice_id = invoice_row.id
    and token_revoked_at is null;

  insert into public.service_request_invoice_delivery_tokens (
    company_id,
    service_request_id,
    invoice_id,
    token_hash,
    token_expires_at,
    created_by_profile_id
  )
  values (
    request_row.company_id,
    request_row.id,
    invoice_row.id,
    clean_token_hash,
    now() + interval '14 days',
    actor_profile_id
  )
  returning * into token_row;

  if invoice_row.invoice_status = 'draft' then
    update public.service_request_invoices
    set invoice_status = 'sent',
        sent_at = coalesce(sent_at, now())
    where id = invoice_row.id;
  end if;

  return jsonb_build_object(
    'invoice_token', clean_token,
    'invoice_token_id', token_row.id,
    'invoice_id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'invoice_status', case when invoice_row.invoice_status = 'draft' then 'sent' else invoice_row.invoice_status end,
    'service_request_id', request_row.id,
    'service_request_status', request_row.status,
    'company_id', request_row.company_id,
    'expires_at', token_row.token_expires_at
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
  paid_amount numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  balance_due numeric(10, 2) := 0;
  invoice_items jsonb := '[]'::jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('link_state', 'invalid');
  end if;

  clean_token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into token_row
  from public.service_request_invoice_delivery_tokens invoice_token
  where invoice_token.token_hash = clean_token_hash;

  if not found then
    return jsonb_build_object('link_state', 'not_found');
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = token_row.invoice_id;

  if not found then
    return jsonb_build_object('link_state', 'unavailable');
  end if;

  select *
  into request_row
  from public.service_requests
  where id = token_row.service_request_id
    and id = invoice_row.service_request_id
    and company_id = token_row.company_id;

  if not found then
    return jsonb_build_object('link_state', 'unavailable');
  end if;

  select *
  into company_row
  from public.companies
  where id = token_row.company_id;

  select coalesce(sum(allocation.allocation_amount), 0)
  into paid_amount
  from public.service_request_payment_allocations allocation
  where allocation.invoice_id = invoice_row.id
    and allocation.allocation_status = 'active';

  reserved_amount := public.active_payment_checkout_reserved_amount('invoice', invoice_row.id);
  balance_due := greatest(invoice_row.total - paid_amount - reserved_amount, 0);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'title', item.item_title,
        'quantity', item.quantity,
        'unit_price', item.unit_price,
        'line_total', item.line_total,
        'notes', item.notes
      )
      order by item.created_at, item.id
    ),
    '[]'::jsonb
  )
  into invoice_items
  from public.service_request_invoice_items item
  where item.invoice_id = invoice_row.id;

  return jsonb_build_object(
    'link_state',
      case
        when token_row.token_revoked_at is not null then 'revoked'
        when token_row.token_expires_at <= now() then 'expired'
        when invoice_row.invoice_status = 'void' then 'void'
        else 'active'
      end,
    'company', jsonb_build_object(
      'id', company_row.id,
      'name', coalesce(company_row.name, 'HomeFix Appliance Repair')
    ),
    'job', jsonb_build_object(
      'id', request_row.id,
      'job_number', request_row.job_number
    ),
    'customer', jsonb_build_object(
      'name', request_row.customer_name,
      'email', request_row.customer_email,
      'phone', request_row.customer_phone,
      'service_address', request_row.full_address
    ),
    'invoice', jsonb_build_object(
      'id', invoice_row.id,
      'invoice_number', invoice_row.invoice_number,
      'invoice_status', invoice_row.invoice_status,
      'source_estimate_id', invoice_row.estimate_id,
      'subtotal', invoice_row.subtotal,
      'tax', coalesce(invoice_row.tax, 0),
      'discount_amount', coalesce(invoice_row.discount_amount, 0),
      'total', invoice_row.total,
      'paid', paid_amount,
      'reserved', reserved_amount,
      'balance_due', balance_due,
      'sent_at', invoice_row.sent_at,
      'created_at', invoice_row.created_at,
      'items', invoice_items
    ),
    'payment', jsonb_build_object(
      'status',
        case
          when invoice_row.invoice_status = 'void' then 'blocked'
          when balance_due <= 0 then 'paid'
          when token_row.token_revoked_at is not null or token_row.token_expires_at <= now() then 'blocked'
          else 'eligible'
        end,
      'target_type', 'invoice',
      'checkout_kind', 'balance_due',
      'amount', balance_due
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
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
  normalized_checkout_kind text := lower(btrim(coalesce(p_checkout_kind, '')));
  clean_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  clean_fingerprint text := lower(btrim(coalesce(p_request_fingerprint, '')));
  token_row public.service_request_invoice_delivery_tokens;
  invoice_row public.service_request_invoices;
  request_row public.service_requests;
  existing_attempt public.service_request_payment_checkout_attempts;
  checkout_attempt public.service_request_payment_checkout_attempts;
  paid_amount numeric(10, 2) := 0;
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

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 301));

  if invoice_row.invoice_status = 'void' then
    raise exception 'Voided invoices cannot be paid.' using errcode = '23514';
  end if;

  select coalesce(sum(allocation.allocation_amount), 0)
  into paid_amount
  from public.service_request_payment_allocations allocation
  where allocation.invoice_id = invoice_row.id
    and allocation.allocation_status = 'active';

  reserved_amount := public.active_payment_checkout_reserved_amount('invoice', invoice_row.id);
  balance_due := greatest(invoice_row.total - paid_amount - reserved_amount, 0);

  if balance_due <= 0 then
    raise exception 'This Invoice is already paid.' using errcode = '23514';
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
      'payment_lifecycle', 'INVOICE-DELIVERY-01',
      'public_invoice_token', true,
      'invoice_token_id', token_row.id,
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

alter table public.communication_timeline_events
  drop constraint if exists communication_timeline_events_event_type_check,
  add constraint communication_timeline_events_event_type_check
    check (event_type in (
      'incoming_call',
      'incoming_sms',
      'website_request',
      'incoming_email',
      'customer_replied',
      'appointment_scheduled',
      'appointment_changed',
      'estimate_sent',
      'estimate_approved',
      'estimate_declined',
      'invoice_sent',
      'invoice_delivery_failed',
      'payment_received',
      'payment_voided',
      'repair_completed',
      'customer_canceled',
      'note_added'
    ));

revoke all on function public.send_service_request_invoice_to_customer_rpc(uuid) from public;
revoke all on function public.get_public_invoice_by_token_rpc(text) from public;
revoke all on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) from public;

grant execute on function public.send_service_request_invoice_to_customer_rpc(uuid) to authenticated;
grant execute on function public.get_public_invoice_by_token_rpc(text) to anon, authenticated;
grant execute on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) to anon, authenticated;

comment on function public.send_service_request_invoice_to_customer_rpc(uuid) is
  'INVOICE-DELIVERY-01. Authenticated Invoice delivery token preparation; provider send is recorded after transport acceptance.';
comment on function public.get_public_invoice_by_token_rpc(text) is
  'INVOICE-DELIVERY-01. Read-only public Invoice document by secure delivery token.';
comment on function public.reserve_public_invoice_payment_checkout_rpc(text, text, text, text, text) is
  'INVOICE-DELIVERY-01. Token-aware public Invoice balance checkout reservation.';
