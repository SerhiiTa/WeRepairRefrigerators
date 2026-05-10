"use client";

import type { RepairCase } from "@/types/repair-case";

type RepairCaseSelectorProps = {
  repairCases: RepairCase[];
  selectedRepairCaseId: string;
  onSelectRepairCase: (repairCaseId: string) => void;
};

export function RepairCaseSelector({
  repairCases,
  selectedRepairCaseId,
  onSelectRepairCase,
}: RepairCaseSelectorProps) {
  if (repairCases.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900 p-5">
        <h2 className="text-lg font-bold text-white">No repair cases available</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Mock repair cases will appear here once local fixture data exists.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <label htmlFor="ai-repair-case" className="text-sm font-bold text-white">
        Select repair case
      </label>
      <select
        id="ai-repair-case"
        value={selectedRepairCaseId}
        onChange={(event) => onSelectRepairCase(event.target.value)}
        className="mt-3 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-300"
      >
        {repairCases.map((repairCase) => (
          <option key={repairCase.id} value={repairCase.id}>
            {repairCase.caseNumber} - {repairCase.appliance.brand} -{" "}
            {repairCase.location.neighborhood}
          </option>
        ))}
      </select>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {repairCases.map((repairCase) => {
          const isSelected = repairCase.id === selectedRepairCaseId;

          return (
            <button
              key={repairCase.id}
              type="button"
              onClick={() => onSelectRepairCase(repairCase.id)}
              className={`rounded-md border p-3 text-left transition ${
                isSelected
                  ? "border-cyan-300/60 bg-cyan-300/10"
                  : "border-white/10 bg-slate-950 hover:border-cyan-300/40"
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {repairCase.caseNumber}
              </p>
              <p className="mt-1 text-sm font-bold text-white">{repairCase.appliance.brand}</p>
              <p className="mt-1 text-xs text-slate-400">
                {repairCase.location.neighborhood}, {repairCase.location.city}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
