import {
  createRepairProposalItem,
  createRepairProposalWarning,
  type RepairProposalContext,
  type RepairProposalDraft,
  type RepairProposalItem,
  type RepairProposalLineType,
  type RepairProposalWarningCode,
} from "./repair-proposal-schema";

export type ExplicitRepairScopeItem = {
  key: string;
  lineType: RepairProposalLineType;
  title: string;
  description: string;
  taxable?: boolean;
  suggested?: boolean;
  warningCodes?: RepairProposalWarningCode[];
};

export type ExplicitRepairScope = {
  language: "english" | "russian" | "ukrainian" | "mixed" | "unknown";
  explicitItems: ExplicitRepairScopeItem[];
  suggestedProcedures: ExplicitRepairScopeItem[];
  matchedTerms: string[];
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function hasRegex(text: string, regex: RegExp): boolean {
  return regex.test(text);
}

function addUnique(
  collection: ExplicitRepairScopeItem[],
  item: ExplicitRepairScopeItem,
) {
  if (!collection.some((existing) => existing.key === item.key)) {
    collection.push(item);
  }
}

function detectLanguage(text: string): ExplicitRepairScope["language"] {
  const hasCyrillic = /[а-яіїєґ]/i.test(text);
  const hasUkrainian = /[іїєґ]/i.test(text);
  const hasEnglish = /[a-z]/i.test(text);

  if (hasCyrillic && hasEnglish) {
    return "mixed";
  }
  if (hasUkrainian) {
    return "ukrainian";
  }
  if (hasCyrillic) {
    return "russian";
  }
  if (hasEnglish) {
    return "english";
  }
  return "unknown";
}

export function extractExplicitRepairScope(input: string): ExplicitRepairScope {
  const text = normalize(input);
  const explicitItems: ExplicitRepairScopeItem[] = [];
  const suggestedProcedures: ExplicitRepairScopeItem[] = [];
  const matchedTerms: string[] = [];

  const hasReplace = hasAny(text, [
    "replace",
    "replacement",
    "change",
    "install",
    "ставить",
    "ставит",
    "замен",
    "менять",
    "поменять",
    "замін",
    "міняти",
    "встановити",
  ]);
  const hasSealedSystemContext = hasAny(text, [
    "sealed system",
    "compressor",
    "компрессор",
    "компресор",
    "evaporator",
    "эвапорейтор",
    "евик",
    "испарител",
    "випарник",
    "фреон",
    "refrigerant",
    "холодоагент",
  ]);
  const hasEvaporator = hasAny(text, [
    "evaporator",
    "эвапорейтор",
    "евик",
    "испарител",
    "випарник",
  ]);
  const hasCompressor = hasAny(text, [
    "compressor",
    "компрессор",
    "компресор",
  ]);
  const hasFilterDrier = hasAny(text, [
    "filter drier",
    "filter-drier",
    "filter dryer",
    "фильтр-драйер",
    "фильтр драйер",
    "фильтр-осуш",
    "фільтр-осуш",
    "осушувач",
  ]);
  const hasServiceValve = hasAny(text, [
    "service valve",
    "service-valve",
    "сервис-вальв",
    "сервис вальв",
    "сервіс-вальв",
    "сервіс вальв",
  ]);
  const hasRecharge = hasAny(text, [
    "recharge",
    "charging",
    "перезаправ",
    "заправ",
    "фреон",
    "refrigerant",
    "холодоагент",
  ]);
  const hasVacuum = hasAny(text, [
    "evacuate",
    "evacuation",
    "vacuum",
    "вакуум",
    "вакум",
    "вакуумувати",
  ]);
  const hasHoleOrLeak = hasAny(text, [
    "hole",
    "leak",
    "дырка",
    "утеч",
    "витік",
    "пробит",
  ]);

  if (hasEvaporator && (hasReplace || hasHoleOrLeak)) {
    matchedTerms.push("evaporator replacement scope");
    addUnique(explicitItems, {
      key: "evaporator",
      lineType: "part",
      title: "Evaporator",
      description:
        "Replace the failed evaporator specified by the technician.",
      taxable: true,
      warningCodes: ["PART_NUMBER_UNCONFIRMED"],
    });
    addUnique(explicitItems, {
      key: "evaporator-replacement-labor",
      lineType: "labor",
      title: "Evaporator replacement labor",
      description:
        "Labor to remove the failed evaporator and install the replacement evaporator.",
      taxable: false,
    });
  }

  if (hasCompressor && hasReplace) {
    matchedTerms.push("compressor replacement scope");
    addUnique(explicitItems, {
      key: "compressor",
      lineType: "part",
      title: "Compressor",
      description: "Replace the compressor specified by the technician.",
      taxable: true,
      warningCodes: ["PART_NUMBER_UNCONFIRMED"],
    });
    addUnique(explicitItems, {
      key: "compressor-replacement-labor",
      lineType: "labor",
      title: "Compressor replacement labor",
      description:
        "Labor to remove the failed compressor and install the replacement compressor.",
      taxable: false,
    });
  }

  if (hasFilterDrier) {
    matchedTerms.push("filter drier");
    addUnique(explicitItems, {
      key: "filter-drier",
      lineType: "part",
      title: "Filter drier",
      description: "Replace the filter drier as part of the sealed-system repair.",
      taxable: true,
      warningCodes: ["PART_NUMBER_UNCONFIRMED"],
    });
  }

  if (hasServiceValve) {
    matchedTerms.push("service valve");
    addUnique(explicitItems, {
      key: "service-valve",
      lineType: "service",
      title: "Service valve",
      description:
        "Install or service the valve specified by the technician for sealed-system access.",
      taxable: false,
      warningCodes: ["PART_NUMBER_UNCONFIRMED"],
    });
  }

  if (hasRecharge && hasSealedSystemContext) {
    matchedTerms.push("refrigerant recharge");
    addUnique(explicitItems, {
      key: "refrigerant-recharge",
      lineType: "material",
      title: "Refrigerant recharge",
      description:
        "Recharge the sealed system with refrigerant after the confirmed repair scope is completed.",
      taxable: true,
    });
  }

  if (hasVacuum && hasSealedSystemContext) {
    matchedTerms.push("evacuation/vacuum");
    addUnique(explicitItems, {
      key: "evacuation",
      lineType: "service",
      title: "Evacuate and vacuum sealed system",
      description:
        "Evacuate and vacuum the sealed system as explicitly stated by the technician.",
      taxable: false,
    });
  }

  if (
    hasAny(text, ["water valve", "water inlet valve", "вотер валв", "водяной клапан"])
  ) {
    matchedTerms.push("water valve");
    addUnique(explicitItems, {
      key: "water-valve",
      lineType: "part",
      title: "Water inlet valve",
      description:
        "Replace the dispenser or water inlet valve specified by the technician.",
      taxable: true,
      warningCodes: ["PART_NUMBER_UNCONFIRMED"],
    });
  }

  if (
    hasAny(text, ["tubing", "water line", "трубоч", "линия воды", "подачи воды"]) &&
    hasAny(text, ["thaw", "defrost", "размороз", "замерз", "frozen"])
  ) {
    matchedTerms.push("frozen dispenser water line");
    addUnique(explicitItems, {
      key: "frozen-dispenser-line",
      lineType: "service",
      title: "Thaw frozen dispenser water line",
      description:
        "Thaw the frozen dispenser water tubing specified by the technician.",
      taxable: false,
    });
  }

  if (
    hasAny(text, ["heater", "heating", "хитинг", "нагрев", "defrost heater"]) &&
    (hasEvaporator || hasAny(text, ["ice", "iced", "defrost", "льд", "лед", "размороз"]))
  ) {
    matchedTerms.push("defrost heater");
    addUnique(explicitItems, {
      key: "defrost-heater",
      lineType: "part",
      title: "Defrost heater",
      description:
        "Replace the evaporator defrost heater/heating element specified by the technician.",
      taxable: true,
      warningCodes: ["PART_NUMBER_UNCONFIRMED"],
    });
  }

  if (hasEvaporator && hasRegex(text, /(fan|ф[эе]н|вентилятор)/i)) {
    matchedTerms.push("evaporator fan");
    addUnique(explicitItems, {
      key: "evaporator-fan",
      lineType: "part",
      title: "Evaporator fan motor",
      description: "Replace the evaporator fan motor specified by the technician.",
      taxable: true,
      warningCodes: ["PART_NUMBER_UNCONFIRMED"],
    });
  }

  if (hasEvaporator && hasAny(text, ["manual defrost", "размороз", "ice", "льд", "лед"])) {
    matchedTerms.push("manual evaporator defrost");
    addUnique(explicitItems, {
      key: "manual-evaporator-defrost",
      lineType: "service",
      title: "Manual evaporator defrost service",
      description: "Manually defrost the evaporator and remove ice buildup.",
      taxable: false,
    });
  }

  if (explicitItems.length > 0) {
    addUnique(explicitItems, {
      key: "diagnostic-reassembly-testing-labor",
      lineType: "labor",
      title: "Diagnostic, reassembly, and testing labor",
      description:
        "Diagnostic verification, reassembly, and performance testing after the technician-confirmed repair.",
      taxable: false,
    });
  }

  if (hasSealedSystemContext && (hasEvaporator || hasCompressor || hasRecharge)) {
    [
      ["recovery", "Refrigerant recovery"],
      ["nitrogen-pressure-test", "Nitrogen pressure test"],
      ["sealed-system-leak-test", "Sealed-system leak test"],
      ["evacuation-review", "System evacuation"],
      ["final-recharge-review", "Final refrigerant recharge"],
      ["cooling-performance-test", "Cooling performance verification"],
    ].forEach(([key, title]) => {
      addUnique(suggestedProcedures, {
        key,
        lineType: "service",
        title,
        description:
          "Suggested sealed-system procedure for technician review before sending.",
        taxable: false,
        suggested: true,
        warningCodes: ["SUGGESTED_PROCEDURE_REVIEW_REQUIRED"],
      });
    });
  }

  return {
    language: detectLanguage(input),
    explicitItems,
    suggestedProcedures,
    matchedTerms,
  };
}

function itemMatchesScope(item: RepairProposalItem, scopeItem: ExplicitRepairScopeItem) {
  const haystack = `${item.customer_title} ${item.internal_name} ${item.customer_description}`.toLowerCase();
  return scopeItem.title
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .every((token) => haystack.includes(token)) || haystack.includes(scopeItem.key.replace(/-/g, " "));
}

export function enforceRepairProposalScope({
  draft,
  context,
  scope,
}: {
  draft: RepairProposalDraft;
  context: RepairProposalContext;
  scope: ExplicitRepairScope;
}): RepairProposalDraft {
  const solution = draft.repair_solutions[0] ?? {
    id: "solution-scope-1",
    title: "Repair Solution",
    customer_description:
      "Repair solution prepared from technician-confirmed scope.",
    included_work: [],
    items: [],
    recommended: true,
    sort_order: 1,
    warranty: null,
    estimated_completion: null,
    warnings: [],
  };
  const existingItems = [...solution.items];
  const addedItems: RepairProposalItem[] = [];

  scope.explicitItems.forEach((scopeItem, index) => {
    if (existingItems.some((item) => itemMatchesScope(item, scopeItem))) {
      return;
    }

    addedItems.push(
      createRepairProposalItem({
        id: `scope-${scopeItem.key}-${index + 1}`,
        lineType: scopeItem.lineType,
        title: scopeItem.title,
        description: scopeItem.description,
        source: "scope_enforcement",
        price: 0,
        taxable: scopeItem.taxable,
        requiresConfirmation: true,
        warningCodes: scopeItem.warningCodes,
      }),
    );
  });

  const suggestedItems = scope.suggestedProcedures
    .filter((scopeItem) => !existingItems.some((item) => itemMatchesScope(item, scopeItem)))
    .map((scopeItem, index) =>
      createRepairProposalItem({
        id: `suggested-${scopeItem.key}-${index + 1}`,
        lineType: scopeItem.lineType,
        title: scopeItem.title,
        description: scopeItem.description,
        source: "suggested_procedure",
        price: 0,
        taxable: scopeItem.taxable,
        requiresConfirmation: true,
        customerVisible: false,
        includedInSummary: false,
        warningCodes: scopeItem.warningCodes ?? ["SUGGESTED_PROCEDURE_REVIEW_REQUIRED"],
      }),
    );

  const repairedSolution = {
    ...solution,
    title:
      solution.title === "Repair Solution" && scope.explicitItems.length > 0
        ? `${scope.explicitItems[0].title} repair`
        : solution.title,
    items: [...existingItems, ...addedItems, ...suggestedItems],
    included_work: Array.from(
      new Set([
        ...solution.included_work,
        ...scope.explicitItems.map((item) => item.title),
      ]),
    ),
    warnings: [
      ...solution.warnings,
      ...suggestedItems.map((item) =>
        createRepairProposalWarning({
          code: "SUGGESTED_PROCEDURE_REVIEW_REQUIRED",
          message: `${item.customer_title} is suggested for technician review before sending.`,
          relatedSolutionId: solution.id,
          relatedItemId: item.id,
          blockingBeforeSend: false,
        }),
      ),
    ],
  };

  return {
    ...draft,
    proposal_title:
      draft.proposal_title === "Repair Proposal" && repairedSolution.title
        ? repairedSolution.title
        : draft.proposal_title,
    repair_solutions: [repairedSolution, ...draft.repair_solutions.slice(1)],
    warnings: [
      ...draft.warnings,
      ...addedItems.flatMap((item) =>
        item.warning_codes.map((code) =>
          createRepairProposalWarning({
            code,
            message: `${item.customer_title} was preserved from technician scope and needs review before sending.`,
            relatedSolutionId: repairedSolution.id,
            relatedItemId: item.id,
          }),
        ),
      ),
      ...suggestedItems.map((item) =>
        createRepairProposalWarning({
          code: "SUGGESTED_PROCEDURE_REVIEW_REQUIRED",
          message: `${item.customer_title} is suggested for technician review before sending.`,
          relatedSolutionId: repairedSolution.id,
          relatedItemId: item.id,
          blockingBeforeSend: false,
        }),
      ),
    ],
    generation_metadata: {
      ...draft.generation_metadata,
      language_detected:
        draft.generation_metadata.language_detected === "unknown"
          ? scope.language
          : draft.generation_metadata.language_detected,
    },
    confirmed_problem_summary: draft.confirmed_problem_summary || context.confirmedRepairScope,
  };
}
