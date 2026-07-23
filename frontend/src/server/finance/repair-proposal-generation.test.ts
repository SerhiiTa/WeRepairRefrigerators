import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicRepairProposalDraft,
  generateRepairProposalDraft,
  type RepairProposalProviderCall,
} from "./repair-proposal-providers.ts";
import {
  createManualRepairProposalDraft,
  createRepairProposalFromTemplate,
} from "./repair-proposal-schema.ts";

function titles(result: Awaited<ReturnType<typeof generateRepairProposalDraft>>) {
  return result.proposalDraft.repair_solutions.flatMap((solution) =>
    solution.items.map((item) => item.customer_title.toLowerCase()),
  );
}

function hasTitle(allTitles: string[], expected: string) {
  return allTitles.some((title) => title.includes(expected));
}

test("English compressor scope preserves compressor, filter drier, evacuation, recharge, and labor", () => {
  const draft = createDeterministicRepairProposalDraft({
    confirmedRepairScope:
      "Replace the compressor, filter drier, evacuate and recharge the system.",
    applianceType: "Refrigerator",
    brand: "LG",
    modelNumber: "LRF123",
  });
  const allTitles = draft.repair_solutions.flatMap((solution) =>
    solution.items.map((item) => item.customer_title.toLowerCase()),
  );

  assert.ok(hasTitle(allTitles, "compressor"));
  assert.ok(hasTitle(allTitles, "filter drier"));
  assert.ok(hasTitle(allTitles, "evacuate"));
  assert.ok(hasTitle(allTitles, "refrigerant recharge"));
  assert.ok(hasTitle(allTitles, "compressor replacement labor"));
});

test("Russian evaporator sealed-system scope creates explicit required lines and review procedures", async () => {
  const result = await generateRepairProposalDraft(
    {
      confirmedRepairScope:
        "дырка в эвапорейторе и надо ставить новый эвапорейтор, фильтр-драйер, сервис-вальв в компрессор и перезаправлять систему фреоном",
      applianceType: "Refrigerator",
      brand: "LG",
      modelNumber: null,
      preferredProvider: "deterministic",
    },
    {},
  );
  const allTitles = titles(result);

  assert.ok(hasTitle(allTitles, "evaporator"));
  assert.ok(hasTitle(allTitles, "filter drier"));
  assert.ok(hasTitle(allTitles, "service valve"));
  assert.ok(hasTitle(allTitles, "refrigerant recharge"));
  assert.ok(hasTitle(allTitles, "evaporator replacement labor"));
  assert.ok(hasTitle(allTitles, "refrigerant recovery"));
  assert.ok(hasTitle(allTitles, "nitrogen pressure test"));
  assert.ok(hasTitle(allTitles, "sealed-system leak test"));
  assert.ok(hasTitle(allTitles, "cooling performance verification"));
  assert.ok(
    result.proposalDraft.warnings.some(
      (warning) => warning.code === "MODEL_NUMBER_MISSING",
    ),
  );
});

test("Mixed dispenser scope preserves water valve and frozen tubing service", async () => {
  const result = await generateRepairProposalDraft({
    confirmedRepairScope:
      "Не идет вода с диспенсера. Надо менять water valve и разморозить tubing подачи воды.",
    applianceType: "Refrigerator",
    preferredProvider: "deterministic",
  });
  const allTitles = titles(result);

  assert.ok(hasTitle(allTitles, "water inlet valve"));
  assert.ok(hasTitle(allTitles, "thaw frozen dispenser water line"));
  assert.ok(hasTitle(allTitles, "diagnostic"));
});

test("Ukrainian compressor scope preserves compressor, filter drier, vacuum, and refrigerant", async () => {
  const result = await generateRepairProposalDraft({
    confirmedRepairScope:
      "Потрібно замінити компресор, фільтр-осушувач, вакуумувати систему та заправити холодоагент.",
    applianceType: "Refrigerator",
    preferredProvider: "deterministic",
  });
  const allTitles = titles(result);

  assert.ok(hasTitle(allTitles, "compressor"));
  assert.ok(hasTitle(allTitles, "filter drier"));
  assert.ok(hasTitle(allTitles, "evacuate"));
  assert.ok(hasTitle(allTitles, "refrigerant recharge"));
});

test("deterministic fallback runs without API providers", async () => {
  const result = await generateRepairProposalDraft({
    confirmedRepairScope: "Replace evaporator fan motor.",
    applianceType: "Refrigerator",
    preferredProvider: "deterministic",
  });

  assert.equal(result.provider, "deterministic");
  assert.equal(result.fallbackUsed, true);
  assert.ok(hasTitle(titles(result), "evaporator fan motor"));
});

test("OpenAI failure falls back to Anthropic provider", async () => {
  const openai: RepairProposalProviderCall = async () => {
    throw new Error("openai_down");
  };
  const anthropic: RepairProposalProviderCall = async () => ({
    provider: "anthropic",
    model: "mock-claude",
    rawDraft: {
      proposal_title: "Compressor repair",
      confirmed_problem_summary: "Replace compressor.",
      customer_summary: "Replace the compressor.",
      repair_solutions: [
        {
          id: "solution-1",
          title: "Compressor repair",
          customer_description: "Replace the compressor.",
          included_work: ["Compressor"],
          recommended: true,
          sort_order: 1,
          warranty: null,
          estimated_completion: null,
          warnings: [],
          items: [],
        },
      ],
      warranty: "Warranty to be confirmed.",
      validity: "30 days",
      disclaimer: "Subject to approval.",
      warnings: [],
      generation_metadata: {
        provider: "anthropic",
        model: "mock-claude",
        generation_mode: "ai",
        language_detected: "english",
        price_book_matches_used: [],
        fallback_used: false,
        generated_at: new Date().toISOString(),
      },
    },
  });

  const result = await generateRepairProposalDraft(
    {
      confirmedRepairScope: "Replace compressor.",
      applianceType: "Refrigerator",
      modelNumber: "LFX",
    },
    { openai, anthropic },
  );

  assert.equal(result.provider, "anthropic");
  assert.equal(result.fallbackUsed, true);
  assert.ok(hasTitle(titles(result), "compressor"));
});

test("both AI providers fail then deterministic fallback preserves scope", async () => {
  const fail: RepairProposalProviderCall = async () => {
    throw new Error("provider_down");
  };
  const result = await generateRepairProposalDraft(
    {
      confirmedRepairScope: "Replace filter drier and recharge refrigerant.",
      applianceType: "Refrigerator",
    },
    { openai: fail, anthropic: fail },
  );

  assert.equal(result.provider, "deterministic");
  assert.ok(hasTitle(titles(result), "filter drier"));
  assert.ok(hasTitle(titles(result), "refrigerant recharge"));
});

test("invalid provider JSON falls through to deterministic fallback", async () => {
  const invalid: RepairProposalProviderCall = async () => ({
    provider: "openai",
    model: "mock",
    rawDraft: "not an object",
  });
  const fail: RepairProposalProviderCall = async () => {
    throw new Error("anthropic_down");
  };

  const result = await generateRepairProposalDraft(
    {
      confirmedRepairScope: "Replace water valve.",
      applianceType: "Refrigerator",
    },
    { openai: invalid, anthropic: fail },
  );

  assert.equal(result.provider, "deterministic");
  assert.ok(hasTitle(titles(result), "water inlet valve"));
});

test("missing model number is a non-blocking warning", async () => {
  const result = await generateRepairProposalDraft({
    confirmedRepairScope: "Replace compressor.",
    applianceType: "Refrigerator",
    modelNumber: null,
    preferredProvider: "deterministic",
  });

  const warning = result.proposalDraft.warnings.find(
    (item) => item.code === "MODEL_NUMBER_MISSING",
  );
  assert.ok(warning);
  assert.equal(warning.blocking_before_send, false);
});

test("missing prices block send but not generation", async () => {
  const result = await generateRepairProposalDraft({
    confirmedRepairScope: "Replace evaporator fan motor.",
    applianceType: "Refrigerator",
    preferredProvider: "deterministic",
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.proposalDraft.warnings.some(
      (warning) =>
        warning.code === "CUSTOMER_PRICE_REQUIRED" &&
        warning.blocking_before_send,
    ),
  );
});

test("manual factory creates a valid editable draft without AI", () => {
  const draft = createManualRepairProposalDraft({
    confirmedRepairScope: "Technician will add repair scope manually.",
    applianceType: "Refrigerator",
  });

  assert.equal(draft.generation_metadata.provider, "manual");
  assert.equal(draft.generation_metadata.generation_mode, "manual");
  assert.equal(draft.repair_solutions.length, 1);
  assert.equal(draft.repair_solutions[0].items.length, 1);
  assert.ok(
    draft.warnings.some(
      (warning) => warning.code === "CUSTOMER_PRICE_REQUIRED",
    ),
  );
});

test("template factory preserves template items and Price Book references", () => {
  const draft = createRepairProposalFromTemplate(
    {
      confirmedRepairScope: "Replace dryer heating element.",
      applianceType: "Dryer",
      modelNumber: "D123",
    },
    {
      proposalTitle: "Dryer heating repair",
      customerSummary: "Replace the failed dryer heating element.",
      warranty: "90-day installed part warranty.",
      items: [
        {
          customer_title: "Dryer heating element",
          line_type: "part",
          customer_unit_price: 185,
          price_book_item_id: "price-book-item-1",
          requires_confirmation: true,
        },
      ],
    },
  );

  assert.equal(draft.generation_metadata.provider, "template");
  assert.equal(
    draft.repair_solutions[0].items[0].price_book_item_id,
    "price-book-item-1",
  );
  assert.equal(draft.repair_solutions[0].items[0].customer_unit_price, 185);
});
