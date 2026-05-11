import type { MarketplaceLead } from "@/types/lead";

export type LeadRepairCaseDraftPriority = "Normal" | "High" | "Urgent";

export type LeadRepairCaseDraft = {
  customerFirstName: string;
  zipCode: string;
  applianceType: string;
  brand: string;
  issueSummary: string;
  preferredTimeWindow: string;
  matchedTechnician: string;
  source: "Marketplace Lead";
  status: "Draft / Not Saved";
};

export function mapLeadToRepairCaseDraft(lead: MarketplaceLead): LeadRepairCaseDraft {
  return {
    customerFirstName: lead.customerFirstName,
    zipCode: lead.zipCode,
    applianceType: lead.applianceType,
    brand: lead.applianceBrand,
    issueSummary: lead.issueSummary,
    preferredTimeWindow: lead.requestedTimeWindow,
    matchedTechnician: lead.matchedTechnician,
    source: "Marketplace Lead",
    status: "Draft / Not Saved",
  };
}
