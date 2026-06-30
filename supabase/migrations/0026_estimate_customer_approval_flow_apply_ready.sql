-- Task 101: Customer estimate approval flow.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add tokenized customer estimate review links. Technicians can send draft
--   estimates, customers can approve/decline without login, and the service
--   request status moves with the response.
--
-- Security model:
--   - Raw approval tokens are never stored, only SHA-256 hashes.
--   - Send remains authenticated and checks can_view_service_request(...).
--   - Customer public reads/responses are limited to token-specific RPCs.
--   - Public RPC output excludes internal notes, technician private data,
--     customer email/phone, technician cost, profile IDs, and company IDs.
--   - No broad table SELECT/UPDATE grants are added.

create extension if not exists pgcrypto;

alter table public.service_request_estimates
  add column if not exists public_approval_token_hash text,
  add column if not exists sent_at timestamptz,
  add column if not exists customer_responded_at timestamptz;

alter table public.service_request_estimates
  drop constraint if exists service_request_estimates_status_check,
  drop constraint if exists service_request_estimates_estimate_status_check;

alter table public.service_request_estimates
  add constraint service_request_estimates_status_check
  check (estimate_status in (
    'draft',
    'sent',
    'approved',
    'declined',
    'void',
    -- Legacy/future values retained so older dev rows do not block migration.
    'presented',
    'converted_to_invoice'
  ));

alter table public.service_request_estimates
  drop constraint if exists service_request_estimates_public_token_hash_length_check,
  add constraint service_request_estimates_public_token_hash_length_check
  check (
    public_approval_token_hash is null
    or public_approval_token_hash ~ '^[0-9a-f]{64}$'
  );

create unique index if not exists service_request_estimates_public_token_hash_idx
  on public.service_request_estimates (public_approval_token_hash)
  where public_approval_token_hash is not null;

alter table public.service_requests
  drop constraint if exists service_requests_status_check;

alter table public.service_requests
  add constraint service_requests_status_check
  check (status in (
    'new',
    'contacted',
    'scheduled',
    'completed',
    'canceled',
    'estimate_approved',
    'estimate_declined',
    -- Legacy/dev values retained so older verification rows do not block
    -- migration application. The app status RPC still writes only CRM values.
    'reviewed',
    'lead_created',
    'archived',
    'spam'
  ));

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
  raw_token text;
  hashed_token text;
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

  if estimate_row.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be sent to customers.' using errcode = '42501';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  hashed_token := encode(digest(raw_token, 'sha256'), 'hex');

  update public.service_request_estimates
  set
    estimate_status = 'sent',
    public_approval_token_hash = hashed_token,
    sent_at = now(),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    estimate_row.service_request_id,
    auth.uid(),
    'estimate',
    'Estimate ' || estimate_row.estimate_number || ' was sent to the customer for approval.'
  );

  return jsonb_build_object(
    'id', estimate_row.id,
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'sent_at', estimate_row.sent_at,
    'approval_token', raw_token
  );
end;
$$;

comment on function public.send_service_request_estimate_to_customer_rpc(uuid) is
  'Task 101. Authenticated draft-only send action that returns a one-time-visible raw public approval token while storing only its hash.';

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
  estimate_row public.service_request_estimates;
  request_row public.service_requests;
  items_json jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select *
  into estimate_row
  from public.service_request_estimates
  where public_approval_token_hash = token_hash
    and estimate_status in ('sent', 'approved', 'declined')
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into request_row
  from public.service_requests
  where id = estimate_row.service_request_id;

  if not found then
    return null;
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
      order by item.created_at asc
    ),
    '[]'::jsonb
  )
  into items_json
  from public.service_request_estimate_items item
  where item.estimate_id = estimate_row.id;

  return jsonb_build_object(
    'estimate', jsonb_build_object(
      'estimate_number', estimate_row.estimate_number,
      'estimate_status', estimate_row.estimate_status,
      'subtotal', estimate_row.subtotal,
      'tax', estimate_row.tax,
      'total', estimate_row.total,
      'warranty_text', estimate_row.warranty_text,
      'disclaimer_text', estimate_row.disclaimer_text,
      'sent_at', estimate_row.sent_at,
      'customer_responded_at', estimate_row.customer_responded_at,
      'items', items_json
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

comment on function public.get_public_estimate_by_token_rpc(text) is
  'Task 101. Public token-specific estimate read model. Returns only customer-safe estimate and service summary fields.';

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
  estimate_row public.service_request_estimates;
  next_estimate_status text;
  next_request_status text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid estimate token.' using errcode = '22023';
  end if;

  if p_response is null or p_response not in ('approved', 'declined') then
    raise exception 'Invalid estimate response.' using errcode = '22023';
  end if;

  token_hash := encode(digest(p_token, 'sha256'), 'hex');
  next_estimate_status := p_response;
  next_request_status := case
    when p_response = 'approved' then 'estimate_approved'
    else 'estimate_declined'
  end;

  select *
  into estimate_row
  from public.service_request_estimates
  where public_approval_token_hash = token_hash
  limit 1;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if estimate_row.estimate_status <> 'sent' then
    raise exception 'Only sent estimates can receive a customer response.' using errcode = '42501';
  end if;

  update public.service_request_estimates
  set
    estimate_status = next_estimate_status,
    customer_responded_at = now(),
    updated_at = now()
  where id = estimate_row.id
  returning * into estimate_row;

  update public.service_requests
  set status = next_request_status, updated_at = now()
  where id = estimate_row.service_request_id;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    estimate_row.service_request_id,
    null,
    'estimate',
    'Customer ' || p_response || ' estimate ' || estimate_row.estimate_number || '.'
  );

  return jsonb_build_object(
    'estimate_number', estimate_row.estimate_number,
    'estimate_status', estimate_row.estimate_status,
    'service_request_status', next_request_status,
    'customer_responded_at', estimate_row.customer_responded_at
  );
end;
$$;

comment on function public.respond_to_public_estimate_rpc(text, text) is
  'Task 101. Public token-specific customer approve/decline mutation for sent estimates only.';

revoke all on function public.send_service_request_estimate_to_customer_rpc(uuid) from public;
revoke all on function public.get_public_estimate_by_token_rpc(text) from public;
revoke all on function public.respond_to_public_estimate_rpc(text, text) from public;

grant execute on function public.send_service_request_estimate_to_customer_rpc(uuid) to authenticated;
grant execute on function public.get_public_estimate_by_token_rpc(text) to anon, authenticated;
grant execute on function public.respond_to_public_estimate_rpc(text, text) to anon, authenticated;
