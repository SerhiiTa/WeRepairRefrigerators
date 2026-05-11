export type LeadStatus = "New" | "Reviewed" | "Converted";

export type MarketplaceLead = {
  id: string;
  customerFirstName: string;
  zipCode: string;
  serviceArea: string;
  applianceType: string;
  applianceBrand: string;
  issueSummary: string;
  requestedTimeWindow: string;
  matchedTechnician: string;
  status: LeadStatus;
  source: string;
  submittedAt: string;
  privacyNote: string;
};
