import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "../../../node_modules/typescript/lib/typescript.js";

const source = readFileSync("frontend/src/components/dashboard/ServiceRequestDetail.tsx", "utf8");
// Execute the actual component calculation block, not a duplicate accounting implementation.
const calculations = source.slice(source.indexOf("  const activePaymentAllocations ="), source.indexOf("  const financePaidTotal ="));
const run = new Function("paymentsState", "invoices", "estimates", ts.transpileModule(`
const moneyToCents = (value: number) => Math.round(value * 100);
const centsToMoney = (value: number) => value / 100;
const invoicesState = { invoices };
const estimatesState = { estimates };
const currentEstimateByLogicalEstimateId = new Map(estimates.map(e => [e.logicalEstimateId ?? e.id, e]));
const activeInvoicesByEstimateId = new Map();
const invoicesByEstimateId = new Map(invoices.filter(i => i.invoiceLifecycleStatus === "current" && i.invoiceStatus !== "void").map(i => [i.estimateId, i]));
${calculations}
const financeBalanceDueCents = Math.max(0, moneyToCents(financeApprovedTotal) - netPaidCreditCents);
return { grossPaidCreditCents, succeededRefundCents, netPaidCreditCents, financeBalanceDueCents,
  getPaymentNetCents, getAllocationNetCents, getInvoiceAllocatedCents, getInvoiceBalanceDue,
  getInvoiceValidAllocations, getAllocationRefundCents, getEstimatePresentedNetPaidCents,
  getEstimateInvoiceCoverageSummary };
`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
const payment = (id, amount, paymentStatus = "succeeded") => ({ id, amount, paymentStatus, voidedAt: null });
const allocation = (id, paymentId, allocationAmount, invoiceId = "invoice") => ({ id, paymentId, allocationAmount, invoiceId, allocationStatus: "active" });
const invoice = (id = "invoice", extra = {}) => ({ id, total: 100, invoiceLifecycleStatus: "current", invoiceStatus: "sent", voidedAt: null, ...extra });
const estimate = (total) => ({ id: "estimate", total, estimateStatus: "approved", revisionStatus: "current", archivedAt: null });
const state = (payments, allocations, refunds = [], refundAllocations = []) => ({ payments, allocations, refunds, refundAllocations });

test("voided, failed and canceled payments preserve original amount but have zero net", () => {
  const payments = [payment("void", 2, "void"), payment("failed", 2, "failed"), payment("canceled", 2, "canceled"), { ...payment("voided", 2), voidedAt: "2026-01-01" }];
  const allocations = payments.map(p => allocation(p.id, p.id, 2));
  const result = run(state(payments, allocations), [], []);
  for (const p of payments) { assert.equal(result.getPaymentNetCents(p), 0); assert.equal(p.amount, 2); }
  for (const a of allocations) assert.equal(result.getAllocationNetCents(a), 0);
});

test("split allocation refunds subtract only the succeeded amount attributed to that allocation", () => {
  const p = payment("p", 100, "partially_refunded");
  const a = allocation("a", "p", 60, "a-invoice");
  const b = allocation("b", "p", 40, "b-invoice");
  const refunds = [{ id: "r", paymentId: "p", amount: 30, status: "succeeded" }, { id: "pending", paymentId: "p", amount: 10, status: "pending" }];
  const refundAllocations = [{ refundId: "r", paymentId: "p", paymentAllocationId: "a", amount: 30, status: "succeeded" }, { refundId: "pending", paymentId: "p", paymentAllocationId: "b", amount: 10, status: "pending" }];
  const result = run(state([p], [a, b], refunds, refundAllocations), [], []);
  assert.equal(result.getAllocationNetCents(a), 3000);
  assert.equal(result.getAllocationNetCents(b), 4000);
  assert.equal(result.getPaymentNetCents(p), 7000);
  assert.equal(result.getInvoiceAllocatedCents(invoice()), 7000);
  assert.equal(result.getInvoiceBalanceDue(invoice()), 30);
  assert.equal(result.getInvoiceAllocatedCents(invoice("a-invoice", { invoiceLifecycleStatus: "superseded" })), 3000);
  assert.equal(result.getInvoiceAllocatedCents(invoice("b-invoice", { invoiceLifecycleStatus: "superseded" })), 4000);
  assert.equal(result.getInvoiceBalanceDue(invoice("a-invoice", { invoiceLifecycleStatus: "superseded" })), 0);
});

test("Job #990003 valid gross/net are $1, void cash stays $2 original/$0 net; estimate scope is Job $1/$2", () => {
  const p = payment("stripe", 1);
  const cash = { ...payment("cash", 2, "void"), voidedAt: "2026-01-01" };
  const historical = invoice("invoice", { total: 3, invoiceLifecycleStatus: "void", invoiceStatus: "void", estimateId: "estimate" });
  const result = run(state([p, cash], [allocation("a", "stripe", 1), { ...allocation("b", "cash", 2), allocationStatus: "void" }]), [historical], [estimate(3)]);
  assert.equal(result.grossPaidCreditCents, 100);
  assert.equal(result.netPaidCreditCents, 100);
  assert.equal(result.financeBalanceDueCents, 200);
  assert.equal(result.getPaymentNetCents(cash), 0);
  assert.equal(result.getInvoiceAllocatedCents(historical), 100);
  assert.equal(result.getInvoiceBalanceDue(historical), 0);
  assert.equal(result.getEstimatePresentedNetPaidCents(estimate(3)), 100);
  assert.equal(result.getEstimateInvoiceCoverageSummary(estimate(3)), null);
  assert.match(source, /getEstimatePresentedNetPaidCents\(estimate\),/);
  assert.match(source, /getEstimatePresentedNetPaidCents\(manualEstimate\),/);
});

test("Job #1034 actual presentation includes refunded originals and subtracts successful refunds once", () => {
  const amounts = [1000, 1193.96, 12.99, 1293.01, 1060.54];
  const payments = amounts.map((amount, i) => payment(String(i), amount, i === 3 ? "succeeded" : "refunded"));
  const allocations = payments.map(p => allocation(p.id, p.id, p.amount));
  const refunds = payments.filter(p => p.id !== "3").map(p => ({ id: `r${p.id}`, paymentId: p.id, amount: p.amount, status: "succeeded" }));
  const refundAllocations = refunds.map(r => ({ refundId: r.id, paymentId: r.paymentId, paymentAllocationId: r.paymentId, amount: r.amount, status: "succeeded" }));
  for (const status of ["pending", "failed", "canceled"]) {
    refunds.push({ id: status, paymentId: "3", amount: 500, status });
    refundAllocations.push({ refundId: status, paymentId: "3", paymentAllocationId: "3", amount: 500, status });
  }
  const result = run(state(payments, allocations, refunds, refundAllocations), [], [estimate(4507.25)]);
  assert.equal(result.grossPaidCreditCents, 456050);
  assert.equal(result.succeededRefundCents, 326749);
  assert.equal(result.netPaidCreditCents, 129301);
  assert.equal(result.financeBalanceDueCents, 321424);
  assert.equal(result.getInvoiceAllocatedCents(invoice()), 129301);
  assert.equal(result.getInvoiceBalanceDue(invoice("invoice", { total: 4507.25 })), 3214.24);
});

test("linked Estimate shows direct gross/net separately from consolidated coverage", () => {
  const e = estimate(100);
  const i = invoice("invoice", { estimateId: e.id });
  const p = payment("p", 60, "partially_refunded");
  const a = { ...allocation("a", "p", 60), invoiceId: null, estimateId: e.id };
  const result = run(state([p], [a], [{ id: "r", paymentId: "p", amount: 20, status: "succeeded" }], [{ refundId: "r", paymentId: "p", paymentAllocationId: "a", amount: 20, status: "succeeded" }]), [i], [e]);
  assert.deepEqual(result.getEstimateInvoiceCoverageSummary(e), { status: "partially_paid", invoiceNumber: undefined, directPaid: 40, directOriginalPaid: 60, currentBalanceDue: 60 });
});
