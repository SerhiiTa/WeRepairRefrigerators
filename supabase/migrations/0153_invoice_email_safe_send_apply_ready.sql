-- EMAIL-03.1: email-only reservation and acceptance. Existing SMS RPC unchanged.
begin;
create or replace function public.reserve_invoice_email_delivery_rpc(p_invoice_id uuid, p_recipient text, p_idempotency_key text, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.service_request_invoices;
  job public.service_requests;
  delivery public.service_request_invoice_deliveries;
  token_id uuid;
  raw_token text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_recipient is null or length(p_recipient)>254 or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 160
    or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid email request' using errcode='22023';
  end if;
  select * into inv from public.service_request_invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  select * into job from public.service_requests where id=inv.service_request_id for update;
  if not found or job.company_id is null or not public.can_record_service_request_payment(job.id) then
    raise exception 'Invoice not authorized' using errcode='42501';
  end if;
  if inv.source_system <> 'native' or inv.invoice_status='void' then raise exception 'Invoice not eligible' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(job.id::text,301));
  select * into delivery from public.service_request_invoice_deliveries where company_id=job.company_id and idempotency_key=p_idempotency_key;
  if found then
    if delivery.invoice_id<>inv.id or delivery.delivery_channel<>'email' or delivery.request_fingerprint<>p_fingerprint then
      raise exception 'Send identity conflict' using errcode='22023';
    end if;
    return jsonb_build_object('claimed',false,'delivery_id',delivery.id,'delivery_status',delivery.delivery_status);
  end if;
  -- A new browser key must not retry an unresolved provider outcome.
  if exists(select 1 from public.service_request_invoice_deliveries where invoice_id=inv.id and delivery_channel='email' and provider='telnyx-email' and delivery_status='pending') then
    raise exception 'Previous email outcome requires review' using errcode='55000';
  end if;
  raw_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.service_request_invoice_delivery_tokens(company_id,service_request_id,invoice_id,token_hash,token_expires_at,created_by_profile_id)
  values(job.company_id,job.id,inv.id,public.estimate_approval_token_hash(raw_token),now()+interval '14 days',auth.uid()) returning id into token_id;
  -- Preserve every existing link and document status during preparation.
  insert into public.service_request_invoice_deliveries(company_id,service_request_id,invoice_id,invoice_token_id,delivery_channel,recipient,idempotency_key,request_fingerprint,provider,provider_status,sent_by_profile_id)
  values(job.company_id,job.id,inv.id,token_id,'email',p_recipient,p_idempotency_key,p_fingerprint,'telnyx-email','reserved',auth.uid()) returning * into delivery;
  return jsonb_build_object('claimed',true,'delivery_id',delivery.id,'company_id',job.company_id,'invoice_token',raw_token,'invoice_number',inv.invoice_number,'customer_name',job.customer_name);
end;
$$;
create or replace function public.finalize_invoice_email_delivery_rpc(p_delivery_id uuid,p_outcome text,p_provider_message_id text default null)
returns void language plpgsql security definer set search_path=public as $$
declare d public.service_request_invoice_deliveries; target_invoice uuid;
begin
  if p_outcome not in ('accepted','failed','unknown') or p_outcome is null then raise exception 'Invalid outcome'; end if;
  if p_outcome='accepted' and nullif(btrim(p_provider_message_id),'') is null then raise exception 'Provider ID required'; end if;
  select invoice_id into target_invoice from public.service_request_invoice_deliveries where id=p_delivery_id and delivery_channel='email' and provider='telnyx-email';
  if target_invoice is null then raise exception 'Delivery unavailable'; end if;
  perform 1 from public.service_request_invoices where id=target_invoice for update;
  select * into d from public.service_request_invoice_deliveries where id=p_delivery_id for update;
  if d.provider_status <> 'sending' then return; end if;
  update public.service_request_invoice_deliveries set
    delivery_status=case p_outcome when 'accepted' then 'sent' when 'failed' then 'failed' else 'pending' end,
    provider_status=p_outcome,provider_message_id=p_provider_message_id,
    provider_error=case p_outcome when 'failed' then 'Email provider rejected the request.' when 'unknown' then 'Provider outcome uncertain; do not resend.' else null end,
    sent_at=case when p_outcome='accepted' then now() else null end,
    failed_at=case when p_outcome='failed' then now() else null end
  where id=d.id;
  if p_outcome='accepted' then
    update public.service_request_invoices set invoice_status='sent',sent_at=coalesce(sent_at,now()) where id=d.invoice_id and invoice_status='draft';
  elsif p_outcome='failed' then
    update public.service_request_invoice_delivery_tokens set token_revoked_at=coalesce(token_revoked_at,now()) where id=d.invoice_token_id;
  end if;
end;
$$;
revoke all on function public.reserve_invoice_email_delivery_rpc(uuid,text,text,text) from public,anon,service_role;
grant execute on function public.reserve_invoice_email_delivery_rpc(uuid,text,text,text) to authenticated;
revoke all on function public.finalize_invoice_email_delivery_rpc(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_invoice_email_delivery_rpc(uuid,text,text) to service_role;
commit;
