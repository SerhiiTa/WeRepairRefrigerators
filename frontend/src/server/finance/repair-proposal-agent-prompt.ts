import type { RankedRepairSolution } from "@/server/price-book/selection";

import type { ExplicitRepairScope } from "./repair-proposal-scope";
import type { RepairProposalContext } from "./repair-proposal-schema";

export const REPAIR_PROPOSAL_SYSTEM_PROMPT = `You are WRA's professional Repair Proposal writer.

Core authority rules:
- The technician-confirmed repair scope is the single source of truth.
- You are not allowed to diagnose appliances.
- You are not allowed to determine repair scope.
- You are not allowed to replace technician decisions.
- You format Repair Proposals. You do not create repairs.
- Expand only the language. Do not expand the repair itself.
- Only rewrite operations explicitly provided by the technician or included in explicit_scope_items.
- Do not infer failed compressors, boards, fans, heaters, valves, pumps, evaporators, sealed-system work, or any other components from symptoms.
- Do not invent prices, quantities, part numbers, warranties, discounts, taxes, or internal costs.
- If required data is missing, return warnings and placeholders instead of making assumptions.
- Preserve every explicit repair action. If the technician says replace X, create a line for X unless unsafe/impossible.
- Do not merge explicitly named replacement parts into vague labor.
- Customer-facing language must be professional and clear. Internal bundle, Price Book, AI, confidence, cost, and vendor details must not be exposed as customer copy.

Return strict JSON only using the provided schema shape. No markdown. No commentary. No hidden reasoning.`;

export function buildRepairProposalUserPrompt({
  context,
  explicitScope,
  priceBookCandidates,
}: {
  context: RepairProposalContext;
  explicitScope: ExplicitRepairScope;
  priceBookCandidates: RankedRepairSolution[];
}) {
  return JSON.stringify({
    task: "Create a structured customer-facing Repair Proposal draft from technician-confirmed scope only.",
    schema_contract: {
      proposal_title: "string",
      confirmed_problem_summary: "string",
      customer_summary: "string",
      repair_solutions: [
        {
          id: "string",
          title: "string",
          customer_description: "string",
          included_work: ["string"],
          recommended: true,
          sort_order: 1,
          warranty: "string|null",
          estimated_completion: "string|null",
          warnings: [],
          items: [
            {
              id: "string",
              line_type: "labor|part|material|service|fee|custom",
              internal_name: "string",
              customer_title: "string",
              customer_description: "string",
              quantity: 1,
              customer_unit_price: 0,
              internal_unit_cost: 0,
              taxable: false,
              customer_visible: true,
              included_in_summary: true,
              price_book_item_id: "string|null",
              source: "ai|price_book",
              requires_confirmation: true,
              warning_codes: ["CUSTOMER_PRICE_REQUIRED", "TECHNICIAN_CONFIRMATION_REQUIRED"],
            },
          ],
        },
      ],
      warranty: "string",
      estimated_completion: "string|null",
      validity: "string",
      disclaimer: "string",
      warnings: [
        {
          code: "MODEL_NUMBER_MISSING|CUSTOMER_PRICE_REQUIRED|INTERNAL_COST_MISSING|TECHNICIAN_CONFIRMATION_REQUIRED|PRICE_BOOK_MATCH_UNCONFIRMED|WARRANTY_NOT_CONFIGURED|PART_NUMBER_UNCONFIRMED|SUGGESTED_PROCEDURE_REVIEW_REQUIRED",
          severity: "info|warning|blocking",
          message: "string",
          related_solution_id: "string|null",
          related_item_id: "string|null",
          blocking_before_send: false,
        },
      ],
      generation_metadata: {
        provider: "openai|anthropic",
        model: "string|null",
        generation_mode: "ai",
        language_detected: "english|russian|ukrainian|spanish|mixed|unknown",
        price_book_matches_used: ["string"],
        fallback_used: false,
        generated_at: "ISO string",
      },
    },
    required_warning_rules: [
      "Missing model number is MODEL_NUMBER_MISSING and does not block generation.",
      "Missing customer price is CUSTOMER_PRICE_REQUIRED and blocks send, but not generate/save.",
      "Missing internal cost is INTERNAL_COST_MISSING and does not block customer send by itself.",
      "Unconfirmed Price Book match is PRICE_BOOK_MATCH_UNCONFIRMED.",
      "Unconfirmed part number is PART_NUMBER_UNCONFIRMED.",
    ],
    price_book_rules: [
      "Use only provided price_book_candidates.",
      "If a candidate clearly matches an explicit item, preserve price_book_item_id and use its totalPrice as customer_unit_price only if it matches the item scope.",
      "Do not create approved Price Book records.",
      "Do not fake Price Book matches.",
      "If no candidate matches, return price_book_item_id null and CUSTOMER_PRICE_REQUIRED.",
    ],
    explicit_scope_items: explicitScope.explicitItems,
    suggested_procedures_for_technician_review: explicitScope.suggestedProcedures,
    matched_terms: explicitScope.matchedTerms,
    price_book_candidates: priceBookCandidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      item_type: candidate.itemType,
      total_price: candidate.totalPrice,
      appliance_type: candidate.applianceType,
      appliance_group: candidate.applianceGroupName,
      brand: candidate.brand,
      customer_description: candidate.customerDescription,
      score: candidate.score,
      match_reasons: candidate.matchReasons,
    })),
    job_context: {
      service_request_id: context.serviceRequestId,
      customer_name: context.customerName,
      appliance_type: context.applianceType,
      brand: context.brand,
      model_number: context.modelNumber,
      customer_complaint: context.customerComplaint,
      confirmed_repair_scope: context.confirmedRepairScope,
      language_hint: context.language,
    },
  });
}
