export type EstimateDraftLineType =
  | "labor"
  | "part"
  | "material"
  | "custom"
  | "warranty";

export type DiagnosisLanguage =
  | "english"
  | "russian"
  | "ukrainian"
  | "spanish"
  | "mixed"
  | "unknown";

export type RepairIntent =
  | "cooling_failure"
  | "evaporator_fan_failure"
  | "condenser_fan_failure"
  | "evaporator_iced_over"
  | "manual_defrost_required"
  | "defrost_heater_replacement"
  | "drain_restriction"
  | "drain_pump_failure"
  | "door_boot_leak"
  | "heating_element_failure"
  | "control_board_failure"
  | "start_relay_failure"
  | "ice_maker_failure"
  | "water_inlet_valve_replacement"
  | "frozen_dispenser_water_line"
  | "sealed_system_failure_suspected"
  | "compressor_replacement_suspected"
  | "advanced_cooling_system_diagnosis";

export type DiagnosisNormalizationProviderMode =
  | "local"
  | "cheap_ai"
  | "advanced_ai";

export type DiagnosisNormalizationContext = {
  applianceType?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  customerProblem?: string | null;
  technicianNotes?: string[];
};

export type DiagnosisNormalizationResult = {
  providerMode: DiagnosisNormalizationProviderMode;
  detectedLanguage: DiagnosisLanguage;
  normalizedEnglishDiagnosis: string;
  repairIntents: RepairIntent[];
  confidence: "high" | "medium" | "low";
  matchedTerms: string[];
};

export type DiagnosisNormalizerProvider = {
  mode: DiagnosisNormalizationProviderMode;
  normalizeDiagnosis: (
    input: string,
    context?: DiagnosisNormalizationContext,
  ) => DiagnosisNormalizationResult;
};

export type EstimateDraftAgentInput = {
  applianceType: string | null;
  brand: string | null;
  modelNumber?: string | null;
  customerProblem?: string | null;
  technicianDiagnosis: string;
  technicianNotes?: string[];
  photoContext?: {
    customerPhotoCount?: number;
    technicianPhotoCount?: number;
    applianceLabelPhotoAvailable?: boolean;
  };
  normalizerMode?: DiagnosisNormalizationProviderMode;
};

export type EstimateDraftAgentLine = {
  lineType: EstimateDraftLineType;
  customerName: string;
  internalName: string;
  quantity?: number;
  unitPrice: number;
  unitCost: number;
  publicDescription?: string | null;
  taxable?: boolean;
  notes: string | null;
};

export type EstimateDraftAgentResult = {
  title: string;
  customerDescription: string;
  repairScope: {
    scopeKey: string;
    serviceCategory: string;
    repairGroup: string;
    repairItem: string;
    customerSummary: string;
  };
  diagnosisNormalization: DiagnosisNormalizationResult;
  lines: EstimateDraftAgentLine[];
  warrantyText: string;
  internalNotes: string;
  confidence: "high" | "medium" | "low";
  sourceReason: string;
};

type IntentDefinition = {
  intent: RepairIntent;
  normalizedPhrase: string;
  terms: string[];
};

type DraftPattern = {
  requiredIntents: RepairIntent[];
  optionalIntents?: RepairIntent[];
  title: string;
  serviceCategory: string;
  repairGroup: string;
  repairItem: string;
  customerDescription: string;
  lines: EstimateDraftAgentLine[];
  confidence: EstimateDraftAgentResult["confidence"];
  sourceReason: string;
};

const standardWarrantyLine: EstimateDraftAgentLine = {
  lineType: "warranty",
  customerName: "Standard Repair Warranty",
  internalName: "Standard workmanship warranty",
  unitPrice: 0,
  unitCost: 0,
  notes:
    "90 days labor and installed parts unless otherwise specified on the estimate.",
};

const intentDefinitions: IntentDefinition[] = [
  {
    intent: "cooling_failure",
    normalizedPhrase: "cooling failure",
    terms: [
      "not cooling",
      "no cooling",
      "warm refrigerator",
      "warm fridge",
      "не холодит",
      "не охлаждает",
      "не морозить",
      "не охолоджує",
      "no enfria",
      "no enfría",
      "no congela",
    ],
  },
  {
    intent: "evaporator_fan_failure",
    normalizedPhrase: "evaporator fan failure",
    terms: [
      "evaporator fan",
      "evap fan",
      "evaporator fan failed",
      "evaporator fan not working",
      "эвапорейтор фэн",
      "евапорейтор фен",
      "вентилятор испарителя",
      "вентилятор випарника",
      "випарник вентилятор",
      "ventilador del evaporador",
      "ventilador evaporador",
    ],
  },
  {
    intent: "condenser_fan_failure",
    normalizedPhrase: "condenser fan failure",
    terms: [
      "condenser fan",
      "condensor fan",
      "condenser fan failed",
      "вентилятор конденсатора",
      "конденсер фэн",
      "конденсор фен",
      "ventilador del condensador",
      "ventilador condensador",
    ],
  },
  {
    intent: "evaporator_iced_over",
    normalizedPhrase: "evaporator iced over",
    terms: [
      "evaporator iced",
      "evaporator full of ice",
      "iced over evaporator",
      "ice on evaporator",
      "эвапорейтор ото льда",
      "эвапорейтор от льда",
      "испаритель во льду",
      "испаритель в льду",
      "весь эвапорейтор ото льда",
      "весь эвапорейтор от льда",
      "випарник у льоду",
      "лід на випарнику",
      "evaporador con hielo",
      "evaporador lleno de hielo",
      "hielo en evaporador",
    ],
  },
  {
    intent: "manual_defrost_required",
    normalizedPhrase: "manual defrost required",
    terms: [
      "manual defrost",
      "defrost evaporator",
      "needs defrost",
      "разморозить",
      "надо разморозить",
      "ручная разморозка",
      "розморозити",
      "ручне розморожування",
      "descongelar",
      "descongelacion manual",
      "descongelación manual",
    ],
  },
  {
    intent: "drain_restriction",
    normalizedPhrase: "drain restriction",
    terms: [
      "clogged drain",
      "blocked drain",
      "drain restriction",
      "забитый дренаж",
      "засор дренажа",
      "забитий дренаж",
      "drenaje tapado",
      "drenaje obstruido",
    ],
  },
  {
    intent: "drain_pump_failure",
    normalizedPhrase: "drain pump failure",
    terms: [
      "drain pump",
      "not draining",
      "won't drain",
      "wont drain",
      "сливной насос",
      "не сливает",
      "дренажный насос",
      "зливний насос",
      "не зливає",
      "bomba de drenaje",
      "bomba de desague",
      "bomba de desagüe",
      "no drena",
    ],
  },
  {
    intent: "door_boot_leak",
    normalizedPhrase: "door boot leak",
    terms: [
      "door boot",
      "leaking from door boot",
      "door gasket leak",
      "leaking from door",
      "манжета люка",
      "течет из дверцы",
      "тече з дверей",
      "goma de puerta",
      "fuelle de puerta",
      "fuga por la puerta",
      "lavadora leaking from door boot",
    ],
  },
  {
    intent: "heating_element_failure",
    normalizedPhrase: "heating element failure",
    terms: [
      "heating element",
      "not heating",
      "no heat",
      "элемент нагрева",
      "тэн",
      "не греет",
      "нагрівальний елемент",
      "не гріє",
      "elemento calefactor",
      "resistencia",
      "no calienta",
      "secadora no calienta",
    ],
  },
  {
    intent: "control_board_failure",
    normalizedPhrase: "control board failure",
    terms: [
      "control board",
      "main board",
      "pcb",
      "electronic control",
      "плата управления",
      "главная плата",
      "плата керування",
      "tarjeta de control",
      "placa de control",
    ],
  },
  {
    intent: "start_relay_failure",
    normalizedPhrase: "start relay failure",
    terms: [
      "start relay",
      "starting component",
      "relay",
      "пусковое реле",
      "реле запуска",
      "пускове реле",
      "rele de arranque",
      "relé de arranque",
    ],
  },
  {
    intent: "ice_maker_failure",
    normalizedPhrase: "ice maker failure",
    terms: [
      "ice maker",
      "icemaker",
      "not making ice",
      "ледогенератор",
      "не делает лед",
      "льодогенератор",
      "не робить лід",
      "maquina de hielo",
      "máquina de hielo",
      "no hace hielo",
    ],
  },
  {
    intent: "sealed_system_failure_suspected",
    normalizedPhrase: "sealed system failure suspected",
    terms: [
      "sealed system",
      "no refrigerant flow",
      "compressor running but no cooling",
      "compressor runs but no cooling",
      "компрессор работает но не производит холод",
      "компрессор работает но нет холода",
      "линейный компрессор работает но не производит холод",
      "компресор працює але не холодить",
      "sistema sellado",
      "compresor funciona pero no enfria",
      "compresor funciona pero no enfría",
    ],
  },
  {
    intent: "compressor_replacement_suspected",
    normalizedPhrase: "compressor replacement suspected",
    terms: [
      "linear compressor",
      "compressor failure",
      "bad compressor",
      "locked compressor",
      "линейный компрессор",
      "линейний компрессор",
      "компрессор неисправен",
      "плохой компрессор",
      "лінійний компресор",
      "compresor lineal",
      "compresor dañado",
    ],
  },
  {
    intent: "advanced_cooling_system_diagnosis",
    normalizedPhrase: "advanced cooling system diagnosis",
    terms: [
      "sealed system diagnosis",
      "advanced cooling diagnosis",
      "pressure test",
      "системная диагностика охлаждения",
      "диагностика sealed system",
      "діагностика системи охолодження",
      "diagnostico sistema sellado",
      "diagnóstico sistema sellado",
    ],
  },
];

const draftPatterns: DraftPattern[] = [
  {
    requiredIntents: [
      "sealed_system_failure_suspected",
      "compressor_replacement_suspected",
    ],
    optionalIntents: ["advanced_cooling_system_diagnosis", "cooling_failure"],
    title: "Sealed System / Compressor Repair Evaluation",
    serviceCategory: "Refrigerator",
    repairGroup: "Sealed System",
    repairItem: "Compressor Replacement Evaluation",
    customerDescription:
      "This repair scope covers advanced sealed-system diagnosis and likely compressor-related repair for a refrigerator that runs but does not produce cooling. Final repair scope should be confirmed with sealed-system testing before parts are installed.",
    lines: [
      {
        lineType: "labor",
        customerName: "Advanced sealed-system diagnosis",
        internalName: "Advanced sealed system / compressor diagnosis",
        unitPrice: 285,
        unitCost: 115,
        notes:
          "Includes advanced cooling-system checks before confirming sealed-system repair.",
      },
      {
        lineType: "labor",
        customerName: "Compressor replacement labor",
        internalName: "Compressor replacement labor",
        unitPrice: 725,
        unitCost: 320,
        notes:
          "Labor estimate for compressor replacement after sealed-system diagnosis confirms failure.",
      },
      {
        lineType: "part",
        customerName: "Compressor Assembly",
        internalName: "LG linear compressor assembly",
        unitPrice: 689,
        unitCost: 365,
        notes: null,
      },
      {
        lineType: "material",
        customerName: "Sealed-System Materials",
        internalName: "Filter drier, brazing materials, refrigerant",
        unitPrice: 185,
        unitCost: 78,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "medium",
    sourceReason:
      "Detected compressor running with no cooling, suggesting sealed-system/compressor failure.",
  },
  {
    requiredIntents: ["evaporator_fan_failure", "evaporator_iced_over"],
    optionalIntents: ["manual_defrost_required", "cooling_failure"],
    title: "Evaporator Fan and Defrost Service",
    serviceCategory: "Refrigerator",
    repairGroup: "Cooling System",
    repairItem: "Evaporator Fan Replacement with Manual Defrost",
    customerDescription:
      "This repair includes replacing the failed evaporator fan assembly and manually clearing ice from the evaporator area so airflow and cooling performance can be restored.",
    lines: [
      {
        lineType: "labor",
        customerName: "Diagnostic and evaporator fan replacement labor",
        internalName: "Evaporator fan replacement labor",
        unitPrice: 325,
        unitCost: 120,
        notes: "Includes access, replacement, and airflow verification.",
      },
      {
        lineType: "part",
        customerName: "Evaporator Fan Motor Assembly",
        internalName: "Evaporator fan motor assembly",
        unitPrice: 189,
        unitCost: 74,
        notes: null,
      },
      {
        lineType: "labor",
        customerName: "Manual Evaporator Defrost Service",
        internalName: "Manual evaporator defrost labor",
        unitPrice: 165,
        unitCost: 65,
        notes: "Includes manually clearing heavy ice buildup from the evaporator area.",
      },
      standardWarrantyLine,
    ],
    confidence: "high",
    sourceReason: "Detected evaporator fan failure with evaporator ice buildup.",
  },
  {
    requiredIntents: ["condenser_fan_failure"],
    optionalIntents: ["start_relay_failure", "cooling_failure"],
    title: "Condenser Fan Motor Replacement",
    serviceCategory: "Refrigerator",
    repairGroup: "Cooling System",
    repairItem: "Condenser Fan Replacement",
    customerDescription:
      "This repair includes replacing the failed condenser fan assembly to restore proper airflow across the condenser and help the refrigerator maintain normal operating temperatures.",
    lines: [
      {
        lineType: "labor",
        customerName: "Diagnostic and condenser fan replacement labor",
        internalName: "Condenser fan replacement labor",
        unitPrice: 325,
        unitCost: 120,
        notes: "Includes diagnostic confirmation, fan replacement, and operation test.",
      },
      {
        lineType: "part",
        customerName: "Condenser Fan Motor Assembly",
        internalName: "Condenser fan motor assembly",
        unitPrice: 189,
        unitCost: 74,
        notes: null,
      },
      {
        lineType: "part",
        customerName: "Starting Component",
        internalName: "Start relay / starting component",
        unitPrice: 89,
        unitCost: 28,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "high",
    sourceReason: "Detected condenser fan repair scope.",
  },
  {
    requiredIntents: ["evaporator_fan_failure"],
    optionalIntents: ["cooling_failure"],
    title: "Evaporator Fan Replacement",
    serviceCategory: "Refrigerator",
    repairGroup: "Cooling System",
    repairItem: "Evaporator Fan Replacement",
    customerDescription:
      "This repair includes replacing the failed evaporator fan assembly to restore proper air movement through the refrigerator cabinet and improve cooling performance.",
    lines: [
      {
        lineType: "labor",
        customerName: "Diagnostic and evaporator fan replacement labor",
        internalName: "Evaporator fan replacement labor",
        unitPrice: 325,
        unitCost: 120,
        notes: "Includes access, replacement, and airflow verification.",
      },
      {
        lineType: "part",
        customerName: "Evaporator Fan Assembly",
        internalName: "Evaporator fan motor assembly",
        unitPrice: 189,
        unitCost: 74,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "high",
    sourceReason: "Detected evaporator fan repair scope.",
  },
  {
    requiredIntents: ["ice_maker_failure"],
    title: "Ice Maker Replacement",
    serviceCategory: "Refrigerator",
    repairGroup: "Ice Maker",
    repairItem: "Ice Maker Replacement",
    customerDescription:
      "This repair includes replacing the ice maker assembly and testing the fill and harvest cycle to restore normal ice production.",
    lines: [
      {
        lineType: "labor",
        customerName: "Ice maker diagnosis and replacement labor",
        internalName: "Ice maker replacement labor",
        unitPrice: 249,
        unitCost: 95,
        notes: "Includes installation and cycle test.",
      },
      {
        lineType: "part",
        customerName: "Ice Maker Assembly",
        internalName: "Ice maker assembly",
        unitPrice: 179,
        unitCost: 68,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "high",
    sourceReason: "Detected ice maker repair scope.",
  },
  {
    requiredIntents: ["drain_pump_failure"],
    optionalIntents: ["drain_restriction"],
    title: "Drain Pump Replacement",
    serviceCategory: "Dishwasher / Washer",
    repairGroup: "Drain System",
    repairItem: "Drain Pump Replacement",
    customerDescription:
      "This repair includes replacing the failed drain pump and verifying the appliance drains properly during a complete test cycle.",
    lines: [
      {
        lineType: "labor",
        customerName: "Diagnostic and drain pump replacement labor",
        internalName: "Drain pump replacement labor",
        unitPrice: 229,
        unitCost: 90,
        notes: "Includes pump access, replacement, and drain cycle test.",
      },
      {
        lineType: "part",
        customerName: "Drain Pump Assembly",
        internalName: "Drain pump assembly",
        unitPrice: 159,
        unitCost: 58,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "high",
    sourceReason: "Detected drain pump repair scope.",
  },
  {
    requiredIntents: ["door_boot_leak"],
    title: "Washer Door Boot Replacement",
    serviceCategory: "Washer",
    repairGroup: "Leak Repair",
    repairItem: "Door Boot Replacement",
    customerDescription:
      "This repair includes replacing the worn door boot seal to help stop water leaking from the washer door area.",
    lines: [
      {
        lineType: "labor",
        customerName: "Door boot replacement labor",
        internalName: "Washer door boot replacement labor",
        unitPrice: 285,
        unitCost: 110,
        notes: "Includes boot removal, installation, and leak test.",
      },
      {
        lineType: "part",
        customerName: "Door Boot Seal",
        internalName: "Washer door boot gasket",
        unitPrice: 185,
        unitCost: 72,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "high",
    sourceReason: "Detected door boot leak repair scope.",
  },
  {
    requiredIntents: ["heating_element_failure"],
    title: "Heating Element Replacement",
    serviceCategory: "Dryer / Oven",
    repairGroup: "Heating System",
    repairItem: "Heating Element Replacement",
    customerDescription:
      "This repair includes replacing the failed heating element and testing the appliance to confirm normal heating operation.",
    lines: [
      {
        lineType: "labor",
        customerName: "Diagnostic and heating element replacement labor",
        internalName: "Heating element replacement labor",
        unitPrice: 229,
        unitCost: 90,
        notes: "Includes diagnosis, replacement, and heat verification.",
      },
      {
        lineType: "part",
        customerName: "Heating Element",
        internalName: "Heating element",
        unitPrice: 149,
        unitCost: 48,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "high",
    sourceReason: "Detected heating element repair scope.",
  },
  {
    requiredIntents: ["control_board_failure"],
    title: "Control Board Replacement",
    serviceCategory: "Appliance",
    repairGroup: "Controls",
    repairItem: "Control Board Replacement",
    customerDescription:
      "This repair includes replacing the failed electronic control board and testing the appliance functions controlled by that board.",
    lines: [
      {
        lineType: "labor",
        customerName: "Diagnostic and control board replacement labor",
        internalName: "Control board replacement labor",
        unitPrice: 295,
        unitCost: 115,
        notes: "Includes diagnosis, board replacement, and function test.",
      },
      {
        lineType: "part",
        customerName: "Electronic Control Board",
        internalName: "Electronic control board",
        unitPrice: 285,
        unitCost: 128,
        notes: null,
      },
      standardWarrantyLine,
    ],
    confidence: "medium",
    sourceReason: "Detected control board repair scope.",
  },
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ё]/g, "е")
    .replace(/[і]/g, "и")
    .replace(/[ї]/g, "и")
    .replace(/[є]/g, "е")
    .replace(/[^a-zа-я0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguage(text: string): DiagnosisLanguage {
  const normalized = normalizeText(text);
  const hasCyrillic = /[а-я]/i.test(normalized);
  const hasSpanish =
    /\b(lavadora|secadora|ventilador|evaporador|condensador|calienta|drenaje|bomba|puerta|hielo|descongelar)\b/.test(
      normalized,
    );
  const hasUkrainian =
    /[іїєґ]/i.test(text) ||
    /\b(працюе|працює|випарник|льод|зливає|гріє|грие|розморозити)\b/.test(
      normalized,
    );
  const hasRussian = hasCyrillic && !hasUkrainian;
  const languageHits = [hasSpanish, hasUkrainian, hasRussian].filter(Boolean)
    .length;

  if (languageHits > 1 || (hasCyrillic && /[a-z]/i.test(normalized))) {
    return "mixed";
  }

  if (hasSpanish) {
    return "spanish";
  }

  if (hasUkrainian) {
    return "ukrainian";
  }

  if (hasRussian) {
    return "russian";
  }

  return /[a-z]/i.test(normalized) ? "english" : "unknown";
}

function includesTerm(haystack: string, term: string): boolean {
  return haystack.includes(normalizeText(term));
}

function normalizeDiagnosisLocal(
  input: string,
  context?: DiagnosisNormalizationContext,
): DiagnosisNormalizationResult {
  const haystack = [
    input,
    context?.applianceType,
    context?.brand,
    context?.modelNumber,
    context?.customerProblem,
    ...(context?.technicianNotes ?? []),
  ]
    .map(normalizeText)
    .join(" ");
  const matchedTerms: string[] = [];
  const repairIntents: RepairIntent[] = [];

  for (const definition of intentDefinitions) {
    const matchedTerm = definition.terms.find((term) =>
      includesTerm(haystack, term),
    );

    if (matchedTerm) {
      repairIntents.push(definition.intent);
      matchedTerms.push(matchedTerm);
    }
  }

  const normalizedEnglishDiagnosis = repairIntents.length
    ? repairIntents
        .map(
          (intent) =>
            intentDefinitions.find((definition) => definition.intent === intent)
              ?.normalizedPhrase,
        )
        .filter((phrase): phrase is string => Boolean(phrase))
        .join("; ")
    : normalizeText(input);

  return {
    providerMode: "local",
    detectedLanguage: detectLanguage(input),
    normalizedEnglishDiagnosis,
    repairIntents,
    confidence:
      repairIntents.length >= 2
        ? "high"
        : repairIntents.length === 1
          ? "medium"
          : "low",
    matchedTerms,
  };
}

export function getEstimateDiagnosisNormalizer(
  mode: DiagnosisNormalizationProviderMode = "local",
): DiagnosisNormalizerProvider {
  return {
    mode,
    normalizeDiagnosis(input, context) {
      return normalizeDiagnosisLocal(input, context);
    },
  };
}

export function normalizeDiagnosis(
  input: string,
  context?: DiagnosisNormalizationContext,
  mode: DiagnosisNormalizationProviderMode = "local",
): DiagnosisNormalizationResult {
  return getEstimateDiagnosisNormalizer(mode).normalizeDiagnosis(input, context);
}

function titleCaseFallback(input: EstimateDraftAgentInput): string {
  const appliance = input.applianceType?.trim() || "Appliance";
  return `${appliance} Repair Estimate`;
}

function buildFallbackDescription(input: EstimateDraftAgentInput): string {
  const appliance = input.applianceType?.trim() || "appliance";
  const brand = input.brand?.trim();
  const brandPrefix = brand ? `${brand} ` : "";

  return `This estimate covers the recommended repair for the ${brandPrefix}${appliance.toLowerCase()} based on the reported symptoms and technician diagnosis. The repair scope can be adjusted after final inspection if additional failed components are found.`;
}

function patternScore(pattern: DraftPattern, intents: RepairIntent[]): number {
  if (!pattern.requiredIntents.every((intent) => intents.includes(intent))) {
    return -1;
  }

  return (
    pattern.requiredIntents.length * 10 +
    (pattern.optionalIntents ?? []).filter((intent) => intents.includes(intent))
      .length
  );
}

function buildRepairScope(
  input: EstimateDraftAgentInput,
  pattern: DraftPattern | null,
): EstimateDraftAgentResult["repairScope"] {
  if (pattern) {
    return {
      scopeKey: pattern.repairItem.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      serviceCategory: pattern.serviceCategory,
      repairGroup: pattern.repairGroup,
      repairItem: pattern.repairItem,
      customerSummary: pattern.customerDescription,
    };
  }

  const appliance = input.applianceType?.trim() || "Appliance";

  return {
    scopeKey: "general_repair_scope",
    serviceCategory: appliance,
    repairGroup: "General Diagnosis",
    repairItem: `${appliance} Repair`,
    customerSummary: buildFallbackDescription(input),
  };
}

export function generateEstimateDraft(
  input: EstimateDraftAgentInput,
): EstimateDraftAgentResult {
  const diagnosisNormalization = normalizeDiagnosis(
    input.technicianDiagnosis,
    {
      applianceType: input.applianceType,
      brand: input.brand,
      modelNumber: input.modelNumber,
      customerProblem: input.customerProblem,
      technicianNotes: input.technicianNotes,
    },
    input.normalizerMode ?? "local",
  );
  const matchedPattern =
    draftPatterns
      .map((pattern) => ({
        pattern,
        score: patternScore(pattern, diagnosisNormalization.repairIntents),
      }))
      .filter((match) => match.score >= 0)
      .sort((left, right) => right.score - left.score)[0]?.pattern ?? null;

  if (matchedPattern) {
    const repairScope = buildRepairScope(input, matchedPattern);

    return {
      title: matchedPattern.title,
      customerDescription: matchedPattern.customerDescription,
      repairScope,
      diagnosisNormalization,
      lines: matchedPattern.lines.map((line) => ({ ...line })),
      warrantyText: standardWarrantyLine.notes ?? "",
      internalNotes: matchedPattern.sourceReason,
      confidence:
        diagnosisNormalization.confidence === "low" &&
        matchedPattern.confidence === "high"
          ? "medium"
          : matchedPattern.confidence,
      sourceReason: `${matchedPattern.sourceReason} Intents: ${diagnosisNormalization.repairIntents.join(", ")}.`,
    };
  }

  const repairScope = buildRepairScope(input, null);

  return {
    title: titleCaseFallback(input),
    customerDescription: buildFallbackDescription(input),
    repairScope,
    diagnosisNormalization,
    lines: [
      {
        lineType: "labor",
        customerName: "Diagnostic and repair labor",
        internalName: "Diagnostic and repair labor",
        unitPrice: 189,
        unitCost: 75,
        notes: "Adjust this labor line after confirming final repair scope.",
      },
      {
        lineType: "custom",
        customerName: "Repair materials or replacement component",
        internalName: "Repair materials or replacement component",
        unitPrice: 125,
        unitCost: 45,
        notes: "Update this line with the specific part or material after diagnosis.",
      },
      standardWarrantyLine,
    ],
    warrantyText: standardWarrantyLine.notes ?? "",
    internalNotes:
      diagnosisNormalization.repairIntents.length > 0
        ? `Detected intents without an exact repair template: ${diagnosisNormalization.repairIntents.join(", ")}.`
        : "No repair intent matched; generated a general repair draft.",
    confidence: diagnosisNormalization.confidence,
    sourceReason: "Local deterministic diagnosis normalization fallback.",
  };
}
