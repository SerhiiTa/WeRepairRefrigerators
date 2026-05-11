import { StatusBadge } from "@/components/StatusBadge";
import type { LeadStatus, MarketplaceLead } from "@/types/lead";

type LeadDetailPanelProps = {
  lead: MarketplaceLead | null;
  onUpdateStatus: (leadId: string, status: LeadStatus) => void;
  onStartConversion: (leadId: string) => void;
};

const leadStatusTone: Record<LeadStatus, "cyan" | "emerald" | "amber" | "slate"> = {
  New: "cyan",
  Reviewed: "amber",
  Converted: "emerald",
};

export function LeadDetailPanel({
  lead,
  onUpdateStatus,
  onStartConversion,
}: LeadDetailPanelProps) {
  if (!lead) {
    return (
      <aside className="rounded-lg border border-dashed border-white/15 bg-slate-900 p-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          Lead detail
        </p>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-white">
          Select a lead to review details.
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Detail panels stay mock-only until marketplace persistence and repair case conversion are
          approved.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-white/10 bg-slate-900 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Lead detail
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
            {lead.customerFirstName} in {lead.zipCode}
          </h2>
        </div>
        <StatusBadge tone={leadStatusTone[lead.status]}>{lead.status}</StatusBadge>
      </div>

      <p className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
        In the live version, marketplace requests can be reviewed and converted into repair cases.
      </p>

      <dl className="mt-5 space-y-3">
        {[
          ["Appliance", `${lead.applianceBrand} ${lead.applianceType}`],
          ["Issue summary", lead.issueSummary],
          ["Requested time", lead.requestedTimeWindow],
          ["Matched technician", lead.matchedTechnician],
          ["Service area", lead.serviceArea],
          ["Submitted", lead.submittedAt],
          ["Privacy note", lead.privacyNote],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-3">
        <button
          className="rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={lead.status !== "New"}
          onClick={() => onUpdateStatus(lead.id, "Reviewed")}
          type="button"
        >
          Mark Reviewed
        </button>
        <button
          className="rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={lead.status === "Converted"}
          onClick={() => onStartConversion(lead.id)}
          type="button"
        >
          Convert to Repair Case
        </button>
      </div>
    </aside>
  );
}
