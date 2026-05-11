export type OpenJobStatus = "open" | "assigned" | "expired";

export type OpenJobUrgency = "Normal" | "High" | "Urgent";

export type OpenJob = {
  id: string;
  createdAt: string;
  customerFirstName: string;
  zipCode: string;
  serviceArea: string;
  applianceType: string;
  brand: string;
  issueSummary: string;
  urgency: OpenJobUrgency;
  preferredWindow: string;
  source: string;
  estimatedLeadValue: number;
  status: OpenJobStatus;
  selectedTechnicianId: string | null;
  acceptedByTechnicianId?: string;
  acceptedAt?: string;
};

export type OpenJobFilters = {
  zipCode: string;
  applianceType: string;
  urgency: "All urgencies" | OpenJobUrgency;
  source: string;
};
