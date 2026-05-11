import type { CommunityLanguage } from "@/types/community";
import type { ExpertLevel, ReputationFilters as ReputationFiltersType } from "@/types/reputation";

type ReputationFiltersProps = {
  applianceOptions: string[];
  brandOptions: string[];
  filters: ReputationFiltersType;
  onChange: (filters: ReputationFiltersType) => void;
  specialtyOptions: string[];
};

const expertLevelOptions: Array<ExpertLevel | "All levels"> = [
  "All levels",
  "rising",
  "trusted",
  "expert",
  "master",
];

const languageOptions: Array<CommunityLanguage | "All languages"> = [
  "All languages",
  "en",
  "es",
  "ru",
  "uk",
];

const sortOptions: ReputationFiltersType["sortBy"][] = [
  "Reputation score",
  "Accepted solutions",
  "Helpful replies",
  "Helpful points",
];

export function ReputationFilters({
  applianceOptions,
  brandOptions,
  filters,
  onChange,
  specialtyOptions,
}: ReputationFiltersProps) {
  return (
    <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-2 xl:grid-cols-3">
      <label className="block">
        <span className="text-sm font-bold text-slate-100">Specialty</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) => onChange({ ...filters, specialty: event.target.value })}
          value={filters.specialty}
        >
          {specialtyOptions.map((specialty) => (
            <option key={specialty}>{specialty}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-100">Expert level</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) =>
            onChange({
              ...filters,
              expertLevel: event.target.value as ReputationFiltersType["expertLevel"],
            })
          }
          value={filters.expertLevel}
        >
          {expertLevelOptions.map((level) => (
            <option key={level}>{level}</option>
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
              language: event.target.value as ReputationFiltersType["language"],
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
        <span className="text-sm font-bold text-slate-100">Brand expertise</span>
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
        <span className="text-sm font-bold text-slate-100">Sort by</span>
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          onChange={(event) =>
            onChange({
              ...filters,
              sortBy: event.target.value as ReputationFiltersType["sortBy"],
            })
          }
          value={filters.sortBy}
        >
          {sortOptions.map((sortOption) => (
            <option key={sortOption}>{sortOption}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
