import { mockMarketplaceLeads } from "@/data/mock-leads";
import type { LeadStatus } from "@/types/lead";
import type {
  AnalyticsBreakdownItem,
  AnalyticsFilterState,
  DateRangeFilter,
  LeadSource,
  MarketplaceAnalyticsLead,
  MarketplaceAnalyticsSnapshot,
  TechnicianPerformanceMetric,
  ZipDemandMetric,
} from "@/types/analytics";

const sourceMap: Record<string, LeadSource> = {
  "Find Technician ZIP discovery": "ZIP Search",
};

const additionalAnalyticsLeads: MarketplaceAnalyticsLead[] = [
  {
    id: "analytics-2001",
    customerFirstName: "Nora",
    zipCode: "77024",
    serviceArea: "Memorial, Houston",
    applianceType: "Built-in refrigerator",
    applianceBrand: "Sub-Zero",
    issueSummary: "Homepage request for a built-in refrigerator that is running warm.",
    requestedTimeWindow: "First available",
    matchedTechnician: "Andre Lewis",
    status: "Converted",
    source: "Homepage CTA",
    submittedAt: "Today, 7:55 AM",
    privacyNote: "Analytics mock uses first name and ZIP only.",
    dateRange: "Last 7 days",
  },
  {
    id: "analytics-2002",
    customerFirstName: "Omar",
    zipCode: "77043",
    serviceArea: "Spring Branch, Houston",
    applianceType: "Refrigerator",
    applianceBrand: "Samsung",
    issueSummary: "Schedule service request for cooling loss after defrost symptoms.",
    requestedTimeWindow: "Afternoon",
    matchedTechnician: "Marisol Reyes",
    status: "New",
    source: "Schedule Service",
    submittedAt: "Today, 11:20 AM",
    privacyNote: "No phone, address, or private notes included.",
    dateRange: "Last 7 days",
  },
  {
    id: "analytics-2003",
    customerFirstName: "Iris",
    zipCode: "77494",
    serviceArea: "Katy",
    applianceType: "Ice machine",
    applianceBrand: "Scotsman",
    issueSummary: "Technician profile request for clear ice machine production issues.",
    requestedTimeWindow: "Weekend",
    matchedTechnician: "Nina Patel",
    status: "Reviewed",
    source: "Technician Profile",
    submittedAt: "Yesterday, 5:10 PM",
    privacyNote: "Public-safe mock analytics lead.",
    dateRange: "Last 7 days",
  },
  {
    id: "analytics-2004",
    customerFirstName: "Mateo",
    zipCode: "77079",
    serviceArea: "Energy Corridor, Houston",
    applianceType: "Refrigerator",
    applianceBrand: "LG",
    issueSummary: "Brand page request for compressor noise and uneven cooling.",
    requestedTimeWindow: "Morning",
    matchedTechnician: "Andre Lewis",
    status: "Converted",
    source: "Brand Page",
    submittedAt: "Last week",
    privacyNote: "Public-safe mock analytics lead.",
    dateRange: "Last 30 days",
  },
  {
    id: "analytics-2005",
    customerFirstName: "Sara",
    zipCode: "77441",
    serviceArea: "Richmond",
    applianceType: "Wine cooler",
    applianceBrand: "Thermador",
    issueSummary: "Service page request for a wine cooler temperature rise.",
    requestedTimeWindow: "Evening",
    matchedTechnician: "Nina Patel",
    status: "Converted",
    source: "Service Page",
    submittedAt: "Last week",
    privacyNote: "Public-safe mock analytics lead.",
    dateRange: "Last 30 days",
  },
  {
    id: "analytics-2006",
    customerFirstName: "Victor",
    zipCode: "77008",
    serviceArea: "Houston Heights",
    applianceType: "Refrigerator ice maker",
    applianceBrand: "Whirlpool",
    issueSummary: "Location page request for ice maker leaking into the bin.",
    requestedTimeWindow: "First available",
    matchedTechnician: "Marisol Reyes",
    status: "Reviewed",
    source: "Location Page",
    submittedAt: "This month",
    privacyNote: "Public-safe mock analytics lead.",
    dateRange: "This quarter",
  },
];

const dateRangeRank: Record<DateRangeFilter, number> = {
  "Last 7 days": 1,
  "Last 30 days": 2,
  "This quarter": 3,
};

function getSeedDateRange(index: number): DateRangeFilter {
  return index < 3 ? "Last 7 days" : "Last 30 days";
}

export const mockMarketplaceAnalyticsLeads: MarketplaceAnalyticsLead[] = [
  ...mockMarketplaceLeads.map((lead, index) => ({
    ...lead,
    source: sourceMap[lead.source] ?? "ZIP Search",
    dateRange: getSeedDateRange(index),
  })),
  ...additionalAnalyticsLeads,
];

function getPercent(count: number, total: number) {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function buildBreakdown<T extends string>(
  leads: MarketplaceAnalyticsLead[],
  getValue: (lead: MarketplaceAnalyticsLead) => T,
): AnalyticsBreakdownItem[] {
  const counts = leads.reduce<Record<string, number>>((accumulator, lead) => {
    const value = getValue(lead);
    accumulator[value] = (accumulator[value] ?? 0) + 1;

    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([label, count]) => ({
      label,
      count,
      percent: getPercent(count, leads.length),
    }))
    .sort((a, b) => b.count - a.count);
}

function getMostCommonValue<T extends string>(
  leads: MarketplaceAnalyticsLead[],
  getValue: (lead: MarketplaceAnalyticsLead) => T,
) {
  return buildBreakdown(leads, getValue)[0]?.label ?? "No data";
}

function getConvertedCount(leads: MarketplaceAnalyticsLead[]) {
  return leads.filter((lead) => lead.status === ("Converted" satisfies LeadStatus)).length;
}

function buildTechnicianPerformance(
  leads: MarketplaceAnalyticsLead[],
): TechnicianPerformanceMetric[] {
  const technicians = Array.from(new Set(leads.map((lead) => lead.matchedTechnician)));

  return technicians
    .map((technician) => {
      const technicianLeads = leads.filter((lead) => lead.matchedTechnician === technician);
      const converted = getConvertedCount(technicianLeads);

      return {
        technician,
        leads: technicianLeads.length,
        converted,
        conversionRate: getPercent(converted, technicianLeads.length),
        mostRequestedBrand: getMostCommonValue(
          technicianLeads,
          (lead) => lead.applianceBrand,
        ),
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

function buildZipDemand(leads: MarketplaceAnalyticsLead[]): ZipDemandMetric[] {
  const zipCodes = Array.from(new Set(leads.map((lead) => lead.zipCode)));

  return zipCodes
    .map((zipCode) => {
      const zipLeads = leads.filter((lead) => lead.zipCode === zipCode);

      return {
        zipCode,
        serviceArea: zipLeads[0]?.serviceArea ?? "Houston MVP",
        leads: zipLeads.length,
        topApplianceType: getMostCommonValue(zipLeads, (lead) => lead.applianceType),
        topBrand: getMostCommonValue(zipLeads, (lead) => lead.applianceBrand),
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

export function filterAnalyticsLeads(
  leads: MarketplaceAnalyticsLead[],
  filters: AnalyticsFilterState,
) {
  return leads.filter((lead) => {
    const matchesDateRange = dateRangeRank[lead.dateRange] <= dateRangeRank[filters.dateRange];
    const matchesZip = filters.zipCode === "All ZIP codes" || lead.zipCode === filters.zipCode;
    const matchesTechnician =
      filters.technician === "All technicians" || lead.matchedTechnician === filters.technician;
    const matchesSource =
      filters.leadSource === "All sources" || lead.source === filters.leadSource;

    return matchesDateRange && matchesZip && matchesTechnician && matchesSource;
  });
}

export function buildMarketplaceAnalyticsSnapshot(
  leads: MarketplaceAnalyticsLead[],
): MarketplaceAnalyticsSnapshot {
  const convertedLeads = getConvertedCount(leads);

  return {
    totalLeads: leads.length,
    convertedLeads,
    conversionRate: getPercent(convertedLeads, leads.length),
    busiestServiceArea: getMostCommonValue(leads, (lead) => lead.serviceArea),
    mostRequestedTechnician: getMostCommonValue(leads, (lead) => lead.matchedTechnician),
    topLeadSource: getMostCommonValue(leads, (lead) => lead.source),
    leadsBySource: buildBreakdown(leads, (lead) => lead.source),
    leadsByZip: buildBreakdown(leads, (lead) => lead.zipCode),
    leadsByApplianceType: buildBreakdown(leads, (lead) => lead.applianceType),
    leadsByBrand: buildBreakdown(leads, (lead) => lead.applianceBrand),
    leadsByTechnician: buildBreakdown(leads, (lead) => lead.matchedTechnician),
    technicianPerformance: buildTechnicianPerformance(leads),
    zipDemand: buildZipDemand(leads),
  };
}
