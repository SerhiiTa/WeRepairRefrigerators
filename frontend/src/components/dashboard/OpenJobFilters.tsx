import type { OpenJobFilters, OpenJobUrgency } from "@/types/open-jobs";

type OpenJobFiltersProps = {
  applianceTypeOptions: string[];
  filters: OpenJobFilters;
  onChange: (filters: OpenJobFilters) => void;
  sourceOptions: string[];
  zipOptions: string[];
};

const urgencyOptions: Array<OpenJobUrgency | "All urgencies"> = [
  "All urgencies",
  "Normal",
  "High",
  "Urgent",
];

export function OpenJobFilters({
  applianceTypeOptions,
  filters,
  onChange,
  sourceOptions,
  zipOptions,
}: OpenJobFiltersProps) {
  return (
    <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-2 xl:grid-cols-4">
      <label className="block">
        <span className="text-sm font-bold text-slate-100">ZIP code</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) => onChange({ ...filters, zipCode: event.target.value })}
          value={filters.zipCode}
        >
          {zipOptions.map((zipCode) => (
            <option key={zipCode}>{zipCode}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-100">Appliance type</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) => onChange({ ...filters, applianceType: event.target.value })}
          value={filters.applianceType}
        >
          {applianceTypeOptions.map((applianceType) => (
            <option key={applianceType}>{applianceType}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-100">Urgency</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) =>
            onChange({
              ...filters,
              urgency: event.target.value as OpenJobFilters["urgency"],
            })
          }
          value={filters.urgency}
        >
          {urgencyOptions.map((urgency) => (
            <option key={urgency}>{urgency}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-100">Lead source</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) => onChange({ ...filters, source: event.target.value })}
          value={filters.source}
        >
          {sourceOptions.map((source) => (
            <option key={source}>{source}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
