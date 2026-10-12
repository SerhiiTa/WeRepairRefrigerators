-- JOB-CLOSE-10 owner-reviewed recovery for two succeeded Stripe Sandbox payments
-- missing receipts because ensure_service_request_payment_receipt_rpc failed before 0141.
--
-- Preconditions:
--   1. Apply 0141_payment_receipt_rpc_allocation_status_repair_apply_ready.sql first.
--   2. Execute this script only in Supabase SQL Editor after reviewing row counts.
--   3. This script creates missing receipt rows/tokens only; it does not create
--      payments, allocations, SMS/email deliveries, or Stripe activity.

begin;

do $$
declare
  target_job_id constant uuid := '4880eb20-9f9e-4e4d-9cd7-6c2a6504f59f';
  target_company_id constant uuid := 'f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633';
  target_customer_id constant uuid := '8199389e-7233-45d7-aeb6-82091b5b6e40';
  missing_payment_ids constant uuid[] := array[
    '41285cd7-2844-42e0-9c9f-3c01eec9c0fe'::uuid,
    '55a65304-39e5-4f3e-8160-c8ac170ec02b'::uuid
  ];
  target_payment_id uuid;
  request_row public.service_requests;
  payment_row public.service_request_payments;
  existing_receipt_count integer;
  created_result jsonb;
begin
  select *
  into request_row
  from public.service_requests
  where id = target_job_id
    and company_id = target_company_id
    and customer_id = target_customer_id
  for update;

  if not found then
    raise exception 'Target Job identity check failed.' using errcode = '22023';
  end if;

  foreach target_payment_id in array missing_payment_ids loop
    select *
    into payment_row
    from public.service_request_payments
    where id = target_payment_id
      and service_request_id = target_job_id
      and company_id = target_company_id
    for update;

    if not found then
      raise exception 'Target payment % was not found for the target Job/company.', target_payment_id
        using errcode = 'P0002';
    end if;

    if payment_row.payment_status <> 'succeeded'
      or payment_row.voided_at is not null
      or coalesce(payment_row.provider, '') <> 'stripe'
      or coalesce(payment_row.payment_method, '') <> 'card'
      or payment_row.amount <= 0
      or coalesce((payment_row.payment_metadata ->> 'stripe_livemode')::boolean, true) is not false
      or coalesce((payment_row.payment_metadata ->> 'stripe_sandbox_pilot')::boolean, false) is not true then
      raise exception 'Target payment % is not an eligible succeeded Stripe Sandbox Pilot card payment.', target_payment_id
        using errcode = '23514';
    end if;

    select count(*)
    into existing_receipt_count
    from public.service_request_payment_receipts
    where payment_id = target_payment_id;

    if existing_receipt_count > 0 then
      raise notice 'Receipt already exists for payment %, skipping.', target_payment_id;
    else
      created_result := public.ensure_service_request_payment_receipt_rpc(target_payment_id);
      raise notice 'Created receipt for payment %: %', target_payment_id, created_result - 'receipt_token';
    end if;
  end loop;

  if (
    select count(*)
    from public.service_request_payment_receipts
    where payment_id = any(missing_payment_ids)
  ) <> array_length(missing_payment_ids, 1) then
    raise exception 'Final receipt count check failed.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.service_request_payment_receipt_deliveries delivery
    where delivery.payment_id = any(missing_payment_ids)
  ) then
    raise exception 'Unexpected receipt delivery rows exist for recovered payments.' using errcode = '23514';
  end if;
end;
$$;

select
  receipt.payment_id,
  receipt.receipt_number,
  receipt.amount,
  receipt.payment_status,
  receipt.created_at,
  token.token_expires_at,
  token.token_revoked_at
from public.service_request_payment_receipts receipt
join public.service_request_payment_receipt_tokens token
  on token.receipt_id = receipt.id
where receipt.payment_id in (
  '41285cd7-2844-42e0-9c9f-3c01eec9c0fe'::uuid,
  '55a65304-39e5-4f3e-8160-c8ac170ec02b'::uuid
)
order by receipt.created_at;

commit;
