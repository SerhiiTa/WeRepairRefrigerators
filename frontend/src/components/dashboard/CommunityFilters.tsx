import type { CommunityDiscussionPriority, CommunityDiscussionStatus, CommunityFilters as CommunityFiltersType, CommunityLanguage } from "@/types/community";

type CommunityFiltersProps = {
  applianceOptions: string[];
  brandOptions: string[];
  filters: CommunityFiltersType;
  onChange: (filters: CommunityFiltersType) => void;
};

const statusOptions: Array<CommunityDiscussionStatus | "All statuses"> = [
  "All statuses",
  "open",
  "in_discussion",
  "solved",
  "archived",
];

const languageOptions: Array<CommunityLanguage | "All languages"> = [
  "All languages",
  "en",
  "es",
  "ru",
  "uk",
];

const priorityOptions: Array<CommunityDiscussionPriority | "All priorities"> = [
  "All priorities",
  "normal",
  "urgent",
  "expert_needed",
];

export function CommunityFilters({
  applianceOptions,
  brandOptions,
  filters,
  onChange,
}: CommunityFiltersProps) {
  return (
    <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-2 xl:grid-cols-5">
      <label className="block">
        <span className="text-sm font-bold text-slate-100">Brand</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) => onChange({ ...filters, brand: event.target.value })}
          value={filters.brand}
        >
          {brandOptions.map((brand) => (
            <option key={brand}>{brand}</option>
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
          {applianceOptions.map((applianceType) => (
            <option key={applianceType}>{applianceType}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-100">Status</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) =>
            onChange({
              ...filters,
              status: event.target.value as CommunityFiltersType["status"],
            })
          }
          value={filters.status}
        >
          {statusOptions.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-100">Language</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) =>
            onChange({
              ...filters,
              language: event.target.value as CommunityFiltersType["language"],
            })
          }
          value={filters.language}
        >
          {languageOptions.map((language) => (
            <option key={language}>{language}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-100">Priority</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) =>
            onChange({
              ...filters,
              priority: event.target.value as CommunityFiltersType["priority"],
            })
          }
          value={filters.priority}
        >
          {priorityOptions.map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
