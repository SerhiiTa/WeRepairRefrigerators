import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const publicRoute = read(
  "frontend/src/app/api/public/payments/stripe-checkout/route.ts",
);
const dashboardRoute = read("frontend/src/app/api/payments/stripe-checkout/route.ts");
const checkoutServer = read("frontend/src/server/finance/stripe-checkout.ts");
const publicApproval = read("frontend/src/components/public/PublicEstimateApproval.tsx");
const publicPage = read("frontend/src/app/estimates/[token]/page.tsx");
const publicInvoicePage = read("frontend/src/app/invoices/[token]/page.tsx");
const publicInvoicePayment = read("frontend/src/components/public/PublicInvoicePayment.tsx");
const migration = read(
  "supabase/migrations/0123_public_customer_stripe_checkout_apply_ready.sql",
);

test("public checkout route is token-authorized and never accepts client amount", () => {
  assert.match(publicRoute, /TOKEN_PATTERN = \/\^\[0-9a-f\]\{64\}\$/);
  assert.match(publicRoute, /getSupabaseServerClient\(\)/);
  assert.match(publicRoute, /createPublicStripeCheckoutSession\(supabase/);
  assert.match(publicRoute, /isRateLimited\(request, token\)/);
  assert.match(publicRoute, /getTrustedCheckoutReturnOrigin\(request\)/);
  assert.doesNotMatch(publicRoute, /requireHomeFixPrivateAccess/);
  assert.doesNotMatch(publicRoute, /payload\.amount|amountCents|unit_amount/);
  assert.doesNotMatch(publicRoute, /origin: new URL\(request\.url\)\.origin/);

  assert.match(dashboardRoute, /requireHomeFixPrivateAccess\(request\)/);
});

test("public checkout preserves iPhone local QA return origin instead of localhost", () => {
  assert.match(publicRoute, /process\.env\.WRA_QA_ENVIRONMENT === "local"/);
  assert.match(publicRoute, /request\.headers\.get\("origin"\)/);
  assert.match(publicRoute, /isPrivateIpv4\(url\.hostname\)/);
  assert.match(publicRoute, /return "http:\/\/localhost:3000"/);
  assert.match(
    publicRoute,
    /const candidates = \[[\s\S]*request\.headers\.get\("origin"\)[\s\S]*new URL\(request\.url\)\.origin[\s\S]*\]/,
    "Origin header should be evaluated before the server request URL fallback.",
  );
  assert.match(
    publicRoute,
    /origin: getTrustedCheckoutReturnOrigin\(request\)/,
    "Stripe success and cancel URLs should receive the trusted customer-facing origin.",
  );
});

test("public checkout server calls token-aware reservation RPC only", () => {
  assert.match(checkoutServer, /createPublicStripeCheckoutSession/);
  assert.match(checkoutServer, /PUBLIC_TOKEN_PATTERN/);
  assert.match(checkoutServer, /buildPublicRequestFingerprint/);
  assert.match(checkoutServer, /resolveDashboardTargetContext/);
  assert.match(checkoutServer, /resolvePublicTargetContext/);
  assert.match(checkoutServer, /assertPilotCustomerAllowed/);
  assert.match(checkoutServer, /production_sandbox_pilot/);
  assert.match(checkoutServer, /service_requests"[\s\S]*customer_id/);
  assert.match(checkoutServer, /customers"[\s\S]*id,company_id/);
  assert.match(checkoutServer, /context\.customerCompanyId !== context\.companyId/);
  assert.match(checkoutServer, /service_request_estimate_revisions/);
  assert.match(checkoutServer, /service_request_invoice_delivery_tokens/);
  assert.match(checkoutServer, /reserve_public_estimate_payment_checkout_rpc/);
  assert.match(checkoutServer, /returnToken: input\.token/);
  assert.match(checkoutServer, /returnQuery\.set\("token", params\.returnToken\)/);
  assert.doesNotMatch(
    checkoutServer,
    /createPublicStripeCheckoutSession[\s\S]*p_amount:/,
    "Public checkout must not submit a client-computed amount.",
  );
});

test("public Estimate page loads payment options and renders secure checkout buttons", () => {
  assert.match(publicPage, /get_public_estimate_payment_options_rpc/);
  assert.match(publicPage, /isPublicStripeCheckoutEnabledForToken/);
  assert.match(publicPage, /stripePaymentsEnabled={stripePaymentsEnabled}/);
  assert.match(publicApproval, /type PublicPaymentOptions/);
  assert.match(publicApproval, /showPaymentActions/);
  assert.match(publicApproval, /stripePaymentsEnabled/);
  assert.match(publicApproval, /\/api\/public\/payments\/stripe-checkout/);
  assert.match(publicApproval, /action\.label/);
  assert.match(migration, /'Pay Deposit'/);
  assert.match(migration, /'Pay in Full'/);
  assert.match(migration, /'Pay Balance Due'/);
  assert.match(publicApproval, /Card details are entered in Stripe secure checkout/);
  assert.doesNotMatch(publicApproval, /dangerouslySetInnerHTML/);
});

test("public Invoice payment buttons are hidden unless Stripe pilot gate allows token", () => {
  assert.match(publicInvoicePage, /isPublicStripeCheckoutEnabledForToken/);
  assert.match(publicInvoicePage, /documentType: "invoice"/);
  assert.match(publicInvoicePage, /stripePaymentsEnabled={stripePaymentsEnabled}/);
  assert.match(publicInvoicePayment, /stripePaymentsEnabled/);
  assert.match(publicInvoicePayment, /paymentIsAvailable =[\s\S]*stripePaymentsEnabled/);
});

test("0123 migration exposes only token-aware public payment RPCs", () => {
  assert.match(migration, /get_public_estimate_payment_options_rpc/);
  assert.match(migration, /reserve_public_estimate_payment_checkout_rpc/);
  assert.match(migration, /public\.estimate_approval_token_hash\(p_token\)/);
  assert.match(migration, /revision_row\.customer_decision <> 'approved'/);
  assert.match(migration, /estimate_row\.estimate_status <> 'approved'/);
  assert.match(migration, /invoice\.invoice_status <> 'void'/);
  assert.match(migration, /for update;/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(estimate_row\.service_request_id::text, 301\)\)/);
  assert.match(migration, /public\.active_payment_checkout_reserved_amount\('estimate', estimate_row\.id\)/);
  assert.match(migration, /public\.active_payment_checkout_reserved_amount\('invoice', invoice_row\.id\)/);
  assert.match(migration, /existing_attempt\.request_fingerprint is distinct from clean_fingerprint/);
  assert.match(migration, /grant execute[\s\S]*to anon, authenticated/);
  assert.doesNotMatch(migration, /insert into public\.service_request_payments/i);
  assert.doesNotMatch(migration, /insert into public\.service_request_payment_allocations/i);
});
