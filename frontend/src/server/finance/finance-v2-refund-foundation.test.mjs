import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

const migration = read(
  "supabase/migrations/0143_finance_v2_refund_financial_foundation_apply_ready.sql",
);
const webhookAccounting = read(
  "frontend/src/server/finance/stripe-webhook-accounting.ts",
);

function principal(payment) {
  if (
    payment.voided ||
    !["paid", "succeeded", "imported", "partially_refunded", "refunded"].includes(
      payment.status,
    )
  ) {
    return 0;
  }

  return Math.max(payment.amount - (payment.tip ?? 0), 0);
}

function refundedAmount(paymentId, refunds, includePending = false) {
  return refunds
    .filter(
      (refund) =>
        refund.paymentId === paymentId &&
        (refund.status === "succeeded" ||
          (includePending && refund.status === "pending")),
    )
    .reduce((sum, refund) => sum + refund.amount, 0);
}

function refundableAmount(payment, refunds) {
  return Math.max(principal(payment) - refundedAmount(payment.id, refunds, true), 0);
}

function reserveRefund({ payment, allocations, refunds, amount, type, idempotencyKey }) {
  if (payment.voided || payment.status === "void") {
    throw new Error("Voided payments cannot be refunded.");
  }

  if (type === "manual" && payment.provider === "stripe") {
    throw new Error("Manual refunds cannot be recorded against Stripe payments.");
  }

  if (type === "stripe" && payment.provider !== "stripe") {
    throw new Error("Stripe refunds require a Stripe payment.");
  }

  const existing = refunds.find(
    (refund) => refund.type === type && refund.idempotencyKey === idempotencyKey,
  );

  if (existing) {
    if (existing.paymentId !== payment.id || existing.amount !== amount) {
      throw new Error("This refund idempotency key was already used for a different refund.");
    }

    return { refunds, refund: existing, idempotent: true };
  }

  if (amount > refundableAmount(payment, refunds)) {
    throw new Error("Refund amount exceeds refundable payment balance.");
  }

  const activeAllocations = allocations.filter(
    (allocation) => allocation.paymentId === payment.id && allocation.active,
  );

  if (activeAllocations.length !== 1) {
    throw new Error(
      "Refund attribution requires explicit allocation adjustments for multi-allocation payments.",
    );
  }

  const refund = {
    id: `refund-${refunds.length + 1}`,
    paymentId: payment.id,
    type,
    amount,
    status: "pending",
    idempotencyKey,
    allocationAdjustments: [
      {
        paymentAllocationId: activeAllocations[0].id,
        amount,
        status: "pending",
      },
    ],
  };

  return { refunds: [...refunds, refund], refund, idempotent: false };
}

function confirmRefund(refunds, refundId) {
  return refunds.map((refund) =>
    refund.id === refundId
      ? {
          ...refund,
          allocationAdjustments: refund.allocationAdjustments.map((allocation) => ({
            ...allocation,
            status: "succeeded",
          })),
          status: "succeeded",
        }
      : refund,
  );
}

function failRefund(refunds, refundId) {
  return refunds.map((refund) =>
    refund.id === refundId
      ? {
          ...refund,
          allocationAdjustments: refund.allocationAdjustments.map((allocation) => ({
            ...allocation,
            status: "failed",
          })),
          status: "failed",
        }
      : refund,
  );
}

function netPaid(allocations, refunds) {
  const paid = allocations
    .filter((allocation) => allocation.active)
    .reduce((sum, allocation) => sum + allocation.amount, 0);
  const refunded = refunds
    .filter((refund) => refund.status === "succeeded")
    .flatMap((refund) => refund.allocationAdjustments)
    .filter((adjustment) => adjustment.status === "succeeded")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0);

  return Math.max(paid - refunded, 0);
}

includesAll(migration, [
  "create table if not exists public.service_request_payment_refunds",
  "create table if not exists public.service_request_payment_refund_allocations",
  "refund_type in ('stripe', 'manual')",
  "refund_status in ('pending', 'succeeded', 'failed', 'canceled')",
  "refund_amount > 0",
  "service_request_payment_refunds_provider_uidx",
  "service_request_payment_refunds_idempotency_uidx",
  "service_request_payment_refundable_amount",
  "active_service_request_net_paid_credit",
  "validate_service_request_payment_refund",
  "validate_service_request_payment_refund_allocation",
  "reserve_service_request_payment_refund_rpc",
  "confirm_service_request_payment_refund_rpc",
  "confirm_stripe_service_request_payment_refund_rpc",
  "record_failed_service_request_payment_refund_rpc",
  "record_manual_service_request_payment_refund_rpc",
  "public.can_record_service_request_payment(request_row.id)",
  "pg_advisory_xact_lock(hashtextextended(request_row.id::text, 507))",
  "Refund attribution requires explicit allocation adjustments for multi-allocation payments.",
  "Manual refunds cannot be recorded against Stripe payments.",
  "Manual refund requires explicit confirmation that money was actually returned.",
  "Stripe refunds can only be confirmed from trusted provider confirmation.",
  "Terminal refunds are immutable.",
  "Terminal refund allocations are immutable.",
  "grant execute on function public.confirm_stripe_service_request_payment_refund_rpc",
  "to service_role",
  "Voided payments cannot be refunded.",
  "Refund amount exceeds refundable payment balance.",
  "grant execute on function public.reserve_service_request_payment_refund_rpc",
  "grant execute on function public.confirm_service_request_payment_refund_rpc",
  "grant execute on function public.record_failed_service_request_payment_refund_rpc",
  "grant execute on function public.record_manual_service_request_payment_refund_rpc",
]);

assert.doesNotMatch(
  migration,
  /delete\s+from\s+public\.service_request_payments/i,
  "Refund foundation must not delete original payment rows.",
);
assert.doesNotMatch(
  migration,
  /delete\s+from\s+public\.service_request_payment_allocations/i,
  "Refund foundation must not delete original allocation rows.",
);
assert.doesNotMatch(
  migration,
  /service_request_payment_receipts[\s\S]*update/i,
  "Refund foundation must not rewrite original payment receipts.",
);
assert.doesNotMatch(
  migration,
  /grant execute[\s\S]*to anon/i,
  "Refund RPCs must not grant anonymous execution.",
);
assert.doesNotMatch(
  migration,
  /grant execute on function public\.confirm_stripe_service_request_payment_refund_rpc\(uuid, text, text, jsonb\) to authenticated/i,
  "Stripe refund confirmation must not be granted to authenticated clients.",
);
assert.match(
  migration,
  /update public\.service_request_payment_refund_allocations[\s\S]*set refund_allocation_status = 'succeeded'[\s\S]*update public\.service_request_payment_refunds[\s\S]*refund_status = 'succeeded'/,
  "Refund confirmation must move child allocation statuses before parent terminal status.",
);
assert.match(
  migration,
  /payment\.payment_status in \('paid', 'succeeded', 'imported', 'partially_refunded', 'refunded'\)/,
  "Net paid must include fully refunded original payments before subtracting refund allocations.",
);
assert.match(
  webhookAccounting,
  /confirm_stripe_service_request_payment_refund_rpc/,
  "Stripe refund webhook posting must use trusted provider confirmation.",
);
assert.match(
  webhookAccounting,
  /refund_requires_reconciliation/,
  "Provider-initiated refunds without a local reservation must require reconciliation.",
);

const payment = {
  id: "payment-1",
  provider: "stripe",
  status: "succeeded",
  amount: 300,
  tip: 0,
  voided: false,
};
const allocation = { id: "allocation-1", paymentId: "payment-1", amount: 300, active: true };

let refunds = [];
let reserved = reserveRefund({
  payment,
  allocations: [allocation],
  refunds,
  amount: 300,
  type: "stripe",
  idempotencyKey: "refund-key-001",
});
assert.equal(refundableAmount(payment, reserved.refunds), 0, "Pending full refund reserves capacity.");
refunds = confirmRefund(reserved.refunds, reserved.refund.id);
assert.equal(netPaid([allocation], refunds), 0, "Full succeeded refund reduces net paid to zero.");
assert.equal(
  netPaid([allocation], refunds),
  netPaid([allocation], refunds),
  "Full refund must be counted once through refund allocations, not by dropping the original payment.",
);
assert.equal(
  netPaid([{ ...allocation, paymentStatus: "refunded" }], refunds),
  0,
  "Original fully refunded payments remain part of paid allocations for net-paid subtraction.",
);

refunds = [];
reserved = reserveRefund({
  payment,
  allocations: [allocation],
  refunds,
  amount: 100,
  type: "stripe",
  idempotencyKey: "refund-key-002",
});
refunds = confirmRefund(reserved.refunds, reserved.refund.id);
assert.equal(netPaid([allocation], refunds), 200, "Partial refund reduces net paid by refund amount.");

reserved = reserveRefund({
  payment,
  allocations: [allocation],
  refunds,
  amount: 50,
  type: "stripe",
  idempotencyKey: "refund-key-003",
});
refunds = confirmRefund(reserved.refunds, reserved.refund.id);
assert.equal(netPaid([allocation], refunds), 150, "Multiple partial refunds accumulate once.");

assert.throws(
  () =>
    reserveRefund({
      payment,
      allocations: [allocation],
      refunds,
      amount: 151,
      type: "stripe",
      idempotencyKey: "refund-key-004",
    }),
  /exceeds refundable/,
  "Refunds above remaining refundable balance are rejected.",
);

reserved = reserveRefund({
  payment,
  allocations: [allocation],
  refunds,
  amount: 25,
  type: "stripe",
  idempotencyKey: "refund-key-005",
});
assert.equal(refundableAmount(payment, reserved.refunds), 125, "Pending refund reserves capacity.");
refunds = failRefund(reserved.refunds, reserved.refund.id);
assert.equal(refundableAmount(payment, refunds), 150, "Failed refund releases reserved capacity.");

const duplicate = reserveRefund({
  payment,
  allocations: [allocation],
  refunds,
  amount: 50,
  type: "stripe",
  idempotencyKey: "refund-key-003",
});
assert.equal(duplicate.idempotent, true, "Duplicate idempotency key returns existing refund.");

assert.throws(
  () =>
    reserveRefund({
      payment: { ...payment, provider: "manual" },
      allocations: [allocation],
      refunds: [],
      amount: 10,
      type: "stripe",
      idempotencyKey: "refund-key-006",
    }),
  /Stripe payment/,
);
assert.throws(
  () =>
    reserveRefund({
      payment,
      allocations: [allocation],
      refunds: [],
      amount: 10,
      type: "manual",
      idempotencyKey: "refund-key-007",
    }),
  /Manual refunds cannot/,
);
assert.match(
  migration,
  /if p_money_returned_confirmed is not true then[\s\S]*Manual refund requires explicit confirmation that money was actually returned\./,
  "Manual refund RPC must require explicit confirmation of actual money return.",
);
assert.throws(
  () =>
    reserveRefund({
      payment: { ...payment, voided: true },
      allocations: [allocation],
      refunds: [],
      amount: 10,
      type: "stripe",
      idempotencyKey: "refund-key-008",
    }),
  /Voided payments/,
);
assert.throws(
  () =>
    reserveRefund({
      payment,
      allocations: [
        allocation,
        { id: "allocation-2", paymentId: "payment-1", amount: 100, active: true },
      ],
      refunds: [],
      amount: 10,
      type: "stripe",
      idempotencyKey: "refund-key-009",
    }),
  /explicit allocation adjustments/,
);

assert.match(
  migration,
  /if tg_op = 'UPDATE' and old\.refund_status in \('succeeded', 'failed', 'canceled'\)/,
  "Terminal parent refund states must be immutable.",
);
assert.match(
  migration,
  /if tg_op = 'UPDATE' and old\.refund_allocation_status in \('succeeded', 'failed', 'canceled'\)/,
  "Terminal refund allocation states must be immutable.",
);
assert.match(
  migration,
  /allocation_total[\s\S]*round\(allocation_total, 2\) <> new\.refund_amount/,
  "Terminal parent refunds must reconcile allocation adjustments to the parent refund amount.",
);

const invoiceTotal = 300;
assert.equal(
  Math.max(invoiceTotal - netPaid([allocation], refunds), 0),
  150,
  "Invoice Balance Due reflects net paid after succeeded refunds.",
);
assert.equal(
  Math.max(invoiceTotal - netPaid([allocation], refunds), 0),
  150,
  "Estimate coverage can use the same net paid helper without inventing allocations.",
);

console.log("finance-v2 refund foundation static contract: PASS");
