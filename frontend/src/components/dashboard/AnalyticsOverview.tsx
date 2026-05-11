"use client";

import { useMemo, useState } from "react";

import { MetricCard } from "@/components/MetricCard";
import { LeadSourceBreakdown } from "@/components/dashboard/LeadSourceBreakdown";
import { TechnicianPerformanceBoard } from "@/components/dashboard/TechnicianPerformanceBoard";
import { ZipDemandBoard } from "@/components/dashboard/ZipDemandBoard";
import {
  buildMarketplaceAnalyticsSnapshot,
  filterAnalyticsLeads,
} from "@/data/mock-analytics";
import type {
  AnalyticsFilterState,
  DateRangeFilter,
  MarketplaceAnalyticsLead,
} from "@/types/analytics";

type AnalyticsOverviewProps = {
  leads: MarketplaceAnalyticsLead[];
};

const dateRanges: DateRangeFilter[] = ["Last 7 days", "Last 30 days", "This quarter"];

export function AnalyticsOverview({ leads }: AnalyticsOverviewProps) {
  const [filters, setFilters] = useState<AnalyticsFilterState>({
    dateRange: "Last 30 days",
    zipCode: "All ZIP codes",
    technician: "All technicians",
    leadSource: "All sources",
  });

  const zipOptions = useMemo(
    () => ["All ZIP codes", ...Array.from(new Set(leads.map((lead) => lead.zipCode))).sort()],
    [leads],
  );

  const technicianOptions = useMemo(
    () => [
      "All technicians",
      ...Array.from(new Set(leads.map((lead) => lead.matchedTechnician))).sort(),
    ],
    [leads],
  );

  const sourceOptions = useMemo(
    () => ["All sources", ...Array.from(new Set(leads.map((lead) => lead.source))).sort()],
    [leads],
  );

  const filteredLeads = useMemo(() => filterAnalyticsLeads(leads, filters), [filters, leads]);
  const snapshot = useMemo(
    () => buildMarketplaceAnalyticsSnapshot(filteredLeads),
    [filteredLeads],
  );

  function updateFilter<Key extends keyof AnalyticsFilterState>(
    key: Key,
    value: AnalyticsFilterState[Key],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-4 md:items-end">
        <label className="block">
          <span className="text-sm font-bold text-slate-100">Date range</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => updateFilter("dateRange", event.target.value as DateRangeFilter)}
            value={filters.dateRange}
          >
            {dateRanges.map((dateRange) => (
              <option key={dateRange}>{dateRange}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">ZIP</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => updateFilter("zipCode", event.target.value)}
            value={filters.zipCode}
          >
            {zipOptions.map((zipCode) => (
              <option key={zipCode}>{zipCode}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">Technician</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => updateFilter("technician", event.target.value)}
            value={filters.technician}
          >
            {technicianOptions.map((technician) => (
              <option key={technician}>{technician}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">Lead source</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => updateFilter("leadSource", event.target.value)}
            value={filters.leadSource}
          >
            {sourceOptions.map((source) => (
              <option key={source}>{source}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Marketplace leads"
          value={`${snapshot.totalLeads}`}
          helper="Filtered mock leads in the selected range."
        />
        <MetricCard
          label="Conversion preview"
          value={`${snapshot.conversionRate}%`}
          helper={`${snapshot.convertedLeads} converted leads in local mock data.`}
        />
        <MetricCard
          label="Top source"
          value={snapshot.topLeadSource}
          helper="Highest-volume intake origin."
        />
        <MetricCard
          label="Top technician"
          value={snapshot.mostRequestedTechnician}
          helper="Most requested technician in filtered data."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <LeadSourceBreakdown
          description="Lead source mix for SEO conversion analytics, paid lead planning, and future attribution."
          items={snapshot.leadsBySource}
          title="Intake source breakdown"
        />
        <LeadSourceBreakdown
          description="Brand demand helps prepare future monetization, SEO planning, and technician specialization."
          items={snapshot.leadsByBrand}
          title="Leads by brand"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ZipDemandBoard metrics={snapshot.zipDemand} />
        <TechnicianPerformanceBoard metrics={snapshot.technicianPerformance} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <LeadSourceBreakdown
          description="Appliance categories help route future dispatch, availability, and technician capability checks."
          items={snapshot.leadsByApplianceType}
          title="Leads by appliance type"
        />
        <LeadSourceBreakdown
          description="Technician demand prepares future performance reporting and marketplace payout analytics."
          items={snapshot.leadsByTechnician}
          title="Leads by technician"
        />
      </section>
    </div>
  );
}
