import type { MarketplaceLead } from "@/types/lead";

export type LeadSource =
  | "Homepage CTA"
  | "Schedule Service"
  | "Technician Profile"
  | "ZIP Search"
  | "Brand Page"
  | "Service Page"
  | "Location Page";

export type DateRangeFilter = "Last 7 days" | "Last 30 days" | "This quarter";

export type MarketplaceAnalyticsLead = MarketplaceLead & {
  source: LeadSource;
  dateRange: DateRangeFilter;
};

export type AnalyticsFilterState = {
  dateRange: DateRangeFilter;
  zipCode: string;
  technician: string;
  leadSource: string;
};

export type AnalyticsBreakdownItem = {
  label: string;
  count: number;
  percent: number;
};

export type TechnicianPerformanceMetric = {
  technician: string;
  leads: number;
  converted: number;
  conversionRate: number;
  mostRequestedBrand: string;
};

export type ZipDemandMetric = {
  zipCode: string;
  serviceArea: string;
  leads: number;
  topApplianceType: string;
  topBrand: string;
};

export type MarketplaceAnalyticsSnapshot = {
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
  busiestServiceArea: string;
  mostRequestedTechnician: string;
  topLeadSource: string;
  leadsBySource: AnalyticsBreakdownItem[];
  leadsByZip: AnalyticsBreakdownItem[];
  leadsByApplianceType: AnalyticsBreakdownItem[];
  leadsByBrand: AnalyticsBreakdownItem[];
  leadsByTechnician: AnalyticsBreakdownItem[];
  technicianPerformance: TechnicianPerformanceMetric[];
  zipDemand: ZipDemandMetric[];
};
