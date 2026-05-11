"use client";

import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import {
  type LeadRepairCaseDraftPriority,
  mapLeadToRepairCaseDraft,
} from "@/lib/lead-to-repair-case";
import type { MarketplaceLead } from "@/types/lead";

type LeadConversionPreviewProps = {
  lead: MarketplaceLead;
  isConfirmed: boolean;
  onCancel: () => void;
  onConfirm: (leadId: string) => void;
};

const priorities: LeadRepairCaseDraftPriority[] = ["Normal", "High", "Urgent"];

export function LeadConversionPreview({
  lead,
  isConfirmed,
  onCancel,
  onConfirm,
}: LeadConversionPreviewProps) {
  const draft = useMemo(() => mapLeadToRepairCaseDraft(lead), [lead]);
  const [modelNumber, setModelNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [internalTechnicianNote, setInternalTechnicianNote] = useState("");
  const [priority, setPriority] = useState<LeadRepairCaseDraftPriority>("Normal");

  if (isConfirmed) {
    return (
      <aside className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">
          Mock conversion prepared
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
          Lead marked converted locally.
        </h2>
        <p className="mt-3 text-sm leading-6 text-emerald-50">
          This is a mock success state. No repair case record was created, no route data changed,
          and nothing was persisted.
        </p>
        <dl className="mt-5 space-y-3">
          {[
            ["Customer", draft.customerFirstName],
            ["Appliance", `${draft.brand} ${draft.applianceType}`],
            ["ZIP code", draft.zipCode],
            ["Status", "Converted in local UI only"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-emerald-200/20 bg-slate-950/70 p-3">
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200/80">
                {label}
              </dt>
              <dd className="mt-1 text-sm leading-6 text-emerald-50">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          className="mt-5 rounded-md border border-emerald-200/30 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/5"
          onClick={onCancel}
          type="button"
        >
          Close Preview
        </button>
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-cyan-300/20 bg-slate-900 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Conversion preview
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
            Repair case draft
          </h2>
        </div>
        <StatusBadge tone="slate">{draft.status}</StatusBadge>
      </div>

      <p className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
        This is a mock conversion preview. In the live version, confirming would create a repair
        case record.
      </p>

      <dl className="mt-5 grid gap-3">
        {[
          ["Customer first name", draft.customerFirstName],
          ["ZIP code", draft.zipCode],
          ["Appliance", `${draft.brand} ${draft.applianceType}`],
          ["Issue summary", draft.issueSummary],
          ["Preferred time window", draft.preferredTimeWindow],
          ["Matched technician", draft.matchedTechnician],
          ["Source", draft.source],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-100">Appliance model number</span>
          <input
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
            onChange={(event) => setModelNumber(event.target.value)}
            placeholder="Enter after technician verifies label"
            type="text"
            value={modelNumber}
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">Serial number</span>
          <input
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
            onChange={(event) => setSerialNumber(event.target.value)}
            placeholder="Optional mock field"
            type="text"
            value={serialNumber}
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">Priority</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => setPriority(event.target.value as LeadRepairCaseDraftPriority)}
            value={priority}
          >
            {priorities.map((priorityOption) => (
              <option key={priorityOption}>{priorityOption}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">Internal technician note</span>
          <textarea
            className="mt-2 min-h-28 w-full resize-y rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
            onChange={(event) => setInternalTechnicianNote(event.target.value)}
            placeholder="Internal note for CRM only. Not public SEO content."
            value={internalTechnicianNote}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          className="rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          onClick={() => onConfirm(lead.id)}
          type="button"
        >
          Confirm Mock Conversion
        </button>
      </div>
    </aside>
  );
}
