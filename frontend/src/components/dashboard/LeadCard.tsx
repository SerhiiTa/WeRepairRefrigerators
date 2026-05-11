import { StatusBadge } from "@/components/StatusBadge";
import type { LeadStatus, MarketplaceLead } from "@/types/lead";

type LeadCardProps = {
  lead: MarketplaceLead;
  isSelected: boolean;
  onSelect: (leadId: string) => void;
  onUpdateStatus: (leadId: string, status: LeadStatus) => void;
  onStartConversion: (leadId: string) => void;
};

const leadStatusTone: Record<LeadStatus, "cyan" | "emerald" | "amber" | "slate"> = {
  New: "cyan",
  Reviewed: "amber",
  Converted: "emerald",
};

export function LeadCard({
  lead,
  isSelected,
  onSelect,
  onUpdateStatus,
  onStartConversion,
}: LeadCardProps) {
  return (
    <article
      className={`rounded-lg border bg-slate-900 p-5 transition ${
        isSelected ? "border-cyan-300/60" : "border-white/10 hover:border-cyan-300/30"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button className="text-left" onClick={() => onSelect(lead.id)} type="button">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={leadStatusTone[lead.status]}>{lead.status}</StatusBadge>
            <span className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300">
              ZIP {lead.zipCode}
            </span>
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-white">
            {lead.customerFirstName} · {lead.applianceBrand} {lead.applianceType}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {lead.issueSummary}
          </p>
        </button>

        <div className="grid gap-2 sm:grid-cols-2 md:min-w-64 md:grid-cols-1">
          <button
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={lead.status !== "New"}
            onClick={() => onUpdateStatus(lead.id, "Reviewed")}
            type="button"
          >
            Mark Reviewed
          </button>
          <button
            className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={lead.status === "Converted"}
            onClick={() => onStartConversion(lead.id)}
            type="button"
          >
            Convert to Repair Case
          </button>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Requested time", lead.requestedTimeWindow],
          ["Matched technician", lead.matchedTechnician],
          ["Service area", lead.serviceArea],
          ["Source", lead.source],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
