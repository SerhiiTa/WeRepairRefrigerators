import { NextResponse } from "next/server";

import type {
  DiagnosisLanguage,
  EstimateDraftAgentLine,
  EstimateDraftAgentResult,
  EstimateDraftLineType,
  RepairIntent,
} from "@/lib/estimate-draft-agent";
import {
  normalizeApplianceCategory,
  type RepairPlan,
} from "@/lib/repair-intelligence";
import { generateRepairProposalDraft } from "@/server/finance/repair-proposal-providers";
import { repairProposalDraftToEstimateDraftAgentResult } from "@/server/finance/repair-proposal-schema";
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
  missing_information: string[];
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

type AuthorizedScopeItem = {
  id: string;
  label: string;
  lineType: EstimateDraftLineType;
  keywords: string[];
  requiredPlaceholders: string[];
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

function hasExplicitAction(value: string): boolean {
  return hasAnyTerm(value, [
    "replace",
    "replacement",
    "change",
    "install",
    "add",
    "manual",
    "manually",
    "defrost",
    "thaw",
    "замена",
    "заменить",
    "поменять",
    "ставить",
    "установить",
    "добавить",
    "размороз",
    "разморозить",
    "вручную",
    "cambiar",
    "reemplazar",
    "instalar",
    "descongelar",
  ]);
}

function buildAuthorizedScopeItems(diagnosis: string): AuthorizedScopeItem[] {
  const normalized = normalizeDiagnosisForScope(diagnosis);
  const explicitAction = hasExplicitAction(normalized);
  const items: AuthorizedScopeItem[] = [];

  const addItem = (item: AuthorizedScopeItem) => {
    if (!items.some((existing) => existing.id === item.id)) {
      items.push(item);
    }
  };

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
  const hasDispenserWaterLine = hasAnyTerm(normalized, [
    "water line",
    "water tube",
    "water tubing",
    "supply tube",
    "supply tubing",
    "water supply tube",
    "water supply tubing",
    "dispenser water line",
    "dispenser supply line",
    "dispenser supply tube",
    "dispenser supply tubing",
    "трубочка",
    "трубка",
    "подачи воды",
  ]);
  const hasDefrost = hasAnyTerm(normalized, [
    "manual defrost",
    "manually defrost",
    "defrost",
    "ice removal",
    "разморозка",
    "разморозить",
    "вручную",
    "descongelar",
  ]);
  const hasCompressorReplace = hasAnyTerm(normalized, [
    "replace compressor",
    "compressor replacement",
    "change compressor",
    "замена компрессор",
    "заменить компрессор",
    "поменять компрессор",
    "cambiar compresor",
    "reemplazar compresor",
  ]);

  if (explicitAction && hasEvaporator && hasFan) {
    addItem({
      id: "evaporator_fan_replacement",
      label: "Evaporator fan motor replacement",
      lineType: "part",
      keywords: ["evaporator", "fan", "motor"],
      requiredPlaceholders: ["[PART PRICE REQUIRED]", "[LABOR PRICE REQUIRED]"],
    });
  }

  if (explicitAction && hasHeater && (hasEvaporator || hasDefrost)) {
    addItem({
      id: "defrost_heater_replacement",
      label: "Defrost heater / evaporator heating element replacement",
      lineType: "part",
      keywords: ["defrost", "heater", "heating", "element", "evaporator"],
      requiredPlaceholders: ["[PART PRICE REQUIRED]", "[LABOR PRICE REQUIRED]"],
    });
  }

  if (hasDefrost && (hasEvaporator || hasAnyTerm(normalized, ["ice", "лед", "льд"]))) {
    addItem({
      id: "manual_evaporator_defrost",
      label: "Manual evaporator defrost / ice removal",
      lineType: "material",
      keywords: ["manual", "defrost", "ice", "evaporator"],
      requiredPlaceholders: ["[LABOR PRICE REQUIRED]"],
    });
  }

  if (explicitAction && hasWaterValve) {
    addItem({
      id: "water_inlet_valve_replacement",
      label: "Water inlet / dispenser water valve replacement",
      lineType: "part",
      keywords: ["water", "valve", "inlet", "dispenser"],
      requiredPlaceholders: ["[PART PRICE REQUIRED]", "[LABOR PRICE REQUIRED]"],
    });
  }

  if (hasDefrost && hasDispenserWaterLine) {
    addItem({
      id: "frozen_dispenser_water_line_thaw",
      label: "Frozen dispenser water line thawing",
      lineType: "material",
      keywords: ["water", "line", "tube", "tubing", "supply", "thaw", "defrost", "frozen"],
      requiredPlaceholders: ["[LABOR PRICE REQUIRED]"],
    });
  }

  if (explicitAction && hasCompressorReplace) {
    addItem({
      id: "compressor_replacement",
      label: "Compressor replacement explicitly requested by technician",
      lineType: "part",
      keywords: ["compressor", "replacement"],
      requiredPlaceholders: [
        "[TECHNICIAN CONFIRMATION REQUIRED]",
        "[PART PRICE REQUIRED]",
        "[LABOR PRICE REQUIRED]",
      ],
    });
  }

  if (items.length > 0) {
    addItem({
      id: "technician_labor_testing",
      label: "Technician labor, reassembly, and final testing for listed work",
      lineType: "labor",
      keywords: ["labor", "testing", "reassembly"],
      requiredPlaceholders: ["[LABOR PRICE REQUIRED]"],
    });
  }

  return items;
}

function lineMatchesAuthorizedScope(
  line: OpenAiEstimateLine,
  authorizedScopeItems: AuthorizedScopeItem[],
): boolean {
  const text = lineSearchText(line);

  return authorizedScopeItems.some((item) =>
    item.keywords.some((keyword) => text.includes(keyword)),
  );
}

function enforceTechnicianScopeAuthority(
  draft: OpenAiEstimateDraft,
  authorizedScopeItems: AuthorizedScopeItem[],
): OpenAiEstimateDraft {
  if (authorizedScopeItems.length === 0) {
    return {
      ...draft,
      estimate_lines: [
        {
          line_type: "custom",
          customer_name: "Technician Repair Scope Required",
          internal_name: "Technician repair scope confirmation required",
          description:
            "The technician must confirm the repair operations, replacement parts, and pricing before an estimate can be sent.",
          quantity: 1,
          unit_price: 0,
          unit_cost: 0,
          taxable: false,
          notes:
            "[TECHNICIAN CONFIRMATION REQUIRED] [PART PRICE REQUIRED] [LABOR PRICE REQUIRED]",
        },
      ],
      repair_intents: [],
      confidence: "low",
      warnings: [
        ...draft.warnings,
        "No explicit technician repair operations were provided. Estimate lines were not generated because the AI is not allowed to decide repair scope.",
      ].slice(0, 8),
      missing_information: Array.from(
        new Set([
          ...draft.missing_information,
          "[TECHNICIAN CONFIRMATION REQUIRED]",
          "[PART PRICE REQUIRED]",
          "[LABOR PRICE REQUIRED]",
        ]),
      ),
    };
  }

  const filteredLines = draft.estimate_lines.filter((line) =>
    lineMatchesAuthorizedScope(line, authorizedScopeItems),
  );
  const missingItems = authorizedScopeItems.filter(
      (item) =>
        !filteredLines.some((line) =>
          item.keywords.some((keyword) => lineSearchText(line).includes(keyword)),
        ),
    );
  const missingLineWarnings = missingItems
    .map((item) => `${item.label}: [TECHNICIAN CONFIRMATION REQUIRED]`);
  const placeholderLines: OpenAiEstimateLine[] = missingItems.map((item) => ({
    line_type: item.lineType,
    customer_name: item.label,
    internal_name: item.label,
    description:
      "Technician explicitly included this item. Confirm final quantity and pricing before sending.",
    quantity: 1,
    unit_price: 0,
    unit_cost: 0,
    taxable: item.lineType === "part",
    notes: item.requiredPlaceholders.join(" "),
  }));

  return {
    ...draft,
    estimate_lines: [...filteredLines, ...placeholderLines],
    repair_intents: draft.repair_intents.filter((intent) =>
      allowedRepairIntents.includes(intent),
    ),
    confidence: missingLineWarnings.length > 0 ? "low" : draft.confidence,
    warnings: Array.from(
      new Set([
        ...draft.warnings,
        "Technician findings are the single source of truth. Any AI line outside explicit technician scope was removed.",
        ...missingLineWarnings,
      ]),
    ).slice(0, 8),
    missing_information: Array.from(
      new Set([
        ...draft.missing_information,
        ...authorizedScopeItems.flatMap((item) => item.requiredPlaceholders),
        ...missingLineWarnings,
      ]),
    ).slice(0, 10),
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

function createAuthorityFallbackDraft(
  input: {
    applianceType: string | null;
    brand: string | null;
    modelNumber: string | null;
    customerComplaint: string | null;
    technicianDiagnosis: string;
    existingNotes: string[];
  },
  authorizedScopeItems: AuthorizedScopeItem[],
  sourceReason = "Local technician-authority estimate writer fallback.",
): EstimateDraftAgentResult {
  const normalizedDiagnosis = cleanText(input.technicianDiagnosis, 1200);
  const missingInformation = Array.from(
    new Set(
      authorizedScopeItems.length > 0
        ? authorizedScopeItems.flatMap((item) => item.requiredPlaceholders)
        : [
            "[TECHNICIAN CONFIRMATION REQUIRED]",
            "[PART PRICE REQUIRED]",
            "[LABOR PRICE REQUIRED]",
          ],
    ),
  );
  const lines: EstimateDraftAgentLine[] =
    authorizedScopeItems.length > 0
      ? authorizedScopeItems.map((item) => ({
          lineType: item.lineType,
          customerName: item.label,
          internalName: item.label,
          quantity: 1,
          unitPrice: 0,
          unitCost: 0,
          publicDescription:
            "Technician-authorized repair item. Confirm pricing before sending.",
          taxable: item.lineType === "part",
          notes: item.requiredPlaceholders.join(" "),
        }))
      : [
          {
            lineType: "custom",
            customerName: "Technician Repair Scope Required",
            internalName: "Technician repair scope confirmation required",
            quantity: 1,
            unitPrice: 0,
            unitCost: 0,
            publicDescription:
              "Confirm the repair operations, replacement parts, quantities, and prices before sending.",
            taxable: false,
            notes: missingInformation.join(" "),
          },
        ];

  return {
    title:
      authorizedScopeItems.length > 0
        ? "Technician-Authorized Estimate Draft"
        : "Technician Scope Required",
    customerDescription:
      authorizedScopeItems.length > 0
        ? "This estimate is based only on the repair scope provided by the technician."
        : "Additional technician confirmation is required before this estimate can be sent.",
    repairScope: {
      scopeKey:
        authorizedScopeItems.length > 0
          ? "technician_authorized_estimate_scope"
          : "technician_scope_required",
      serviceCategory: normalizeApplianceCategory(input.applianceType),
      repairGroup: "Technician Provided Scope",
      repairItem:
        authorizedScopeItems.map((item) => item.label).join(", ") ||
        "Technician confirmation required",
      customerSummary:
        authorizedScopeItems.length > 0
          ? "Technician-authorized repair scope formatted for customer review."
          : "Technician must confirm repair scope and pricing.",
    },
    diagnosisNormalization: {
      providerMode: "local",
      detectedLanguage: "unknown",
      normalizedEnglishDiagnosis: normalizedDiagnosis,
      repairIntents: [],
      confidence: authorizedScopeItems.length > 0 ? "medium" : "low",
      matchedTerms: authorizedScopeItems.map((item) => item.id),
    },
    lines,
    warrantyText: "90 days labor and installed parts unless otherwise specified.",
    internalNotes: `Estimate writer fallback. Missing information: ${missingInformation.join("; ")}`,
    confidence: authorizedScopeItems.length > 0 ? "medium" : "low",
    sourceReason,
  };
}

function createEstimateWriterPlanFromDraft(
  input: {
    applianceType: string | null;
    brand: string | null;
    modelNumber: string | null;
    technicianDiagnosis: string;
  },
  draft: EstimateDraftAgentResult,
  authorizedScopeItems: AuthorizedScopeItem[],
  missingInformation: string[],
): RepairPlan {
  return {
    applianceCategory: normalizeApplianceCategory(input.applianceType),
    brand: input.brand,
    modelNumber: input.modelNumber,
    problemSummary:
      draft.diagnosisNormalization.normalizedEnglishDiagnosis ||
      input.technicianDiagnosis,
    detectedRepairType:
      authorizedScopeItems.length > 0
        ? "technician_authorized_estimate_scope"
        : "technician_scope_required",
    requiredOperations: draft.lines
      .filter((line) => line.lineType === "labor" || line.lineType === "custom")
      .map((line, index) => ({
        id: `estimate-writer-operation-${index + 1}`,
        title: line.customerName,
        description:
          line.publicDescription ||
          line.notes ||
          "Technician-authorized estimate line.",
        estimateLineType: line.lineType,
        customerVisible: true,
      })),
    likelyParts: draft.lines
      .filter((line) => line.lineType === "part")
      .map((line, index) => ({
        id: `estimate-writer-part-${index + 1}`,
        customerName: line.customerName,
        internalName: line.internalName,
        reason: "Technician-authorized estimate line.",
        quantity: line.quantity ?? 1,
        required: true,
      })),
    materials: draft.lines
      .filter((line) => line.lineType === "material")
      .map((line, index) => ({
        id: `estimate-writer-material-${index + 1}`,
        customerName: line.customerName,
        internalName: line.internalName,
        reason: "Technician-authorized estimate line.",
        quantity: line.quantity ?? 1,
        required: true,
      })),
    laborConsiderations: missingInformation,
    riskNotes:
      missingInformation.length > 0
        ? [
            {
              id: "estimate-writer-missing-information",
              severity: "caution",
              note: missingInformation.join("; "),
              customerVisible: false,
            },
          ]
        : [],
    customerFacingExplanation: draft.customerDescription,
    estimateStrategy: {
      strategy: "detailed",
      customerSummary: draft.customerDescription,
      pricingWarning:
        missingInformation.length > 0
          ? "Some estimate information requires technician confirmation before sending."
          : undefined,
    },
    warrantyRecommendation: {
      text: draft.warrantyText,
      days: 90,
      scope: "labor_and_installed_parts",
    },
    confidence: draft.confidence,
    repairIntents: draft.diagnosisNormalization.repairIntents,
    matchedKnowledgeKeys: ["estimate_writer.technician_authority"],
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
      missing_information: {
        type: "array",
        items: { type: "string" },
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
        minItems: 1,
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
      "missing_information",
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
  authorizedScopeItems: AuthorizedScopeItem[];
}) {
  return {
    role: "user",
    content: JSON.stringify({
      task: "Format a professional appliance-repair estimate draft from technician-approved scope only.",
      role_guidance:
        "You are an estimate writer, not a repair decision maker. The technician findings are the single source of truth. Rewrite and organize only the operations explicitly provided by the technician.",
      safety_rules: [
        "Return strict JSON only.",
        "The technician findings are the single source of truth.",
        "The AI is not allowed to determine repair scope.",
        "The AI is not allowed to diagnose.",
        "The AI is not allowed to replace technician decisions.",
        "The AI formats estimates. It does not create repairs.",
        "Expand only the language. Do not expand the repair itself.",
        "Only rewrite operations explicitly provided by the technician.",
        "Do not infer failed components from symptoms.",
        "Do not add common industry practice repairs.",
        "Do not add parts, labor operations, quantities, prices, or part numbers unless the technician explicitly provided them or they appear in authorized_scope_items.",
        "If required information is missing, use missing_information and line notes with placeholders such as [PART PRICE REQUIRED], [LABOR PRICE REQUIRED], [TECHNICIAN CONFIRMATION REQUIRED], or [MODEL NUMBER REQUIRED].",
        "Use customer-friendly line names and keep part numbers/internal names in internal_name.",
        "Return customer-facing line item titles in English by default, even when the technician diagnosis is Russian, Ukrainian, Spanish, or mixed language.",
        "In estimate_lines, customer_name means the customer-facing line item title. It must never be a person name or the word Customer.",
        "Never use generic line names like Diagnostic and repair labor or Repair materials or replacement component when the technician provided a specific repair operation.",
        "Separate only the labor, parts, service operations, and other charges explicitly provided by the technician.",
        "Use line_type labor for technician labor, part for replacement parts, material for service operations such as manual defrost/testing/cleanup, and custom for other charges.",
        "Labor, service, and other lines are normally non-taxable. Part lines are normally taxable.",
        "Generate practical customer-facing line names and descriptions. Keep wording professional and sales-friendly.",
        "Do not claim the repair is guaranteed.",
        "Avoid unsafe DIY instructions or technical step-by-step procedures.",
        "Do not include payment, SMS, customer approval, inventory, or vendor actions.",
        "Use warranty_text for warranty/disclaimer text, not a priced estimate line.",
        "Technician explicit requested work has priority. If the technician says replace/change X, create a specific estimate line for X using placeholders for missing prices.",
        "Do not merge explicitly named replacement parts into vague labor.",
        "Understand Russian and technician slang: хитинг/heating/heater means heater or defrost heater when evaporator/ice/defrost context exists; эвапорейтор means evaporator; эвик can mean evaporator; фен/фэн means fan; не кулит means not cooling; забит льдом means iced over.",
        "Understand dispenser slang: вотер валв means water valve; центральный вотер валв means main/central water inlet valve; трубочка подачи воды в двери means dispenser water tube in the door.",
        "Use authorized_scope_items as the only allowed estimate scope. If authorized_scope_items is empty, return one placeholder line requiring technician confirmation.",
        "For LG refrigerator linear compressor running but no cooling, do not add compressor, sealed-system, refrigerant, or filter-drier lines unless the technician explicitly says to replace or perform that repair.",
        "If the technician only describes symptoms, summarize the symptoms and ask for technician confirmation instead of creating repair lines.",
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
      authorized_scope_items: input.authorizedScopeItems,
      future_architecture:
        "Repair Intelligence should later produce a validated repair scope. This Estimate Builder only transforms validated technician scope into customer-facing estimate language.",
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
    missing_information: Array.isArray(draft.missing_information)
      ? draft.missing_information
          .map((item) => cleanText(item, 160))
          .filter(Boolean)
          .slice(0, 10)
      : [],
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
      draft.warnings.length > 0 || draft.missing_information.length > 0
        ? [
            draft.warnings.length > 0
              ? `Estimate agent warnings: ${draft.warnings.join("; ")}`
              : "",
            draft.missing_information.length > 0
              ? `Missing estimate information: ${draft.missing_information.join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" ")
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
  authorizedScopeItems: AuthorizedScopeItem[],
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
                "You are a professional home-service estimate writer for appliance repair technicians. Return only the JSON schema requested. The technician findings are the single source of truth. You format estimates; you do not diagnose, infer repair scope, invent parts, invent labor, or replace technician decisions.",
            },
            buildEstimateAgentPrompt({ ...input, authorizedScopeItems }),
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
      const technicianScopedDraft = enforceTechnicianScopeAuthority(
        validatedDraft,
        authorizedScopeItems,
      );

      logEstimateAgentDev("openai_response", {
        elapsedMs: Date.now() - startedAt,
        timeoutMs: ESTIMATE_AGENT_TIMEOUT_MS,
        openAiStatus,
        authorizedScopeCount: authorizedScopeItems.length,
      });

      return technicianScopedDraft;
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
  const authorizedScopeItems = buildAuthorizedScopeItems(
    agentInput.technicianDiagnosis,
  );

  logEstimateAgentDev("request_start", {
    jobId: agentInput.jobId,
    diagnosisLength: agentInput.technicianDiagnosis.length,
    authorizedScopeItems: authorizedScopeItems.map((item) => item.id),
  });

  try {
    const proposalResult = await generateRepairProposalDraft({
      serviceRequestId: agentInput.jobId,
      applianceType: agentInput.applianceType,
      brand: agentInput.brand,
      modelNumber: agentInput.modelNumber,
      customerComplaint: agentInput.customerComplaint,
      confirmedRepairScope: agentInput.technicianDiagnosis,
      language:
        agentInput.languageHint === "english" ||
        agentInput.languageHint === "russian" ||
        agentInput.languageHint === "ukrainian" ||
        agentInput.languageHint === "spanish" ||
        agentInput.languageHint === "mixed"
          ? agentInput.languageHint
          : null,
    });
    const draft = repairProposalDraftToEstimateDraftAgentResult(
      proposalResult.proposalDraft,
    );
    const repairPlan: RepairPlan = {
      applianceCategory: normalizeApplianceCategory(agentInput.applianceType),
      brand: agentInput.brand,
      modelNumber: agentInput.modelNumber,
      problemSummary: proposalResult.proposalDraft.confirmed_problem_summary,
      detectedRepairType: "technician_confirmed_repair_proposal",
      requiredOperations: proposalResult.proposalDraft.repair_solutions.flatMap(
        (solution) =>
          solution.items
            .filter((item) => item.line_type !== "part" && item.customer_visible)
            .map((item) => ({
              id: item.id,
              title: item.customer_title,
              description: item.customer_description,
              estimateLineType:
                item.line_type === "service" || item.line_type === "fee"
                  ? "custom"
                  : item.line_type,
              customerVisible: item.customer_visible,
            })),
      ),
      likelyParts: proposalResult.proposalDraft.repair_solutions.flatMap(
        (solution) =>
          solution.items
            .filter((item) => item.line_type === "part" && item.customer_visible)
            .map((item) => ({
              id: item.id,
              customerName: item.customer_title,
              internalName: item.internal_name,
              reason: item.customer_description,
              quantity: item.quantity,
              required: true,
            })),
      ),
      materials: proposalResult.proposalDraft.repair_solutions.flatMap(
        (solution) =>
          solution.items
            .filter((item) => item.line_type === "material" && item.customer_visible)
            .map((item) => ({
              id: item.id,
              customerName: item.customer_title,
              internalName: item.internal_name,
              reason: item.customer_description,
              quantity: item.quantity,
              required: true,
            })),
      ),
      laborConsiderations: proposalResult.proposalDraft.warnings.map(
        (warning) => warning.message,
      ),
      riskNotes: proposalResult.proposalDraft.warnings.map((warning) => ({
        id: warning.code,
        severity: warning.blocking_before_send ? "caution" : "info",
        note: warning.message,
        customerVisible: false,
      })),
      customerFacingExplanation: proposalResult.proposalDraft.customer_summary,
      estimateStrategy: {
        strategy: "detailed",
        customerSummary: proposalResult.proposalDraft.customer_summary,
        pricingWarning:
          proposalResult.proposalDraft.warnings.length > 0
            ? "Some proposal information requires technician confirmation before sending."
            : undefined,
      },
      warrantyRecommendation: {
        text: proposalResult.proposalDraft.warranty,
        days: 90,
        scope: "labor_and_installed_parts",
      },
      confidence: draft.confidence,
      repairIntents: [],
      matchedKnowledgeKeys: ["repair_proposal.technician_authority_contract"],
    };
    const source = proposalResult.provider === "openai" ? "openai" : "fallback";

    logEstimateAgentDev("request_complete", {
      finalSource: source,
      provider: proposalResult.provider,
      fallbackReasons: proposalResult.fallbackReasons,
      extractedExplicitScope: proposalResult.explicitScope.explicitItems.map(
        (item) => item.title,
      ),
      lineCount: draft.lines.length,
      finalLineTitles: draft.lines.map((line) => line.customerName),
    });

    return jsonResponse({
      ok: true,
      source,
      provider: proposalResult.provider,
      proposal_draft: proposalResult.proposalDraft,
      repair_plan: repairPlan,
      estimate_lines: draft.lines,
      customer_summary: draft.customerDescription,
      warranty_text: draft.warrantyText,
      pricing_warnings: proposalResult.proposalDraft.warnings.map(
        (warning) => warning.message,
      ),
      confidence: draft.confidence,
      draft,
      fallbackReason: proposalResult.fallbackReasons.join("; ") || undefined,
      message:
        source === "openai"
          ? "Generated with AI. Please review before sending."
          : "Generated locally. Please review before sending.",
    });
  } catch (proposalError) {
    logEstimateAgentDev("proposal_contract_failed", {
      message:
        proposalError instanceof Error
          ? proposalError.message
          : String(proposalError),
    });
  }

  try {
    const aiDraft = await openAiEstimateAgentProvider.generateDraft(
      agentInput,
      authorizedScopeItems,
    );
    const draft = mapOpenAiDraftToAgentResult(aiDraft);
    const repairPlan = createEstimateWriterPlanFromDraft(
      agentInput,
      draft,
      authorizedScopeItems,
      aiDraft.missing_information,
    );
    const modelConfig = getEstimateAgentModelConfig();
    const pricingWarnings = aiDraft.missing_information;

    logEstimateAgentDev("request_complete", {
      finalSource: "openai",
      authorizedScopeItems: authorizedScopeItems.map((item) => item.id),
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
        authorizedScopeItems: authorizedScopeItems.map((item) => item.id),
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

    const draft = createAuthorityFallbackDraft(
      agentInput,
      authorizedScopeItems,
      "Local deterministic estimate draft fallback after server-side estimate agent was unavailable.",
    );
    const missingInformation = Array.from(
      new Set(
        authorizedScopeItems.length > 0
          ? authorizedScopeItems.flatMap((item) => item.requiredPlaceholders)
          : [
              "[TECHNICIAN CONFIRMATION REQUIRED]",
              "[PART PRICE REQUIRED]",
              "[LABOR PRICE REQUIRED]",
            ],
      ),
    );
    const repairPlan = createEstimateWriterPlanFromDraft(
      agentInput,
      draft,
      authorizedScopeItems,
      missingInformation,
    );
    const pricingWarnings = missingInformation;

    logEstimateAgentDev("request_complete", {
      finalSource: "fallback",
      authorizedScopeItems: authorizedScopeItems.map((item) => item.id),
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
