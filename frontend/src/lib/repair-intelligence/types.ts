import type {
  EstimateDraftAgentLine,
  EstimateDraftLineType,
  RepairIntent,
} from "@/lib/estimate-draft-agent";

export type ApplianceCategory =
  | "refrigeration"
  | "laundry"
  | "dishwasher"
  | "cooking"
  | "general";

export type RepairConfidence = "high" | "medium" | "low";

export type EstimateDisplayStrategy = "detailed" | "package";

export type RepairPlanInput = {
  applianceType: string | null;
  brand: string | null;
  modelNumber: string | null;
  customerComplaint: string | null;
  technicianDiagnosis: string;
  normalizedDiagnosis?: string | null;
  repairIntents: RepairIntent[];
  existingNotes?: string[];
};

export type RepairOperation = {
  id: string;
  title: string;
  description: string;
  estimateLineType: EstimateDraftLineType;
  laborHours?: number;
  customerVisible: boolean;
};

export type RepairPart = {
  id: string;
  customerName: string;
  internalName: string;
  reason: string;
  quantity: number;
  required: boolean;
};

export type RepairMaterial = {
  id: string;
  customerName: string;
  internalName: string;
  reason: string;
  quantity: number;
  required: boolean;
};

export type RepairRisk = {
  id: string;
  severity: "info" | "caution" | "high";
  note: string;
  customerVisible: boolean;
};

export type RepairWarranty = {
  text: string;
  days: number;
  scope: "labor_and_installed_parts" | "labor_only" | "limited";
};

export type RepairEstimateSuggestion = {
  strategy: EstimateDisplayStrategy;
  packageTitle?: string;
  customerSummary: string;
  pricingWarning?: string;
};

export type RepairPlan = {
  applianceCategory: ApplianceCategory;
  brand: string | null;
  modelNumber: string | null;
  problemSummary: string;
  detectedRepairType: string;
  requiredOperations: RepairOperation[];
  likelyParts: RepairPart[];
  materials: RepairMaterial[];
  laborConsiderations: string[];
  riskNotes: RepairRisk[];
  customerFacingExplanation: string;
  estimateStrategy: RepairEstimateSuggestion;
  warrantyRecommendation: RepairWarranty;
  confidence: RepairConfidence;
  repairIntents: RepairIntent[];
  matchedKnowledgeKeys: string[];
};

export type RepairKnowledgePattern = {
  key: string;
  applianceCategory: ApplianceCategory;
  repairType: string;
  intents: RepairIntent[];
  terms?: string[];
  operations: RepairOperation[];
  parts?: RepairPart[];
  materials?: RepairMaterial[];
  laborConsiderations?: string[];
  riskNotes?: RepairRisk[];
  customerExplanation: string;
  warranty?: Partial<RepairWarranty>;
  estimateStrategy?: Partial<RepairEstimateSuggestion>;
  confidence?: RepairConfidence;
};

export type RepairPricingPolicy = {
  defaultWarranty: RepairWarranty;
  linePrices: Record<
    string,
    {
      unitPrice: number;
      unitCost: number;
      taxable: boolean;
    }
  >;
  highEndBuiltInPremium: number;
  taxRate: number;
};

export type RepairPlanEstimate = {
  lines: EstimateDraftAgentLine[];
  pricingWarnings: string[];
};
