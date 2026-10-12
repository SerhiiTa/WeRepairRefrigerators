import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration = read(
  "supabase/migrations/0140_payment_receipts_foundation_apply_ready.sql",
);
const receipts = read("frontend/src/server/finance/payment-receipts.ts");
const webhookAccounting = read(
  "frontend/src/server/finance/stripe-webhook-accounting.ts",
);
const returnStatus = read("frontend/src/server/finance/stripe-return-status.ts");
const successPage = read("frontend/src/app/payments/stripe/success/page.tsx");
const successExperience = read(
  "frontend/src/app/payments/stripe/success/StripeSuccessExperience.tsx",
);
const statusRoute = read(
  "frontend/src/app/api/payments/stripe-return-status/route.ts",
);
const publicReceiptPage = read("frontend/src/app/receipts/[token]/page.tsx");
const receiptRoute = read(
  "frontend/src/app/api/service-requests/[id]/payments/[paymentId]/receipt/route.ts",
);
const serviceRequestDetail = read(
  "frontend/src/components/dashboard/ServiceRequestDetail.tsx",
);

test("0140 creates one hashed-token receipt per canonical successful payment", () => {
  assert.match(migration, /create table if not exists public\.service_request_payment_receipts/);
  assert.match(migration, /create table if not exists public\.service_request_payment_receipt_tokens/);
  assert.match(migration, /create table if not exists public\.service_request_payment_receipt_deliveries/);
  assert.match(migration, /service_request_payment_receipts_payment_uidx/);
  assert.match(migration, /service_request_payment_receipts_request_sequence_uidx/);
  assert.match(migration, /service_request_payment_receipt_deliveries_idempotency_uidx/);
  assert.match(migration, /delivery_attempt_count integer not null default 0/);
  assert.match(migration, /delivery_attempt_count between 0 and 5/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(payment_row\.service_request_id::text, 302\)\)/);
  assert.match(migration, /payment_row\.payment_status <> 'succeeded'/);
  assert.match(migration, /payment_row\.voided_at is not null/);
  assert.match(migration, /coalesce\(payment_row\.provider, ''\) <> 'stripe'/);
  assert.match(migration, /coalesce\(payment_row\.payment_method, ''\) <> 'card'/);
  assert.match(migration, /select coalesce\(max\(receipt_sequence\), 0\) \+ 1/);
  assert.match(migration, /'RCP-' \|\| job_number_text \|\| '-' \|\| lpad\(next_sequence::text, 3, '0'\)/);
  assert.doesNotMatch(migration, /'receipt-sms:' \|\| payment_row\.id::text/);
});

test("0140 supports manual idempotent receipt delivery finalization", () => {
  assert.match(migration, /finalize_service_request_payment_receipt_delivery_rpc/);
  assert.match(migration, /delivery_status = 'sent'/);
  assert.match(migration, /provider_message_id/);
  assert.match(migration, /case when delivery_attempt_count >= 3 then 'failed' else 'pending' end/);
  assert.match(migration, /now\(\) \+ \(delivery_attempt_count \* interval '5 minutes'\)/);
  assert.doesNotMatch(migration, /delivered_at = now\(\)/);
  assert.doesNotMatch(migration, /claim_service_request_payment_receipt_delivery_rpc/);
  assert.doesNotMatch(migration, /for update skip locked/);
});

test("0140 stores only token hashes and supports expiration and revocation", () => {
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /token_expires_at timestamptz not null/);
  assert.match(migration, /token_revoked_at timestamptz/);
  assert.match(migration, /public\.estimate_approval_token_hash\(token_text\)/);
  assert.match(migration, /public\.estimate_approval_token_hash\(clean_token\)/);
  assert.match(migration, /token_revoked_at is null/);
  assert.match(migration, /token_expires_at > now\(\)/);
  assert.doesNotMatch(migration, /access_token/);
  assert.doesNotMatch(migration, /receipt_url/);
});

test("receipt RPC returns only limited public receipt fields", () => {
  assert.match(migration, /get_public_payment_receipt_by_token_rpc/);
  assert.match(migration, /'receipt_number'/);
  assert.match(migration, /'job_number'/);
  assert.match(migration, /'amount'/);
  assert.match(migration, /'payment_method'/);
  assert.match(migration, /'card_brand'/);
  assert.match(migration, /'card_last4'/);
  assert.doesNotMatch(migration, /customer_phone|customer_email|street_address|provider_payment_id.*return/i);
});

test("webhook creates receipt only after canonical ledger posting", () => {
  const postIndex = webhookAccounting.indexOf("postCanonicalPaymentAtomically");
  const receiptIndex = webhookAccounting.indexOf("ensurePaymentReceipt(paymentId)");
  assert.ok(postIndex >= 0);
  assert.ok(receiptIndex > postIndex);
  assert.match(receipts, /ensure_service_request_payment_receipt_rpc/);
  assert.doesNotMatch(webhookAccounting, /sendConversationSms/);
  assert.doesNotMatch(receipts, /sendConversationSms/);
});

test("receipt delivery is manual staff action only", () => {
  assert.match(receiptRoute, /requireHomeFixPrivateAccess/);
  assert.match(receiptRoute, /can_view_service_request/);
  assert.match(receiptRoute, /Receipt SMS must use the authorized Job conversation recipient/);
  assert.match(receiptRoute, /sendConversationSms/);
  assert.match(receiptRoute, /Receipt email delivery is not configured yet/);
  assert.ok(
    receiptRoute.indexOf('if (channel === "email")') <
      receiptRoute.indexOf("const receiptData = await buildReceiptResponse"),
  );
  assert.match(receiptRoute, /idempotency_key/);
  assert.doesNotMatch(webhookAccounting, /receipt.*sendConversationSms/i);
  assert.doesNotMatch(receipts, /service_request_payment_receipt_deliveries/);
});

test("dashboard exposes manual receipt view and delivery controls", () => {
  assert.match(serviceRequestDetail, /View Receipt/);
  assert.match(serviceRequestDetail, /Send Receipt via SMS/);
  assert.match(serviceRequestDetail, /Send Receipt via Email \(Coming Soon\)/);
  assert.match(serviceRequestDetail, /Email delivery coming soon/);
  assert.match(serviceRequestDetail, /Confirm Send/);
  assert.match(serviceRequestDetail, /Delivery History/);
  assert.match(serviceRequestDetail, /Receipt email delivery is not configured yet/);
  assert.match(serviceRequestDetail, /controlled recipient gate/);
});

test("success page waits for receipt-backed verified payment", () => {
  assert.match(returnStatus, /ensure_service_request_payment_receipt_rpc/);
  assert.match(returnStatus, /finalAttempt\.checkout_status === "succeeded"[\s\S]*loadPaymentReceipt/);
  assert.match(returnStatus, /finalAttempt\.checkout_status === "succeeded"[\s\S]*"processing"/);
  assert.match(successPage, /StripeSuccessExperience/);
  assert.match(successExperience, /polls < 8/);
  assert.match(successExperience, /api\/payments\/stripe-return-status/);
  assert.match(successExperience, /Payment Successful!/);
  assert.match(successExperience, /View Receipt/);
  assert.match(statusRoute, /Cache-Control": "no-store"/);
});

test("public receipt page is token scoped, noindex, and avoids internal identifiers", () => {
  assert.match(publicReceiptPage, /get_public_payment_receipt_by_token_rpc/);
  assert.match(publicReceiptPage, /TOKEN_PATTERN/);
  assert.match(publicReceiptPage, /robots/);
  assert.match(publicReceiptPage, /index: false/);
  assert.match(publicReceiptPage, /fetchCache = "force-no-store"/);
  assert.match(publicReceiptPage, /HomeFix Appliance Repair/);
  assert.match(publicReceiptPage, /Payment Receipt/);
  assert.doesNotMatch(publicReceiptPage, /provider_payment|payment_id|service_request_id|company_id|stripe/i);
});
