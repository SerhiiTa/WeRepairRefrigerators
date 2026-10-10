import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration = read(
  "supabase/migrations/0125_invoice_delivery_public_payment_apply_ready.sql",
);
const sendRoute = read("frontend/src/app/api/invoices/[id]/send/route.ts");
const deliveryBridge = read(
  "frontend/src/server/finance/invoice-communications-delivery.ts",
);
const publicInvoicePage = read("frontend/src/app/invoices/[token]/page.tsx");
const publicInvoiceComponent = read(
  "frontend/src/components/public/PublicInvoicePayment.tsx",
);
const publicCheckoutRoute = read(
  "frontend/src/app/api/public/payments/stripe-checkout/route.ts",
);
const checkoutServer = read("frontend/src/server/finance/stripe-checkout.ts");
const returnStatus = read("frontend/src/server/finance/stripe-return-status.ts");
const serviceRequestDetail = read(
  "frontend/src/components/dashboard/ServiceRequestDetail.tsx",
);

test("0125 creates secure invoice token, delivery, and public payment RPCs", () => {
  assert.match(migration, /create table if not exists public\.service_request_invoice_delivery_tokens/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /token_expires_at timestamptz not null/);
  assert.match(migration, /token_revoked_at timestamptz/);
  assert.match(migration, /create table if not exists public\.service_request_invoice_deliveries/);
  assert.match(migration, /communication_message_id uuid references public\.communication_messages/);
  assert.match(migration, /create or replace function public\.send_service_request_invoice_to_customer_rpc/);
  assert.match(migration, /create or replace function public\.get_public_invoice_by_token_rpc/);
  assert.match(migration, /create or replace function public\.reserve_public_invoice_payment_checkout_rpc/);
  assert.match(migration, /replace\(pg_catalog\.gen_random_uuid\(\)::text, '-', ''\)/);
  assert.doesNotMatch(migration, /gen_random_bytes/i);
  assert.match(migration, /public\.estimate_approval_token_hash\(clean_token\)/);
  assert.match(migration, /invoice_token\.token_hash = clean_token_hash/);
  assert.match(migration, /public\.active_payment_checkout_reserved_amount\('invoice', invoice_row\.id\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(request_row\.id::text, 301\)\)/);
  assert.match(migration, /grant execute on function public\.get_public_invoice_by_token_rpc\(text\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.reserve_public_invoice_payment_checkout_rpc\(text, text, text, text, text\) to anon, authenticated/);
  assert.doesNotMatch(migration, /insert into public\.service_request_payments/i);
  assert.doesNotMatch(migration, /insert into public\.service_request_payment_allocations/i);
});

test("Invoice send route uses dashboard auth and delivery bridge", () => {
  assert.match(sendRoute, /createUserScopedServerClient\(accessToken\)/);
  assert.match(sendRoute, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(sendRoute, /send_service_request_invoice_to_customer_rpc/);
  assert.match(sendRoute, /sendInvoiceToCustomer/);
  assert.match(sendRoute, /idempotencyKey/);
  assert.match(sendRoute, /channel === "sms"/);
  assert.match(sendRoute, /channel === "email"/);
  assert.doesNotMatch(sendRoute, /requireHomeFixPrivateAccess/);
});

test("Invoice delivery bridge reuses Communications and blocks real email outside local mock", () => {
  assert.match(deliveryBridge, /sendConversationSms/);
  assert.match(deliveryBridge, /checkConversationSmsReadiness/);
  assert.match(deliveryBridge, /communication_conversations/);
  assert.match(deliveryBridge, /communication_messages/);
  assert.match(deliveryBridge, /service_request_invoice_deliveries/);
  assert.match(deliveryBridge, /invoice_sent/);
  assert.match(deliveryBridge, /invoice_delivery_failed/);
  assert.match(deliveryBridge, /WRA_QA_ENVIRONMENT === "local"/);
  assert.match(deliveryBridge, /WRA_DISABLE_PROVIDER_CALLS === "1"/);
  assert.match(deliveryBridge, /EMAIL_MOCK_MODE === "1"/);
  assert.match(deliveryBridge, /127\.0\.0\.1|localhost/);
});

test("Public Invoice page displays canonical financial state and starts invoice checkout", () => {
  assert.match(publicInvoicePage, /get_public_invoice_by_token_rpc/);
  assert.match(publicInvoiceComponent, /Pay Balance Due/);
  assert.match(publicInvoiceComponent, /documentType: "invoice"/);
  assert.match(publicInvoiceComponent, /targetType: "invoice"/);
  assert.match(publicInvoiceComponent, /checkoutKind: "balance_due"/);
  assert.match(publicInvoiceComponent, /Card details are entered in Stripe secure checkout/);
  assert.doesNotMatch(publicInvoiceComponent, /dangerouslySetInnerHTML/);
});

test("Public checkout server preserves Estimate tokens and routes Invoice tokens explicitly", () => {
  assert.match(publicCheckoutRoute, /documentType/);
  assert.match(publicCheckoutRoute, /createPublicStripeCheckoutSession/);
  assert.match(checkoutServer, /documentType\?: "estimate" \| "invoice"/);
  assert.match(checkoutServer, /reserve_public_invoice_payment_checkout_rpc/);
  assert.match(checkoutServer, /reserve_public_estimate_payment_checkout_rpc/);
  assert.match(checkoutServer, /input\.documentType === "invoice"/);
  assert.match(returnStatus, /get_public_invoice_by_token_rpc/);
  assert.match(returnStatus, /checkout_metadata/);
  assert.match(returnStatus, /public_invoice_token === true/);
  assert.match(returnStatus, /documentHref = `\/invoices\/\$\{params\.token\}`/);
});

test("Dashboard Invoice send action opens delivery modal instead of legacy status RPC", () => {
  assert.match(serviceRequestDetail, /type InvoiceDeliveryDraft/);
  assert.match(serviceRequestDetail, /openInvoiceDelivery\(invoice\)/);
  assert.match(serviceRequestDetail, /\/api\/invoices\/\$\{invoice\.id\}\/send/);
  assert.match(serviceRequestDetail, /Message Preview/);
  assert.match(serviceRequestDetail, /Recipient \{invoiceDeliveryDraft\.channel === "sms"/);
});
