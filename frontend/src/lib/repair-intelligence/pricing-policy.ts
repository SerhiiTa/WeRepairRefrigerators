import type {
  EstimateDraftAgentLine,
  EstimateDraftLineType,
} from "@/lib/estimate-draft-agent";
import type {
  RepairMaterial,
  RepairOperation,
  RepairPart,
  RepairPlan,
  RepairPlanEstimate,
  RepairPricingPolicy,
} from "@/lib/repair-intelligence/types";

export const defaultRepairPricingPolicy: RepairPricingPolicy = {
  defaultWarranty: {
    text: "90 days labor and installed parts unless otherwise specified.",
    days: 90,
    scope: "labor_and_installed_parts",
  },
  highEndBuiltInPremium: 150,
  taxRate: 0.0825,
  linePrices: {
    "sealed-system-diagnosis": { unitPrice: 225, unitCost: 90, taxable: false },
    "compressor-replacement": { unitPrice: 1350, unitCost: 520, taxable: false },
    "vacuum-pressure-test": { unitPrice: 325, unitCost: 140, taxable: false },
    compressor: { unitPrice: 950, unitCost: 420, taxable: true },
    "filter-drier": { unitPrice: 145, unitCost: 35, taxable: true },
    "refrigerant-service-materials": {
      unitPrice: 285,
      unitCost: 110,
      taxable: true,
    },
    "evaporator-access-diagnosis": {
      unitPrice: 225,
      unitCost: 90,
      taxable: false,
    },
    "manual-evaporator-defrost": {
      unitPrice: 185,
      unitCost: 65,
      taxable: false,
    },
    "airflow-cooling-test": { unitPrice: 95, unitCost: 35, taxable: false },
    "evaporator-fan-motor": { unitPrice: 289, unitCost: 95, taxable: true },
    "defrost-heater": { unitPrice: 245, unitCost: 85, taxable: true },
    "machine-compartment-service": {
      unitPrice: 225,
      unitCost: 85,
      taxable: false,
    },
    "condenser-fan-motor": { unitPrice: 265, unitCost: 90, taxable: true },
    "start-relay": { unitPrice: 185, unitCost: 55, taxable: true },
    "dispenser-water-diagnosis": {
      unitPrice: 165,
      unitCost: 55,
      taxable: false,
    },
    "water-inlet-valve": { unitPrice: 225, unitCost: 75, taxable: true },
    "frozen-dispenser-line-thaw": {
      unitPrice: 145,
      unitCost: 50,
      taxable: false,
    },
    "ice-maker-control-diagnosis": {
      unitPrice: 165,
      unitCost: 65,
      taxable: false,
    },
    "ice-maker": { unitPrice: 315, unitCost: 125, taxable: true },
    "control-board": { unitPrice: 425, unitCost: 190, taxable: true },
    "washer-front-panel-disassembly": {
      unitPrice: 245,
      unitCost: 95,
      taxable: false,
    },
    "washer-leak-spin-test": { unitPrice: 95, unitCost: 35, taxable: false },
    "washer-door-boot": { unitPrice: 329, unitCost: 135, taxable: true },
    "washer-drain-path-inspection": {
      unitPrice: 165,
      unitCost: 65,
      taxable: false,
    },
    "washer-drain-pump": { unitPrice: 245, unitCost: 95, taxable: true },
    "dryer-heating-diagnosis": {
      unitPrice: 165,
      unitCost: 65,
      taxable: false,
    },
    "dryer-heating-element": { unitPrice: 245, unitCost: 85, taxable: true },
    "dishwasher-drain-path-inspection": {
      unitPrice: 185,
      unitCost: 70,
      taxable: false,
    },
    "dishwasher-leak-cycle-test": {
      unitPrice: 95,
      unitCost: 35,
      taxable: false,
    },
    "dishwasher-drain-pump": { unitPrice: 245, unitCost: 90, taxable: true },
    "dishwasher-electrical-water-test": {
      unitPrice: 165,
      unitCost: 65,
      taxable: false,
    },
    "dishwasher-inlet-valve": { unitPrice: 225, unitCost: 75, taxable: true },
    "dishwasher-heater": { unitPrice: 245, unitCost: 85, taxable: true },
    "dishwasher-control-board": { unitPrice: 395, unitCost: 175, taxable: true },
    "double-oven-remove-reinstall": {
      unitPrice: 325,
      unitCost: 135,
      taxable: false,
    },
    "oven-circuit-temperature-test": {
      unitPrice: 165,
      unitCost: 65,
      taxable: false,
    },
    "oven-bake-element": { unitPrice: 245, unitCost: 80, taxable: true },
    "cooking-heat-control-diagnosis": {
      unitPrice: 165,
      unitCost: 65,
      taxable: false,
    },
    igniter: { unitPrice: 245, unitCost: 80, taxable: true },
    "convection-fan": { unitPrice: 295, unitCost: 120, taxable: true },
    "general-diagnosis": { unitPrice: 165, unitCost: 65, taxable: false },
    "general-reassembly-test": { unitPrice: 95, unitCost: 35, taxable: false },
  },
};

function priceFor(
  id: string,
  policy: RepairPricingPolicy,
  fallback: {
    unitPrice: number;
    unitCost: number;
    taxable: boolean;
  },
) {
  return policy.linePrices[id] ?? fallback;
}

function operationToLine(
  operation: RepairOperation,
  policy: RepairPricingPolicy,
): EstimateDraftAgentLine {
  const price = priceFor(operation.id, policy, {
    unitPrice: Math.max(95, Math.round((operation.laborHours ?? 1) * 165)),
    unitCost: Math.max(35, Math.round((operation.laborHours ?? 1) * 65)),
    taxable: operation.estimateLineType === "part",
  });

  return {
    lineType: operation.estimateLineType,
    customerName: operation.title,
    internalName: operation.title,
    quantity: 1,
    unitPrice: price.unitPrice,
    unitCost: price.unitCost,
    publicDescription: operation.description,
    taxable: price.taxable,
    notes: operation.description,
  };
}

function partToLine(
  part: RepairPart,
  policy: RepairPricingPolicy,
): EstimateDraftAgentLine {
  const price = priceFor(part.id, policy, {
    unitPrice: 225,
    unitCost: 85,
    taxable: true,
  });

  return {
    lineType: "part",
    customerName: part.customerName,
    internalName: part.internalName,
    quantity: part.quantity,
    unitPrice: price.unitPrice,
    unitCost: price.unitCost,
    publicDescription: part.reason,
    taxable: price.taxable,
    notes: part.reason,
  };
}

function materialToLine(
  material: RepairMaterial,
  policy: RepairPricingPolicy,
): EstimateDraftAgentLine {
  const price = priceFor(material.id, policy, {
    unitPrice: 125,
    unitCost: 45,
    taxable: false,
  });

  return {
    lineType: "material",
    customerName: material.customerName,
    internalName: material.internalName,
    quantity: material.quantity,
    unitPrice: price.unitPrice,
    unitCost: price.unitCost,
    publicDescription: material.reason,
    taxable: price.taxable,
    notes: material.reason,
  };
}

function packageLineTypeForPlan(plan: RepairPlan): EstimateDraftLineType {
  return plan.estimateStrategy.strategy === "package" ? "custom" : "labor";
}

export function createEstimateFromRepairPlan(
  plan: RepairPlan,
  policy = defaultRepairPricingPolicy,
): RepairPlanEstimate {
  const warnings: string[] = [];

  if (plan.estimateStrategy.strategy === "package") {
    const internalLines = [
      ...plan.requiredOperations.map((operation) =>
        operationToLine(operation, policy),
      ),
      ...plan.likelyParts.map((part) => partToLine(part, policy)),
      ...plan.materials.map((material) => materialToLine(material, policy)),
    ];
    const packageTotal = internalLines.reduce(
      (total, line) => total + line.unitPrice * (line.quantity ?? 1),
      0,
    );
    const packageCost = internalLines.reduce(
      (total, line) => total + line.unitCost * (line.quantity ?? 1),
      0,
    );

    warnings.push(
      "Package estimate uses an internal operation/part breakdown for future profitability analysis.",
    );

    return {
      lines: [
        {
          lineType: packageLineTypeForPlan(plan),
          customerName:
            plan.estimateStrategy.packageTitle ??
            `${plan.brand ?? ""} ${plan.detectedRepairType}`
              .trim()
              .replaceAll("_", " "),
          internalName: `Package: ${plan.detectedRepairType}`,
          quantity: 1,
          unitPrice: packageTotal,
          unitCost: packageCost,
          publicDescription: plan.estimateStrategy.customerSummary,
          taxable: false,
          notes: internalLines
            .map((line) => `${line.customerName}: $${line.unitPrice}`)
            .join("; "),
        },
      ],
      pricingWarnings: warnings,
    };
  }

  return {
    lines: [
      ...plan.requiredOperations
        .filter((operation) => operation.customerVisible)
        .map((operation) => operationToLine(operation, policy)),
      ...plan.likelyParts
        .filter((part) => part.required)
        .map((part) => partToLine(part, policy)),
      ...plan.materials
        .filter((material) => material.required)
        .map((material) => materialToLine(material, policy)),
    ],
    pricingWarnings: warnings,
  };
}
