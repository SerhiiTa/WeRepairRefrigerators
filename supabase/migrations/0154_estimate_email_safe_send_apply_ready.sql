-- EMAIL-03.2: deferred email snapshots; existing three-argument SMS helper unchanged.
begin;
create or replace function public.create_service_request_estimate_revision_snapshot(
  p_estimate_id uuid,
  p_token_hash text,
  p_sent_by_profile_id uuid,
  p_deferred_email boolean
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

  if not p_deferred_email then
  update public.service_request_estimate_revisions
  set
    revision_status = case when revision_status = 'sent' then 'revoked' else revision_status end,
    token_revoked_at = coalesce(token_revoked_at, now()),
    updated_at = now()
  where estimate_id = estimate_row.id
    and token_revoked_at is null
    and customer_decision is null;

  end if;
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
    token_revoked_at,
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
    case when p_deferred_email then now() else null end,
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

  if not p_deferred_email then
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

  end if;
  return revision_row;
end;
$$;

revoke all on function public.create_service_request_estimate_revision_snapshot(uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
create or replace function public.reserve_estimate_email_delivery_rpc(p_estimate_id uuid,p_recipient text,p_idempotency_key text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.service_request_estimates; j public.service_requests; r public.service_request_estimate_revisions; d public.service_request_estimate_revision_deliveries; token text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_recipient is null or length(p_recipient)>254 or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 160 or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid send request' using errcode='22023';end if;
 select * into e from public.service_request_estimates where id=p_estimate_id for update;
 if not found or not public.can_view_service_request(e.service_request_id) then raise exception 'Estimate not authorized' using errcode='42501';end if;
 select * into j from public.service_requests where id=e.service_request_id;
 if not found or j.company_id is null then raise exception 'Company unavailable' using errcode='42501';end if;
 if e.estimate_status not in ('draft','sent','approved') or e.total<=0 or not exists(select 1 from public.service_request_estimate_items where estimate_id=e.id) then raise exception 'Estimate not eligible' using errcode='22023';end if;
 select * into d from public.service_request_estimate_revision_deliveries where idempotency_key=p_idempotency_key;
 if found then
   if d.delivery_channel<>'email' or d.request_fingerprint<>p_fingerprint or not exists(select 1 from public.service_request_estimate_revisions where id=d.revision_id and estimate_id=e.id and company_id=j.company_id) then raise exception 'Send identity conflict' using errcode='22023';end if;
   return jsonb_build_object('claimed',false,'delivery_status',d.delivery_status,'provider_error',d.provider_error,'review_required',coalesce((d.delivery_metadata->>'review_required')::boolean,false));
 end if;
 if exists(select 1 from public.service_request_estimate_revision_deliveries x join public.service_request_estimate_revisions y on y.id=x.revision_id where y.estimate_id=e.id and x.provider='telnyx-email' and x.delivery_status='pending') then raise exception 'Previous email outcome requires review' using errcode='55000';end if;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 r:=public.create_service_request_estimate_revision_snapshot(e.id,public.estimate_approval_token_hash(token),auth.uid(),true);
 insert into public.service_request_estimate_revision_deliveries(revision_id,delivery_channel,delivery_status,recipient,idempotency_key,request_fingerprint,provider,provider_status,sent_by_profile_id)
 values(r.id,'email','pending',p_recipient,p_idempotency_key,p_fingerprint,'telnyx-email','reserved',auth.uid()) returning * into d;
 return jsonb_build_object('claimed',true,'delivery_id',d.id,'revision_id',r.id,'estimate_number',e.estimate_number,'approval_token',token);
end;$$;
create or replace function public.finalize_estimate_email_delivery_rpc(p_delivery_id uuid,p_outcome text,p_provider_message_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.service_request_estimate_revision_deliveries; r public.service_request_estimate_revisions; e public.service_request_estimates; target_revision uuid;
begin
 if p_outcome is null or p_outcome not in ('accepted','failed','unknown') then raise exception 'Invalid outcome';end if;
 if p_outcome='accepted' and nullif(btrim(p_provider_message_id),'') is null then raise exception 'Provider ID required';end if;
 select revision_id into target_revision from public.service_request_estimate_revision_deliveries where id=p_delivery_id and delivery_channel='email' and provider='telnyx-email';
 if target_revision is null then raise exception 'Delivery unavailable';end if;
 -- Match the public approval path: revision before Estimate.
 select * into r from public.service_request_estimate_revisions where id=target_revision for update;
 select * into e from public.service_request_estimates where id=r.estimate_id for update;
 select * into d from public.service_request_estimate_revision_deliveries where id=p_delivery_id for update;
 if d.provider_status<>'sending' then return jsonb_build_object('active',r.token_revoked_at is null);end if;
 update public.service_request_estimate_revision_deliveries set delivery_status=case p_outcome when 'accepted' then 'sent' when 'failed' then 'failed' else 'pending' end,provider_status=p_outcome,provider_message_id=p_provider_message_id,provider_error=case p_outcome when 'failed' then 'Email provider rejected the request.' when 'unknown' then 'Provider outcome uncertain; do not resend.' else null end,sent_at=case when p_outcome='accepted' then now() else null end,failed_at=case when p_outcome='failed' then now() else null end where id=d.id;
 if p_outcome='accepted' then
   -- Never activate stale contents after a concurrent edit/approval/SMS send.
   if to_jsonb(e) is distinct from r.snapshot->'estimate' then
     update public.service_request_estimate_revision_deliveries set delivery_metadata=delivery_metadata||jsonb_build_object('review_required',true),provider_error='Provider accepted, but Estimate changed. Link remains inactive; staff review required.' where id=d.id;
     return jsonb_build_object('active',false);
   end if;
   update public.service_request_estimate_revisions set token_revoked_at=now(),revision_status=case when revision_status='sent' then 'revoked' else revision_status end where estimate_id=e.id and id<>r.id and token_revoked_at is null and customer_decision is null;
   update public.service_request_estimate_revisions set token_revoked_at=null,sent_at=now() where id=r.id;
   update public.service_request_estimates set estimate_status=case when estimate_status='approved' then 'approved' else 'sent' end,public_approval_token_hash=r.public_approval_token_hash,sent_at=now(),updated_at=now() where id=e.id;
   update public.service_requests set status=case when e.estimate_status='approved' then 'estimate_approved' else 'estimate_sent' end,updated_at=now() where id=e.service_request_id;
   insert into public.service_request_notes(service_request_id,created_by_profile_id,note_type,body) values(e.service_request_id,d.sent_by_profile_id,'estimate','Estimate '||e.estimate_number||' revision '||r.revision_number||' email accepted for sending.');
 elsif p_outcome='failed' then
   update public.service_request_estimate_revisions set revision_status='revoked' where id=r.id;
 end if;
 return jsonb_build_object('active',p_outcome='accepted');
end;$$;
revoke all on function public.reserve_estimate_email_delivery_rpc(uuid,text,text,text) from public,anon,service_role;
grant execute on function public.reserve_estimate_email_delivery_rpc(uuid,text,text,text) to authenticated;
revoke all on function public.finalize_estimate_email_delivery_rpc(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_estimate_email_delivery_rpc(uuid,text,text) to service_role;
commit;
