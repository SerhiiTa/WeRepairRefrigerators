import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(
    __dirname,
    "../../../..",
    "supabase/migrations/0112_canonical_payment_ledger_allocation_foundation_apply_ready.sql",
  ),
  "utf8",
);
const migrationWithoutComments = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const manualPaymentMigration = readFileSync(
  resolve(
    __dirname,
    "../../../..",
    "supabase/migrations/0113_manual_payment_collection_rpc_apply_ready.sql",
  ),
  "utf8",
);
const conversionRepairMigration = readFileSync(
  resolve(
    __dirname,
    "../../../..",
    "supabase/migrations/0115_estimate_invoice_conversion_lock_repair_apply_ready.sql",
  ),
  "utf8",
);

function paymentPrincipal(payment) {
  if (!["paid", "succeeded", "imported", "partially_refunded"].includes(payment.status)) {
    return 0;
  }

  return Math.max(payment.amount - (payment.tip ?? 0), 0);
}

function allocate(payment, allocations, nextAllocation) {
  const allocated = allocations
    .filter((allocation) => allocation.paymentId === payment.id && allocation.active)
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  if (allocated + nextAllocation.amount > paymentPrincipal(payment)) {
    throw new Error("Payment allocation exceeds available payment principal.");
  }

  return [...allocations, { ...nextAllocation, active: true }];
}

function estimateSummary(estimate, allocations) {
  const depositPaid = allocations
    .filter((allocation) => allocation.active && allocation.estimateId === estimate.id)
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  return {
    depositPaid,
    remainingEstimatedAmount: Math.max(estimate.total - depositPaid, 0),
  };
}

function invoiceSummary(invoice, allocations) {
  const allocatedPaid = allocations
    .filter((allocation) => allocation.active && allocation.invoiceId === invoice.id)
    .reduce((sum, allocation) => sum + allocation.amount, 0);
  const balanceDue = Math.max(
    Math.round((invoice.total - allocatedPaid) * 100) / 100,
    0,
  );

  return {
    allocatedPaid,
    balanceDue,
    financialState:
      allocatedPaid <= 0 ? "unpaid" : balanceDue <= 0 ? "paid" : "partially_paid",
  };
}

function carryForwardEstimateDeposit({ estimateId, invoiceId, allocations }) {
  return allocations.map((allocation) => {
    if (!allocation.active || allocation.estimateId !== estimateId || allocation.invoiceId) {
      return allocation;
    }

    return {
      ...allocation,
      estimateId: null,
      invoiceId,
      carriedFromEstimateId: allocation.carriedFromEstimateId ?? estimateId,
      source: "estimate_deposit_carry_forward",
    };
  });
}

function allocateToTarget(target, allocations, nextAllocation) {
  const alreadyAllocated = allocations
    .filter((allocation) => allocation.active && allocation.targetId === target.id)
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  if (alreadyAllocated + nextAllocation.amount > target.total) {
    throw new Error("Payment amount exceeds the selected balance.");
  }

  return [...allocations, { ...nextAllocation, active: true }];
}

function canRecordPayment({ role, status = "active", sameCompany = true }) {
  if (role === "admin") {
    return true;
  }

  return (
    sameCompany &&
    status === "active" &&
    ["owner", "manager", "dispatcher", "technician"].includes(role)
  );
}

function canRecordEstimatePayment({ estimate, invoices }) {
  return (
    estimate.status === "approved" &&
    !invoices.some((invoice) => invoice.estimateId === estimate.id)
  );
}

test("migration serializes active allocation validation with payment row locks", () => {
  assert.match(
    migration,
    /from public\.service_request_payments\s+where id = new\.payment_id\s+for update;/i,
  );
  assert.match(
    migration,
    /available_amount := public\.service_request_payment_principal_amount\(new\.payment_id\);/i,
  );
  assert.match(
    migration,
    /select coalesce\(sum\(allocation\.allocation_amount\), 0\)[\s\S]*from public\.service_request_payment_allocations allocation[\s\S]*where allocation\.payment_id = new\.payment_id/i,
  );

  const lockIndex = migration.indexOf("where id = new.payment_id\n  for update;");
  const availableIndex = migration.indexOf(
    "available_amount := public.service_request_payment_principal_amount(new.payment_id);",
  );
  const allocationSumIndex = migration.indexOf(
    "select coalesce(sum(allocation.allocation_amount), 0)",
  );

  assert.ok(lockIndex >= 0, "payment row lock is present");
  assert.ok(availableIndex > lockIndex, "available principal is calculated after payment lock");
  assert.ok(allocationSumIndex > lockIndex, "active allocation sum is calculated after payment lock");
});

test("migration uses strong relational allocation targets, not polymorphic target ids", () => {
  assert.match(migration, /create table if not exists public\.service_request_payment_allocations/i);
  assert.match(migration, /estimate_id uuid[\s\S]*references public\.service_request_estimates\(id\)/i);
  assert.match(migration, /invoice_id uuid[\s\S]*references public\.service_request_invoices\(id\)/i);
  assert.match(migration, /service_request_payment_allocations_one_target_check/i);
  assert.doesNotMatch(migrationWithoutComments, /\btarget_type\b/i);
  assert.doesNotMatch(migrationWithoutComments, /\btarget_id\b/i);
});

test("manual payment migration locks payment target before target balance calculation", () => {
  const estimateLockIndex = manualPaymentMigration.indexOf(
    "where id = p_target_id\n    for update;",
  );
  const estimateAllocationIndex = manualPaymentMigration.indexOf(
    "where allocation.estimate_id = estimate_row.id",
  );
  const invoiceLockIndex = manualPaymentMigration.indexOf(
    "where id = p_target_id\n    for update;",
    estimateLockIndex + 1,
  );
  const invoiceAllocationIndex = manualPaymentMigration.indexOf(
    "where allocation.invoice_id = invoice_row.id",
  );

  assert.ok(estimateLockIndex >= 0, "Estimate target lock is present.");
  assert.ok(invoiceLockIndex >= 0, "Invoice target lock is present.");
  assert.ok(
    estimateAllocationIndex > estimateLockIndex,
    "Estimate allocations are summed after the Estimate target lock.",
  );
  assert.ok(
    invoiceAllocationIndex > invoiceLockIndex,
    "Invoice allocations are summed after the Invoice target lock.",
  );
});

test("two different manual payment requests cannot over-allocate one target", () => {
  const estimate = { id: "estimate-1", total: 100 };
  const first = allocateToTarget(estimate, [], {
    paymentId: "payment-1",
    targetId: estimate.id,
    amount: 80,
  });

  assert.throws(
    () =>
      allocateToTarget(estimate, first, {
        paymentId: "payment-2",
        targetId: estimate.id,
        amount: 30,
      }),
    /exceeds the selected balance/,
  );
});

test("manual payment idempotency replays only identical target and payment inputs", () => {
  const existing = {
    companyId: "company-1",
    serviceRequestId: "job-1",
    targetType: "estimate",
    targetId: "estimate-1",
    amount: 126.65,
    method: "cash",
  };
  const identicalRetry = { ...existing };
  const changedTarget = { ...existing, targetId: "estimate-2" };
  const changedAmount = { ...existing, amount: 100 };
  const changedMethod = { ...existing, method: "zelle" };

  function isSameIdempotentRequest(next) {
    return (
      next.companyId === existing.companyId &&
      next.serviceRequestId === existing.serviceRequestId &&
      next.targetType === existing.targetType &&
      next.targetId === existing.targetId &&
      next.amount === existing.amount &&
      next.method === existing.method
    );
  }

  assert.equal(isSameIdempotentRequest(identicalRetry), true);
  assert.equal(isSameIdempotentRequest(changedTarget), false);
  assert.equal(isSameIdempotentRequest(changedAmount), false);
  assert.equal(isSameIdempotentRequest(changedMethod), false);
});

test("manual payment authorization permits active company staff and rejects read-only or cross-company callers", () => {
  assert.equal(canRecordPayment({ role: "admin", sameCompany: false }), true);
  assert.equal(canRecordPayment({ role: "owner" }), true);
  assert.equal(canRecordPayment({ role: "manager" }), true);
  assert.equal(canRecordPayment({ role: "dispatcher" }), true);
  assert.equal(canRecordPayment({ role: "technician" }), true);
  assert.equal(canRecordPayment({ role: "viewer" }), false);
  assert.equal(canRecordPayment({ role: "technician", status: "suspended" }), false);
  assert.equal(canRecordPayment({ role: "technician", sameCompany: false }), false);
});

test("approved estimate accepts deposit only before an invoice exists", () => {
  const estimate = { id: "estimate-1", status: "approved" };

  assert.equal(canRecordEstimatePayment({ estimate, invoices: [] }), true);
  assert.equal(
    canRecordEstimatePayment({
      estimate,
      invoices: [{ id: "invoice-1", estimateId: estimate.id }],
    }),
    false,
  );
});

test("conversion repair shares estimate-first lock ordering with manual payment", () => {
  assert.match(
    conversionRepairMigration,
    /from public\.service_request_estimates\s+where id = p_estimate_id\s+for update;/i,
  );
  assert.match(
    manualPaymentMigration,
    /from public\.service_request_estimates\s+where id = p_target_id\s+for update;/i,
  );

  const estimateLockIndex = conversionRepairMigration.indexOf(
    "where id = p_estimate_id\n  for update;",
  );
  const paymentLockIndex = conversionRepairMigration.indexOf(
    "from public.service_request_payments payment",
  );
  const carryForwardIndex = conversionRepairMigration.indexOf(
    "update public.service_request_payment_allocations allocation",
  );

  assert.ok(estimateLockIndex >= 0, "Estimate conversion lock is present.");
  assert.ok(paymentLockIndex > estimateLockIndex, "Payment rows lock after Estimate row.");
  assert.ok(carryForwardIndex > paymentLockIndex, "Carry-forward runs after payment locks.");
});

test("estimate-stage deposit produces deposit paid and remaining estimated amount", () => {
  const estimate = { id: "estimate-1", total: 1000 };
  const payment = { id: "payment-1", amount: 300, status: "succeeded" };
  const allocations = allocate(payment, [], {
    paymentId: payment.id,
    estimateId: estimate.id,
    invoiceId: null,
    amount: 300,
  });

  assert.deepEqual(estimateSummary(estimate, allocations), {
    depositPaid: 300,
    remainingEstimatedAmount: 700,
  });
});

test("invoice creation carries the same deposit allocation forward without duplicating payment", () => {
  const estimate = { id: "estimate-1", total: 1000 };
  const invoice = { id: "invoice-1", total: 1000 };
  const payment = { id: "payment-1", amount: 300, status: "succeeded" };
  const beforeInvoice = allocate(payment, [], {
    paymentId: payment.id,
    estimateId: estimate.id,
    invoiceId: null,
    amount: 300,
  });

  const afterInvoice = carryForwardEstimateDeposit({
    estimateId: estimate.id,
    invoiceId: invoice.id,
    allocations: beforeInvoice,
  });

  assert.equal(afterInvoice.length, 1);
  assert.equal(new Set(afterInvoice.map((allocation) => allocation.paymentId)).size, 1);
  assert.deepEqual(invoiceSummary(invoice, afterInvoice), {
    allocatedPaid: 300,
    balanceDue: 700,
    financialState: "partially_paid",
  });
});

test("converted invoice with carried deposits reports canonical paid and balance", () => {
  const estimate = { id: "estimate-1018", total: 329.08 };
  const invoice = { id: "invoice-e2e0944d", total: 329.08 };
  const firstPayment = { id: "payment-50", amount: 50, status: "succeeded" };
  const secondPayment = { id: "payment-50-50", amount: 50.5, status: "succeeded" };
  const estimateAllocations = allocate(
    secondPayment,
    allocate(firstPayment, [], {
      paymentId: firstPayment.id,
      estimateId: estimate.id,
      invoiceId: null,
      amount: 50,
    }),
    {
      paymentId: secondPayment.id,
      estimateId: estimate.id,
      invoiceId: null,
      amount: 50.5,
    },
  );

  const invoiceAllocations = carryForwardEstimateDeposit({
    estimateId: estimate.id,
    invoiceId: invoice.id,
    allocations: estimateAllocations,
  });

  assert.deepEqual(invoiceSummary(invoice, invoiceAllocations), {
    allocatedPaid: 100.5,
    balanceDue: 228.58,
    financialState: "partially_paid",
  });
  assert.equal(
    invoiceAllocations.filter(
      (allocation) =>
        allocation.active &&
        allocation.invoiceId === invoice.id &&
        allocation.carriedFromEstimateId === estimate.id,
    ).length,
    2,
  );
});

test("two independent payments can fully satisfy one invoice", () => {
  const invoice = { id: "invoice-1", total: 1000 };
  const card = { id: "payment-card", amount: 500, status: "succeeded" };
  const zelle = { id: "payment-zelle", amount: 500, status: "succeeded" };
  const allocations = allocate(
    zelle,
    allocate(card, [], {
      paymentId: card.id,
      estimateId: null,
      invoiceId: invoice.id,
      amount: 500,
    }),
    {
      paymentId: zelle.id,
      estimateId: null,
      invoiceId: invoice.id,
      amount: 500,
    },
  );

  assert.deepEqual(invoiceSummary(invoice, allocations), {
    allocatedPaid: 1000,
    balanceDue: 0,
    financialState: "paid",
  });
});

test("tips and processor fees do not create invoice overpayment or fee balances", () => {
  const invoice = { id: "invoice-1", total: 1000 };
  const withTip = { id: "payment-tip", amount: 1100, tip: 100, status: "succeeded" };
  const withFee = { id: "payment-fee", amount: 1000, serviceFee: 29, net: 971, status: "succeeded" };

  const tipAllocations = allocate(withTip, [], {
    paymentId: withTip.id,
    estimateId: null,
    invoiceId: invoice.id,
    amount: 1000,
  });
  const feeAllocations = allocate(withFee, [], {
    paymentId: withFee.id,
    estimateId: null,
    invoiceId: invoice.id,
    amount: 1000,
  });

  assert.deepEqual(invoiceSummary(invoice, tipAllocations), {
    allocatedPaid: 1000,
    balanceDue: 0,
    financialState: "paid",
  });
  assert.deepEqual(invoiceSummary(invoice, feeAllocations), {
    allocatedPaid: 1000,
    balanceDue: 0,
    financialState: "paid",
  });
});

test("over-allocation is rejected and no-allocation invoices are unpaid", () => {
  const payment = { id: "payment-1", amount: 300, status: "succeeded" };
  const allocations = allocate(payment, [], {
    paymentId: payment.id,
    estimateId: "estimate-1",
    invoiceId: null,
    amount: 300,
  });

  assert.throws(
    () =>
      allocate(payment, allocations, {
        paymentId: payment.id,
        estimateId: null,
        invoiceId: "invoice-1",
        amount: 300,
      }),
    /exceeds available payment principal/,
  );

  assert.deepEqual(invoiceSummary({ id: "invoice-2", total: 1000 }, []), {
    allocatedPaid: 0,
    balanceDue: 1000,
    financialState: "unpaid",
  });
});

test("migration enforces cross-company checks and idempotent carry-forward", () => {
  assert.match(migration, /Payment allocation company must match the service request company/i);
  assert.match(migration, /Payment allocation company must match the payment company/i);
  assert.match(migration, /Estimate allocation target must belong to the same service request/i);
  assert.match(migration, /Invoice allocation target must belong to the same service request/i);
  assert.match(
    migration,
    /from public\.service_request_payments payment[\s\S]*order by payment\.id[\s\S]*for update;/i,
  );
  assert.match(migration, /update public\.service_request_payment_allocations allocation/i);
  assert.match(migration, /where allocation\.estimate_id = estimate_row\.id/i);

  const once = carryForwardEstimateDeposit({
    estimateId: "estimate-1",
    invoiceId: "invoice-1",
    allocations: [
      {
        paymentId: "payment-1",
        estimateId: "estimate-1",
        invoiceId: null,
        amount: 300,
        active: true,
      },
    ],
  });
  const twice = carryForwardEstimateDeposit({
    estimateId: "estimate-1",
    invoiceId: "invoice-1",
    allocations: once,
  });

  assert.deepEqual(twice, once);
});
