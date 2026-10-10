import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/0121_payment_lifecycle_stripe_readiness_apply_ready.sql",
  ),
  "utf8",
);
const lifecycleModule = readFileSync(
  resolve(root, "frontend/src/server/finance/payment-lifecycle.ts"),
  "utf8",
);

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

test("payment lifecycle module defines Estimate and Invoice eligibility rules", () => {
  includesAll(lifecycleModule, [
    "calculatePaymentLifecycleEligibility",
    "EstimateDepositConfig",
    "{ type: \"fixed\"; amountCents: number }",
    "{ type: \"percent\"; percent: number }",
    "hasActiveInvoice",
    "estimate_has_active_invoice",
    "revisionState",
    "revision_${input.revisionState}",
    "input.status !== \"approved\"",
    "Pay Deposit",
    "Pay in Full",
    "Pay Balance Due",
    "void_invoice",
    "fully_paid",
    "pendingReservationCents",
  ]);

  assert.match(
    lifecycleModule,
    /if \(input\.hasActiveInvoice\)[\s\S]*status: "direct_to_invoice"[\s\S]*actions: \[\]/,
    "Already invoiced Estimates must not expose new payment actions.",
  );
  assert.match(
    lifecycleModule,
    /const depositDueCents = Math\.max\(requiredDepositCents - base\.paidCents - base\.reservedCents, 0\)/,
    "Deposit due must subtract paid deposits and active reservations.",
  );
  assert.match(
    lifecycleModule,
    /amountCents: base\.remainingBalanceCents[\s\S]*maxAmountCents: base\.remainingBalanceCents/,
    "Pay-in-full must use the server-calculated remaining eligible balance.",
  );
});

test("Stripe webhook accounting contract covers required events without double-posting", () => {
  includesAll(lifecycleModule, [
    "STRIPE_WEBHOOK_ACCOUNTING_CONTRACTS",
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "charge.refunded",
    "refund.created",
    "refund.updated",
    "charge.dispute.created",
    "charge.dispute.closed",
    "requiresProviderEventDeduplication: true",
    "requiresSignatureVerification: true",
  ]);

  assert.match(
    lifecycleModule,
    /eventType: "checkout\.session\.completed"[\s\S]*createsCanonicalPayment: false/,
    "Checkout completion alone must not post a canonical payment.",
  );
  assert.match(
    lifecycleModule,
    /eventType: "payment_intent\.succeeded"[\s\S]*effect: "post_canonical_payment_once"[\s\S]*createsCanonicalPayment: true/,
    "Confirmed PaymentIntent success is the canonical payment posting signal.",
  );
});

test("0121 migration adds deposit config and checkout reservation structures", () => {
  includesAll(migration, [
    "add column if not exists deposit_type text",
    "add column if not exists deposit_value numeric(10, 2)",
    "service_request_estimates_deposit_type_check",
    "service_request_estimates_deposit_value_check",
    "create table if not exists public.service_request_payment_checkout_attempts",
    "create table if not exists public.service_request_payment_provider_events",
    "service_request_payment_checkout_attempts_idempotency_uidx",
    "service_request_payment_provider_events_provider_uidx",
    "provider_checkout_session_id",
    "provider_payment_intent_id",
    "request_fingerprint",
    "reserved_until",
    "checkout_status in (",
    "succeeded_payment_id uuid",
  ]);

  assert.doesNotMatch(
    migration,
    /insert\s+into\s+public\.service_request_payments/i,
    "Readiness migration must not post canonical payments before STRIPE-01.",
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.service_request_payment_allocations/i,
    "Readiness migration must not rewrite existing allocations.",
  );
});

test("eligibility RPC reads canonical allocations and active reservations", () => {
  includesAll(migration, [
    "get_service_request_payment_eligibility_rpc",
    "public.active_payment_checkout_reserved_amount('estimate', estimate_row.id)",
    "public.active_payment_checkout_reserved_amount('invoice', invoice_row.id)",
    "from public.service_request_payment_allocations allocation",
    "where allocation.estimate_id = estimate_row.id",
    "where allocation.invoice_id = invoice_row.id",
    "allocation.allocation_status = 'active'",
    "invoice.invoice_status <> 'void'",
    "revision_row.revision_status <> 'sent'",
    "revision_row.token_revoked_at is not null",
    "revision_row.customer_decision is not null",
    "revision_row.token_expires_at <= now()",
  ]);

  assert.match(
    migration,
    /if estimate_row\.deposit_type = 'fixed'[\s\S]*elsif estimate_row\.deposit_type = 'percent'/,
    "Eligibility RPC must support fixed and percentage deposits.",
  );
});

test("checkout reservation RPC serializes targets and enforces strict idempotency", () => {
  includesAll(migration, [
    "reserve_service_request_payment_checkout_rpc",
    "where id = p_target_id\n    for update;",
    "pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 301))",
    "pg_advisory_xact_lock(hashtextextended(invoice_row.service_request_id::text, 301))",
    "existing_attempt.service_request_id is distinct from request_row.id",
    "existing_attempt.target_type is distinct from normalized_target_type",
    "existing_attempt.checkout_kind is distinct from normalized_checkout_kind",
    "round(existing_attempt.amount, 2) is distinct from round(p_amount, 2)",
    "existing_attempt.request_fingerprint is distinct from clean_fingerprint",
    "Payment amount exceeds the selected eligible balance.",
  ]);

  const estimateLockIndex = migration.indexOf(
    "from public.service_request_estimates\n    where id = p_target_id\n    for update;",
  );
  const estimateEligibilityIndex = migration.indexOf(
    "eligibility := public.get_service_request_payment_eligibility_rpc",
  );
  assert.ok(
    estimateLockIndex >= 0 && estimateEligibilityIndex > estimateLockIndex,
    "Reservation must lock the target before recalculating eligibility.",
  );
});

test("0121 grants do not expose payment writes to anon or public", () => {
  includesAll(migration, [
    "alter table public.service_request_payment_checkout_attempts enable row level security",
    "alter table public.service_request_payment_provider_events enable row level security",
    "revoke all on public.service_request_payment_checkout_attempts from public",
    "revoke all on public.service_request_payment_provider_events from public",
    "grant select on public.service_request_payment_checkout_attempts to authenticated",
    "grant select on public.service_request_payment_provider_events to authenticated",
    "public.can_view_service_request(service_request_id)",
    "grant execute on function public.get_service_request_payment_eligibility_rpc",
    "grant execute on function public.reserve_service_request_payment_checkout_rpc",
  ]);

  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all)[\s\S]*service_request_payment_checkout_attempts[\s\S]*to\s+authenticated/i,
    "Authenticated role must not receive direct write grants on checkout attempts.",
  );
  assert.doesNotMatch(
    migration,
    /grant\s+execute[\s\S]*to\s+anon/i,
    "Anonymous users must not execute checkout readiness RPCs.",
  );
});
