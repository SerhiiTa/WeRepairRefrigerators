-- FINANCE-V2-REFUND-04: Integrate succeeded refunds into Finance V2 balances.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Keep existing Finance V2 calculation callers stable while making the
--   canonical paid-credit path refund-aware after migration 0143.
--
-- Accounting:
--   Original payments and allocations are preserved.
--   Only succeeded refund allocation adjustments reduce Net Paid.
--   Pending, failed, and canceled refunds do not reduce Net Paid.

create or replace function public.active_service_request_paid_credit(
  p_service_request_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.active_service_request_net_paid_credit(p_service_request_id);
$$;

revoke all on function public.active_service_request_paid_credit(uuid) from public;

comment on function public.active_service_request_paid_credit(uuid) is
  'FINANCE-V2-REFUND-04. Existing Finance V2 paid-credit entry point now delegates to refund-adjusted Net Paid after succeeded refunds.';
