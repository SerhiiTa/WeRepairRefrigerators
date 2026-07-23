import assert from "node:assert/strict";
import test from "node:test";

import { calculateRepairProposalTotals } from "./repair-proposal-calculations.ts";

test("subtotal only", () => {
  const result = calculateRepairProposalTotals({
    lines: [{ lineType: "labor", quantity: 1, unitPrice: 100, taxable: false }],
  });

  assert.equal(result.subtotal, 100);
  assert.equal(result.total, 100);
  assert.equal(result.tax, 0);
});

test("quantity greater than one", () => {
  const result = calculateRepairProposalTotals({
    lines: [{ lineType: "part", quantity: 2, unitPrice: 49.5, taxable: false }],
  });

  assert.equal(result.subtotal, 99);
  assert.equal(result.partsTotal, 99);
});

test("taxable and non-taxable lines", () => {
  const result = calculateRepairProposalTotals({
    lines: [
      { lineType: "part", quantity: 1, unitPrice: 100, taxable: true },
      { lineType: "labor", quantity: 1, unitPrice: 50, taxable: false },
    ],
    taxRate: 8.25,
  });

  assert.equal(result.taxableAmount, 100);
  assert.equal(result.nonTaxableAmount, 50);
  assert.equal(result.tax, 8.25);
  assert.equal(result.total, 158.25);
});

test("flat discount before tax", () => {
  const result = calculateRepairProposalTotals({
    lines: [
      { lineType: "part", quantity: 1, unitPrice: 100, taxable: true },
      { lineType: "labor", quantity: 1, unitPrice: 100, taxable: false },
    ],
    discountType: "flat",
    discountValue: 20,
    taxRate: 10,
  });

  assert.equal(result.discountAmount, 20);
  assert.equal(result.taxableAmount, 90);
  assert.equal(result.tax, 9);
  assert.equal(result.total, 189);
});

test("percentage discount before tax", () => {
  const result = calculateRepairProposalTotals({
    lines: [
      { lineType: "part", quantity: 1, unitPrice: 120, taxable: true },
      { lineType: "labor", quantity: 1, unitPrice: 80, taxable: false },
    ],
    discountType: "percent",
    discountValue: 10,
    taxRate: 8.25,
  });

  assert.equal(result.discountAmount, 20);
  assert.equal(result.taxableAmount, 108);
  assert.equal(result.tax, 8.91);
  assert.equal(result.total, 188.91);
});

test("rounding edge case", () => {
  const result = calculateRepairProposalTotals({
    lines: [{ lineType: "part", quantity: 3, unitPrice: 33.335, taxable: true }],
    taxRate: 8.25,
  });

  assert.equal(result.subtotal, 100.02);
  assert.equal(result.tax, 8.25);
  assert.equal(result.total, 108.27);
});

test("zero tax", () => {
  const result = calculateRepairProposalTotals({
    lines: [{ lineType: "part", quantity: 1, unitPrice: 100, taxable: true }],
    taxRate: 0,
  });

  assert.equal(result.tax, 0);
  assert.equal(result.total, 100);
});

test("internal cost, gross profit, and margin percent", () => {
  const result = calculateRepairProposalTotals({
    lines: [
      { lineType: "part", quantity: 1, unitPrice: 300, unitCost: 100, taxable: false },
      { lineType: "labor", quantity: 1, unitPrice: 200, unitCost: 50, taxable: false },
    ],
  });

  assert.equal(result.internalCostTotal, 150);
  assert.equal(result.grossProfit, 350);
  assert.equal(result.marginPercent, 70);
});

test("invalid negative values normalize safely", () => {
  const result = calculateRepairProposalTotals({
    lines: [
      { lineType: "part", quantity: -5, unitPrice: -10, unitCost: -20, taxable: true },
    ],
    discountValue: -50,
    taxRate: -8.25,
  });

  assert.equal(result.lines[0].quantity, 1);
  assert.equal(result.lines[0].unitPrice, 0);
  assert.equal(result.lines[0].unitCost, 0);
  assert.equal(result.discountAmount, 0);
  assert.equal(result.tax, 0);
  assert.equal(result.total, 0);
});

test("discount greater than subtotal is capped", () => {
  const result = calculateRepairProposalTotals({
    lines: [{ lineType: "labor", quantity: 1, unitPrice: 50, taxable: true }],
    discountType: "flat",
    discountValue: 500,
    taxRate: 10,
  });

  assert.equal(result.discountAmount, 50);
  assert.equal(result.taxableAmount, 0);
  assert.equal(result.total, 0);
});

test("legacy estimate payload defaults to no discount or tax", () => {
  const result = calculateRepairProposalTotals({
    lines: [{ lineType: "custom", quantity: 1, unitPrice: 75 }],
  });

  assert.equal(result.discountType, "flat");
  assert.equal(result.discountValue, 0);
  assert.equal(result.taxRate, 0);
  assert.equal(result.total, 75);
});

test("public and invoice totals use the same calculation snapshot", () => {
  const result = calculateRepairProposalTotals({
    lines: [
      { lineType: "part", quantity: 1, unitPrice: 285, unitCost: 95, taxable: true },
      { lineType: "material", quantity: 1, unitPrice: 145, unitCost: 25, taxable: false },
      { lineType: "labor", quantity: 1, unitPrice: 165, unitCost: 80, taxable: false },
    ],
    taxRate: 8.25,
  });

  assert.equal(result.subtotal, 595);
  assert.equal(result.taxableAmount, 285);
  assert.equal(result.tax, 23.51);
  assert.equal(result.total, 618.51);
  assert.equal(result.internalCostTotal, 200);
  assert.equal(result.grossProfit, 418.51);
  assert.equal(result.marginPercent, 67.66);
});
