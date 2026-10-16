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
const receiptRepairMigration = read(
  "supabase/migrations/0141_payment_receipt_rpc_allocation_status_repair_apply_ready.sql",
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

function formatReceiptPaidAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Pending";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Chicago",
    timeZoneName: "short",
    year: "numeric",
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? "";
  const dayPeriod = part("dayPeriod");

  return `${part("month")} ${part("day")}, ${part("year")} at ${part("hour")}:${part("minute")}${
    dayPeriod ? ` ${dayPeriod}` : ""
  } ${part("timeZoneName")}`.trim();
}

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

test("0141 repairs receipt creation for the actual Finance V2 allocation schema", () => {
  assert.match(
    receiptRepairMigration,
    /create or replace function public\.ensure_service_request_payment_receipt_rpc/,
  );
  assert.match(
    receiptRepairMigration,
    /from public\.service_request_payment_allocations allocation[\s\S]*allocation\.allocation_status = 'active'/,
  );
  assert.doesNotMatch(receiptRepairMigration, /allocation\.voided_at/);
  assert.match(receiptRepairMigration, /where payment_id = payment_row\.id[\s\S]*for update/);
  assert.match(receiptRepairMigration, /pg_advisory_xact_lock\(hashtextextended\(payment_row\.service_request_id::text, 302\)\)/);
  assert.match(receiptRepairMigration, /payment_row\.payment_status <> 'succeeded'/);
  assert.match(receiptRepairMigration, /coalesce\(payment_row\.provider, ''\) <> 'stripe'/);
  assert.match(receiptRepairMigration, /coalesce\(payment_row\.payment_method, ''\) <> 'card'/);
  assert.match(receiptRepairMigration, /grant execute on function public\.ensure_service_request_payment_receipt_rpc\(uuid\) to service_role/);
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
  assert.match(receiptRoute, /target_service_request_id: serviceRequestId/);
  assert.doesNotMatch(receiptRoute, /p_service_request_id: serviceRequestId/);
  assert.match(receiptRoute, /Receipt SMS must use the authorized Job conversation recipient/);
  assert.match(receiptRoute, /sendConversationSms/);
  assert.match(receiptRoute, /deliveryOptions/);
  assert.match(receiptRoute, /findLatestConversation/);
  assert.match(receiptRoute, /available: Boolean\(conversation\?\.customer_phone\)/);
  assert.match(receiptRoute, /deliverPaymentReceiptEmail/);
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
  assert.match(serviceRequestDetail, /Send Receipt via Email/);
  assert.match(serviceRequestDetail, /receiptEmailOption.available/);
  assert.match(serviceRequestDetail, /Confirm Send/);
  assert.match(serviceRequestDetail, /Delivery History/);
  assert.match(serviceRequestDetail, /Receipt email delivery is not configured/);
  assert.match(serviceRequestDetail, /controlled recipient gate/);
  assert.match(serviceRequestDetail, /Receipt history is unavailable:/);
  assert.match(serviceRequestDetail, /Receipt delivery history is unavailable:/);
  assert.match(serviceRequestDetail, /stripeReturnRefreshKeyRef/);
  assert.match(serviceRequestDetail, /tab !== "finance"/);
  assert.match(serviceRequestDetail, /Promise\.all\(\[loadPayments\(\), loadInvoices\(\)\]\)/);
});

test("success page waits for receipt-backed verified payment", () => {
  assert.match(returnStatus, /ensure_service_request_payment_receipt_rpc/);
  assert.match(returnStatus, /existingReceipt/);
  assert.match(returnStatus, /finalAttempt\.checkout_status === "succeeded"[\s\S]*loadPaymentReceipt/);
  assert.match(returnStatus, /receipt_unavailable/);
  assert.match(returnStatus, /token_rpc_failed/);
  assert.match(returnStatus, /token_missing/);
  assert.match(returnStatus, /stripe-return-status-receipt-diagnostic/);
  assert.match(returnStatus, /receiptRowFound/);
  assert.match(returnStatus, /tokenIssued/);
  assert.match(successPage, /StripeSuccessExperience/);
  assert.match(successPage, /isDashboardReturn/);
  assert.match(successPage, /devPreview/);
  assert.match(successPage, /devReceiptModal/);
  assert.match(successPage, /process\.env\.NODE_ENV !== "production"/);
  assert.match(successPage, /devOpenReceiptDelivery/);
  assert.match(successPage, /paymentStatus: "processing"/);
  assert.match(returnStatus, /staffReceiptDelivery/);
  assert.match(returnStatus, /succeeded_payment_id/);
  assert.match(returnStatus, /serviceRequestId: attempt\.service_request_id/);
  assert.match(successExperience, /polls < 12/);
  assert.match(successExperience, /requestSequenceRef/);
  assert.match(successExperience, /requestSequence === requestSequenceRef\.current/);
  assert.match(successExperience, /payload\?\.ok === true[\s\S]*payload\.status/);
  assert.ok(
    successExperience.indexOf("setStatus(payload.status)") <
      successExperience.indexOf("setPolls((current) => current + 1)"),
  );
  assert.match(successExperience, /Receipt temporarily unavailable/);
  assert.match(successExperience, /HomeFixOS could not prepare the receipt link yet/);
  assert.match(successExperience, /api\/payments\/stripe-return-status/);
  assert.match(successExperience, /Authorization/);
  assert.match(successExperience, /Payment Successful!/);
  assert.match(successExperience, /Verifying your payment/);
  assert.match(successExperience, /Securely confirming your transaction with Stripe/);
  assert.match(successExperience, /homefix-verify-ring/);
  assert.match(successExperience, /homefix-success-ring/);
  assert.match(successExperience, /prefers-reduced-motion/);
  assert.match(successExperience, /Payment Amount/);
  assert.match(successExperience, /Your payment receipt is ready to view/);
  assert.match(successExperience, /Reliable Appliances\. Happier Homes\./);
  assert.match(successExperience, /CreditCardIcon/);
  assert.match(successExperience, /ClipboardListIcon/);
  assert.match(successExperience, /CalendarDaysIcon/);
  assert.match(successExperience, /ReceiptTextIcon/);
  assert.doesNotMatch(successExperience, /\["▣", "Payment Method"/);
  assert.doesNotMatch(successExperience, /\["●", "Job Number"/);
  assert.doesNotMatch(successExperience, /\["◷", "Date & Time"/);
  assert.doesNotMatch(successExperience, /\["◆", "Receipt Number"/);
  assert.match(successExperience, /View Receipt/);
  assert.match(successExperience, /Send Receipt/);
  assert.match(successExperience, /status\.staffReceiptDelivery/);
  assert.match(successExperience, /setReceiptDeliveryModal/);
  assert.match(successExperience, /api\/service-requests\/\$\{serviceRequestId\}\/payments\/\$\{paymentId\}\/receipt/);
  assert.match(successExperience, /const smsSelected = event\.currentTarget\.checked/);
  assert.match(successExperience, /\? \{ \.\.\.current, smsSelected \}/);
  assert.match(
    successExperience,
    /\(!receiptDeliveryModal\.smsSelected &&\s*!receiptDeliveryModal\.emailSelected\)/,
  );
  const smsSelectionIndex = successExperience.indexOf(
    "const smsSelected = event.currentTarget.checked",
  );
  assert.ok(smsSelectionIndex > -1);
  assert.ok(
    smsSelectionIndex <
      successExperience.indexOf("setReceiptDeliveryModal((current) =>", smsSelectionIndex),
  );
  assert.ok(
    successExperience.indexOf("const sends: Array<Promise<Response>> = []") >
      successExperience.indexOf("Choose SMS or Email before sending."),
  );
  assert.match(successExperience, /Receipt email delivery is not configured yet/);
  assert.match(successExperience, /Preview only\. No receipt was sent\./);
  assert.match(successExperience, /Message Preview/);
  assert.match(successExperience, /Confirm Send/);
  assert.match(successExperience, /Delivery History/);
  assert.match(successExperience, /devOpenReceiptDelivery/);
  assert.match(successExperience, /hidden border-l border-\[#E2E8F0\] p-5 text-center sm:block/);
  assert.match(successExperience, /paidAt/);
  assert.doesNotMatch(successExperience, /dateStyle[\s\S]*timeZoneName/);
  assert.doesNotThrow(() => formatReceiptPaidAt("2026-10-12T23:58:06.523232+00:00"));
  assert.equal(
    formatReceiptPaidAt("2026-10-12T23:58:06.523232+00:00"),
    "Oct 12, 2026 at 6:58 PM CDT",
  );
  assert.match(statusRoute, /requireHomeFixPrivateAccess/);
  assert.match(statusRoute, /loadDashboardStripeReturnStatus/);
  assert.match(returnStatus, /target_service_request_id: serviceRequestId/);
  assert.match(statusRoute, /Cache-Control": "no-store"/);
});

test("public receipt page is token scoped, noindex, and avoids internal identifiers", () => {
  assert.match(publicReceiptPage, /get_public_payment_receipt_by_token_rpc/);
  assert.match(publicReceiptPage, /TOKEN_PATTERN/);
  assert.match(publicReceiptPage, /robots/);
  assert.match(publicReceiptPage, /index: false/);
  assert.match(publicReceiptPage, /fetchCache = "force-no-store"/);
  assert.match(publicReceiptPage, /HomeFix/);
  assert.match(publicReceiptPage, /Reliable Appliances\. Happier Homes\./);
  assert.match(publicReceiptPage, /PAYMENT RECEIPT/);
  assert.match(publicReceiptPage, /Amount Received/);
  assert.match(publicReceiptPage, /This receipt confirms the individual payment listed above/);
  assert.match(publicReceiptPage, /America\/Chicago/);
  assert.doesNotMatch(publicReceiptPage, /Send Receipt/);
  assert.doesNotMatch(publicReceiptPage, /sendConversationSms/);
  assert.doesNotMatch(publicReceiptPage, /dateStyle[\s\S]*timeZoneName/);
  assert.doesNotMatch(publicReceiptPage, /provider_payment|payment_id|service_request_id|company_id|stripe/i);
});
