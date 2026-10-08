-- PAYMENTS-03: Manual payment collection RPC.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Record a technician-confirmed manual payment and its canonical allocation
--   atomically. This is the first native payment collection workflow and does
--   not integrate Stripe or any external provider.
--
-- Safety:
--   - Does not modify migration 0112.
--   - Does not change grants or RLS policies on tables.
--   - Does not couple payment state to operational Job status.
--   - Uses the 0112 allocation trigger to enforce principal and target
--     invariants, including payment-row SELECT ... FOR UPDATE protection.

create or replace function public.can_record_service_request_payment(
  target_service_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.service_requests sr
      join public.company_members cm on cm.company_id = sr.company_id
      join public.companies c on c.id = cm.company_id
      join public.profiles p on p.id = cm.profile_id
      where sr.id = target_service_request_id
        and sr.company_id is not null
        and cm.profile_id = auth.uid()
        and cm.member_role in ('owner', 'manager', 'dispatcher', 'technician')
        and cm.member_status = 'active'
        and cm.archived_at is null
        and cm.removed_at is null
        and cm.suspended_at is null
        and c.status = 'active'
        and c.archived_at is null
        and p.status in ('active', 'verified')
    );
$$;

comment on function public.can_record_service_request_payment(uuid) is
  'PAYMENTS-03. Financial write predicate for manual payments. Allows platform admins and active company staff on company-owned Jobs; selected-technician view access alone is not payment-write access.';

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
  payment_row public.service_request_payments;
  allocation_row public.service_request_payment_allocations;
  existing_payment public.service_request_payments;
  estimate_has_invoice boolean := false;
  target_total numeric(10, 2);
  already_allocated numeric(10, 2);
  remaining_amount numeric(10, 2);
  clean_method text := lower(btrim(coalesce(p_payment_method, '')));
  clean_reference text := nullif(btrim(coalesce(p_reference_code, '')), '');
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  clean_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  provider_payment_key text;
  target_label text;
  normalized_target_type text := lower(btrim(coalesce(p_target_type, '')));
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

  provider_payment_key := 'manual:' || clean_idempotency_key;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id;

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

  if normalized_target_type = 'estimate' then
    -- Lock order: target Estimate/Invoice row first, then allocation/payment
    -- rows through the 0112 allocation trigger. This serializes competing
    -- manual payments for one target before remaining balance is calculated.
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

    if estimate_row.estimate_status <> 'approved' then
      raise exception 'Deposits can only be recorded against approved estimates.'
        using errcode = '22023';
    end if;

    estimate_has_invoice := exists (
      select 1
      from public.service_request_invoices invoice
      where invoice.estimate_id = estimate_row.id
      limit 1
    );

    target_total := estimate_row.total;
    target_label := estimate_row.estimate_number;

    select coalesce(sum(allocation.allocation_amount), 0)
    into already_allocated
    from public.service_request_payment_allocations allocation
    where allocation.estimate_id = estimate_row.id
      and allocation.allocation_status = 'active';
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

    if invoice_row.invoice_status = 'void' then
      raise exception 'Payments cannot be recorded against a void invoice.'
        using errcode = '22023';
    end if;

    target_total := invoice_row.total;
    target_label := invoice_row.invoice_number;

    select coalesce(sum(allocation.allocation_amount), 0)
    into already_allocated
    from public.service_request_payment_allocations allocation
    where allocation.invoice_id = invoice_row.id
      and allocation.allocation_status = 'active';
  else
    raise exception 'Choose an estimate deposit or invoice payment target.'
      using errcode = '22023';
  end if;

  remaining_amount := greatest(target_total - already_allocated, 0);

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

  if normalized_target_type = 'estimate' and estimate_has_invoice then
    raise exception 'This Estimate has already been converted to an Invoice. Record payment against the Invoice instead.'
      using errcode = '23514';
  end if;

  if p_amount > remaining_amount then
    raise exception 'Payment amount exceeds the selected balance.'
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
      'note', clean_note
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
      'target_label', target_label
    )
  )
  returning * into allocation_row;

  return jsonb_build_object(
    'idempotent', false,
    'payment', to_jsonb(payment_row),
    'allocation', to_jsonb(allocation_row),
    'target_type', normalized_target_type,
    'target_label', target_label
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
  'PAYMENTS-03. Atomically records a technician-confirmed manual payment and one canonical allocation with idempotency protection.';

revoke all on function public.can_record_service_request_payment(uuid) from public;
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

grant execute on function public.can_record_service_request_payment(uuid) to authenticated;
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
