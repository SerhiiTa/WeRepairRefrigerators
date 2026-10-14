-- FINANCE-V2-REFUND-11.2. Forward-only; LOCAL preparation, not applied to Production.
-- Reuses payment Communications events and the Job's existing internal notes.
begin;
set local lock_timeout = '5s';

alter table public.communication_timeline_events
  add column if not exists refund_id uuid references public.service_request_payment_refunds(id);
create unique index if not exists communication_timeline_refund_unique
  on public.communication_timeline_events (refund_id) where refund_id is not null;
alter table public.service_request_notes
  add column if not exists refund_id uuid references public.service_request_payment_refunds(id);
create unique index if not exists service_request_notes_refund_unique
  on public.service_request_notes (refund_id) where refund_id is not null;
-- Canonical refund reasons have no length limit; preserve them in system notes.
alter table public.service_request_notes
  drop constraint service_request_notes_body_length_check,
  add constraint service_request_notes_body_length_check
    check (char_length(body) <= 2000 or refund_id is not null);

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

  -- Match reservation: Job row -> Job advisory -> refund/allocation/payment.
  -- Acquire these BEFORE any refund/allocation/payment lock. The event trigger
  -- and Timeline note FK can then reuse the Job lock without a reverse edge.
  perform 1 from public.service_requests job
  where job.id = (select service_request_id from public.service_request_payment_refunds where id = p_refund_id)
  for update;
  perform pg_advisory_xact_lock(hashtextextended(service_request_id::text, 507))
  from public.service_request_payment_refunds where id = p_refund_id;

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

  -- Match reservation: Job row -> Job advisory -> refund/allocation/payment.
  -- Acquire these BEFORE any refund/allocation/payment lock. The event trigger
  -- and Timeline note FK can then reuse the Job lock without a reverse edge.
  perform 1 from public.service_requests job
  where job.id = (select service_request_id from public.service_request_payment_refunds where id = p_refund_id)
  for update;
  perform pg_advisory_xact_lock(hashtextextended(service_request_id::text, 507))
  from public.service_request_payment_refunds where id = p_refund_id;

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

-- Private shared event writer. Neither accounting nor refund records are written.
-- Live confirmations supply their observed timestamp. Backfill never invents one.
create or replace function public.ensure_confirmed_refund_events(
  p_refund_id uuid, p_confirmation_time timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_row public.service_request_payment_refunds;
  payment_row public.service_request_payments;
  conversation_id_value uuid;
  event_time_value timestamptz;
  refund_scope text;
  event_body text;
  time_label text;
begin
  select * into strict refund_row from public.service_request_payment_refunds where id = p_refund_id;
  if refund_row.refund_status <> 'succeeded' then return; end if;
  -- Live RPC callers already own this lock BEFORE financial locks. Backfill
  -- enters here without financial locks and visits Jobs in deterministic order.
  perform 1 from public.service_requests
  where id = refund_row.service_request_id and company_id = refund_row.company_id for update;
  if not found then raise exception 'Refund Job/company mismatch'; end if;
  select * into strict payment_row from public.service_request_payments
  where id = refund_row.payment_id and company_id = refund_row.company_id
    and service_request_id = refund_row.service_request_id;

  -- Preserve an existing counterpart's body/time when repairing a missing row.
  select body, event_time into event_body, event_time_value
  from public.communication_timeline_events where refund_id = refund_row.id;
  if not found then
    select body, created_at into event_body, event_time_value
    from public.service_request_notes where refund_id = refund_row.id;
  end if;
  if event_body is null then
    event_time_value := coalesce(p_confirmation_time, refund_row.created_at);
    time_label := case when p_confirmation_time is not null then '. Confirmed at: '
      else '. Refund recorded at (exact confirmation time unavailable): ' end;
    -- Presentation only: original gross principal, independent of current status.
    -- The accounting helper returns zero for fully-refunded historical payments.
    refund_scope := case when refund_row.refund_amount >= greatest(payment_row.amount - coalesce(payment_row.tip_amount, 0), 0)
      then 'Full' else 'Partial' end;
    event_body := initcap(refund_row.refund_type) || ' refund confirmed: $'
      || to_char(refund_row.refund_amount, 'FM999999990.00') || '. '
      || refund_scope || ' refund. Payment method: ' || coalesce(payment_row.payment_method, 'unknown')
      || '. Original payment: ' || refund_row.payment_id::text
      || case when coalesce(payment_row.provider_payment_id, payment_row.reference_code) is not null
        then ' (' || coalesce(payment_row.provider_payment_id, payment_row.reference_code) || ')' else '' end
      || '. Reason: ' || refund_row.refund_reason
      || time_label || to_char(event_time_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      || case when refund_row.refund_type = 'stripe' and refund_row.provider_refund_id is not null
        then '. Stripe Refund ID: ' || refund_row.provider_refund_id else '' end;
  end if;

  select id into conversation_id_value from public.communication_conversations
  where service_request_id = refund_row.service_request_id and company_id = refund_row.company_id
  order by updated_at desc, id limit 1;
  if conversation_id_value is null then
    insert into public.communication_conversations (
      company_id, service_request_id, primary_source_type, status, summary
    ) values (refund_row.company_id, refund_row.service_request_id, 'manual', 'linked', 'Job financial activity')
    returning id into conversation_id_value;
  end if;
  insert into public.communication_timeline_events (
    conversation_id, event_type, title, body, event_time,
    service_request_id, invoice_id, payment_reference, refund_id
  ) values (
    conversation_id_value, 'note_added', 'Refund confirmed', event_body, event_time_value,
    refund_row.service_request_id, payment_row.invoice_id, refund_row.payment_id::text, refund_row.id
  ) on conflict (refund_id) where refund_id is not null do nothing;
  insert into public.service_request_notes (
    service_request_id, created_by_profile_id, note_type, body, created_at, refund_id
  ) values (
    refund_row.service_request_id, refund_row.created_by_profile_id, 'internal_note', event_body, event_time_value, refund_row.id
  ) on conflict (refund_id) where refund_id is not null do nothing;
end;
$$;
revoke all on function public.ensure_confirmed_refund_events(uuid, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.record_confirmed_refund_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.refund_status <> 'succeeded' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.refund_status = 'succeeded' then return new; end if;
  end if;
  perform public.ensure_confirmed_refund_events(new.id, clock_timestamp());
  return new;
end;
$$;
revoke all on function public.record_confirmed_refund_events() from public, anon, authenticated, service_role;
drop trigger if exists record_confirmed_refund_events on public.service_request_payment_refunds;
create trigger record_confirmed_refund_events
  after insert or update of refund_status on public.service_request_payment_refunds
  for each row execute function public.record_confirmed_refund_events();

-- Existing RPC permissions are preserved by CREATE OR REPLACE, then made explicit.
revoke all on function public.confirm_service_request_payment_refund_rpc(uuid, text, text, jsonb) from public, anon;
grant execute on function public.confirm_service_request_payment_refund_rpc(uuid, text, text, jsonb) to authenticated;
revoke all on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_stripe_service_request_payment_refund_rpc(uuid, text, text, jsonb) to service_role;

-- Transactional, idempotent historical backfill. No refund UPDATE, no status replay.
-- 0143 has no immutable confirmed_at; updated_at and caller metadata are not proof
-- of confirmation time. Use canonical creation time, explicitly labeled recorded.
do $$
declare historical_refund record;
begin
  for historical_refund in
    select id from public.service_request_payment_refunds where refund_status = 'succeeded'
    order by service_request_id, payment_id, id
  loop
    perform public.ensure_confirmed_refund_events(historical_refund.id);
  end loop;
end;
$$;
commit;
