-- STRIPE-PROD-09: Stripe Checkout service-role grant repair.
--
-- APPLY-READY, FORWARD ONLY.
--
-- Purpose:
--   Allow trusted server-side Stripe Checkout and webhook code to persist
--   provider session identifiers and provider event processing state after the
--   public token-scoped reservation RPC creates an attempt.
--
-- Safety:
--   - Does not grant anon or authenticated write privileges.
--   - Does not modify payments, allocations, checkout attempts or events.
--   - Preserves dashboard RLS policies for browser roles.
--   - Complements SECURITY DEFINER posting RPCs without creating a public
--     mutation path.

grant select, update
on table public.service_request_payment_checkout_attempts
to service_role;

grant select, insert, update
on table public.service_request_payment_provider_events
to service_role;

comment on table public.service_request_payment_checkout_attempts is
  'PAYMENT-LIFECYCLE-01. Provider checkout initiation and reservation records. STRIPE-PROD-09 grants trusted service_role SELECT/UPDATE for server-side Stripe session persistence.';

comment on table public.service_request_payment_provider_events is
  'PAYMENT-LIFECYCLE-01. Provider webhook event ledger. STRIPE-PROD-09 grants trusted service_role SELECT/INSERT/UPDATE for signature-verified webhook accounting.';
