export type RepairCaseStatusTone = "cyan" | "emerald" | "amber" | "slate";

export type RepairCasePart = {
  name: string;
  partNumber: string;
  quantity: number;
};

export type RepairCasePhoto = {
  label: string;
  description: string;
};

export type RepairCaseSeoPreview = {
  title: string;
  description: string;
  slug: string;
  audience: string;
  status: string;
};

export type ApplianceLabelExtraction = {
  detectedBrand: string;
  detectedModelNumber: string;
  detectedSerialNumber: string;
  confidence: string;
};

export type RepairCase = {
  id: string;
  caseNumber: string;
  privateCustomer?: {
    name?: string;
    phone?: string;
    notes?: string;
  };
  location: {
    label: string;
    city: string;
    zipCode: string;
    neighborhood: string;
  };
  appliance: {
    brand: string;
    modelNumber: string;
    serialNumber: string;
  };
  labelExtraction?: ApplianceLabelExtraction;
  issueDescription: string;
  technicianFindings: string;
  partsUsed: RepairCasePart[];
  repairSummary: string;
  repairStatus: string;
  repairStatusTone: RepairCaseStatusTone;
  estimatedRepairCost: number;
  technician: string;
  photos: RepairCasePhoto[];
  seoPreview: RepairCaseSeoPreview;
};
