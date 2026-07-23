export type RepairProposalDiscountType = "flat" | "percent";

export type RepairProposalCalculationLineInput = {
  lineType: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number | null;
  taxable?: boolean | null;
};

export type RepairProposalCalculationInput = {
  lines: RepairProposalCalculationLineInput[];
  discountType?: RepairProposalDiscountType | null;
  discountValue?: number | null;
  taxRate?: number | null;
};

export type RepairProposalCalculatedLine = RepairProposalCalculationLineInput & {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  internalCostTotal: number;
  taxable: boolean;
};

export type RepairProposalCalculationResult = {
  lines: RepairProposalCalculatedLine[];
  laborTotal: number;
  partsTotal: number;
  materialsTotal: number;
  feesTotal: number;
  subtotal: number;
  discountType: RepairProposalDiscountType;
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  taxableAmount: number;
  nonTaxableAmount: number;
  tax: number;
  total: number;
  internalCostTotal: number;
  grossProfit: number;
  marginPercent: number;
};

const MAX_QUANTITY = 99;
const MAX_UNIT_AMOUNT = 50000;
const MAX_TAX_RATE = 20;
const MAX_PERCENT_DISCOUNT = 100;

export function cents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100);
}

function fromCents(value: number): number {
  return Math.round(value) / 100;
}

function normalizeMoney(value: number | null | undefined): number {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }

  return fromCents(Math.max(0, Math.min(cents(Number(value)), cents(MAX_UNIT_AMOUNT))));
}

function normalizeQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(MAX_QUANTITY, Math.round(value * 100) / 100));
}

function normalizeTaxRate(value: number | null | undefined): number {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_TAX_RATE, Math.round(Number(value) * 10000) / 10000));
}

function normalizeDiscountType(
  value: RepairProposalDiscountType | null | undefined,
): RepairProposalDiscountType {
  return value === "percent" ? "percent" : "flat";
}

function normalizeDiscountValue(
  discountType: RepairProposalDiscountType,
  value: number | null | undefined,
): number {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }

  const normalized = Math.max(0, Number(value));

  if (discountType === "percent") {
    return Math.min(MAX_PERCENT_DISCOUNT, Math.round(normalized * 10000) / 10000);
  }

  return fromCents(Math.min(cents(normalized), cents(MAX_UNIT_AMOUNT)));
}

export function calculateRepairProposalTotals(
  input: RepairProposalCalculationInput,
): RepairProposalCalculationResult {
  const lines = input.lines.map((line): RepairProposalCalculatedLine => {
    const quantity = normalizeQuantity(line.quantity);
    const unitPrice = normalizeMoney(line.unitPrice);
    const unitCost = normalizeMoney(line.unitCost ?? 0);
    const lineTotal = fromCents(Math.round(quantity * cents(unitPrice)));
    const internalCostTotal = fromCents(Math.round(quantity * cents(unitCost)));

    return {
      ...line,
      quantity,
      unitPrice,
      unitCost,
      lineTotal,
      internalCostTotal,
      taxable: line.taxable ?? true,
    };
  });

  const subtotalCents = lines.reduce((total, line) => total + cents(line.lineTotal), 0);
  const taxableBeforeDiscountCents = lines.reduce(
    (total, line) => total + (line.taxable ? cents(line.lineTotal) : 0),
    0,
  );
  const internalCostCents = lines.reduce(
    (total, line) => total + cents(line.internalCostTotal),
    0,
  );

  const discountType = normalizeDiscountType(input.discountType);
  const discountValue = normalizeDiscountValue(discountType, input.discountValue);
  const discountCents =
    discountType === "percent"
      ? Math.min(
          subtotalCents,
          Math.round(subtotalCents * (discountValue / 100)),
        )
      : Math.min(subtotalCents, cents(discountValue));

  const taxableDiscountShareCents =
    subtotalCents > 0
      ? Math.round(discountCents * (taxableBeforeDiscountCents / subtotalCents))
      : 0;
  const taxableAmountCents = Math.max(
    0,
    taxableBeforeDiscountCents - taxableDiscountShareCents,
  );
  const nonTaxableAmountCents = Math.max(
    0,
    subtotalCents - discountCents - taxableAmountCents,
  );
  const taxRate = normalizeTaxRate(input.taxRate);
  const taxCents = Math.round(taxableAmountCents * (taxRate / 100));
  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents);
  const grossProfitCents = totalCents - internalCostCents;

  const total = fromCents(totalCents);
  const grossProfit = fromCents(grossProfitCents);

  return {
    lines,
    laborTotal: sumByLineTypes(lines, ["labor"]),
    partsTotal: sumByLineTypes(lines, ["part"]),
    materialsTotal: sumByLineTypes(lines, ["material"]),
    feesTotal: sumByLineTypes(lines, ["custom", "warranty"]),
    subtotal: fromCents(subtotalCents),
    discountType,
    discountValue,
    discountAmount: fromCents(discountCents),
    taxRate,
    taxableAmount: fromCents(taxableAmountCents),
    nonTaxableAmount: fromCents(nonTaxableAmountCents),
    tax: fromCents(taxCents),
    total,
    internalCostTotal: fromCents(internalCostCents),
    grossProfit,
    marginPercent:
      totalCents > 0 ? Math.round((grossProfitCents / totalCents) * 10000) / 100 : 0,
  };
}

function sumByLineTypes(
  lines: RepairProposalCalculatedLine[],
  lineTypes: string[],
): number {
  return fromCents(
    lines.reduce(
      (total, line) =>
        total + (lineTypes.includes(line.lineType) ? cents(line.lineTotal) : 0),
      0,
    ),
  );
}
