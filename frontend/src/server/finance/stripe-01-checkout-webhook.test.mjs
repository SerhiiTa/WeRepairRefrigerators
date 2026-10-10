import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const checkoutRoute = read("frontend/src/app/api/payments/stripe-checkout/route.ts");
const webhookRoute = read("frontend/src/app/api/payments/stripe-webhook/route.ts");
const checkoutServer = read("frontend/src/server/finance/stripe-checkout.ts");
const webhookAccounting = read(
  "frontend/src/server/finance/stripe-webhook-accounting.ts",
);
const stripeReturnStatus = read("frontend/src/server/finance/stripe-return-status.ts");
const stripeSuccessPage = read("frontend/src/app/payments/stripe/success/page.tsx");
const stripeCancelPage = read("frontend/src/app/payments/stripe/cancel/page.tsx");
const stripeConfig = read("frontend/src/server/finance/stripe-config.ts");
const devQa = read("frontend/scripts/dev-qa.mjs");
const stripeAtomicMigration = read(
  "supabase/migrations/0122_stripe_atomic_payment_posting_apply_ready.sql",
);

test("Stripe QA config allows only explicit local Test Mode keys", () => {
  assert.match(devQa, /qaStripeEnvPath = resolve\(frontendRoot, "\.env\.qa\.stripe\.local"\)/);
  assert.match(devQa, /WRA_QA_ENABLE_STRIPE_TEST_MODE=1/);
  assert.match(devQa, /startsWith\("sk_test_"\)/);
  assert.match(devQa, /startsWith\("pk_test_"\)/);
  assert.match(devQa, /startsWith\("whsec_"\)/);
  assert.match(devQa, /STRIPE_MOCK_MODE: stripeQaEnabled \? "0" : "1"/);
  assert.doesNotMatch(devQa, /writeFileSync\(/);
  assert.doesNotMatch(devQa, /renameSync|unlinkSync/);

  assert.match(stripeConfig, /Live Stripe keys are not allowed/);
  assert.match(stripeConfig, /WRA_STRIPE_SANDBOX_PILOT_CUSTOMER_ID/);
  assert.match(stripeConfig, /production_sandbox_pilot/);
  assert.match(stripeConfig, /process\.env\.NODE_ENV !== "production"/);
  assert.match(stripeConfig, /Stripe mock mode is only allowed in local QA/);
  assert.match(stripeConfig, /process\.env\.WRA_QA_ENABLE_STRIPE_TEST_MODE === "1"/);
  assert.match(stripeConfig, /new Stripe\(process\.env\.STRIPE_SECRET_KEY/);
});

test("Checkout route requires dashboard auth and never accepts client amount", () => {
  assert.match(checkoutRoute, /requireHomeFixPrivateAccess\(request\)/);
  assert.match(checkoutRoute, /createStripeCheckoutSession\(privateAccess\.context\.supabase/);
  assert.doesNotMatch(checkoutRoute, /payload\.amount|amountCents|unit_amount/);
});

test("Checkout server calculates eligibility before reserving exact amount", () => {
  const eligibilityIndex = checkoutServer.indexOf(
    "get_service_request_payment_eligibility_rpc",
  );
  const reserveIndex = checkoutServer.indexOf(
    "reserve_service_request_payment_checkout_rpc",
  );

  assert.ok(eligibilityIndex >= 0, "Eligibility RPC must be called.");
  assert.ok(reserveIndex > eligibilityIndex, "Reservation must follow eligibility calculation.");
  assert.match(checkoutServer, /selectedAction\?\.max_amount \?\? selectedAction\?\.amount/);
  assert.match(checkoutServer, /p_amount: amount/);
  assert.match(checkoutServer, /buildRequestFingerprint/);
  assert.match(checkoutServer, /idempotencyKey: `checkout:\$\{params\.attempt\.id\}`/);
  assert.match(checkoutServer, /provider_checkout_session_id: session\.id/);
  assert.match(checkoutServer, /checkout_metadata:[\s\S]*stripe_checkout_url: session\.url/);
  assert.match(checkoutServer, /success_url: `\$\{params\.origin\}\/payments\/stripe\/success\?\$\{returnQuery\.toString\(\)\}`/);
  assert.match(checkoutServer, /cancel_url: `\$\{params\.origin\}\/payments\/stripe\/cancel\?\$\{returnQuery\.toString\(\)\}`/);
  assert.doesNotMatch(checkoutServer, /p_amount:\s*0\.01/);
});

test("Webhook route verifies raw Stripe signature before processing", () => {
  assert.match(webhookRoute, /const rawBody = await request\.text\(\)/);
  assert.match(webhookRoute, /stripe\.webhooks\.constructEvent\(/);
  assert.match(webhookRoute, /config\.webhookSecret/);
  assert.match(webhookRoute, /production_sandbox_pilot/);
  assert.doesNotMatch(webhookRoute, /request\.json\(\)/);
});

test("Webhook accounting dedupes provider events and posts canonical ledger only on confirmed success", () => {
  assert.match(webhookAccounting, /service_request_payment_provider_events/);
  assert.match(webhookAccounting, /provider_event_id: params\.event\.id/);
  assert.match(webhookAccounting, /isDuplicateError/);
  assert.match(webhookAccounting, /event\.type === "payment_intent\.succeeded"/);
  assert.match(webhookAccounting, /record_stripe_checkout_payment_rpc/);
  assert.match(webhookAccounting, /isAttemptAllowedForRuntime/);
  assert.match(webhookAccounting, /customers"[\s\S]*id,company_id/);
  assert.match(webhookAccounting, /customerCompanyId === data\.company_id/);
  assert.match(webhookAccounting, /rejected_non_pilot_attempt/);
  assert.match(webhookAccounting, /rejected_live_event/);
  assert.match(webhookAccounting, /annotateStripeSandboxPayment/);
  assert.match(webhookAccounting, /stripe_sandbox_pilot/);
  assert.match(webhookAccounting, /pilot_customer_id/);
  assert.match(webhookAccounting, /p_amount_cents: params\.paymentIntent\.amount_received/);
  assert.match(webhookAccounting, /p_payment_status: params\.paymentIntent\.status/);
  assert.match(webhookAccounting, /markAttemptProcessingFromCheckoutSession/);
  assert.match(webhookAccounting, /params\.attempt\.checkout_status === "succeeded"/);
  assert.match(webhookAccounting, /params\.attempt\.succeeded_payment_id/);
  assert.match(webhookAccounting, /\.neq\("checkout_status", "succeeded"\)/);
  assert.match(webhookAccounting, /\.is\("succeeded_payment_id", null\)/);
  assert.match(webhookAccounting, /preserved_succeeded/);
  assert.match(
    webhookAccounting,
    /\.from\("service_request_payments"\)[\s\S]*\.select\("id,payment_metadata"\)[\s\S]*payment_metadata:/,
    "Webhook may only touch canonical Payments to annotate sandbox/test metadata after atomic posting.",
  );
  assert.doesNotMatch(webhookAccounting, /\.from\("service_request_payment_allocations"\)/);

  assert.doesNotMatch(
    webhookAccounting,
    /event\.type === "checkout\.session\.completed"[\s\S]*from\("service_request_payments"\)/,
    "Checkout completion alone must not create a canonical Payment.",
  );
});

test("Stripe return pages require customer token authorization for payment details", () => {
  assert.match(stripeSuccessPage, /loadStripeReturnStatus/);
  assert.match(stripeSuccessPage, /Payment processing/);
  assert.match(stripeSuccessPage, /Payment received/);
  assert.match(stripeSuccessPage, /verified webhook posts it/);
  assert.match(stripeSuccessPage, /Return to/);
  assert.doesNotMatch(stripeSuccessPage, /checkoutAttemptId|company_id|payment_metadata/);

  assert.match(stripeCancelPage, /Checkout canceled/);
  assert.match(stripeCancelPage, /payment failed or was refunded/);
  assert.doesNotMatch(stripeCancelPage, /api\/public\/payments\/stripe-checkout/);

  assert.match(stripeReturnStatus, /TOKEN_PATTERN/);
  assert.match(stripeReturnStatus, /UUID_PATTERN/);
  assert.match(stripeReturnStatus, /get_public_estimate_by_token_rpc/);
  assert.match(stripeReturnStatus, /get_public_estimate_payment_options_rpc/);
  assert.match(stripeReturnStatus, /tokenEstimateId !== attempt\.estimate_id/);
  assert.match(stripeReturnStatus, /attempt\.checkout_status === "succeeded" \|\| attempt\.succeeded_payment_id/);
});

test("Refund and dispute events are audit-only until explicit adjustment ledger exists", () => {
  assert.match(webhookAccounting, /event\.type\.startsWith\("refund\."\)/);
  assert.match(webhookAccounting, /event\.type\.startsWith\("charge\.dispute\."\)/);
  assert.match(webhookAccounting, /recorded_audit_only/);
  assert.match(webhookAccounting, /until ledger adjustment support is implemented/);
});

test("0122 atomic Stripe posting RPC owns financial writes and service-role grant", () => {
  assert.match(stripeAtomicMigration, /record_stripe_checkout_payment_rpc/);
  assert.match(stripeAtomicMigration, /security definer/);
  assert.match(stripeAtomicMigration, /for update;/);
  assert.match(stripeAtomicMigration, /pg_advisory_xact_lock\(hashtextextended\(attempt_row\.service_request_id::text, 301\)\)/);
  assert.match(stripeAtomicMigration, /insert into public\.service_request_payments/);
  assert.match(stripeAtomicMigration, /insert into public\.service_request_payment_allocations/);
  assert.match(stripeAtomicMigration, /insert into public\.communication_timeline_events/);
  assert.match(stripeAtomicMigration, /allocation_amount > available_amount/);
  assert.match(stripeAtomicMigration, /grant execute[\s\S]*to service_role/);
  assert.match(stripeAtomicMigration, /revoke all[\s\S]*from authenticated/);
  assert.doesNotMatch(stripeAtomicMigration, /grant execute[\s\S]*to authenticated/i);
  assert.doesNotMatch(stripeAtomicMigration, /grant execute[\s\S]*to anon/i);
});
