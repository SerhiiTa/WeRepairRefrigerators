import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration0144 = read(
  "supabase/migrations/0144_finance_v2_refund_net_paid_balance_apply_ready.sql",
);
const serviceRequestDetail = read(
  "frontend/src/components/dashboard/ServiceRequestDetail.tsx",
);
const stripeAlignment = read(
  "supabase/migrations/0138_finance_v2_stripe_estimate_job_balance_alignment_apply_ready.sql",
);
const manualPaymentSafety = read(
  "supabase/migrations/0135_finance_v2_manual_payment_collectible_safety_apply_ready.sql",
);
const invoiceSync = read(
  "supabase/migrations/0139_finance_v2_job_invoice_sync_unique_repair_apply_ready.sql",
);

function netPaid({ paid, refunds }) {
  return Math.max(
    0,
    paid -
      refunds
        .filter((refund) => refund.status === "succeeded")
        .reduce((total, refund) => total + refund.amount, 0),
  );
}

function reconcileJobFinance({ approved, payments, refunds }) {
  const toCents = (amount) => Math.round(amount * 100);
  const toMoney = (cents) => cents / 100;
  const grossPaid = payments
    .filter(
      (payment) =>
        payment.voidedAt === null &&
        ["paid", "succeeded", "imported", "partially_refunded", "refunded"].includes(
          payment.status,
        ),
    )
    .reduce((total, payment) => total + toCents(payment.amount), 0);
  const succeededRefunds = refunds
    .filter((refund) => refund.status === "succeeded")
    .reduce((total, refund) => total + toCents(refund.amount), 0);
  const net = Math.max(0, grossPaid - succeededRefunds);

  return {
    grossPaid: toMoney(grossPaid),
    succeededRefunds: toMoney(succeededRefunds),
    net: toMoney(net),
    balanceDue: toMoney(Math.max(0, toCents(approved) - net)),
  };
}

test("0144 preserves existing paid-credit entry point while delegating to refund-adjusted net paid", () => {
  assert.match(migration0144, /create or replace function public\.active_service_request_paid_credit/);
  assert.match(migration0144, /public\.active_service_request_net_paid_credit\(p_service_request_id\)/);
  assert.doesNotMatch(migration0144, /insert into public\.service_request_payments/i);
  assert.doesNotMatch(migration0144, /update public\.service_request_payments/i);
  assert.doesNotMatch(migration0144, /delete from public\.service_request_payments/i);
  assert.doesNotMatch(migration0144, /service_request_estimates[\s\S]*(update|insert|delete)/i);
  assert.doesNotMatch(migration0144, /service_request_invoices[\s\S]*(update|insert|delete)/i);
});

test("Existing checkout, manual payment, and invoice sync callers remain on the canonical paid-credit path", () => {
  assert.match(stripeAlignment, /public\.active_service_request_paid_credit\(estimate_row\.service_request_id\)/);
  assert.match(stripeAlignment, /public\.active_service_request_paid_credit\(invoice_row\.service_request_id\)/);
  assert.match(stripeAlignment, /public\.active_service_request_paid_credit\(attempt_row\.service_request_id\)/);
  assert.match(manualPaymentSafety, /public\.active_service_request_paid_credit\(request_row\.id\)/);
  assert.match(invoiceSync, /public\.active_service_request_paid_credit\(request_row\.id\)/);
});

test("Net paid math subtracts only succeeded refunds and never pending or failed refunds", () => {
  assert.equal(netPaid({ paid: 1000, refunds: [] }), 1000);
  assert.equal(
    netPaid({
      paid: 1000,
      refunds: [{ amount: 1000, status: "succeeded" }],
    }),
    0,
  );
  assert.equal(
    netPaid({
      paid: 1000,
      refunds: [
        { amount: 100, status: "succeeded" },
        { amount: 250, status: "succeeded" },
      ],
    }),
    650,
  );
  assert.equal(
    netPaid({
      paid: 1000,
      refunds: [
        { amount: 400, status: "pending" },
        { amount: 300, status: "failed" },
        { amount: 200, status: "canceled" },
      ],
    }),
    1000,
  );
});

test("Dashboard finance presentation reads refund history and uses net paid for current totals", () => {
  assert.match(serviceRequestDetail, /service_request_payment_refunds/);
  assert.match(
    serviceRequestDetail,
    /select\("id,payment_id,refund_amount,refund_type,refund_status,refund_reason,provider_refund_id,created_at,updated_at"\)/,
  );
  assert.doesNotMatch(serviceRequestDetail, /confirmed_at/);
  assert.match(serviceRequestDetail, /provider_refund_id/);
  assert.match(serviceRequestDetail, /providerRefundId/);
  assert.match(serviceRequestDetail, /refund_status/);
  assert.match(serviceRequestDetail, /succeededRefunds/);
  assert.match(serviceRequestDetail, /netPaidCreditCents/);
  assert.match(serviceRequestDetail, /grossPaidCreditCents - succeededRefundCents/);
  assert.match(
    serviceRequestDetail,
    /\["paid", "succeeded", "imported", "partially_refunded", "refunded"\]/,
  );
  assert.match(serviceRequestDetail, /Refund History/);
  assert.match(serviceRequestDetail, /Original Paid/);
  assert.match(serviceRequestDetail, /Net Paid/);
  assert.match(serviceRequestDetail, /invoiceRefunds/);
});

test("Job #1034 refund reconciliation keeps refunded originals in gross and subtracts refunds once", () => {
  const result = reconcileJobFinance({
    approved: 4507.25,
    payments: [
      { amount: 1000, status: "refunded", voidedAt: null },
      { amount: 1193.96, status: "refunded", voidedAt: null },
      { amount: 12.99, status: "refunded", voidedAt: null },
      { amount: 1293.01, status: "succeeded", voidedAt: null },
      { amount: 1060.54, status: "refunded", voidedAt: null },
    ],
    refunds: [
      { amount: 1000, status: "succeeded" },
      { amount: 1193.96, status: "succeeded" },
      { amount: 12.99, status: "succeeded" },
      { amount: 1060.54, status: "succeeded" },
      { amount: 500, status: "pending" },
      { amount: 500, status: "failed" },
      { amount: 500, status: "canceled" },
    ],
  });

  assert.equal(result.grossPaid, 4560.5);
  assert.equal(result.succeededRefunds, 3267.49);
  assert.equal(result.net, 1293.01);
  assert.equal(result.balanceDue, 3214.24);
});

test("Payment History exposes a guarded refund modal for eligible confirmed payments", () => {
  assert.match(serviceRequestDetail, /function renderPaymentHistoryItem/);
  assert.match(serviceRequestDetail, /canRefundPayment\(entry\.payment\)/);
  assert.match(serviceRequestDetail, /Refund Payment/);
  assert.match(serviceRequestDetail, /Full Refund/);
  assert.match(serviceRequestDetail, /Partial Refund/);
  assert.match(serviceRequestDetail, /Maximum refundable/);
  assert.match(serviceRequestDetail, /Refund reason/);
  assert.match(serviceRequestDetail, /paymentRefundState\.status !== "success"/);
});

test("Refund UI distinguishes Stripe requests from manually confirmed money returned", () => {
  assert.match(serviceRequestDetail, /\/api\/service-requests\/\$\{payment\.serviceRequestId\}\/payments\/\$\{payment\.id\}\/refund/);
  assert.match(serviceRequestDetail, /Request Stripe Refund/);
  assert.match(serviceRequestDetail, /Refund requested\. Awaiting Stripe confirmation\./);
  assert.match(serviceRequestDetail, /record_manual_service_request_payment_refund_rpc/);
  assert.match(serviceRequestDetail, /p_money_returned_confirmed: true/);
  assert.match(serviceRequestDetail, /I confirm the money has already been returned to the customer\./);
  assert.match(serviceRequestDetail, /Record Refund/);
});

test("Refund modal captures input event values before draft state updaters", () => {
  assert.match(serviceRequestDetail, /const nextAmount = event\.currentTarget\.value;\s*setPaymentRefundDraft\(\(current\) =>\s*current \? \{ \.\.\.current, amount: nextAmount \} : current,/);
  assert.match(serviceRequestDetail, /const nextReason = event\.currentTarget\.value;\s*setPaymentRefundDraft\(\(current\) =>\s*current \? \{ \.\.\.current, reason: nextReason \} : current,/);
  assert.match(serviceRequestDetail, /const nextMoneyReturnedConfirmed = event\.currentTarget\.checked;\s*setPaymentRefundDraft\(\(current\) =>/);
  assert.doesNotMatch(
    serviceRequestDetail,
    /setPaymentRefundDraft\(\(current\) =>[\s\S]{0,220}event\.currentTarget\.(?:value|checked)/,
  );
});
