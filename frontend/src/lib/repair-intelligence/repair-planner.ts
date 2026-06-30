import { repairKnowledgePacks } from "@/lib/repair-intelligence/knowledge";
import type {
  ApplianceCategory,
  RepairKnowledgePattern,
  RepairMaterial,
  RepairOperation,
  RepairPart,
  RepairPlan,
  RepairPlanInput,
  RepairRisk,
  RepairWarranty,
} from "@/lib/repair-intelligence/types";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[.,;:!?()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeApplianceCategory(
  applianceType: string | null,
): ApplianceCategory {
  const appliance = normalizeText(applianceType);

  if (
    appliance.includes("refrigerator") ||
    appliance.includes("freezer") ||
    appliance.includes("ice maker") ||
    appliance.includes("wine cooler") ||
    appliance.includes("built-in") ||
    appliance.includes("built in")
  ) {
    return "refrigeration";
  }

  if (
    appliance.includes("washer") ||
    appliance.includes("dryer") ||
    appliance.includes("laundry")
  ) {
    return "laundry";
  }

  if (appliance.includes("dishwasher")) {
    return "dishwasher";
  }

  if (
    appliance.includes("oven") ||
    appliance.includes("range") ||
    appliance.includes("cooktop") ||
    appliance.includes("microwave")
  ) {
    return "cooking";
  }

  return "general";
}

function scoreKnowledgePattern(
  pattern: RepairKnowledgePattern,
  input: RepairPlanInput,
  applianceCategory: ApplianceCategory,
): number {
  const haystack = normalizeText(
    [
      input.applianceType,
      input.brand,
      input.modelNumber,
      input.customerComplaint,
      input.technicianDiagnosis,
      input.normalizedDiagnosis,
      ...(input.existingNotes ?? []),
    ].join(" "),
  );
  const intentMatches = pattern.intents.filter((intent) =>
    input.repairIntents.includes(intent),
  ).length;
  const termMatches =
    pattern.terms?.filter((term) => haystack.includes(normalizeText(term)))
      .length ?? 0;
  const categoryBoost =
    pattern.applianceCategory === applianceCategory
      ? 3
      : applianceCategory === "general"
        ? 0
        : -2;

  return intentMatches * 4 + termMatches * 2 + categoryBoost;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function mergeWarranty(
  base: RepairWarranty,
  pattern?: RepairKnowledgePattern,
): RepairWarranty {
  return {
    text:
      pattern?.warranty?.text ??
      base.text ??
      "90 days labor and installed parts unless otherwise specified.",
    days: pattern?.warranty?.days ?? base.days,
    scope: pattern?.warranty?.scope ?? base.scope,
  };
}

function buildFallbackPattern(
  input: RepairPlanInput,
  applianceCategory: ApplianceCategory,
): RepairKnowledgePattern {
  return {
    key: "general.diagnostic_repair_plan",
    applianceCategory,
    repairType: "diagnostic_repair_plan",
    intents: input.repairIntents,
    operations: [
      {
        id: "general-diagnosis",
        title: "Diagnosis and repair plan",
        description:
          "Diagnose the reported issue, identify failed components, and prepare repair scope.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
      {
        id: "general-reassembly-test",
        title: "Reassembly and function test",
        description:
          "Reassemble access panels and verify appliance operation after repair.",
        estimateLineType: "labor",
        laborHours: 0.5,
        customerVisible: true,
      },
    ],
    customerExplanation:
      "The repair plan begins with diagnosis, repair scope confirmation, and final operation testing.",
    confidence: "low",
  };
}

export function createRepairPlan(input: RepairPlanInput): RepairPlan {
  const applianceCategory = normalizeApplianceCategory(input.applianceType);
  const scoredPatterns = repairKnowledgePacks
    .map((pattern) => ({
      pattern,
      score: scoreKnowledgePattern(pattern, input, applianceCategory),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const selectedPatterns =
    scoredPatterns.length > 0
      ? scoredPatterns.slice(0, 2).map((item) => item.pattern)
      : [buildFallbackPattern(input, applianceCategory)];
  const primaryPattern = selectedPatterns[0];
  const operations = uniqueById(
    selectedPatterns.flatMap((pattern) => pattern.operations),
  );
  const parts = uniqueById(
    selectedPatterns.flatMap((pattern) => pattern.parts ?? []),
  );
  const materials = uniqueById(
    selectedPatterns.flatMap((pattern) => pattern.materials ?? []),
  );
  const riskNotes = uniqueById(
    selectedPatterns.flatMap((pattern) => pattern.riskNotes ?? []),
  );
  const laborConsiderations = Array.from(
    new Set(
      selectedPatterns.flatMap(
        (pattern) => pattern.laborConsiderations ?? [],
      ),
    ),
  );
  const warrantyRecommendation = mergeWarranty(
    {
      text: "90 days labor and installed parts unless otherwise specified.",
      days: 90,
      scope: "labor_and_installed_parts",
    },
    primaryPattern,
  );
  const problemSummary =
    input.normalizedDiagnosis ||
    input.technicianDiagnosis ||
    input.customerComplaint ||
    "Repair diagnosis pending.";
  const customerFacingExplanation =
    primaryPattern.customerExplanation ||
    "The repair plan is based on the technician's findings and includes diagnosis, repair, and final testing.";

  return {
    applianceCategory,
    brand: input.brand,
    modelNumber: input.modelNumber,
    problemSummary,
    detectedRepairType: primaryPattern.repairType,
    requiredOperations: operations as RepairOperation[],
    likelyParts: parts as RepairPart[],
    materials: materials as RepairMaterial[],
    laborConsiderations,
    riskNotes: riskNotes as RepairRisk[],
    customerFacingExplanation,
    estimateStrategy: {
      strategy: primaryPattern.estimateStrategy?.strategy ?? "detailed",
      packageTitle: primaryPattern.estimateStrategy?.packageTitle,
      customerSummary:
        primaryPattern.estimateStrategy?.customerSummary ??
        customerFacingExplanation,
      pricingWarning: primaryPattern.estimateStrategy?.pricingWarning,
    },
    warrantyRecommendation,
    confidence: primaryPattern.confidence ?? "medium",
    repairIntents: input.repairIntents,
    matchedKnowledgeKeys: selectedPatterns.map((pattern) => pattern.key),
  };
}
