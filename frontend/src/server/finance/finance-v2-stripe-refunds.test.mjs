import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const refundRoute = read(
  "frontend/src/app/api/service-requests/[id]/payments/[paymentId]/refund/route.ts",
);
const stripeRefunds = read("frontend/src/server/finance/stripe-refunds.ts");
const webhookAccounting = read(
  "frontend/src/server/finance/stripe-webhook-accounting.ts",
);
const migration0143 = read(
  "supabase/migrations/0143_finance_v2_refund_financial_foundation_apply_ready.sql",
);

test("Stripe refund route is authenticated staff-only and validates amount, reason, idempotency", () => {
  assert.match(refundRoute, /requireHomeFixPrivateAccess\(request\)/);
  assert.match(refundRoute, /createStripePaymentRefund\(privateAccess\.context/);
  assert.match(refundRoute, /parseMoneyToCents/);
  assert.match(refundRoute, /Refund reason is required/);
  assert.match(refundRoute, /idempotencyKey\.length < 12/);
  assert.match(refundRoute, /recoverable \? 202 : 403/);
  assert.doesNotMatch(refundRoute, /STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("Stripe refund helper reserves capacity before provider call and uses stable idempotency", () => {
  const reserveIndex = stripeRefunds.indexOf(
    "reserve_service_request_payment_refund_rpc",
  );
  const stripeCreateIndex = stripeRefunds.indexOf("stripe.refunds.create");

  assert.ok(reserveIndex >= 0, "Refund reservation RPC must be called.");
  assert.ok(stripeCreateIndex > reserveIndex, "Stripe call must happen after reservation.");
  assert.match(stripeRefunds, /buildRefundIdempotencyKey/);
  assert.match(stripeRefunds, /createHash\("sha256"\)/);
  assert.match(stripeRefunds, /idempotencyKey: stableIdempotencyKey/);
  assert.match(stripeRefunds, /payment_intent: getPaymentIntentId\(payment\)/);
  assert.match(stripeRefunds, /homefixos_refund_id/);
  assert.match(stripeRefunds, /provider_refund_id: stripeRefund\.id/);
  assert.match(stripeRefunds, /pendingRefundId: refundId/);
});

test("Stripe refund helper confirms succeeded provider refunds only through trusted service-role RPC", () => {
  assert.match(stripeRefunds, /getSupabaseServiceRoleClient/);
  assert.match(stripeRefunds, /confirm_stripe_service_request_payment_refund_rpc/);
  assert.match(stripeRefunds, /serviceRole\.rpc/);
  assert.doesNotMatch(
    stripeRefunds,
    /privateAccess\.supabase\.rpc\(\s*"confirm_stripe_service_request_payment_refund_rpc"/,
  );
  assert.match(stripeRefunds, /record_failed_service_request_payment_refund_rpc/);
  assert.match(stripeRefunds, /Stripe refund succeeded, but local confirmation is pending provider reconciliation/);
});

test("Stripe refund webhook handles refund events before checkout-attempt-required payment flow", () => {
  const refundBranchIndex = webhookAccounting.indexOf("isStripeRefundEvent(event)");
  const paymentBranchIndex = webhookAccounting.indexOf(
    'event.type === "payment_intent.succeeded"',
  );

  assert.ok(refundBranchIndex >= 0, "Refund webhook branch must exist.");
  assert.ok(
    refundBranchIndex < paymentBranchIndex,
    "Refund webhooks must not require checkout attempt metadata.",
  );
  assert.match(webhookAccounting, /refund\.created/);
  assert.match(webhookAccounting, /refund\.updated/);
  assert.match(webhookAccounting, /findLocalRefundForStripeRefund/);
  assert.match(webhookAccounting, /confirmed_refund/);
  assert.match(webhookAccounting, /released_refund/);
  assert.match(webhookAccounting, /refund_requires_reconciliation/);
  assert.match(webhookAccounting, /record_stripe_service_request_payment_refund_failure_rpc/);
  assert.match(webhookAccounting, /charge\.refunded/);
  assert.match(webhookAccounting, /recorded_refund_audit_only/);
});

test("0143 grants trusted Stripe refund confirmation and failure paths only to service_role", () => {
  assert.match(migration0143, /confirm_stripe_service_request_payment_refund_rpc/);
  assert.match(migration0143, /record_stripe_service_request_payment_refund_failure_rpc/);
  assert.match(
    migration0143,
    /grant execute on function public\.confirm_stripe_service_request_payment_refund_rpc\(uuid, text, text, jsonb\) to service_role;/,
  );
  assert.match(
    migration0143,
    /grant execute on function public\.record_stripe_service_request_payment_refund_failure_rpc\(uuid, text, text, text, jsonb\) to service_role;/,
  );
  assert.match(
    migration0143,
    /revoke all on function public\.confirm_stripe_service_request_payment_refund_rpc\(uuid, text, text, jsonb\) from authenticated;/,
  );
  assert.match(
    migration0143,
    /revoke all on function public\.record_stripe_service_request_payment_refund_failure_rpc\(uuid, text, text, text, jsonb\) from authenticated;/,
  );
  assert.match(
    migration0143,
    /grant select, update on public\.service_request_payment_refunds to service_role;/,
  );
});
