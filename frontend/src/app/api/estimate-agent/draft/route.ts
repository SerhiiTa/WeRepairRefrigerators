import { NextResponse } from "next/server";

import {
  generateEstimateDraft,
  type DiagnosisLanguage,
  type EstimateDraftAgentLine,
  type EstimateDraftAgentResult,
  type EstimateDraftLineType,
  type RepairIntent,
} from "@/lib/estimate-draft-agent";
import {
  createEstimateFromRepairPlan,
  createRepairPlan,
  type RepairPlan,
} from "@/lib/repair-intelligence";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateAgentDraftPayload = {
  jobId?: unknown;
  applianceType?: unknown;
  brand?: unknown;
  modelNumber?: unknown;
  customerComplaint?: unknown;
  technicianDiagnosis?: unknown;
  existingNotes?: unknown;
  language?: unknown;
};

type OpenAiEstimateLine = {
  line_type: EstimateDraftLineType;
  customer_name: string;
  internal_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  taxable: boolean;
  notes: string | null;
};

type OpenAiEstimateDraft = {
  detected_language: DiagnosisLanguage;
  normalized_english_diagnosis: string;
  repair_intents: RepairIntent[];
  likely_repair_scope: {
    scope_key: string;
    service_category: string;
    repair_group: string;
    repair_item: string;
    customer_summary: string;
  };
  customer_facing_summary: string;
  estimate_lines: OpenAiEstimateLine[];
  warranty_text: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

type ExplicitEstimateScope = {
  evaporatorFanReplacement: boolean;
  defrostHeaterReplacement: boolean;
  manualEvaporatorDefrost: boolean;
  waterValveReplacement: boolean;
  frozenDispenserWaterLine: boolean;
  sealedSystemCompressor: boolean;
};

const ESTIMATE_AGENT_TIMEOUT_MS = 30_000;
const DEFAULT_ESTIMATE_AGENT_MODEL = "gpt-4o-mini";

const allowedLanguages: DiagnosisLanguage[] = [
  "english",
  "russian",
  "ukrainian",
  "spanish",
  "mixed",
  "unknown",
];

const allowedLineTypes: EstimateDraftLineType[] = [
  "labor",
  "part",
  "material",
  "custom",
  "warranty",
];

const genericLineNamePatterns = [
  "diagnostic and repair labor",
  "repair materials or replacement component",
  "repair labor",
  "replacement component",
  "customer",
];

const allowedRepairIntents: RepairIntent[] = [
  "cooling_failure",
  "evaporator_fan_failure",
  "condenser_fan_failure",
  "evaporator_iced_over",
  "manual_defrost_required",
  "defrost_heater_replacement",
  "drain_restriction",
  "drain_pump_failure",
  "door_boot_leak",
  "heating_element_failure",
  "control_board_failure",
  "start_relay_failure",
  "ice_maker_failure",
  "water_inlet_valve_replacement",
  "frozen_dispenser_water_line",
  "sealed_system_failure_suspected",
  "compressor_replacement_suspected",
  "advanced_cooling_system_diagnosis",
];

function getEstimateAgentModelConfig() {
  return {
    cheapModel:
      process.env.ESTIMATE_AGENT_MODEL?.trim() ||
      DEFAULT_ESTIMATE_AGENT_MODEL,
    advancedModel:
      process.env.ESTIMATE_AGENT_ADVANCED_MODEL?.trim() ||
      process.env.ESTIMATE_AGENT_MODEL?.trim() ||
      DEFAULT_ESTIMATE_AGENT_MODEL,
  };
}

function logEstimateAgentDev(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[estimate-agent]", event, {
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    selectedModel: getEstimateAgentModelConfig().cheapModel,
    ...details,
  });
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

class OpenAiEstimateAgentError extends Error {
  code: string;
  elapsedMs: number;
  openAiStatus: number | null;
  timeoutMs: number;

  constructor(
    message: string,
    options: {
      code: string;
      elapsedMs: number;
      openAiStatus?: number | null;
      timeoutMs?: number;
    },
  ) {
    super(message);
    this.name = "OpenAiEstimateAgentError";
    this.code = options.code;
    this.elapsedMs = options.elapsedMs;
    this.openAiStatus = options.openAiStatus ?? null;
    this.timeoutMs = options.timeoutMs ?? ESTIMATE_AGENT_TIMEOUT_MS;
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
}

function cleanText(value: unknown, maxLength = 1200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNotes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((note) => cleanText(note, 700))
    .filter(Boolean)
    .slice(0, 5);
}

function cleanMoney(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(50_000, Math.round(numberValue * 100) / 100));
}

function cleanQuantity(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 1;
  }

  return Math.max(1, Math.min(99, Math.round(numberValue * 100) / 100));
}

function isGenericLineName(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return genericLineNamePatterns.some((pattern) => normalized === pattern);
}

function normalizeDiagnosisForScope(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[.,;:!?()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyTerm(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function extractExplicitEstimateScope(
  diagnosis: string,
): ExplicitEstimateScope {
  const normalized = normalizeDiagnosisForScope(diagnosis);
  const hasEvaporator = hasAnyTerm(normalized, [
    "evaporator",
    "эвапорейтор",
    "евопорейтор",
    "испаритель",
    "эвик",
  ]);
  const hasFan = hasAnyTerm(normalized, [
    "fan",
    "фэн",
    "фен",
    "вентилятор",
  ]);
  const hasHeater = hasAnyTerm(normalized, [
    "heater",
    "heating",
    "heating element",
    "defrost heater",
    "хитинг",
    "нагрев",
    "нагреватель",
    "тэн",
    "тен",
    "хитер",
  ]);
  const hasIceOrDefrost = hasAnyTerm(normalized, [
    "ice",
    "iced",
    "frost",
    "defrost",
    "размороз",
    "разморозка",
    "лед",
    "льд",
    "льдом",
    "забит льдом",
  ]);
  const hasManualDefrost = hasIceOrDefrost && hasAnyTerm(normalized, [
    "manual",
    "manually",
    "вручную",
    "руками",
    "разморозка",
    "разморозить",
  ]);
  const hasWaterValve = hasAnyTerm(normalized, [
    "water valve",
    "water inlet valve",
    "dispenser valve",
    "вотер валв",
    "водяной клапан",
    "клапан воды",
    "клапан подачи воды",
    "центральный вотер валв",
  ]);
  const hasDispenser = hasAnyTerm(normalized, [
    "dispenser",
    "диспенсер",
    "подачи воды",
    "water dispenser",
  ]);
  const hasWaterLine = hasAnyTerm(normalized, [
    "water line",
    "линия воды",
    "трубочка",
    "трубка",
    "подачи воды",
  ]);
  const hasFrozenLine = hasWaterLine && hasAnyTerm(normalized, [
    "frozen",
    "freeze",
    "thaw",
    "размороз",
    "разморозить",
    "замерз",
    "замерзла",
    "замерзшая",
  ]);
  const hasCompressor = hasAnyTerm(normalized, [
    "compressor",
    "компрессор",
    "linear compressor",
    "линейный компрессор",
  ]);
  const hasNoCooling = hasAnyTerm(normalized, [
    "not cooling",
    "no cooling",
    "no cool",
    "не кулит",
    "не холодит",
    "не производит холод",
    "нет холода",
  ]);

  return {
    evaporatorFanReplacement: hasEvaporator && hasFan,
    defrostHeaterReplacement:
      hasHeater && (hasEvaporator || hasIceOrDefrost),
    manualEvaporatorDefrost:
      hasManualDefrost || (hasEvaporator && hasIceOrDefrost),
    waterValveReplacement: hasWaterValve && hasDispenser,
    frozenDispenserWaterLine: hasFrozenLine && hasDispenser,
    sealedSystemCompressor: hasCompressor && hasNoCooling,
  };
}

function lineSearchText(line: OpenAiEstimateLine): string {
  return normalizeDiagnosisForScope(
    [
      line.customer_name,
      line.internal_name,
      line.description ?? "",
      line.notes ?? "",
    ].join(" "),
  );
}

function draftHasLine(
  draft: OpenAiEstimateDraft,
  terms: string[],
  requiredTerms?: string[],
): boolean {
  return draft.estimate_lines.some((line) => {
    const text = lineSearchText(line);

    return (
      hasAnyTerm(text, terms) &&
      (!requiredTerms || hasAnyTerm(text, requiredTerms))
    );
  });
}

function addRepairIntent(
  intents: RepairIntent[],
  intent: RepairIntent,
): RepairIntent[] {
  return intents.includes(intent) ? intents : [...intents, intent];
}

function appendLineIfMissing(
  lines: OpenAiEstimateLine[],
  line: OpenAiEstimateLine,
): OpenAiEstimateLine[] {
  const title = normalizeDiagnosisForScope(line.customer_name);

  if (
    lines.some(
      (existingLine) =>
        normalizeDiagnosisForScope(existingLine.customer_name) === title,
    )
  ) {
    return lines;
  }

  return [...lines, line];
}

function ensureExplicitScopeLines(
  draft: OpenAiEstimateDraft,
  explicitScope: ExplicitEstimateScope,
): OpenAiEstimateDraft {
  let lines = draft.estimate_lines;
  let repairIntents = draft.repair_intents;
  const warnings = [...draft.warnings];

  if (
    explicitScope.evaporatorFanReplacement &&
    !draftHasLine(draft, ["evaporator", "эвапорейтор", "испаритель"], [
      "fan",
      "фэн",
      "фен",
      "вентилятор",
    ])
  ) {
    lines = appendLineIfMissing(lines, {
      line_type: "part",
      customer_name: "Evaporator Fan Motor Replacement",
      internal_name: "Evaporator fan motor assembly",
      description:
        "Replace the evaporator fan motor assembly required for cold air circulation.",
      quantity: 1,
      unit_price: 289,
      unit_cost: 95,
      taxable: true,
      notes:
        "Added by explicit-scope validation because the technician requested evaporator fan replacement.",
    });
    repairIntents = addRepairIntent(repairIntents, "evaporator_fan_failure");
  }

  if (
    explicitScope.defrostHeaterReplacement &&
    !draftHasLine(draft, ["heater", "heating", "нагрев", "тэн", "тен"], [
      "defrost",
      "evaporator",
      "размороз",
      "испаритель",
    ])
  ) {
    lines = appendLineIfMissing(lines, {
      line_type: "part",
      customer_name: "Defrost Heater Replacement",
      internal_name: "Evaporator defrost heater / heating element",
      description:
        "Replace the evaporator defrost heater for the automatic defrost system.",
      quantity: 1,
      unit_price: 245,
      unit_cost: 85,
      taxable: true,
      notes:
        "Added by explicit-scope validation because the technician requested heater/heating replacement in evaporator defrost context.",
    });
    repairIntents = addRepairIntent(
      addRepairIntent(repairIntents, "defrost_heater_replacement"),
      "heating_element_failure",
    );
  }

  if (
    explicitScope.manualEvaporatorDefrost &&
    !draftHasLine(draft, ["manual", "defrost", "ice", "размороз", "лед"], [
      "evaporator",
      "испаритель",
      "ice",
      "лед",
    ])
  ) {
    lines = appendLineIfMissing(lines, {
      line_type: "material",
      customer_name: "Manual Evaporator Defrost Service",
      internal_name: "Manual evaporator defrost / ice removal",
      description:
        "Manually defrost the evaporator and clear ice buildup before final cooling tests.",
      quantity: 1,
      unit_price: 185,
      unit_cost: 65,
      taxable: false,
      notes:
        "Added by explicit-scope validation because the technician described manual evaporator defrost or ice removal.",
    });
    repairIntents = addRepairIntent(
      addRepairIntent(repairIntents, "manual_defrost_required"),
      "evaporator_iced_over",
    );
  }

  if (
    explicitScope.waterValveReplacement &&
    !draftHasLine(draft, ["water", "valve", "клапан", "вотер валв"], [
      "valve",
      "клапан",
      "вотер валв",
    ])
  ) {
    lines = appendLineIfMissing(lines, {
      line_type: "part",
      customer_name: "Dispenser Water Valve Replacement",
      internal_name: "Water inlet valve / dispenser water valve",
      description:
        "Replace the water valve serving the refrigerator dispenser water supply.",
      quantity: 1,
      unit_price: 225,
      unit_cost: 75,
      taxable: true,
      notes:
        "Added by explicit-scope validation because the technician requested water valve replacement.",
    });
    repairIntents = addRepairIntent(
      repairIntents,
      "water_inlet_valve_replacement",
    );
  }

  if (
    explicitScope.frozenDispenserWaterLine &&
    !draftHasLine(draft, ["water", "line", "tube", "труб"], [
      "thaw",
      "defrost",
      "размороз",
      "frozen",
      "замерз",
    ])
  ) {
    lines = appendLineIfMissing(lines, {
      line_type: "material",
      customer_name: "Frozen Dispenser Water Line Thawing",
      internal_name: "Dispenser door water tube thaw service",
      description:
        "Thaw the frozen dispenser water line in the door and verify water flow.",
      quantity: 1,
      unit_price: 145,
      unit_cost: 50,
      taxable: false,
      notes:
        "Added by explicit-scope validation because the technician described thawing the dispenser water tube.",
    });
    repairIntents = addRepairIntent(
      repairIntents,
      "frozen_dispenser_water_line",
    );
  }

  if (
    explicitScope.sealedSystemCompressor &&
    !draftHasLine(draft, ["sealed", "compressor", "компрессор"], [
      "system",
      "compressor",
      "компрессор",
    ])
  ) {
    lines = appendLineIfMissing(lines, {
      line_type: "labor",
      customer_name: "Advanced Sealed-System Diagnosis",
      internal_name: "Sealed system / compressor performance diagnosis",
      description:
        "Perform advanced cooling-system checks for suspected compressor or sealed-system failure.",
      quantity: 1,
      unit_price: 225,
      unit_cost: 90,
      taxable: false,
      notes:
        "Added by explicit-scope validation because the diagnosis describes a compressor running with no cooling.",
    });
    repairIntents = addRepairIntent(
      addRepairIntent(repairIntents, "sealed_system_failure_suspected"),
      "advanced_cooling_system_diagnosis",
    );
  }

  const needsRepairLabor =
    explicitScope.evaporatorFanReplacement ||
    explicitScope.defrostHeaterReplacement ||
    explicitScope.manualEvaporatorDefrost ||
    explicitScope.waterValveReplacement ||
    explicitScope.frozenDispenserWaterLine ||
    explicitScope.sealedSystemCompressor;
  const hasLaborOrTesting = lines.some((line) => {
    const text = lineSearchText(line);

    return (
      line.line_type === "labor" ||
      hasAnyTerm(text, ["labor", "diagnostic", "testing", "reassembly"])
    );
  });

  if (needsRepairLabor && !hasLaborOrTesting) {
    lines = appendLineIfMissing(lines, {
      line_type: "labor",
      customer_name: "Diagnostic, Reassembly, and Testing Labor",
      internal_name: "Repair labor with final cooling test",
      description:
        "Access the failed components, complete reassembly, and verify cooling performance after repair.",
      quantity: 1,
      unit_price: 225,
      unit_cost: 90,
      taxable: false,
      notes:
        "Added by explicit-scope validation so named parts are not estimated without labor/testing scope.",
    });
  }

  if (lines.length !== draft.estimate_lines.length) {
    warnings.push(
      "Explicit technician scope was preserved with server-side estimate line validation.",
    );
  }

  return {
    ...draft,
    repair_intents: repairIntents,
    estimate_lines: lines,
    warnings: warnings.slice(0, 6),
  };
}

function createFallbackDraft(
  input: {
    applianceType: string | null;
    brand: string | null;
    modelNumber: string | null;
    customerComplaint: string | null;
    technicianDiagnosis: string;
    existingNotes: string[];
  },
  sourceReason?: string,
): EstimateDraftAgentResult {
  const draft = generateEstimateDraft({
    applianceType: input.applianceType,
    brand: input.brand,
    modelNumber: input.modelNumber,
    customerProblem: input.customerComplaint,
    technicianDiagnosis: input.technicianDiagnosis,
    technicianNotes: input.existingNotes,
    normalizerMode: "local",
  });

  return sourceReason ? { ...draft, sourceReason } : draft;
}

function createRepairPlanFromDraft(
  input: {
    applianceType: string | null;
    brand: string | null;
    modelNumber: string | null;
    customerComplaint: string | null;
    technicianDiagnosis: string;
    existingNotes: string[];
  },
  draft: Pick<EstimateDraftAgentResult, "diagnosisNormalization">,
): RepairPlan {
  return createRepairPlan({
    applianceType: input.applianceType,
    brand: input.brand,
    modelNumber: input.modelNumber,
    customerComplaint: input.customerComplaint,
    technicianDiagnosis: input.technicianDiagnosis,
    normalizedDiagnosis:
      draft.diagnosisNormalization.normalizedEnglishDiagnosis,
    repairIntents: draft.diagnosisNormalization.repairIntents,
    existingNotes: input.existingNotes,
  });
}

function applyRepairPlanToDraft(
  draft: EstimateDraftAgentResult,
  repairPlan: RepairPlan,
): {
  draft: EstimateDraftAgentResult;
  pricingWarnings: string[];
} {
  const planEstimate = createEstimateFromRepairPlan(repairPlan);

  return {
    draft: {
      ...draft,
      title: repairPlan.detectedRepairType.replaceAll("_", " "),
      customerDescription: repairPlan.customerFacingExplanation,
      repairScope: {
        scopeKey: repairPlan.detectedRepairType,
        serviceCategory: repairPlan.applianceCategory,
        repairGroup: repairPlan.detectedRepairType,
        repairItem: repairPlan.detectedRepairType.replaceAll("_", " "),
        customerSummary: repairPlan.estimateStrategy.customerSummary,
      },
      diagnosisNormalization: {
        ...draft.diagnosisNormalization,
        repairIntents: repairPlan.repairIntents,
        confidence: repairPlan.confidence,
      },
      lines: planEstimate.lines.length > 0 ? planEstimate.lines : draft.lines,
      warrantyText: repairPlan.warrantyRecommendation.text,
      internalNotes: [
        draft.internalNotes,
        `Repair plan: ${repairPlan.detectedRepairType}. Knowledge: ${repairPlan.matchedKnowledgeKeys.join(", ") || "general"}.`,
        repairPlan.laborConsiderations.length > 0
          ? `Labor considerations: ${repairPlan.laborConsiderations.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      confidence: repairPlan.confidence,
      sourceReason:
        "Estimate generated from Repair Intelligence Engine repair plan.",
    },
    pricingWarnings: planEstimate.pricingWarnings,
  };
}

function buildEstimateAgentSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      detected_language: { type: "string", enum: allowedLanguages },
      normalized_english_diagnosis: { type: "string" },
      repair_intents: {
        type: "array",
        items: { type: "string", enum: allowedRepairIntents },
      },
      likely_repair_scope: {
        type: "object",
        additionalProperties: false,
        properties: {
          scope_key: { type: "string" },
          service_category: { type: "string" },
          repair_group: { type: "string" },
          repair_item: { type: "string" },
          customer_summary: { type: "string" },
        },
        required: [
          "scope_key",
          "service_category",
          "repair_group",
          "repair_item",
          "customer_summary",
        ],
      },
      customer_facing_summary: { type: "string" },
      estimate_lines: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            line_type: { type: "string", enum: allowedLineTypes },
            customer_name: {
              type: "string",
              description:
                "Customer-facing estimate line item title, for example Replace freezer evaporator fan motor. This is not the customer's personal name.",
            },
            internal_name: {
              type: "string",
              description:
                "Internal technician-facing part/service name, including part family or part number when useful.",
            },
            description: {
              type: ["string", "null"],
              description:
                "Short customer-facing explanation of what this line covers.",
            },
            quantity: { type: "number" },
            unit_price: { type: "number" },
            unit_cost: { type: "number" },
            taxable: { type: "boolean" },
            notes: { type: ["string", "null"] },
          },
          required: [
            "line_type",
            "customer_name",
            "internal_name",
            "description",
            "quantity",
            "unit_price",
            "unit_cost",
            "taxable",
            "notes",
          ],
        },
      },
      warranty_text: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "detected_language",
      "normalized_english_diagnosis",
      "repair_intents",
      "likely_repair_scope",
      "customer_facing_summary",
      "estimate_lines",
      "warranty_text",
      "confidence",
      "warnings",
    ],
  };
}

function buildEstimateAgentPrompt(input: {
  jobId: string | null;
  applianceType: string | null;
  brand: string | null;
  modelNumber: string | null;
  customerComplaint: string | null;
  technicianDiagnosis: string;
  existingNotes: string[];
  languageHint: string | null;
}) {
  return {
    role: "user",
    content: JSON.stringify({
      task: "Create a professional appliance-repair estimate draft for a field technician to review and send to a customer.",
      role_guidance:
        "Act like an experienced appliance repair estimator. Infer repair scope from natural technician shorthand in English, Russian, Ukrainian, Spanish, or mixed language. In Slavic/Russian technician slang, words like фен/фэн can refer to a fan or fan motor in appliance repair context.",
      safety_rules: [
        "Return strict JSON only.",
        "Use customer-friendly line names and keep part numbers/internal names in internal_name.",
        "Return customer-facing line item titles in English by default, even when the technician diagnosis is Russian, Ukrainian, Spanish, or mixed language.",
        "In estimate_lines, customer_name means the customer-facing line item title. It must never be a person name or the word Customer.",
        "Never use generic line names like Diagnostic and repair labor or Repair materials or replacement component when the diagnosis describes a real repair.",
        "Separate labor, parts, service operations, and other charges into separate lines.",
        "Use line_type labor for technician labor, part for replacement parts, material for service operations such as manual defrost/testing/cleanup, and custom for other charges.",
        "Labor, service, and other lines are normally non-taxable. Part lines are normally taxable.",
        "Generate practical customer-facing line names and descriptions. Keep wording professional and sales-friendly.",
        "Do not claim the repair is guaranteed. Use suspected/likely language when diagnosis is uncertain.",
        "Avoid unsafe DIY instructions or technical step-by-step procedures.",
        "Do not include payment, SMS, customer approval, inventory, or vendor actions.",
        "Use warranty_text for warranty/disclaimer text, not a priced estimate line.",
        "Technician explicit requested work has priority over generic inference. If the technician says replace/change X, create a specific estimate line for X unless it is clearly unsafe or impossible.",
        "Do not merge explicitly named replacement parts into vague labor. Named replacement parts must remain separate line items from labor and testing.",
        "Understand Russian and technician slang: хитинг/heating/heater means heater or defrost heater when evaporator/ice/defrost context exists; эвапорейтор means evaporator; эвик can mean evaporator; фен/фэн means fan; не кулит means not cooling; забит льдом means iced over.",
        "Understand dispenser slang: вотер валв means water valve; центральный вотер валв means main/central water inlet valve; трубочка подачи воды в двери means dispenser water tube in the door.",
        "If the diagnosis says замена хитинга with evaporator, ice, or defrost context, include a Defrost Heater Replacement / Evaporator Defrost Heating Element line.",
        "If the diagnosis says refrigerator dispenser is not working and replace water valve, include a water inlet valve / dispenser water valve replacement line.",
        "If the diagnosis says to defrost/thaw the water supply tube in the door, include a frozen dispenser water line thawing service line.",
        "For LG refrigerator linear compressor running but no cooling, strongly consider sealed system/compressor failure instead of generic labor.",
        "For evaporator fan replacement plus iced evaporator/manual defrost, include repair-specific lines such as replacing the evaporator fan motor, manually defrosting/removing ice buildup, and testing airflow/cooling after repair.",
        "Include every separate repair action the technician names. If the diagnosis says change evaporator fan, manually defrost evaporator, and change the water valve, the estimate_lines must include evaporator fan replacement, manual evaporator defrost/ice removal, and water inlet valve replacement.",
        "For water valve wording in refrigerator/ice-maker context, infer water inlet valve replacement unless the context clearly says otherwise.",
        "Do not create a parts-only estimate when a replacement part is named. Include appropriate diagnostic/repair labor and final testing/reassembly scope when useful.",
        "If an evaporator fan is replaced, include labor for access/replacement/testing plus the evaporator fan motor assembly as separate lines when pricing can reasonably be separated.",
        "If evaporator ice buildup or manual defrost is named, include a manual evaporator defrost / ice removal service line.",
        "If compressor, linear compressor, sealed system, or no-cooling with compressor running is named, use sealed-system diagnosis and compressor/sealed-system repair scope. Do not add vague or cheap generic material lines unless refrigerant/recovery/service materials are actually relevant to the sealed-system scope.",
        "Do not add unrelated parts that the technician did not name and the symptom does not support. For example, a linear compressor running with no cooling should not automatically add evaporator fan or defrost heater lines unless fan, heater, ice, or defrost symptoms are also present.",
      ],
      bad_output_examples: [
        "Diagnostic and repair labor",
        "Repair materials or replacement component",
      ],
      good_output_examples: [
        "Replace freezer evaporator fan motor",
        "Replace evaporator defrost heater",
        "Replace refrigerator dispenser water valve",
        "Thaw frozen dispenser water line",
        "Manually defrost evaporator and remove ice buildup",
        "Test airflow and cooling performance after repair",
      ],
      allowed_repair_intents: allowedRepairIntents,
      allowed_line_types: allowedLineTypes,
      job_context: {
        job_id: input.jobId,
        appliance_type: input.applianceType,
        brand: input.brand,
        model_number: input.modelNumber,
        customer_complaint: input.customerComplaint,
        technician_diagnosis: input.technicianDiagnosis,
        existing_notes: input.existingNotes,
        language_hint: input.languageHint,
      },
    }),
  };
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const response = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        text?: unknown;
      }>;
    }>;
  };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter((text): text is string => typeof text === "string")
      .join("\n") ?? ""
  );
}

function parseJsonDraft(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("OpenAI response did not include JSON text.");
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
    }

    throw new Error("OpenAI response was not valid JSON.");
  }
}

function validateOpenAiDraft(value: unknown): OpenAiEstimateDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI draft was not an object.");
  }

  const draft = value as Partial<OpenAiEstimateDraft>;

  if (!allowedLanguages.includes(draft.detected_language as DiagnosisLanguage)) {
    throw new Error("OpenAI draft returned an unsupported language.");
  }

  if (
    draft.confidence !== "high" &&
    draft.confidence !== "medium" &&
    draft.confidence !== "low"
  ) {
    throw new Error("OpenAI draft returned an unsupported confidence.");
  }

  if (
    typeof draft.normalized_english_diagnosis !== "string" ||
    typeof draft.customer_facing_summary !== "string" ||
    typeof draft.warranty_text !== "string" ||
    !draft.likely_repair_scope ||
    typeof draft.likely_repair_scope.scope_key !== "string" ||
    typeof draft.likely_repair_scope.service_category !== "string" ||
    typeof draft.likely_repair_scope.repair_group !== "string" ||
    typeof draft.likely_repair_scope.repair_item !== "string" ||
    typeof draft.likely_repair_scope.customer_summary !== "string"
  ) {
    throw new Error("OpenAI draft was missing required text fields.");
  }

  const repairIntents = Array.isArray(draft.repair_intents)
    ? draft.repair_intents.filter((intent): intent is RepairIntent =>
        allowedRepairIntents.includes(intent as RepairIntent),
      )
    : [];

  if (repairIntents.length === 0) {
    throw new Error("OpenAI draft did not return any supported repair intents.");
  }

  const lines = Array.isArray(draft.estimate_lines)
    ? draft.estimate_lines
        .map((line): OpenAiEstimateLine | null => {
          if (!line || typeof line !== "object") {
            return null;
          }

          const rawLine = line as Partial<OpenAiEstimateLine>;
          const lineType = rawLine.line_type;
          const customerName = cleanText(rawLine.customer_name, 160);
          const internalName = cleanText(rawLine.internal_name, 180);
          const description = cleanText(rawLine.description, 500);

          if (
            !allowedLineTypes.includes(lineType as EstimateDraftLineType) ||
            !customerName ||
            isGenericLineName(customerName)
          ) {
            return null;
          }

          return {
            line_type: lineType as EstimateDraftLineType,
            customer_name: customerName,
            internal_name: internalName || customerName,
            description: description || null,
            quantity: cleanQuantity(rawLine.quantity),
            unit_price: cleanMoney(rawLine.unit_price),
            unit_cost: cleanMoney(rawLine.unit_cost),
            taxable:
              typeof rawLine.taxable === "boolean"
                ? rawLine.taxable
                : lineType === "part",
            notes: cleanText(rawLine.notes, 500) || null,
          };
        })
        .filter((line): line is OpenAiEstimateLine => line !== null)
    : [];

  if (lines.length === 0) {
    throw new Error("OpenAI draft did not include any usable estimate lines.");
  }

  return {
    detected_language: draft.detected_language as DiagnosisLanguage,
    normalized_english_diagnosis: cleanText(
      draft.normalized_english_diagnosis,
      1200,
    ),
    repair_intents: repairIntents,
    likely_repair_scope: {
      scope_key: cleanText(draft.likely_repair_scope.scope_key, 80),
      service_category: cleanText(
        draft.likely_repair_scope.service_category,
        80,
      ),
      repair_group: cleanText(draft.likely_repair_scope.repair_group, 80),
      repair_item: cleanText(draft.likely_repair_scope.repair_item, 120),
      customer_summary: cleanText(
        draft.likely_repair_scope.customer_summary,
        800,
      ),
    },
    customer_facing_summary: cleanText(draft.customer_facing_summary, 900),
    estimate_lines: lines,
    warranty_text: cleanText(draft.warranty_text, 900),
    confidence: draft.confidence,
    warnings: Array.isArray(draft.warnings)
      ? draft.warnings
          .map((warning) => cleanText(warning, 220))
          .filter(Boolean)
          .slice(0, 5)
      : [],
  };
}

function mapOpenAiDraftToAgentResult(
  draft: OpenAiEstimateDraft,
): EstimateDraftAgentResult {
  const lines: EstimateDraftAgentLine[] = draft.estimate_lines.map((line) => ({
    lineType: line.line_type,
    customerName: line.customer_name,
    internalName: line.internal_name,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    unitCost: line.unit_cost,
    publicDescription: line.description,
    taxable: line.taxable,
    notes: line.description || line.notes,
  }));

  return {
    title: draft.likely_repair_scope.repair_item || "Smart Estimate Draft",
    customerDescription:
      draft.customer_facing_summary ||
      draft.likely_repair_scope.customer_summary,
    repairScope: {
      scopeKey: draft.likely_repair_scope.scope_key,
      serviceCategory: draft.likely_repair_scope.service_category,
      repairGroup: draft.likely_repair_scope.repair_group,
      repairItem: draft.likely_repair_scope.repair_item,
      customerSummary: draft.likely_repair_scope.customer_summary,
    },
    diagnosisNormalization: {
      providerMode: "cheap_ai",
      detectedLanguage: draft.detected_language,
      normalizedEnglishDiagnosis: draft.normalized_english_diagnosis,
      repairIntents: draft.repair_intents,
      confidence: draft.confidence,
      matchedTerms: [],
    },
    lines,
    warrantyText: draft.warranty_text,
    internalNotes:
      draft.warnings.length > 0
        ? `Estimate agent warnings: ${draft.warnings.join("; ")}`
        : "Estimate generated by server-side estimate agent. Technician must review before sending.",
    confidence: draft.confidence,
    sourceReason: "Server-side OpenAI estimate agent structured draft.",
  };
}

async function callOpenAiEstimateAgent(
  input: {
    jobId: string | null;
    applianceType: string | null;
    brand: string | null;
    modelNumber: string | null;
    customerComplaint: string | null;
    technicianDiagnosis: string;
    existingNotes: string[];
    languageHint: string | null;
  },
  explicitScope: ExplicitEstimateScope,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("openai_key_missing");
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  let openAiStatus: number | null = null;
  const timeoutId = setTimeout(
    () => controller.abort(),
    ESTIMATE_AGENT_TIMEOUT_MS,
  );

  try {
    const modelConfig = getEstimateAgentModelConfig();

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelConfig.cheapModel,
          input: [
            {
              role: "system",
              content:
                "You are a professional home-service estimate draft agent for appliance repair technicians. Return only the JSON schema requested. Keep customer-facing wording concise and safe. Use repair-specific reasoning, especially for refrigeration sealed-system symptoms.",
            },
            buildEstimateAgentPrompt(input),
          ],
          temperature: 0.1,
          max_output_tokens: 1500,
          text: {
            format: {
              type: "json_schema",
              name: "estimate_agent_draft",
              strict: true,
              schema: buildEstimateAgentSchema(),
            },
          },
        }),
        signal: controller.signal,
      });

      openAiStatus = response.status;

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new OpenAiEstimateAgentError(
          `OpenAI estimate agent request failed with status ${response.status}.`,
          {
            code: "openai_http_error",
            elapsedMs: Date.now() - startedAt,
            openAiStatus,
          },
        );
      }

      const text = extractOpenAiText(payload);
      const parsedDraft = parseJsonDraft(text);
      const validatedDraft = validateOpenAiDraft(parsedDraft);

      logEstimateAgentDev("openai_response", {
        elapsedMs: Date.now() - startedAt,
        timeoutMs: ESTIMATE_AGENT_TIMEOUT_MS,
        openAiStatus,
      });

      return ensureExplicitScopeLines(validatedDraft, explicitScope);
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;

      if (error instanceof OpenAiEstimateAgentError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new OpenAiEstimateAgentError(
          `OpenAI estimate agent timed out after ${elapsedMs}ms.`,
          {
            code: "openai_timeout",
            elapsedMs,
            openAiStatus,
          },
        );
      }

      throw new OpenAiEstimateAgentError(
        error instanceof Error
          ? error.message
          : "OpenAI estimate agent request failed.",
        {
          code: "openai_request_failed",
          elapsedMs,
          openAiStatus,
        },
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

const openAiEstimateAgentProvider = {
  name: "openai",
  generateDraft: callOpenAiEstimateAgent,
};

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return jsonResponse(
      {
        ok: false,
        message: "Log in again before generating an estimate draft.",
      },
      401,
    );
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return jsonResponse(
      {
        ok: false,
        message: "Estimate agent is not available in this workspace.",
      },
      503,
    );
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return jsonResponse(
      {
        ok: false,
        message: "Log in again before generating an estimate draft.",
      },
      401,
    );
  }

  let payload: EstimateAgentDraftPayload;

  try {
    payload = (await request.json()) as EstimateAgentDraftPayload;
  } catch {
    return jsonResponse(
      {
        ok: false,
        message: "Estimate agent request was not valid JSON.",
      },
      400,
    );
  }

  const technicianDiagnosis = cleanText(payload.technicianDiagnosis, 1800);

  if (!technicianDiagnosis) {
    return jsonResponse(
      {
        ok: false,
        message: "Describe the diagnosis before generating an estimate.",
      },
      400,
    );
  }

  const agentInput = {
    jobId: cleanText(payload.jobId, 80) || null,
    applianceType: cleanText(payload.applianceType, 120) || null,
    brand: cleanText(payload.brand, 120) || null,
    modelNumber: cleanText(payload.modelNumber, 120) || null,
    customerComplaint: cleanText(payload.customerComplaint, 1400) || null,
    technicianDiagnosis,
    existingNotes: cleanNotes(payload.existingNotes),
    languageHint: cleanText(payload.language, 40) || null,
  };
  const explicitScope = extractExplicitEstimateScope(
    agentInput.technicianDiagnosis,
  );

  logEstimateAgentDev("request_start", {
    jobId: agentInput.jobId,
    diagnosisLength: agentInput.technicianDiagnosis.length,
    explicitScope,
  });

  try {
    const aiDraft = await openAiEstimateAgentProvider.generateDraft(
      agentInput,
      explicitScope,
    );
    const baseDraft = mapOpenAiDraftToAgentResult(aiDraft);
    const repairPlan = createRepairPlanFromDraft(agentInput, baseDraft);
    const { draft, pricingWarnings } = applyRepairPlanToDraft(
      baseDraft,
      repairPlan,
    );
    const modelConfig = getEstimateAgentModelConfig();

    logEstimateAgentDev("request_complete", {
      finalSource: "openai",
      explicitScope,
      repairType: repairPlan.detectedRepairType,
      matchedKnowledgeKeys: repairPlan.matchedKnowledgeKeys,
      lineCount: draft.lines.length,
      finalLineTitles: draft.lines.map((line) => line.customerName),
    });

    return jsonResponse({
      ok: true,
      source: "openai",
      provider: "openai",
      model: modelConfig.cheapModel,
      repair_plan: repairPlan,
      estimate_lines: draft.lines,
      customer_summary: draft.customerDescription,
      warranty_text: draft.warrantyText,
      pricing_warnings: pricingWarnings,
      confidence: draft.confidence,
      draft,
      message: "Generated with AI. Please review before sending.",
    });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== "production";
    const fallbackReason =
      error instanceof OpenAiEstimateAgentError
        ? error.code
        : error instanceof Error
          ? error.message
          : String(error);
    const openAiFailureDetails =
      error instanceof OpenAiEstimateAgentError
        ? {
            timeoutMs: error.timeoutMs,
            elapsedMs: error.elapsedMs,
            openAiStatus: error.openAiStatus,
          }
        : {};

    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[estimate-agent] OpenAI estimate agent failed:",
        error instanceof Error ? error.message : error,
      );
    }

    if (isDev) {
      logEstimateAgentDev("request_complete", {
        finalSource: "error",
        explicitScope,
        fallbackReason,
        ...openAiFailureDetails,
      });

      return jsonResponse(
        {
          ok: false,
          source: "error",
          provider: "openai",
          fallbackReason,
          message:
            error instanceof OpenAiEstimateAgentError
              ? `OpenAI estimate agent did not complete: ${error.code}.`
              : "OpenAI estimate agent did not complete.",
          ...openAiFailureDetails,
        },
        502,
      );
    }

    const baseDraft = createFallbackDraft(
      agentInput,
      "Local deterministic estimate draft fallback after server-side estimate agent was unavailable.",
    );
    const repairPlan = createRepairPlanFromDraft(agentInput, baseDraft);
    const { draft, pricingWarnings } = applyRepairPlanToDraft(
      baseDraft,
      repairPlan,
    );

    logEstimateAgentDev("request_complete", {
      finalSource: "fallback",
      explicitScope,
      repairType: repairPlan.detectedRepairType,
      matchedKnowledgeKeys: repairPlan.matchedKnowledgeKeys,
      fallbackReason,
      ...openAiFailureDetails,
      lineCount: draft.lines.length,
      finalLineTitles: draft.lines.map((line) => line.customerName),
    });

    return jsonResponse({
      ok: true,
      source: "fallback",
      provider: "local_fallback",
      repair_plan: repairPlan,
      estimate_lines: draft.lines,
      customer_summary: draft.customerDescription,
      warranty_text: draft.warrantyText,
      pricing_warnings: pricingWarnings,
      confidence: draft.confidence,
      draft,
      fallbackReason:
        error instanceof Error && error.message === "openai_key_missing"
          ? "openai_key_missing"
          : "openai_unavailable",
      message:
        error instanceof Error && error.message === "openai_key_missing"
          ? "Generated locally. OpenAI API key is not configured."
          : "Generated locally. OpenAI estimate agent was not available.",
    });
  }
}
