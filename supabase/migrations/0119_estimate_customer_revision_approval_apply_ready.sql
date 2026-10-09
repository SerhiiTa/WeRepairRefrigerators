-- ESTIMATE-LIFECYCLE-03: Customer approval revisions.
--
-- Forward-only, apply-ready.
-- Purpose:
--   Preserve immutable customer-facing Estimate revisions while keeping the
--   existing dashboard Estimate, manual approval, Payment Ledger, deposits and
--   invoice conversion semantics intact.
--
-- Safety:
--   - This migration is NOT applied automatically by Codex.
--   - Public links resolve only through SECURITY DEFINER RPCs.
--   - Already sent revisions remain immutable snapshots.
--   - Stale/revoked/expired revision links cannot approve a newer Estimate.

create table if not exists public.service_request_estimate_revisions (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null
    references public.service_request_estimates(id)
    on delete cascade,
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  company_id uuid not null
    references public.companies(id)
    on delete cascade,
  revision_number integer not null,
  revision_status text not null default 'sent'
    check (revision_status in ('sent', 'approved', 'declined', 'revoked', 'expired')),
  estimate_number text not null,
  estimate_status_at_send text not null,
  subtotal numeric(10,2) not null default 0,
  discount_type text,
  discount_value numeric(10,2),
  discount_amount numeric(10,2) not null default 0,
  tax_rate numeric(7,4),
  taxable_amount numeric(10,2),
  non_taxable_amount numeric(10,2),
  tax numeric(10,2),
  total numeric(10,2) not null default 0,
  warranty_text text,
  disclaimer_text text,
  customer_preview_notes text,
  snapshot jsonb not null default '{}'::jsonb,
  public_approval_token_hash text,
  token_expires_at timestamptz not null default (now() + interval '14 days'),
  token_revoked_at timestamptz,
  sent_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  sent_at timestamptz not null default now(),
  customer_decision text
    check (customer_decision is null or customer_decision in ('approved', 'declined')),
  customer_decision_at timestamptz,
  customer_decision_channel text,
  customer_decision_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_request_estimate_revisions_revision_positive_check
    check (revision_number > 0),
  constraint service_request_estimate_revisions_token_hash_check
    check (
      public_approval_token_hash is null
      or public_approval_token_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint service_request_estimate_revisions_decision_timestamp_check
    check (
      (customer_decision is null and customer_decision_at is null)
      or (customer_decision is not null and customer_decision_at is not null)
    )
);

comment on table public.service_request_estimate_revisions is
  'ESTIMATE-LIFECYCLE-03. Immutable sent customer-facing Estimate revision snapshots and public approval tokens.';

create unique index if not exists service_request_estimate_revisions_estimate_revision_idx
  on public.service_request_estimate_revisions (estimate_id, revision_number);

create unique index if not exists service_request_estimate_revisions_token_hash_idx
  on public.service_request_estimate_revisions (public_approval_token_hash)
  where public_approval_token_hash is not null;

create unique index if not exists service_request_estimate_revisions_current_sent_idx
  on public.service_request_estimate_revisions (estimate_id)
  where revision_status = 'sent'
    and token_revoked_at is null
    and customer_decision is null;

create index if not exists service_request_estimate_revisions_request_idx
  on public.service_request_estimate_revisions (service_request_id, revision_number desc);

drop trigger if exists set_service_request_estimate_revisions_updated_at
  on public.service_request_estimate_revisions;
create trigger set_service_request_estimate_revisions_updated_at
before update on public.service_request_estimate_revisions
for each row
execute function public.set_updated_at();

create table if not exists public.service_request_estimate_revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null
    references public.service_request_estimate_revisions(id)
    on delete cascade,
  source_item_id uuid
    references public.service_request_estimate_items(id)
    on delete set null,
  pricing_catalog_item_id uuid
    references public.pricing_catalog_items(id)
    on delete set null,
  item_title text not null,
  quantity integer not null,
  unit_price numeric(10,2) not null,
  line_total numeric(10,2) not null,
  notes text,
  technician_cost numeric(10,2),
  internal_cost numeric(10,2),
  taxable boolean not null default true,
  warranty_text text,
  item_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint service_request_estimate_revision_items_title_check
    check (length(btrim(item_title)) > 0),
  constraint service_request_estimate_revision_items_quantity_check
    check (quantity > 0 and quantity <= 1000),
  constraint service_request_estimate_revision_items_money_check
    check (unit_price >= 0 and line_total >= 0)
);

comment on table public.service_request_estimate_revision_items is
  'ESTIMATE-LIFECYCLE-03. Immutable line-item snapshot for a sent customer Estimate revision.';

create index if not exists service_request_estimate_revision_items_revision_idx
  on public.service_request_estimate_revision_items (revision_id, created_at, id);

create table if not exists public.service_request_estimate_revision_deliveries (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null
    references public.service_request_estimate_revisions(id)
    on delete cascade,
  communication_message_id uuid
    references public.communication_messages(id)
    on delete set null,
  delivery_channel text not null
    check (delivery_channel in ('approval_link', 'sms', 'email')),
  delivery_status text not null
    check (delivery_status in ('pending', 'sent', 'delivered', 'failed', 'unavailable')),
  recipient text,
  idempotency_key text,
  request_fingerprint text,
  provider text,
  provider_message_id text,
  provider_status text,
  provider_error text,
  sent_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  delivery_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.service_request_estimate_revision_deliveries is
  'ESTIMATE-LIFECYCLE-03. Provider delivery/audit records for Estimate revision links. Status may be unavailable when no provider is configured.';

create index if not exists service_request_estimate_revision_deliveries_revision_idx
  on public.service_request_estimate_revision_deliveries (revision_id, created_at desc);

create unique index if not exists service_request_estimate_revision_deliveries_idempotency_uidx
  on public.service_request_estimate_revision_deliveries (idempotency_key)
  where idempotency_key is not null;

create index if not exists service_request_estimate_revision_deliveries_message_idx
  on public.service_request_estimate_revision_deliveries (communication_message_id)
  where communication_message_id is not null;

drop trigger if exists set_service_request_estimate_revision_deliveries_updated_at
  on public.service_request_estimate_revision_deliveries;
create trigger set_service_request_estimate_revision_deliveries_updated_at
before update on public.service_request_estimate_revision_deliveries
for each row
execute function public.set_updated_at();

create or replace function public.validate_service_request_estimate_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  request_company_id uuid;
begin
  select *
  into estimate_row
  from public.service_request_estimates
  where id = new.estimate_id;

  if not found then
    raise exception 'Estimate was not found.' using errcode = '23503';
  end if;

  if new.service_request_id <> estimate_row.service_request_id then
    raise exception 'Estimate revision must belong to the same Job as the Estimate.'
      using errcode = '23514';
  end if;

  select company_id
  into request_company_id
  from public.service_requests
  where id = estimate_row.service_request_id;

  if request_company_id is null then
    raise exception 'Estimate revision requires a company-scoped Job.'
      using errcode = '23514';
  end if;

  if new.company_id <> request_company_id then
    raise exception 'Estimate revision must belong to the same company as the Job.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_service_request_estimate_revision
  on public.service_request_estimate_revisions;
create trigger validate_service_request_estimate_revision
before insert or update on public.service_request_estimate_revisions
for each row
execute function public.validate_service_request_estimate_revision();

create or replace function public.create_service_request_estimate_revision_snapshot(
  p_estimate_id uuid,
  p_token_hash text,
  p_sent_by_profile_id uuid
)
returns public.service_request_estimate_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  request_row public.service_requests;
  revision_row public.service_request_estimate_revisions;
  next_revision_number integer;
begin
  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = estimate_row.service_request_id;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('estimate-revisions'), hashtext(estimate_row.id::text));

  update public.service_request_estimate_revisions
  set
    revision_status = case when revision_status = 'sent' then 'revoked' else revision_status end,
    token_revoked_at = coalesce(token_revoked_at, now()),
    updated_at = now()
  where estimate_id = estimate_row.id
    and token_revoked_at is null
    and customer_decision is null;

  select coalesce(max(revision_number), 0) + 1
  into next_revision_number
  from public.service_request_estimate_revisions
  where estimate_id = estimate_row.id;

  insert into public.service_request_estimate_revisions (
    estimate_id,
    service_request_id,
    company_id,
    revision_number,
    revision_status,
    estimate_number,
    estimate_status_at_send,
    subtotal,
    discount_type,
    discount_value,
    discount_amount,
    tax_rate,
    taxable_amount,
    non_taxable_amount,
    tax,
    total,
    warranty_text,
    disclaimer_text,
    customer_preview_notes,
    snapshot,
    public_approval_token_hash,
    sent_by_profile_id,
    sent_at
  )
  values (
    estimate_row.id,
    estimate_row.service_request_id,
    request_row.company_id,
    next_revision_number,
    'sent',
    estimate_row.estimate_number,
    estimate_row.estimate_status,
    estimate_row.subtotal,
    estimate_row.discount_type,
    estimate_row.discount_value,
    coalesce(estimate_row.discount_amount, 0),
    estimate_row.tax_rate,
    estimate_row.taxable_amount,
    estimate_row.non_taxable_amount,
    estimate_row.tax,
    estimate_row.total,
    estimate_row.warranty_text,
    estimate_row.disclaimer_text,
    estimate_row.customer_preview_notes,
    jsonb_build_object(
      'estimate', to_jsonb(estimate_row),
      'service_request', jsonb_build_object(
        'id', request_row.id,
        'job_number', request_row.job_number,
        'customer_id', request_row.customer_id,
        'company_id', request_row.company_id,
        'customer_name', request_row.customer_name,
        'appliance_type', request_row.appliance_type,
        'appliance_brand', request_row.appliance_brand,
        'appliance_model', request_row.appliance_model,
        'issue_description', request_row.issue_description,
        'city', request_row.city,
        'state', request_row.state,
        'zip_code', request_row.zip_code,
        'selected_technician_business_name', request_row.selected_technician_business_name
      )
    ),
    p_token_hash,
    p_sent_by_profile_id,
    now()
  )
  returning * into revision_row;

  insert into public.service_request_estimate_revision_items (
    revision_id,
    source_item_id,
    pricing_catalog_item_id,
    item_title,
    quantity,
    unit_price,
    line_total,
    notes,
    technician_cost,
    internal_cost,
    taxable,
    warranty_text,
    item_metadata
  )
  select
    revision_row.id,
    item.id,
    item.pricing_catalog_item_id,
    item.item_title,
    item.quantity,
    item.unit_price,
    item.line_total,
    item.notes,
    item.technician_cost,
    item.internal_cost,
    coalesce(item.taxable, true),
    item.warranty_text,
    to_jsonb(item)
  from public.service_request_estimate_items item
  where item.estimate_id = estimate_row.id
  order by item.created_at, item.id;

  insert into public.service_request_estimate_revision_deliveries (
    revision_id,
    delivery_channel,
    delivery_status,
    provider,
    sent_by_profile_id,
    delivery_metadata,
    created_at,
    updated_at
  )
  values (
    revision_row.id,
    'approval_link',
    'sent',
    'homefixos',
    p_sent_by_profile_id,
    jsonb_build_object('note', 'Approval link generated locally.'),
    now(),
    now()
  );

  insert into public.service_request_estimate_revision_deliveries (
    revision_id,
    delivery_channel,
    delivery_status,
    sent_by_profile_id,
    provider_error,
    delivery_metadata,
    created_at,
    updated_at
  )
  values
    (
      revision_row.id,
      'email',
      'unavailable',
      p_sent_by_profile_id,
      'Email estimate delivery provider is not configured for this workflow.',
      jsonb_build_object('safe_customer_message', 'Email delivery is unavailable. Copy the approval link instead.'),
      now(),
      now()
    );

  return revision_row;
end;
$$;

create or replace function public.send_service_request_estimate_to_customer_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  request_row public.service_requests;
  revision_row public.service_request_estimate_revisions;
  raw_token text;
  hashed_token text;
  next_estimate_status text;
  next_request_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  if estimate_row.estimate_status not in ('draft', 'sent', 'approved') then
    raise exception 'Only draft, sent, or approved estimates can be sent to customers.'
      using errcode = '42501';
  end if;

  if estimate_row.total <= 0 then
    raise exception 'Estimate total must be greater than zero before sending.'
      using errcode = '22023';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = estimate_row.service_request_id;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.service_request_estimate_items item
    where item.estimate_id = estimate_row.id
  ) then
    raise exception 'Estimate requires at least one line item before sending.'
      using errcode = '22023';
  end if;

  raw_token := replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  hashed_token := public.estimate_approval_token_hash(raw_token);

  revision_row := public.create_service_request_estimate_revision_snapshot(
    estimate_row.id,
    hashed_token,
    auth.uid()
  );

  next_estimate_status := case
    when estimate_row.estimate_status = 'approved' then 'approved'
    else 'sent'
  end;
  next_request_status := case
    when estimate_row.estimate_status = 'approved' then 'estimate_approved'
    else 'estimate_sent'
  end;

  update public.service_request_estimates
  set
    estimate_status = next_estimate_status,
    public_approval_token_hash = hashed_token,
    sent_at = now(),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set status = next_request_status, updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.communication_timeline_events (
    conversation_id,
    event_type,
    title,
    body,
    event_time,
    service_request_id,
    estimate_id
  )
  select
    conversation.id,
    'estimate_sent',
    'Estimate sent',
    'Estimate ' || estimate_row.estimate_number ||
      ' revision ' || revision_row.revision_number ||
      ' was sent to the customer.',
    revision_row.sent_at,
    estimate_row.service_request_id,
    estimate_row.id
  from public.communication_conversations conversation
  where conversation.service_request_id = estimate_row.service_request_id
    and conversation.company_id = revision_row.company_id
  order by
    case when conversation.customer_id = request_row.customer_id then 0 else 1 end,
    conversation.updated_at desc
  limit 1;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    estimate_row.service_request_id,
    auth.uid(),
    'estimate',
    case
      when next_estimate_status = 'approved'
        then 'Approved estimate ' || estimate_row.estimate_number ||
          ' revision ' || revision_row.revision_number ||
          ' was sent to the customer for records.'
      else 'Estimate ' || estimate_row.estimate_number ||
        ' revision ' || revision_row.revision_number ||
        ' was sent to the customer for approval.'
    end
  );

  if next_request_status = 'estimate_sent' then
    insert into public.service_request_notes (
      service_request_id,
      created_by_profile_id,
      note_type,
      body
    )
    values (
      estimate_row.service_request_id,
      auth.uid(),
      'status_change',
      'Job status automatically changed to Estimate Sent after estimate ' ||
        estimate_row.estimate_number || ' was sent.'
    );
  end if;

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'sent_at', estimate_row.sent_at,
    'service_request_status', next_request_status,
    'approval_token', raw_token,
    'revision_id', revision_row.id,
    'revision_number', revision_row.revision_number,
    'revision_status', revision_row.revision_status,
    'delivery_status', 'link_generated',
    'provider_delivery', jsonb_build_object(
      'approval_link', 'sent',
      'sms', 'unavailable',
      'email', 'unavailable'
    )
  );
end;
$$;

create or replace function public.revise_service_request_estimate_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id
  for update;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  if estimate_row.estimate_status not in ('sent', 'declined') then
    raise exception 'Only sent or declined estimates can be revised.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_payment_allocations allocation
    where allocation.estimate_id = estimate_row.id
      and allocation.allocation_status = 'active'
  ) then
    raise exception 'Estimates with payments cannot be revised. Create a new supplemental estimate instead.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoices invoice
    where invoice.estimate_id = estimate_row.id
      and invoice.invoice_status <> 'void'
  ) then
    raise exception 'Estimates linked to an invoice cannot be revised.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoice_estimates membership
    where membership.estimate_id = estimate_row.id
      and membership.membership_status = 'active'
  ) then
    raise exception 'Estimates included in an invoice cannot be revised.'
      using errcode = '42501';
  end if;

  update public.service_request_estimate_revisions
  set
    revision_status = case when revision_status = 'sent' then 'revoked' else revision_status end,
    token_revoked_at = coalesce(token_revoked_at, now()),
    updated_at = now()
  where estimate_id = estimate_row.id
    and token_revoked_at is null
    and customer_decision is null;

  update public.service_request_estimates
  set
    estimate_status = 'draft',
    public_approval_token_hash = null,
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    estimate_row.service_request_id,
    auth.uid(),
    'estimate',
    'Estimate ' || estimate_row.estimate_number ||
      ' was reopened as a draft revision. Previously sent customer links were revoked.'
  );

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status
  );
end;
$$;

create or replace function public.get_public_estimate_by_token_rpc(
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
  request_row public.service_requests;
  items_json jsonb;
  deliveries_json jsonb;
  link_state text := 'active';
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Estimate link is invalid.' using errcode = '22023';
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into revision_row
  from public.service_request_estimate_revisions
  where public_approval_token_hash = token_hash;

  if not found then
    raise exception 'Estimate link was not found.' using errcode = 'P0002';
  end if;

  select * into estimate_row
  from public.service_request_estimates
  where id = revision_row.estimate_id;

  select * into request_row
  from public.service_requests
  where id = revision_row.service_request_id;

  if revision_row.token_revoked_at is not null then
    link_state := 'updated';
  elsif revision_row.token_expires_at <= now() then
    link_state := 'expired';
  elsif revision_row.customer_decision is not null then
    link_state := revision_row.customer_decision;
  elsif estimate_row.estimate_status <> 'sent' then
    link_state := 'unavailable';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_title', item.item_title,
        'quantity', item.quantity,
        'unit_price', item.unit_price,
        'line_total', item.line_total,
        'notes', item.notes,
        'warranty_text', item.warranty_text
      )
      order by item.created_at, item.id
    ),
    '[]'::jsonb
  )
  into items_json
  from public.service_request_estimate_revision_items item
  where item.revision_id = revision_row.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'delivery_channel', delivery.delivery_channel,
        'delivery_status', delivery.delivery_status,
        'provider', delivery.provider,
        'provider_message_id', delivery.provider_message_id,
        'provider_status', delivery.provider_status,
        'provider_error', delivery.provider_error,
        'sent_at', delivery.sent_at,
        'delivered_at', delivery.delivered_at,
        'failed_at', delivery.failed_at
      )
      order by delivery.created_at, delivery.id
    ),
    '[]'::jsonb
  )
  into deliveries_json
  from public.service_request_estimate_revision_deliveries delivery
  where delivery.revision_id = revision_row.id;

  return jsonb_build_object(
    'estimate', jsonb_build_object(
      'id', revision_row.estimate_id,
      'revision_id', revision_row.id,
      'revision_number', revision_row.revision_number,
      'link_state', link_state,
      'estimate_number', revision_row.estimate_number,
      'estimate_status', case
        when link_state = 'active' then estimate_row.estimate_status
        when link_state in ('approved', 'declined') then link_state
        else revision_row.revision_status
      end,
      'subtotal', revision_row.subtotal,
      'discount_type', revision_row.discount_type,
      'discount_value', revision_row.discount_value,
      'discount_amount', revision_row.discount_amount,
      'tax_rate', revision_row.tax_rate,
      'taxable_amount', revision_row.taxable_amount,
      'non_taxable_amount', revision_row.non_taxable_amount,
      'tax', revision_row.tax,
      'total', revision_row.total,
      'warranty_text', revision_row.warranty_text,
      'disclaimer_text', revision_row.disclaimer_text,
      'customer_preview_notes', revision_row.customer_preview_notes,
      'sent_at', revision_row.sent_at,
      'token_expires_at', revision_row.token_expires_at,
      'customer_responded_at', revision_row.customer_decision_at,
      'items', items_json,
      'deliveries', deliveries_json
    ),
    'service_request', jsonb_build_object(
      'customer_name', request_row.customer_name,
      'appliance_type', request_row.appliance_type,
      'appliance_brand', request_row.appliance_brand,
      'appliance_model', request_row.appliance_model,
      'issue_description', request_row.issue_description,
      'city', request_row.city,
      'state', request_row.state,
      'zip_code', request_row.zip_code,
      'selected_technician_business_name', request_row.selected_technician_business_name
    )
  );
end;
$$;

create or replace function public.respond_to_public_estimate_rpc(
  p_token text,
  p_response text
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
  request_row public.service_requests;
  next_request_status text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Estimate link is invalid.' using errcode = '22023';
  end if;

  if p_response is null or p_response not in ('approved', 'declined') then
    raise exception 'Estimate response must be approved or declined.' using errcode = '22023';
  end if;

  token_hash := public.estimate_approval_token_hash(p_token);

  select *
  into revision_row
  from public.service_request_estimate_revisions
  where public_approval_token_hash = token_hash
  for update;

  if not found then
    raise exception 'Estimate link was not found.' using errcode = 'P0002';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = revision_row.estimate_id
  for update;

  select *
  into request_row
  from public.service_requests
  where id = revision_row.service_request_id;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if revision_row.token_revoked_at is not null then
    raise exception 'This estimate has been updated. Ask the technician for the newest estimate link.'
      using errcode = '42501';
  end if;

  if revision_row.token_expires_at <= now() then
    update public.service_request_estimate_revisions
    set revision_status = 'expired', updated_at = now()
    where id = revision_row.id;

    raise exception 'This estimate link has expired. Ask the technician for a new estimate link.'
      using errcode = '42501';
  end if;

  if revision_row.customer_decision is not null then
    return jsonb_build_object(
      'id', estimate_row.id,
      'estimate_number', estimate_row.estimate_number,
      'estimate_status', revision_row.customer_decision,
      'revision_id', revision_row.id,
      'revision_number', revision_row.revision_number,
      'customer_responded_at', revision_row.customer_decision_at,
      'idempotent', true
    );
  end if;

  if estimate_row.estimate_status <> 'sent' then
    raise exception 'Only the current sent estimate revision can receive a customer response.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoices invoice
    where invoice.estimate_id = estimate_row.id
      and invoice.invoice_status <> 'void'
  ) then
    raise exception 'This estimate is already linked to an invoice.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_request_invoice_estimates membership
    where membership.estimate_id = estimate_row.id
      and membership.membership_status = 'active'
  ) then
    raise exception 'This estimate is already linked to an invoice.'
      using errcode = '42501';
  end if;

  next_request_status := case
    when p_response = 'approved' then 'estimate_approved'
    else 'estimate_declined'
  end;

  update public.service_request_estimate_revisions
  set
    revision_status = p_response,
    customer_decision = p_response,
    customer_decision_at = now(),
    customer_decision_channel = 'public_link',
    customer_decision_metadata = jsonb_build_object(
      'decision_source', 'customer_public_link',
      'token_hash', token_hash
    ),
    updated_at = now()
  where id = revision_row.id
  returning * into revision_row;

  update public.service_request_estimates
  set
    estimate_status = p_response,
    customer_responded_at = revision_row.customer_decision_at,
    approval_source = case when p_response = 'approved' then 'customer' else approval_source end,
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set status = next_request_status, updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.communication_timeline_events (
    conversation_id,
    event_type,
    title,
    body,
    event_time,
    service_request_id,
    estimate_id
  )
  select
    conversation.id,
    case when p_response = 'approved' then 'estimate_approved' else 'estimate_declined' end,
    case when p_response = 'approved' then 'Estimate approved' else 'Estimate declined' end,
    'Customer ' || case when p_response = 'approved' then 'approved' else 'declined' end ||
      ' estimate ' || estimate_row.estimate_number ||
      ' revision ' || revision_row.revision_number || '.',
    revision_row.customer_decision_at,
    estimate_row.service_request_id,
    estimate_row.id
  from public.communication_conversations conversation
  where conversation.service_request_id = estimate_row.service_request_id
    and conversation.company_id = revision_row.company_id
  order by
    case when conversation.customer_id = request_row.customer_id then 0 else 1 end,
    conversation.updated_at desc
  limit 1;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values
    (
      estimate_row.service_request_id,
      null,
      'estimate',
      'Customer ' || case when p_response = 'approved' then 'approved' else 'declined' end ||
        ' estimate ' || estimate_row.estimate_number ||
        ' revision ' || revision_row.revision_number || '.'
    ),
    (
      estimate_row.service_request_id,
      null,
      'status_change',
      case
        when p_response = 'approved'
          then 'Job status automatically changed to Estimate Approved after customer approval.'
        else 'Job status automatically changed to Waiting Customer after customer declined the estimate.'
      end
    );

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'revision_id', revision_row.id,
    'revision_number', revision_row.revision_number,
    'service_request_status', next_request_status,
    'customer_responded_at', estimate_row.customer_responded_at,
    'approval_source', estimate_row.approval_source
  );
end;
$$;

revoke all on public.service_request_estimate_revisions from public;
revoke all on public.service_request_estimate_revision_items from public;
revoke all on public.service_request_estimate_revision_deliveries from public;

alter table public.service_request_estimate_revisions enable row level security;
alter table public.service_request_estimate_revision_items enable row level security;
alter table public.service_request_estimate_revision_deliveries enable row level security;

drop policy if exists "service_request_estimate_revisions_dashboard_select"
  on public.service_request_estimate_revisions;
create policy "service_request_estimate_revisions_dashboard_select"
on public.service_request_estimate_revisions
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_estimate_revision_items_dashboard_select"
  on public.service_request_estimate_revision_items;
create policy "service_request_estimate_revision_items_dashboard_select"
on public.service_request_estimate_revision_items
for select
to authenticated
using (
  exists (
    select 1
    from public.service_request_estimate_revisions revision
    where revision.id = service_request_estimate_revision_items.revision_id
      and public.can_view_service_request(revision.service_request_id)
  )
);

drop policy if exists "service_request_estimate_revision_deliveries_dashboard_select"
  on public.service_request_estimate_revision_deliveries;
create policy "service_request_estimate_revision_deliveries_dashboard_select"
on public.service_request_estimate_revision_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.service_request_estimate_revisions revision
    where revision.id = service_request_estimate_revision_deliveries.revision_id
      and public.can_view_service_request(revision.service_request_id)
  )
);

grant select on public.service_request_estimate_revisions to authenticated;
grant select on public.service_request_estimate_revision_items to authenticated;
grant select on public.service_request_estimate_revision_deliveries to authenticated;

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
      'payment_received',
      'repair_completed',
      'customer_canceled',
      'note_added'
    ));

revoke all on function public.create_service_request_estimate_revision_snapshot(uuid, text, uuid) from public;
revoke all on function public.send_service_request_estimate_to_customer_rpc(uuid) from public;
revoke all on function public.revise_service_request_estimate_rpc(uuid) from public;
revoke all on function public.get_public_estimate_by_token_rpc(text) from public;
revoke all on function public.respond_to_public_estimate_rpc(text, text) from public;

grant execute on function public.send_service_request_estimate_to_customer_rpc(uuid) to authenticated;
grant execute on function public.revise_service_request_estimate_rpc(uuid) to authenticated;
grant execute on function public.get_public_estimate_by_token_rpc(text) to anon, authenticated;
grant execute on function public.respond_to_public_estimate_rpc(text, text) to anon, authenticated;

comment on function public.send_service_request_estimate_to_customer_rpc(uuid) is
  'ESTIMATE-LIFECYCLE-03. Creates an immutable sent Estimate revision, revokes stale open links, and returns a public approval token.';
comment on function public.revise_service_request_estimate_rpc(uuid) is
  'ESTIMATE-LIFECYCLE-03. Reopens eligible sent/declined estimates as draft while preserving sent revision snapshots and revoking old links.';
comment on function public.get_public_estimate_by_token_rpc(text) is
  'ESTIMATE-LIFECYCLE-03. Public read-only resolver for immutable Estimate revision approval links.';
comment on function public.respond_to_public_estimate_rpc(text, text) is
  'ESTIMATE-LIFECYCLE-03. Public customer approve/decline mutation for the current sent revision only.';
