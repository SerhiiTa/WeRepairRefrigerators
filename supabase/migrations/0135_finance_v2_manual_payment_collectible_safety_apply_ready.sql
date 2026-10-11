-- FINANCE-V2-33: Manual payment collection safety alignment.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Align manual payment collection with Finance V2 Job-level paid credit so
--   dashboard-entered payments cannot overcollect after Estimate revisions,
--   replacement Invoices, or combined Job Invoices.
--
-- Safety:
--   - Replaces only record_manual_service_request_payment_rpc.
--   - Preserves canonical payment and allocation inserts.
--   - Preserves idempotency behavior and dashboard authorization.
--   - Does not rewrite historical payments, allocations, estimates, or invoices.

create or replace function public.record_manual_service_request_payment_rpc(
  p_service_request_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference_code text default null,
  p_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  estimate_row public.service_request_estimates;
  invoice_row public.service_request_invoices;
  existing_payment public.service_request_payments;
  payment_row public.service_request_payments;
  allocation_row public.service_request_payment_allocations;
  clean_method text := lower(btrim(coalesce(p_payment_method, '')));
  clean_reference text := nullif(btrim(coalesce(p_reference_code, '')), '');
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  clean_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  provider_payment_key text;
  target_label text;
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
  scope jsonb;
  approved_total numeric(10, 2) := 0;
  paid_credit numeric(10, 2) := 0;
  reserved_amount numeric(10, 2) := 0;
  remaining_amount numeric(10, 2) := 0;
  payment_amount_cents bigint;
  remaining_cents bigint;
  estimate_has_current_invoice boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if clean_idempotency_key is null or length(clean_idempotency_key) < 12 then
    raise exception 'A valid idempotency key is required.' using errcode = '22023';
  end if;

  if clean_method not in ('cash', 'check', 'zelle', 'venmo', 'cash_app') then
    raise exception 'Choose a supported manual payment method.' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception 'Enter a valid payment amount.' using errcode = '22023';
  end if;

  if round(p_amount, 2) <> p_amount then
    raise exception 'Payment amount must use dollars and cents.' using errcode = '22023';
  end if;

  payment_amount_cents := round(p_amount * 100)::bigint;
  provider_payment_key := 'manual:' || clean_idempotency_key;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Job was not found.' using errcode = 'P0002';
  end if;

  if request_row.company_id is null then
    raise exception 'Manual payments require a company-scoped job.' using errcode = '23514';
  end if;

  if not public.can_record_service_request_payment(request_row.id) then
    raise exception 'This account is not allowed to record payments for that job.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(request_row.id::text, 301));

  if normalized_target_type = 'estimate' then
    select *
    into estimate_row
    from public.service_request_estimates
    where id = p_target_id
    for update;

    if not found then
      raise exception 'Estimate was not found.' using errcode = 'P0002';
    end if;

    if estimate_row.service_request_id is distinct from request_row.id then
      raise exception 'Estimate must belong to the selected job.' using errcode = '23514';
    end if;

    if estimate_row.estimate_status <> 'approved'
      or coalesce(estimate_row.revision_status, 'current') <> 'current' then
      raise exception 'Deposits can only be recorded against current approved estimates.'
        using errcode = '22023';
    end if;

    select exists (
      select 1
      from public.service_request_invoices invoice
      where invoice.service_request_id = request_row.id
        and invoice.invoice_status <> 'void'
        and coalesce(invoice.invoice_lifecycle_status, 'current') = 'current'
        and (
          invoice.estimate_id = estimate_row.id
          or invoice.logical_estimate_id = coalesce(estimate_row.logical_estimate_id, estimate_row.id)
          or exists (
            select 1
            from public.service_request_invoice_estimates membership
            where membership.invoice_id = invoice.id
              and membership.estimate_id = estimate_row.id
              and membership.membership_status = 'active'
          )
        )
    )
    into estimate_has_current_invoice;

    target_label := estimate_row.estimate_number;
  elsif normalized_target_type = 'invoice' then
    select *
    into invoice_row
    from public.service_request_invoices
    where id = p_target_id
    for update;

    if not found then
      raise exception 'Invoice was not found.' using errcode = 'P0002';
    end if;

    if invoice_row.service_request_id is distinct from request_row.id then
      raise exception 'Invoice must belong to the selected job.' using errcode = '23514';
    end if;

    if invoice_row.invoice_status = 'void'
      or coalesce(invoice_row.invoice_lifecycle_status, 'current') <> 'current' then
      raise exception 'Payments can only be recorded against the current active Invoice.'
        using errcode = '22023';
    end if;

    target_label := invoice_row.invoice_number;
  else
    raise exception 'Choose an estimate deposit or invoice payment target.'
      using errcode = '22023';
  end if;

  select *
  into existing_payment
  from public.service_request_payments payment
  where payment.provider = 'manual'
    and payment.provider_payment_id = provider_payment_key;

  if found then
    select *
    into allocation_row
    from public.service_request_payment_allocations allocation
    where allocation.payment_id = existing_payment.id
      and allocation.allocation_status = 'active'
    order by allocation.created_at asc
    limit 1;

    if existing_payment.company_id is distinct from request_row.company_id
      or existing_payment.service_request_id is distinct from request_row.id
      or round(existing_payment.amount, 2) is distinct from round(p_amount, 2)
      or existing_payment.payment_method is distinct from clean_method
      or allocation_row.id is null
      or (
        normalized_target_type = 'estimate'
        and (
          (
            allocation_row.estimate_id is distinct from p_target_id
            or allocation_row.invoice_id is not null
          )
          and (
            allocation_row.carried_from_estimate_id is distinct from p_target_id
            or allocation_row.invoice_id is null
          )
        )
      )
      or (
        normalized_target_type = 'invoice'
        and (
          allocation_row.invoice_id is distinct from p_target_id
          or allocation_row.estimate_id is not null
        )
      ) then
      raise exception 'This idempotency key was already used for a different payment.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'payment', to_jsonb(existing_payment),
      'allocation', to_jsonb(allocation_row),
      'target_type', normalized_target_type,
      'target_label', target_label
    );
  end if;

  if normalized_target_type = 'estimate' and estimate_has_current_invoice then
    raise exception 'This Estimate is already included in the current Job Invoice. Record payment against the Invoice instead.'
      using errcode = '23514';
  end if;

  scope := public.get_service_request_effective_approved_scope_rpc(request_row.id);
  approved_total := round(coalesce((scope ->> 'approved_total')::numeric, 0), 2);
  paid_credit := public.active_service_request_paid_credit(request_row.id);
  reserved_amount := public.active_service_request_checkout_reserved_amount(request_row.id);
  remaining_amount := greatest(approved_total - paid_credit - reserved_amount, 0);
  remaining_cents := round(remaining_amount * 100)::bigint;

  if approved_total <= 0 then
    raise exception 'Approve an Estimate before recording payment.'
      using errcode = '23514';
  end if;

  if remaining_cents <= 0 then
    raise exception 'This Job is already paid in full.'
      using errcode = '23514';
  end if;

  if payment_amount_cents > remaining_cents then
    raise exception 'Payment amount exceeds the remaining Job balance.'
      using errcode = '23514';
  end if;

  insert into public.service_request_payments (
    company_id,
    service_request_id,
    invoice_id,
    source_system,
    payment_status,
    payment_type,
    payment_method,
    amount,
    service_fee,
    net_amount,
    tip_amount,
    payment_date,
    paid_at,
    provider,
    provider_payment_id,
    provider_event_id,
    recorded_by_profile_id,
    reference_code,
    description,
    payment_metadata,
    import_metadata
  )
  values (
    request_row.company_id,
    request_row.id,
    case when normalized_target_type = 'invoice' then invoice_row.id else null end,
    'native',
    'succeeded',
    'manual',
    clean_method,
    p_amount,
    0,
    p_amount,
    0,
    current_date,
    now(),
    'manual',
    provider_payment_key,
    provider_payment_key,
    auth.uid(),
    clean_reference,
    clean_note,
    jsonb_build_object(
      'manual_payment', true,
      'idempotency_key', clean_idempotency_key,
      'target_type', normalized_target_type,
      'target_id', p_target_id,
      'target_label', target_label,
      'reference', clean_reference,
      'note', clean_note,
      'finance_v2_job_approved_scope', approved_total,
      'finance_v2_job_paid_credit_before_posting', paid_credit,
      'finance_v2_active_reservations_before_posting', reserved_amount,
      'finance_v2_remaining_before_posting', remaining_amount
    ),
    '{}'::jsonb
  )
  returning * into payment_row;

  insert into public.service_request_payment_allocations (
    company_id,
    service_request_id,
    payment_id,
    estimate_id,
    invoice_id,
    allocation_amount,
    allocation_source,
    created_by_profile_id,
    allocation_metadata
  )
  values (
    request_row.company_id,
    request_row.id,
    payment_row.id,
    case when normalized_target_type = 'estimate' then estimate_row.id else null end,
    case when normalized_target_type = 'invoice' then invoice_row.id else null end,
    p_amount,
    case
      when normalized_target_type = 'estimate' then 'estimate_deposit'
      else 'manual'
    end,
    auth.uid(),
    jsonb_build_object(
      'manual_payment', true,
      'idempotency_key', clean_idempotency_key,
      'target_type', normalized_target_type,
      'target_id', p_target_id,
      'target_label', target_label,
      'finance_v2_job_credit_allocation', true
    )
  )
  returning * into allocation_row;

  return jsonb_build_object(
    'idempotent', false,
    'payment', to_jsonb(payment_row),
    'allocation', to_jsonb(allocation_row),
    'target_type', normalized_target_type,
    'target_label', target_label,
    'remaining_job_balance_before_posting', remaining_amount
  );
exception
  when unique_violation then
    select *
    into existing_payment
    from public.service_request_payments payment
    where payment.provider = 'manual'
      and payment.provider_payment_id = provider_payment_key;

    if found then
      select *
      into allocation_row
      from public.service_request_payment_allocations allocation
      where allocation.payment_id = existing_payment.id
        and allocation.allocation_status = 'active'
      order by allocation.created_at asc
      limit 1;

      if existing_payment.company_id is distinct from request_row.company_id
        or existing_payment.service_request_id is distinct from request_row.id
        or round(existing_payment.amount, 2) is distinct from round(p_amount, 2)
        or existing_payment.payment_method is distinct from clean_method
        or allocation_row.id is null
        or (
          normalized_target_type = 'estimate'
          and (
            (
              allocation_row.estimate_id is distinct from p_target_id
              or allocation_row.invoice_id is not null
            )
            and (
              allocation_row.carried_from_estimate_id is distinct from p_target_id
              or allocation_row.invoice_id is null
            )
          )
        )
        or (
          normalized_target_type = 'invoice'
          and (
            allocation_row.invoice_id is distinct from p_target_id
            or allocation_row.estimate_id is not null
          )
        ) then
        raise exception 'This idempotency key was already used for a different payment.'
          using errcode = '23505';
      end if;

      return jsonb_build_object(
        'idempotent', true,
        'payment', to_jsonb(existing_payment),
        'allocation', to_jsonb(allocation_row),
        'target_type', normalized_target_type,
        'target_label', target_label
      );
    end if;

    raise;
end;
$$;

comment on function public.record_manual_service_request_payment_rpc(
  uuid,
  text,
  uuid,
  numeric,
  text,
  text,
  text,
  text
) is
  'FINANCE-V2-33. Atomically records a manual payment capped by Job-level approved scope minus valid paid credit and active reservations.';

revoke all on function public.record_manual_service_request_payment_rpc(
  uuid,
  text,
  uuid,
  numeric,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.record_manual_service_request_payment_rpc(
  uuid,
  text,
  uuid,
  numeric,
  text,
  text,
  text,
  text
) to authenticated;
