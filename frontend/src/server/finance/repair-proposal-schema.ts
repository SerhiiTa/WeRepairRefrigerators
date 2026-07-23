import type {
  DiagnosisLanguage,
  EstimateDraftAgentResult,
  RepairIntent,
} from "@/lib/estimate-draft-agent";

export type RepairProposalLineType =
  | "labor"
  | "part"
  | "material"
  | "service"
  | "fee"
  | "custom";

export type RepairProposalWarningCode =
  | "MODEL_NUMBER_MISSING"
  | "CUSTOMER_PRICE_REQUIRED"
  | "INTERNAL_COST_MISSING"
  | "TECHNICIAN_CONFIRMATION_REQUIRED"
  | "PRICE_BOOK_MATCH_UNCONFIRMED"
  | "WARRANTY_NOT_CONFIGURED"
  | "PART_NUMBER_UNCONFIRMED"
  | "SUGGESTED_PROCEDURE_REVIEW_REQUIRED";

export type RepairProposalWarningSeverity = "info" | "warning" | "blocking";

export type RepairProposalProvider =
  | "openai"
  | "anthropic"
  | "deterministic"
  | "manual"
  | "template";

export type RepairProposalGenerationMode =
  | "ai"
  | "manual"
  | "template"
  | "deterministic_fallback";

export type RepairProposalItemSource =
  | "ai"
  | "manual"
  | "template"
  | "deterministic_fallback"
  | "price_book"
  | "scope_enforcement"
  | "suggested_procedure";

export type RepairProposalWarning = {
  code: RepairProposalWarningCode;
  severity: RepairProposalWarningSeverity;
  message: string;
  related_solution_id: string | null;
  related_item_id: string | null;
  blocking_before_send: boolean;
};

export type RepairProposalItem = {
  id: string;
  line_type: RepairProposalLineType;
  internal_name: string;
  customer_title: string;
  customer_description: string;
  quantity: number;
  customer_unit_price: number;
  internal_unit_cost: number;
  taxable: boolean;
  customer_visible: boolean;
  included_in_summary: boolean;
  price_book_item_id: string | null;
  source: RepairProposalItemSource;
  requires_confirmation: boolean;
  warning_codes: RepairProposalWarningCode[];
};

export type RepairProposalSolution = {
  id: string;
  title: string;
  customer_description: string;
  included_work: string[];
  items: RepairProposalItem[];
  recommended: boolean;
  sort_order: number;
  warranty: string | null;
  estimated_completion: string | null;
  warnings: RepairProposalWarning[];
};

export type RepairProposalGenerationMetadata = {
  provider: RepairProposalProvider;
  model: string | null;
  generation_mode: RepairProposalGenerationMode;
  language_detected: DiagnosisLanguage;
  price_book_matches_used: string[];
  fallback_used: boolean;
  generated_at: string;
};

export type RepairProposalDraft = {
  proposal_title: string;
  confirmed_problem_summary: string;
  customer_summary: string;
  repair_solutions: RepairProposalSolution[];
  warranty: string;
  estimated_completion: string | null;
  validity: string;
  disclaimer: string;
  warnings: RepairProposalWarning[];
  generation_metadata: RepairProposalGenerationMetadata;
};

export type RepairProposalContext = {
  serviceRequestId?: string | null;
  customerName?: string | null;
  applianceType?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  customerComplaint?: string | null;
  confirmedRepairScope: string;
  language?: DiagnosisLanguage | null;
};

export type RepairProposalTemplate = {
  proposalTitle: string;
  customerSummary: string;
  items: Array<Partial<RepairProposalItem> & { customer_title: string }>;
  warranty?: string | null;
};

export const REPAIR_PROPOSAL_LINE_TYPES: RepairProposalLineType[] = [
  "labor",
  "part",
  "material",
  "service",
  "fee",
  "custom",
];

const warningCodes: RepairProposalWarningCode[] = [
  "MODEL_NUMBER_MISSING",
  "CUSTOMER_PRICE_REQUIRED",
  "INTERNAL_COST_MISSING",
  "TECHNICIAN_CONFIRMATION_REQUIRED",
  "PRICE_BOOK_MATCH_UNCONFIRMED",
  "WARRANTY_NOT_CONFIGURED",
  "PART_NUMBER_UNCONFIRMED",
  "SUGGESTED_PROCEDURE_REVIEW_REQUIRED",
];

function cleanText(value: unknown, fallback: string, maxLength = 1200): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function cleanNullableText(value: unknown, maxLength = 800): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function cleanMoney(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.round(numeric * 100) / 100)
    : 0;
}

function cleanQuantity(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(1, Math.min(99, Math.round(numeric * 100) / 100))
    : 1;
}

function uniqueWarnings(warnings: RepairProposalWarning[]): RepairProposalWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.related_solution_id ?? ""}:${warning.related_item_id ?? ""}:${warning.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isWarningCode(value: unknown): value is RepairProposalWarningCode {
  return warningCodes.includes(value as RepairProposalWarningCode);
}

function normalizeLineType(value: unknown): RepairProposalLineType {
  return REPAIR_PROPOSAL_LINE_TYPES.includes(value as RepairProposalLineType)
    ? (value as RepairProposalLineType)
    : "custom";
}

export function createRepairProposalWarning({
  code,
  message,
  severity,
  relatedSolutionId = null,
  relatedItemId = null,
  blockingBeforeSend,
}: {
  code: RepairProposalWarningCode;
  message: string;
  severity?: RepairProposalWarningSeverity;
  relatedSolutionId?: string | null;
  relatedItemId?: string | null;
  blockingBeforeSend?: boolean;
}): RepairProposalWarning {
  const blocks =
    blockingBeforeSend ??
    (code === "CUSTOMER_PRICE_REQUIRED" ||
      code === "TECHNICIAN_CONFIRMATION_REQUIRED");

  return {
    code,
    severity: severity ?? (blocks ? "blocking" : "warning"),
    message,
    related_solution_id: relatedSolutionId,
    related_item_id: relatedItemId,
    blocking_before_send: blocks,
  };
}

export function createRepairProposalItem({
  id,
  lineType,
  title,
  description,
  source,
  price = 0,
  cost = 0,
  quantity = 1,
  taxable,
  priceBookItemId = null,
  requiresConfirmation = true,
  warningCodes: itemWarningCodes,
  customerVisible = true,
  includedInSummary = true,
}: {
  id: string;
  lineType: RepairProposalLineType;
  title: string;
  description?: string | null;
  source: RepairProposalItemSource;
  price?: number;
  cost?: number;
  quantity?: number;
  taxable?: boolean;
  priceBookItemId?: string | null;
  requiresConfirmation?: boolean;
  warningCodes?: RepairProposalWarningCode[];
  customerVisible?: boolean;
  includedInSummary?: boolean;
}): RepairProposalItem {
  const normalizedPrice = cleanMoney(price);
  const warnings = new Set<RepairProposalWarningCode>(itemWarningCodes ?? []);

  if (normalizedPrice <= 0 && customerVisible) {
    warnings.add("CUSTOMER_PRICE_REQUIRED");
  }
  if (requiresConfirmation) {
    warnings.add("TECHNICIAN_CONFIRMATION_REQUIRED");
  }

  return {
    id,
    line_type: lineType,
    internal_name: title,
    customer_title: title,
    customer_description:
      description ?? "Technician-confirmed repair item. Review before sending.",
    quantity: cleanQuantity(quantity),
    customer_unit_price: normalizedPrice,
    internal_unit_cost: cleanMoney(cost),
    taxable: taxable ?? (lineType === "part" || lineType === "material"),
    customer_visible: customerVisible,
    included_in_summary: includedInSummary,
    price_book_item_id: priceBookItemId,
    source,
    requires_confirmation: requiresConfirmation,
    warning_codes: Array.from(warnings),
  };
}

export function normalizeRepairProposalDraft(
  value: unknown,
  context: RepairProposalContext,
  metadataDefaults: Partial<RepairProposalGenerationMetadata> = {},
): RepairProposalDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Repair Proposal draft must be an object.");
  }

  const raw = value as Partial<RepairProposalDraft>;
  const metadata = raw.generation_metadata ?? ({} as RepairProposalGenerationMetadata);
  const languageDetected =
    metadata.language_detected === "english" ||
    metadata.language_detected === "russian" ||
    metadata.language_detected === "ukrainian" ||
    metadata.language_detected === "spanish" ||
    metadata.language_detected === "mixed"
      ? metadata.language_detected
      : context.language ?? "unknown";

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
        .map((warning): RepairProposalWarning | null => {
          if (!warning || typeof warning !== "object") {
            return null;
          }
          const candidate = warning as Partial<RepairProposalWarning>;
          if (!isWarningCode(candidate.code)) {
            return null;
          }
          return createRepairProposalWarning({
            code: candidate.code,
            message: cleanText(candidate.message, candidate.code, 260),
            severity:
              candidate.severity === "info" ||
              candidate.severity === "warning" ||
              candidate.severity === "blocking"
                ? candidate.severity
                : undefined,
            relatedSolutionId: cleanNullableText(candidate.related_solution_id, 80),
            relatedItemId: cleanNullableText(candidate.related_item_id, 80),
            blockingBeforeSend: Boolean(candidate.blocking_before_send),
          });
        })
        .filter((warning): warning is RepairProposalWarning => Boolean(warning))
    : [];

  const repairSolutions = Array.isArray(raw.repair_solutions)
    ? raw.repair_solutions.map((solution, solutionIndex): RepairProposalSolution => {
        const rawSolution =
          solution && typeof solution === "object"
            ? (solution as Partial<RepairProposalSolution>)
            : {};
        const solutionId = cleanText(rawSolution.id, `solution-${solutionIndex + 1}`, 80);
        const items = Array.isArray(rawSolution.items)
          ? rawSolution.items.map((item, itemIndex): RepairProposalItem => {
              const rawItem =
                item && typeof item === "object"
                  ? (item as Partial<RepairProposalItem>)
                  : {};
              const lineType = normalizeLineType(rawItem.line_type);
              const itemWarnings = Array.isArray(rawItem.warning_codes)
                ? rawItem.warning_codes.filter(isWarningCode)
                : [];
              const normalizedItem = createRepairProposalItem({
                id: cleanText(rawItem.id, `${solutionId}-item-${itemIndex + 1}`, 80),
                lineType,
                title: cleanText(
                  rawItem.customer_title ?? rawItem.internal_name,
                  "Technician-confirmed repair item",
                  180,
                ),
                description: cleanText(
                  rawItem.customer_description,
                  "Technician-confirmed repair item. Review before sending.",
                  600,
                ),
                source:
                  rawItem.source === "ai" ||
                  rawItem.source === "manual" ||
                  rawItem.source === "template" ||
                  rawItem.source === "deterministic_fallback" ||
                  rawItem.source === "price_book" ||
                  rawItem.source === "scope_enforcement" ||
                  rawItem.source === "suggested_procedure"
                    ? rawItem.source
                    : metadataDefaults.generation_mode === "manual"
                      ? "manual"
                      : "ai",
                price: rawItem.customer_unit_price,
                cost: rawItem.internal_unit_cost,
                quantity: rawItem.quantity,
                taxable: rawItem.taxable,
                priceBookItemId: cleanNullableText(rawItem.price_book_item_id, 80),
                requiresConfirmation: Boolean(rawItem.requires_confirmation),
                warningCodes: itemWarnings,
                customerVisible: rawItem.customer_visible !== false,
                includedInSummary: rawItem.included_in_summary !== false,
              });
              return {
                ...normalizedItem,
                internal_name: cleanText(rawItem.internal_name, normalizedItem.internal_name, 180),
              };
            })
          : [];

        const solutionWarnings = Array.isArray(rawSolution.warnings)
          ? rawSolution.warnings
              .map((warning): RepairProposalWarning | null => {
                if (!warning || typeof warning !== "object") {
                  return null;
                }
                const candidate = warning as Partial<RepairProposalWarning>;
                if (!isWarningCode(candidate.code)) {
                  return null;
                }
                return createRepairProposalWarning({
                  code: candidate.code,
                  message: cleanText(candidate.message, candidate.code, 260),
                  relatedSolutionId: solutionId,
                  relatedItemId: cleanNullableText(candidate.related_item_id, 80),
                  blockingBeforeSend: Boolean(candidate.blocking_before_send),
                });
              })
              .filter((warning): warning is RepairProposalWarning => Boolean(warning))
          : [];

        return {
          id: solutionId,
          title: cleanText(rawSolution.title, "Repair Solution", 180),
          customer_description: cleanText(
            rawSolution.customer_description,
            "Repair solution prepared from technician-confirmed scope.",
            900,
          ),
          included_work: Array.isArray(rawSolution.included_work)
            ? rawSolution.included_work
                .map((item) => cleanText(item, "", 180))
                .filter(Boolean)
                .slice(0, 12)
            : items.map((item) => item.customer_title).slice(0, 12),
          items,
          recommended: rawSolution.recommended !== false,
          sort_order: Number.isFinite(Number(rawSolution.sort_order))
            ? Number(rawSolution.sort_order)
            : solutionIndex + 1,
          warranty: cleanNullableText(rawSolution.warranty, 500),
          estimated_completion: cleanNullableText(rawSolution.estimated_completion, 160),
          warnings: uniqueWarnings(solutionWarnings),
        };
      })
    : [];

  const draftWarnings = [...warnings];
  repairSolutions.forEach((solution) => {
    solution.items.forEach((item) => {
      item.warning_codes.forEach((code) => {
        draftWarnings.push(
          createRepairProposalWarning({
            code,
            message:
              code === "CUSTOMER_PRICE_REQUIRED"
                ? `${item.customer_title} needs a customer price before sending.`
                : `${item.customer_title} requires technician review before sending.`,
            relatedSolutionId: solution.id,
            relatedItemId: item.id,
          }),
        );
      });
    });
  });

  if (!context.modelNumber) {
    draftWarnings.push(
      createRepairProposalWarning({
        code: "MODEL_NUMBER_MISSING",
        severity: "info",
        message: "Model number is missing. Generation may continue, but confirm parts before sending.",
        blockingBeforeSend: false,
      }),
    );
  }

  return {
    proposal_title: cleanText(raw.proposal_title, "Repair Proposal", 180),
    confirmed_problem_summary: cleanText(
      raw.confirmed_problem_summary,
      context.confirmedRepairScope,
      1000,
    ),
    customer_summary: cleanText(
      raw.customer_summary,
      "A repair proposal was prepared from the technician-confirmed repair scope.",
      1000,
    ),
    repair_solutions: repairSolutions,
    warranty: cleanText(raw.warranty, "Warranty to be confirmed before sending.", 800),
    estimated_completion: cleanNullableText(raw.estimated_completion, 160),
    validity: cleanText(raw.validity, "Proposal valid for 30 days unless otherwise noted.", 240),
    disclaimer: cleanText(
      raw.disclaimer,
      "Final repair is subject to technician confirmation and customer approval.",
      800,
    ),
    warnings: uniqueWarnings(draftWarnings),
    generation_metadata: {
      provider: metadataDefaults.provider ?? metadata.provider ?? "deterministic",
      model: metadataDefaults.model ?? metadata.model ?? null,
      generation_mode:
        metadataDefaults.generation_mode ??
        metadata.generation_mode ??
        "deterministic_fallback",
      language_detected: languageDetected,
      price_book_matches_used: Array.isArray(metadata.price_book_matches_used)
        ? metadata.price_book_matches_used.filter(
            (item): item is string => typeof item === "string" && item.length > 0,
          )
        : [],
      fallback_used: Boolean(metadataDefaults.fallback_used ?? metadata.fallback_used),
      generated_at:
        typeof metadata.generated_at === "string" && metadata.generated_at
          ? metadata.generated_at
          : new Date().toISOString(),
    },
  };
}

export function createEmptyRepairProposalDraft(
  context: RepairProposalContext,
  metadata: RepairProposalGenerationMetadata,
): RepairProposalDraft {
  const solutionId = "solution-manual-1";
  const item = createRepairProposalItem({
    id: "manual-item-1",
    lineType: "custom",
    title: "Technician-confirmed repair item",
    description: "Add the customer-facing repair details before sending.",
    source: metadata.generation_mode === "template" ? "template" : "manual",
    price: 0,
    requiresConfirmation: true,
  });

  return normalizeRepairProposalDraft(
    {
      proposal_title: "Repair Proposal",
      confirmed_problem_summary:
        context.confirmedRepairScope || "Technician repair scope required.",
      customer_summary:
        "A repair proposal draft is ready for the technician to complete.",
      repair_solutions: [
        {
          id: solutionId,
          title: "Repair Solution",
          customer_description: "Add the repair solution details before sending.",
          included_work: [item.customer_title],
          items: [item],
          recommended: true,
          sort_order: 1,
          warranty: null,
          estimated_completion: null,
          warnings: [],
        },
      ],
      warranty: "Warranty to be confirmed before sending.",
      validity: "Proposal valid for 30 days unless otherwise noted.",
      disclaimer: "Final repair is subject to technician confirmation and customer approval.",
      warnings: [],
      generation_metadata: metadata,
    },
    context,
    metadata,
  );
}

export function createManualRepairProposalDraft(
  context: RepairProposalContext,
): RepairProposalDraft {
  return createEmptyRepairProposalDraft(context, {
    provider: "manual",
    model: null,
    generation_mode: "manual",
    language_detected: context.language ?? "unknown",
    price_book_matches_used: [],
    fallback_used: false,
    generated_at: new Date().toISOString(),
  });
}

export function createRepairProposalFromTemplate(
  context: RepairProposalContext,
  template: RepairProposalTemplate,
): RepairProposalDraft {
  const solutionId = "solution-template-1";
  const items = template.items.map((item, index) =>
    createRepairProposalItem({
      id: item.id ?? `template-item-${index + 1}`,
      lineType: normalizeLineType(item.line_type),
      title: item.customer_title,
      description: item.customer_description,
      source: "template",
      price: item.customer_unit_price ?? 0,
      cost: item.internal_unit_cost ?? 0,
      quantity: item.quantity ?? 1,
      taxable: item.taxable,
      priceBookItemId: item.price_book_item_id ?? null,
      requiresConfirmation: item.requires_confirmation ?? true,
      warningCodes: item.warning_codes,
      customerVisible: item.customer_visible ?? true,
      includedInSummary: item.included_in_summary ?? true,
    }),
  );

  return normalizeRepairProposalDraft(
    {
      proposal_title: template.proposalTitle,
      confirmed_problem_summary: context.confirmedRepairScope,
      customer_summary: template.customerSummary,
      repair_solutions: [
        {
          id: solutionId,
          title: template.proposalTitle,
          customer_description: template.customerSummary,
          included_work: items.map((item) => item.customer_title),
          items,
          recommended: true,
          sort_order: 1,
          warranty: template.warranty ?? null,
          estimated_completion: null,
          warnings: [],
        },
      ],
      warranty: template.warranty ?? "Warranty to be confirmed before sending.",
      validity: "Proposal valid for 30 days unless otherwise noted.",
      disclaimer: "Final repair is subject to technician confirmation and customer approval.",
      warnings: [],
      generation_metadata: {
        provider: "template",
        model: null,
        generation_mode: "template",
        language_detected: context.language ?? "unknown",
        price_book_matches_used: items
          .map((item) => item.price_book_item_id)
          .filter((item): item is string => Boolean(item)),
        fallback_used: false,
        generated_at: new Date().toISOString(),
      },
    },
    context,
    { provider: "template", generation_mode: "template" },
  );
}

export function repairProposalDraftToEstimateDraftAgentResult(
  draft: RepairProposalDraft,
): EstimateDraftAgentResult {
  const visibleItems = draft.repair_solutions.flatMap((solution) =>
    solution.items.filter((item) => item.customer_visible),
  );
  const firstSolution = draft.repair_solutions[0];
  const repairIntents: RepairIntent[] = [];
  const confidence = draft.warnings.some((warning) => warning.blocking_before_send)
    ? "medium"
    : "high";

  return {
    title: draft.proposal_title,
    customerDescription: draft.customer_summary,
    repairScope: {
      scopeKey: firstSolution?.id ?? "repair-proposal",
      serviceCategory: "Repair Proposal",
      repairGroup: firstSolution?.title ?? draft.proposal_title,
      repairItem: firstSolution?.title ?? draft.proposal_title,
      customerSummary: draft.customer_summary,
    },
    diagnosisNormalization: {
      providerMode:
        draft.generation_metadata.provider === "openai" ||
        draft.generation_metadata.provider === "anthropic"
          ? "cheap_ai"
          : "local",
      detectedLanguage: draft.generation_metadata.language_detected,
      normalizedEnglishDiagnosis: draft.confirmed_problem_summary,
      repairIntents,
      confidence,
      matchedTerms: draft.repair_solutions.flatMap((solution) =>
        solution.items.map((item) => item.customer_title),
      ),
    },
    lines: visibleItems.map((item) => ({
      lineType:
        item.line_type === "service" || item.line_type === "fee"
          ? "custom"
          : item.line_type,
      customerName: item.customer_title,
      internalName: item.internal_name,
      quantity: item.quantity,
      unitPrice: item.customer_unit_price,
      unitCost: item.internal_unit_cost,
      publicDescription: item.customer_description,
      taxable: item.taxable,
      notes:
        item.warning_codes.length > 0
          ? item.warning_codes.join(", ")
          : item.customer_description,
    })),
    warrantyText: draft.warranty,
    internalNotes:
      draft.warnings.length > 0
        ? `Repair Proposal warnings: ${draft.warnings.map((warning) => warning.code).join(", ")}`
        : "Repair Proposal generated from technician-confirmed scope.",
    confidence,
    sourceReason: `Repair Proposal contract generated by ${draft.generation_metadata.provider}.`,
  };
}
