import type { ServiceRequestFormValues } from "@/components/public/ServiceRequestForm";
import type { MarketplaceLead } from "@/types/lead";
import type { TechnicianProfilePreview } from "@/types/public-seo";

type IntakeLeadOptions = {
  technician: TechnicianProfilePreview | null;
  id?: string;
  submittedAt?: string;
};

export function mapIntakeToMarketplaceLead(
  intake: ServiceRequestFormValues,
  { technician, id = "preview-public-intake", submittedAt = "Preview just now" }: IntakeLeadOptions,
): MarketplaceLead {
  return {
    id,
    customerFirstName: intake.customerFirstName.trim() || "Preview",
    zipCode: intake.zipCode.trim() || "ZIP pending",
    serviceArea: technician?.serviceArea ?? "Houston MVP service area",
    applianceType: intake.applianceType,
    applianceBrand: intake.brand,
    issueSummary:
      intake.issueDescription.trim() ||
      "Customer submitted a public schedule request and the issue summary is pending.",
    requestedTimeWindow: intake.preferredServiceWindow,
    matchedTechnician: technician?.name ?? "Technician match pending",
    status: "New",
    source: "Public Schedule Request",
    submittedAt,
    privacyNote:
      "Preview lead uses first name, ZIP, appliance details, and issue summary only. No phone, exact address, or private notes are included.",
  };
}

export function buildDashboardLeadPreviewHref(lead: MarketplaceLead) {
  const searchParams = new URLSearchParams({
    name: lead.customerFirstName,
    zip: lead.zipCode,
    appliance: lead.applianceType,
    brand: lead.applianceBrand,
    issue: lead.issueSummary,
    technician: lead.matchedTechnician,
    window: lead.requestedTimeWindow,
  });

  return `/dashboard/leads/preview?${searchParams.toString()}`;
}

export function mapSearchParamsToMarketplaceLead(
  searchParams: Record<string, string | string[] | undefined>,
): MarketplaceLead {
  const getParam = (key: string, fallback: string) => {
    const value = searchParams[key];
    const normalizedValue = Array.isArray(value) ? value[0] : value;

    return normalizedValue?.trim() || fallback;
  };

  return {
    id: "transient-dashboard-preview",
    customerFirstName: getParam("name", "Preview"),
    zipCode: getParam("zip", "77024"),
    serviceArea: "Dashboard preview service area",
    applianceType: getParam("appliance", "Refrigerator"),
    applianceBrand: getParam("brand", "Other / Not sure"),
    issueSummary: getParam(
      "issue",
      "Public schedule request preview from the customer intake flow.",
    ),
    requestedTimeWindow: getParam("window", "First available"),
    matchedTechnician: getParam("technician", "Technician match pending"),
    status: "New",
    source: "Public Schedule Request",
    submittedAt: "Transient preview",
    privacyNote:
      "This preview demonstrates how marketplace requests will appear in the CRM. It is not saved and excludes phone numbers, exact addresses, and private notes.",
  };
}
