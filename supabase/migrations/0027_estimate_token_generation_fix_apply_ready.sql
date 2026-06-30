-- Task 101 follow-up: Estimate approval token generation fix.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Patch the estimate approval RPCs from migration 0026 without rewriting
--   the already-applied migration. The original send RPC used
--   gen_random_bytes(...), which is not available in this Supabase project.
--   This patch avoids gen_random_bytes entirely and generates a 64-character
--   public token from two UUIDv4 values. The stored value remains a SHA-256
--   hash of the raw token.
--
-- Security model preserved:
--   - Raw approval tokens are still non-guessable 64-character hex strings.
--   - Only the SHA-256 token hash is stored.
--   - The raw token is returned only once from the authenticated send RPC.
--   - Customer public access remains token-specific through RPCs only.
--   - No RLS policy, table grant, or frontend service-role behavior changes.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.estimate_approval_token_hash(
  p_token text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  hash_value text;
begin
  if p_token is null then
    return null;
  end if;

  if to_regprocedure('extensions.digest(text,text)') is not null then
    execute 'select encode(extensions.digest($1, ''sha256''), ''hex'')'
    into hash_value
    using p_token;
    return hash_value;
  end if;

  if to_regprocedure('public.digest(text,text)') is not null then
    execute 'select encode(public.digest($1, ''sha256''), ''hex'')'
    into hash_value
    using p_token;
    return hash_value;
  end if;

  if to_regprocedure('pg_catalog.sha256(bytea)') is not null then
    execute 'select encode(pg_catalog.sha256(convert_to($1, ''UTF8'')), ''hex'')'
    into hash_value
    using p_token;
    return hash_value;
  end if;

  raise exception 'No SHA-256 hashing function is available for estimate approval tokens.'
    using errcode = '42883';
end;
$$;

comment on function public.estimate_approval_token_hash(text) is
  'Task 101/0027. Internal helper for estimate approval token hashing across Supabase pgcrypto schema variants.';

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

  raw_token := replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  hashed_token := public.estimate_approval_token_hash(raw_token);

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
  'Task 101/0027. Authenticated draft-only send action using UUIDv4 token generation and SHA-256 token hashing.';

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

  token_hash := public.estimate_approval_token_hash(p_token);

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
  'Task 101/0027. Public token-specific estimate read model using schema-safe SHA-256 token hashing.';

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

  token_hash := public.estimate_approval_token_hash(p_token);
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
  'Task 101/0027. Public token-specific customer approve/decline mutation using schema-safe SHA-256 token hashing.';

revoke all on function public.estimate_approval_token_hash(text) from public;
revoke all on function public.send_service_request_estimate_to_customer_rpc(uuid) from public;
revoke all on function public.get_public_estimate_by_token_rpc(text) from public;
revoke all on function public.respond_to_public_estimate_rpc(text, text) from public;

grant execute on function public.send_service_request_estimate_to_customer_rpc(uuid) to authenticated;
grant execute on function public.get_public_estimate_by_token_rpc(text) to anon, authenticated;
grant execute on function public.respond_to_public_estimate_rpc(text, text) to anon, authenticated;
