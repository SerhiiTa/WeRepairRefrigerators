"use client";

import { useMemo, useState } from "react";

import { LeadCard } from "@/components/dashboard/LeadCard";
import { LeadConversionPreview } from "@/components/dashboard/LeadConversionPreview";
import { LeadDetailPanel } from "@/components/dashboard/LeadDetailPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LeadStatus, MarketplaceLead } from "@/types/lead";

type LeadInboxProps = {
  leads: MarketplaceLead[];
};

const statusFilters = ["All statuses", "New", "Reviewed", "Converted"] as const;

export function LeadInbox({ leads }: LeadInboxProps) {
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>("All statuses");
  const [applianceFilter, setApplianceFilter] = useState("All appliances");
  const [zipFilter, setZipFilter] = useState("All ZIP codes");
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id ?? "");
  const [conversionLeadId, setConversionLeadId] = useState("");
  const [confirmedConversionLeadId, setConfirmedConversionLeadId] = useState("");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, LeadStatus>>({});

  const hydratedLeads = useMemo(
    () =>
      leads.map((lead) => ({
        ...lead,
        status: statusOverrides[lead.id] ?? lead.status,
      })),
    [leads, statusOverrides],
  );

  const applianceOptions = useMemo(
    () => ["All appliances", ...Array.from(new Set(leads.map((lead) => lead.applianceType)))],
    [leads],
  );

  const zipOptions = useMemo(
    () => ["All ZIP codes", ...Array.from(new Set(leads.map((lead) => lead.zipCode)))],
    [leads],
  );

  const filteredLeads = useMemo(
    () =>
      hydratedLeads.filter((lead) => {
        const matchesStatus =
          statusFilter === "All statuses" ? true : lead.status === statusFilter;
        const matchesAppliance =
          applianceFilter === "All appliances" ? true : lead.applianceType === applianceFilter;
        const matchesZip = zipFilter === "All ZIP codes" ? true : lead.zipCode === zipFilter;

        return matchesStatus && matchesAppliance && matchesZip;
      }),
    [applianceFilter, hydratedLeads, statusFilter, zipFilter],
  );

  const selectedLead =
    hydratedLeads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? null;

  const conversionLead = conversionLeadId
    ? hydratedLeads.find((lead) => lead.id === conversionLeadId) ?? null
    : null;

  function updateLeadStatus(leadId: string, status: LeadStatus) {
    setStatusOverrides((current) => ({
      ...current,
      [leadId]: status,
    }));
    setSelectedLeadId(leadId);
  }

  function startConversionPreview(leadId: string) {
    setSelectedLeadId(leadId);
    setConversionLeadId(leadId);
    setConfirmedConversionLeadId("");
  }

  function confirmMockConversion(leadId: string) {
    updateLeadStatus(leadId, "Converted");
    setConversionLeadId(leadId);
    setConfirmedConversionLeadId(leadId);
  }

  function closeConversionPreview() {
    setConversionLeadId("");
    setConfirmedConversionLeadId("");
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-3 md:items-end">
        <label className="block">
          <span className="text-sm font-bold text-slate-100">Lead status</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) =>
              setStatusFilter(event.target.value as (typeof statusFilters)[number])
            }
            value={statusFilter}
          >
            {statusFilters.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">Appliance type</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => setApplianceFilter(event.target.value)}
            value={applianceFilter}
          >
            {applianceOptions.map((appliance) => (
              <option key={appliance}>{appliance}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">ZIP code</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => setZipFilter(event.target.value)}
            value={zipFilter}
          >
            {zipOptions.map((zipCode) => (
              <option key={zipCode}>{zipCode}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_24rem] xl:items-start">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
              {filteredLeads.length} lead{filteredLeads.length === 1 ? "" : "s"} shown
            </p>
            <p className="text-sm text-slate-400">
              Local status actions only. No repair cases are created.
            </p>
          </div>

          {filteredLeads.length > 0 ? (
            <div className="space-y-4">
              {filteredLeads.map((lead) => (
                <LeadCard
                  isSelected={selectedLead?.id === lead.id}
                  key={lead.id}
                  lead={lead}
                  onSelect={setSelectedLeadId}
                  onStartConversion={startConversionPreview}
                  onUpdateStatus={updateLeadStatus}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No marketplace leads match these filters"
              description="Try another status, appliance type, or ZIP code. This inbox is populated from static mock lead data."
            />
          )}
        </div>

        {conversionLead ? (
          <LeadConversionPreview
            isConfirmed={confirmedConversionLeadId === conversionLead.id}
            lead={conversionLead}
            onCancel={closeConversionPreview}
            onConfirm={confirmMockConversion}
          />
        ) : (
          <LeadDetailPanel
            lead={selectedLead}
            onStartConversion={startConversionPreview}
            onUpdateStatus={updateLeadStatus}
          />
        )}
      </section>
    </div>
  );
}
