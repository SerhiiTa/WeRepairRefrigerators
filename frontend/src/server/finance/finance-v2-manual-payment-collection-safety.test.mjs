import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration = read(
  "supabase/migrations/0135_finance_v2_manual_payment_collectible_safety_apply_ready.sql",
);
const serviceRequestDetail = read(
  "frontend/src/components/dashboard/ServiceRequestDetail.tsx",
);

test("manual payment RPC uses Finance V2 job-level collectible balance", () => {
  assert.match(
    migration,
    /create or replace function public\.record_manual_service_request_payment_rpc/,
  );
  assert.match(migration, /perform pg_advisory_xact_lock\(hashtextextended\(request_row\.id::text, 301\)\)/);
  assert.match(migration, /scope := public\.get_service_request_effective_approved_scope_rpc\(request_row\.id\)/);
  assert.match(migration, /paid_credit := public\.active_service_request_paid_credit\(request_row\.id\)/);
  assert.match(migration, /reserved_amount := public\.active_service_request_checkout_reserved_amount\(request_row\.id\)/);
  assert.match(migration, /remaining_amount := greatest\(approved_total - paid_credit - reserved_amount, 0\)/);
  assert.match(migration, /payment_amount_cents := round\(p_amount \* 100\)::bigint/);
  assert.match(migration, /remaining_cents := round\(remaining_amount \* 100\)::bigint/);
  assert.match(migration, /if payment_amount_cents > remaining_cents then/);
  assert.match(migration, /This Job is already paid in full\./);
  assert.match(migration, /Payment amount exceeds the remaining Job balance\./);
  assert.doesNotMatch(
    migration,
    /remaining_amount := greatest\(target_total - already_allocated, 0\)/,
    "Manual payment collection must not cap against document-level allocations.",
  );
});

test("manual Estimate deposits are blocked when included in current Job Invoice membership", () => {
  assert.match(migration, /estimate_has_current_invoice boolean := false/);
  assert.match(migration, /from public\.service_request_invoice_estimates membership/);
  assert.match(migration, /membership\.estimate_id = estimate_row\.id/);
  assert.match(migration, /membership\.membership_status = 'active'/);
  assert.match(
    migration,
    /This Estimate is already included in the current Job Invoice\. Record payment against the Invoice instead\./,
  );
});

test("manual collection UI uses current Job balance and combined Invoice provenance", () => {
  assert.match(serviceRequestDetail, /const estimateIdByItemId = new Map<string, string>\(\)/);
  assert.match(serviceRequestDetail, /activeInvoicesByEstimateId\.set\(estimateId, invoice\)/);
  assert.match(serviceRequestDetail, /const financeBalanceDueCents = Math\.max\(/);
  assert.match(serviceRequestDetail, /const remainingCents = Math\.min\(totalCents, financeBalanceDueCents\)/);
  assert.match(serviceRequestDetail, /paid: centsToMoney\(validPaidCreditCents\)/);
  assert.match(serviceRequestDetail, /remaining: centsToMoney\(financeBalanceDueCents\)/);
  assert.match(serviceRequestDetail, /const financeOverpaymentTotal = Math\.max\(/);
  assert.match(serviceRequestDetail, /label: "Overpayment"/);
  assert.doesNotMatch(
    serviceRequestDetail,
    /const paidCents = estimateAllocatedCents\.get\(estimate\.id\) \?\? 0;[\s\S]{0,220}remaining: centsToMoney\(Math\.max\(0, totalCents - paidCents\)\)/,
    "Manual Estimate collection targets must not imply unpaid Job balance from estimate-only allocations.",
  );
});

test("current Invoice payment history shows valid Job-level credited payments", () => {
  assert.match(
    serviceRequestDetail,
    /invoice\.invoiceLifecycleStatus === "current"[\s\S]*validPaidPaymentIds\.has\(entry\.payment\.id\)/,
  );
  assert.match(serviceRequestDetail, /Credited from \{entry\.invoiceTarget\.invoiceNumber\}/);
});
