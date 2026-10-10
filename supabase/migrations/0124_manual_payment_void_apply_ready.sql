-- PAYMENT-06: Manual payment void and financial audit.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Allow authorized company users to void incorrectly recorded manual
--   payments while preserving the original payment record and excluding its
--   allocations from canonical collected-balance calculations.
--
-- Safety:
--   - Does not delete payment or allocation records.
--   - Does not affect Stripe/provider-confirmed payments.
--   - Uses the existing canonical payment ledger and allocation statuses.
--   - Does not mutate operational Job status.

alter table public.service_request_payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  add column if not exists void_reason text,
  add column if not exists void_reason_note text;

comment on column public.service_request_payments.voided_at is
  'PAYMENT-06 timestamp when a manual payment was voided. The original payment row remains for audit history.';
comment on column public.service_request_payments.voided_by_profile_id is
  'PAYMENT-06 authenticated profile that voided the manual payment.';
comment on column public.service_request_payments.void_reason is
  'PAYMENT-06 normalized reason code for voiding an eligible manual payment.';
comment on column public.service_request_payments.void_reason_note is
  'PAYMENT-06 required explanation when void_reason = other, optional otherwise.';

alter table public.service_request_payments
  drop constraint if exists service_request_payments_void_reason_check,
  add constraint service_request_payments_void_reason_check
    check (
      void_reason is null
      or void_reason in (
        'payment_not_received',
        'entered_by_mistake',
        'check_returned',
        'incorrect_amount',
        'other'
      )
    ),
  drop constraint if exists service_request_payments_void_reason_note_check,
  add constraint service_request_payments_void_reason_note_check
    check (
      void_reason <> 'other'
      or (void_reason_note is not null and length(btrim(void_reason_note)) >= 3)
    ),
  drop constraint if exists service_request_payments_void_audit_fields_check,
  add constraint service_request_payments_void_audit_fields_check
    check (
      payment_status <> 'void'
      or (voided_at is not null and void_reason is not null)
    );

create index if not exists service_request_payments_voided_request_idx
  on public.service_request_payments (service_request_id, voided_at desc)
  where payment_status = 'void' and voided_at is not null;

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
      'payment_voided',
      'repair_completed',
      'customer_canceled',
      'note_added'
    ));

create unique index if not exists communication_timeline_payment_voided_uidx
  on public.communication_timeline_events (service_request_id, payment_reference)
  where event_type = 'payment_voided'
    and service_request_id is not null
    and payment_reference is not null;

create or replace function public.void_manual_service_request_payment_rpc(
  p_service_request_id uuid,
  p_payment_id uuid,
  p_reason text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  payment_row public.service_request_payments;
  allocation_count integer := 0;
  v_conversation_id uuid;
  clean_reason text := lower(btrim(coalesce(p_reason, '')));
  clean_reason_note text := nullif(btrim(coalesce(p_reason_note, '')), '');
  reason_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if clean_reason not in (
    'payment_not_received',
    'entered_by_mistake',
    'check_returned',
    'incorrect_amount',
    'other'
  ) then
    raise exception 'Choose a valid void reason.' using errcode = '22023';
  end if;

  if clean_reason = 'other'
    and (clean_reason_note is null or length(clean_reason_note) < 3) then
    raise exception 'Add an explanation when using Other as the void reason.'
      using errcode = '22023';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if request_row.company_id is null then
    raise exception 'Manual payment voids require a company-scoped job.'
      using errcode = '23514';
  end if;

  if not public.can_record_service_request_payment(request_row.id) then
    raise exception 'This account is not allowed to void payments for that job.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 406));

  select *
  into payment_row
  from public.service_request_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment was not found.' using errcode = 'P0002';
  end if;

  if payment_row.service_request_id is distinct from request_row.id then
    raise exception 'Payment must belong to the selected job.' using errcode = '23514';
  end if;

  if payment_row.company_id is distinct from request_row.company_id then
    raise exception 'Payment must belong to the same company as the job.'
      using errcode = '23514';
  end if;

  if payment_row.payment_status = 'void' then
    raise exception 'This payment has already been voided.' using errcode = '23505';
  end if;

  if payment_row.source_system <> 'native'
    or coalesce(payment_row.payment_type, '') <> 'manual'
    or coalesce(payment_row.provider, '') <> 'manual'
    or coalesce(payment_row.payment_method, '') not in (
      'cash',
      'check',
      'zelle',
      'venmo',
      'cash_app'
    ) then
    raise exception 'Only manually recorded payments can be voided here.'
      using errcode = '22023';
  end if;

  if payment_row.provider_payment_id is null
    or payment_row.provider_payment_id not like 'manual:%' then
    raise exception 'Provider-confirmed payments require a refund workflow.'
      using errcode = '22023';
  end if;

  perform 1
  from public.service_request_payment_allocations allocation
  where allocation.payment_id = payment_row.id
  for update;

  select count(*)
  into allocation_count
  from public.service_request_payment_allocations allocation
  where allocation.payment_id = payment_row.id;

  update public.service_request_payment_allocations allocation
  set
    allocation_status = 'void',
    allocation_metadata = coalesce(allocation.allocation_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'voided_at', now(),
        'voided_by_profile_id', auth.uid(),
        'void_reason', clean_reason,
        'void_reason_note', clean_reason_note
      )
  where allocation.payment_id = payment_row.id
    and allocation.allocation_status = 'active';

  update public.service_request_payments
  set
    payment_status = 'void',
    voided_at = now(),
    voided_by_profile_id = auth.uid(),
    void_reason = clean_reason,
    void_reason_note = clean_reason_note,
    payment_metadata = coalesce(payment_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'voided_at', now(),
        'voided_by_profile_id', auth.uid(),
        'void_reason', clean_reason,
        'void_reason_note', clean_reason_note
      )
  where id = payment_row.id
  returning * into payment_row;

  reason_label := case clean_reason
    when 'payment_not_received' then 'Payment not received'
    when 'entered_by_mistake' then 'Entered by mistake'
    when 'check_returned' then 'Check returned'
    when 'incorrect_amount' then 'Incorrect amount'
    else 'Other'
  end;

  select conversation.id
  into v_conversation_id
  from public.communication_conversations conversation
  where conversation.service_request_id = request_row.id
  order by conversation.updated_at desc
  limit 1;

  if v_conversation_id is not null
    and not exists (
      select 1
      from public.communication_timeline_events event
      where event.service_request_id = request_row.id
        and event.event_type = 'payment_voided'
        and event.payment_reference = payment_row.id::text
    ) then
    insert into public.communication_timeline_events (
      conversation_id,
      event_type,
      title,
      body,
      event_time,
      service_request_id,
      invoice_id,
      payment_reference
    )
    values (
      v_conversation_id,
      'payment_voided',
      'Payment voided',
      initcap(coalesce(payment_row.payment_method, 'manual'))
        || ' payment of $'
        || to_char(payment_row.amount, 'FM999999990.00')
        || ' was voided. Reason: '
        || reason_label
        || case
          when clean_reason_note is not null then '. ' || clean_reason_note
          else ''
        end,
      now(),
      request_row.id,
      payment_row.invoice_id,
      payment_row.id::text
    );
  end if;

  return jsonb_build_object(
    'payment_id', payment_row.id,
    'payment_status', payment_row.payment_status,
    'voided_at', payment_row.voided_at,
    'void_reason', payment_row.void_reason,
    'allocation_count', allocation_count
  );
end;
$$;

comment on function public.void_manual_service_request_payment_rpc(
  uuid,
  uuid,
  text,
  text
) is
  'PAYMENT-06. Atomically voids eligible native manual payments, voids their active allocations, and records an audit timeline event. Provider-confirmed payments are rejected.';

revoke all on function public.void_manual_service_request_payment_rpc(
  uuid,
  uuid,
  text,
  text
) from public;
revoke all on function public.void_manual_service_request_payment_rpc(
  uuid,
  uuid,
  text,
  text
) from anon;
revoke all on function public.void_manual_service_request_payment_rpc(
  uuid,
  uuid,
  text,
  text
) from authenticated;

grant execute on function public.void_manual_service_request_payment_rpc(
  uuid,
  uuid,
  text,
  text
) to authenticated;
