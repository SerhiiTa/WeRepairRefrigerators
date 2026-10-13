-- FINANCE-V2-01: Enable Invoice custom deposit payment eligibility.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Advertise Invoice Custom Deposit as an explicit Stripe Checkout action while
--   preserving the existing Finance V2 Job-level collectible balance, active
--   reservation checks, tenant authorization, and webhook/payment-ledger logic.
--
-- Safety:
--   - Does not create, move, rewrite, or delete Payments or Allocations.
--   - Does not modify historical Invoices or Estimates.
--   - Keeps one current Invoice and existing lifecycle protections unchanged.
--   - Only changes the eligibility action list for current eligible Invoice targets.

do $$
declare
  existing_definition text;
  updated_definition text;
  old_invoice_actions text := $old$
    actions := jsonb_build_array(jsonb_build_object(
      'kind', 'balance_due',
      'label', 'Pay Balance Due',
      'amount', remaining_amount,
      'max_amount', remaining_amount
    ));
$old$;
  new_invoice_actions text := $new$
    actions := jsonb_build_array(
      jsonb_build_object(
        'kind', 'balance_due',
        'label', 'Pay in Full',
        'amount', remaining_amount,
        'max_amount', remaining_amount
      ),
      jsonb_build_object(
        'kind', 'custom_deposit',
        'label', 'Custom Deposit',
        'amount', remaining_amount,
        'max_amount', remaining_amount
      )
    );
$new$;
begin
  select pg_get_functiondef('public.get_service_request_payment_eligibility_rpc(text, uuid, uuid)'::regprocedure)
  into existing_definition;

  if existing_definition is null then
    raise exception 'get_service_request_payment_eligibility_rpc(text, uuid, uuid) is missing.'
      using errcode = '42883';
  end if;

  if position(new_invoice_actions in existing_definition) > 0 then
    return;
  end if;

  if position(old_invoice_actions in existing_definition) = 0 then
    raise exception 'Invoice payment eligibility action block did not match expected Finance V2 definition.'
      using errcode = '22023';
  end if;

  updated_definition := replace(existing_definition, old_invoice_actions, new_invoice_actions);
  execute updated_definition;
end;
$$;

revoke all on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) from public;
grant execute on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) to authenticated;

comment on function public.get_service_request_payment_eligibility_rpc(text, uuid, uuid) is
  'FINANCE-V2-01. Computes Stripe Checkout eligibility and advertises Pay in Full plus Custom Deposit for current Invoice targets.';
