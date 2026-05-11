import { StatusBadge } from "@/components/StatusBadge";
import type { OpenJob } from "@/types/open-jobs";

type OpenJobCardProps = {
  acceptedTechnicianName?: string;
  job: OpenJob;
  onAccept: (jobId: string) => void;
};

type StatusTone = "cyan" | "emerald" | "amber" | "slate";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function getUrgencyTone(urgency: OpenJob["urgency"]): StatusTone {
  if (urgency === "Urgent" || urgency === "High") {
    return "amber";
  }

  return "cyan";
}

function getStatusTone(status: OpenJob["status"]): StatusTone {
  if (status === "assigned") {
    return "emerald";
  }

  if (status === "expired") {
    return "slate";
  }

  return "cyan";
}

export function OpenJobCard({ acceptedTechnicianName, job, onAccept }: OpenJobCardProps) {
  const isAssigned = job.status === "assigned";
  const isExpired = job.status === "expired";

  return (
    <article
      className={`rounded-lg border p-5 shadow-2xl shadow-black/10 ${
        isAssigned
          ? "border-emerald-300/30 bg-emerald-300/10"
          : isExpired
            ? "border-white/10 bg-slate-900/70 opacity-80"
            : "border-white/10 bg-slate-900"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={getStatusTone(job.status)}>{job.status}</StatusBadge>
            <StatusBadge tone={getUrgencyTone(job.urgency)}>{job.urgency}</StatusBadge>
          </div>
          <h3 className="mt-4 text-xl font-bold text-white">
            {job.brand} {job.applianceType}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{job.issueSummary}</p>
        </div>

        <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-left sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Lead value
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {formatCurrency(job.estimatedLeadValue)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Area</p>
          <p className="mt-1 font-semibold text-white">
            {job.serviceArea} / {job.zipCode}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Preferred window
          </p>
          <p className="mt-1 font-semibold text-white">{job.preferredWindow}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Source</p>
          <p className="mt-1 font-semibold text-white">{job.source}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Customer preview
          </p>
          <p className="mt-1 font-semibold text-white">{job.customerFirstName}, ZIP only</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          {isAssigned
            ? `Accepted by ${acceptedTechnicianName ?? "mock technician"}${
                job.acceptedAt ? ` at ${job.acceptedAt}` : ""
              }.`
            : isExpired
              ? "Expired mock lead. It remains visible for dispatch workflow planning."
              : "Open marketplace job. Accepting only changes local dashboard state."}
        </p>
        <button
          className={`rounded-md px-4 py-3 text-sm font-bold transition ${
            isAssigned
              ? "cursor-default border border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
              : isExpired
                ? "cursor-not-allowed border border-white/10 bg-slate-800 text-slate-500"
                : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          }`}
          disabled={isAssigned || isExpired}
          onClick={() => onAccept(job.id)}
          type="button"
        >
          {isAssigned ? "Assigned" : isExpired ? "Expired" : "Accept Job"}
        </button>
      </div>
    </article>
  );
}
