"use client";

import { useMemo, useState } from "react";

import { MetricCard } from "@/components/MetricCard";
import { ExpertBadgeGrid } from "@/components/dashboard/ExpertBadgeGrid";
import { ReputationFilters } from "@/components/dashboard/ReputationFilters";
import { TechnicianLeaderboard } from "@/components/dashboard/TechnicianLeaderboard";
import { TechnicianSpecialtyBadge } from "@/components/dashboard/TechnicianSpecialtyBadge";
import { filterTechnicianReputation, getAllExpertBadges } from "@/data/mock-reputation";
import type { ReputationFilters as ReputationFiltersType, TechnicianReputation } from "@/types/reputation";

type ReputationOverviewProps = {
  technicians: TechnicianReputation[];
};

const defaultFilters: ReputationFiltersType = {
  applianceType: "All appliance types",
  brand: "All brands",
  expertLevel: "All levels",
  language: "All languages",
  sortBy: "Reputation score",
  specialty: "All specialties",
};

function buildOptions(label: string, values: string[]) {
  return [label, ...Array.from(new Set(values)).sort()];
}

function getTopSpecialty(technicians: TechnicianReputation[]) {
  const specialtyCounts = technicians
    .flatMap((technician) => technician.specialties)
    .reduce<Record<string, number>>((counts, specialty) => {
      counts[specialty] = (counts[specialty] ?? 0) + 1;
      return counts;
    }, {});

  return (
    Object.entries(specialtyCounts).sort(
      ([, firstCount], [, secondCount]) => secondCount - firstCount,
    )[0]?.[0] ?? "No specialty"
  );
}

export function ReputationOverview({ technicians }: ReputationOverviewProps) {
  const [filters, setFilters] = useState<ReputationFiltersType>(defaultFilters);

  const filteredTechnicians = useMemo(
    () => filterTechnicianReputation(technicians, filters),
    [filters, technicians],
  );

  const specialtyOptions = useMemo(
    () => buildOptions("All specialties", technicians.flatMap((technician) => technician.specialties)),
    [technicians],
  );
  const applianceOptions = useMemo(
    () =>
      buildOptions(
        "All appliance types",
        technicians.flatMap((technician) => technician.solvedApplianceTypes),
      ),
    [technicians],
  );
  const brandOptions = useMemo(
    () => buildOptions("All brands", technicians.flatMap((technician) => technician.solvedBrands)),
    [technicians],
  );

  const activeExperts = filteredTechnicians.filter(
    (technician) => technician.expertLevel === "expert" || technician.expertLevel === "master",
  );
  const acceptedSolutions = filteredTechnicians.reduce(
    (total, technician) => total + technician.acceptedSolutions,
    0,
  );
  const helpfulReplies = filteredTechnicians.reduce(
    (total, technician) => total + technician.helpfulReplies,
    0,
  );
  const allBadges = getAllExpertBadges();
  const topContributors = filteredTechnicians.slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          helper="Expert and master technicians in the filtered private leaderboard."
          label="Active Experts"
          value={activeExperts.length.toString()}
        />
        <MetricCard
          helper="Accepted solutions across filtered private community contributors."
          label="Accepted Solutions"
          value={acceptedSolutions.toString()}
        />
        <MetricCard
          helper="Helpful technician replies in static community reputation data."
          label="Helpful Replies"
          value={helpfulReplies.toString()}
        />
        <MetricCard
          helper="Most common specialty among filtered technicians."
          label="Top Specialty"
          value={getTopSpecialty(filteredTechnicians)}
        />
      </section>

      <section className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-5">
        <p className="text-sm font-bold text-emerald-100">
          Reputation metrics are designed for internal technician collaboration and are not publicly
          indexed.
        </p>
      </section>

      <ReputationFilters
        applianceOptions={applianceOptions}
        brandOptions={brandOptions}
        filters={filters}
        onChange={setFilters}
        specialtyOptions={specialtyOptions}
      />

      <TechnicianLeaderboard technicians={filteredTechnicians} />

      <section className="space-y-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">
            Top contributors
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">Community trust signals</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {topContributors.map((technician) => (
            <article
              className="rounded-lg border border-white/10 bg-slate-900 p-5"
              key={technician.id}
            >
              <p className="text-lg font-bold text-white">{technician.technicianName}</p>
              <p className="mt-1 text-sm text-slate-400">{technician.role}</p>
              <p className="mt-4 text-3xl font-bold text-cyan-200">
                {technician.reputationScore}
              </p>
              <p className="mt-1 text-sm text-slate-500">reputation score</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {technician.specialties.slice(0, 2).map((specialty) => (
                  <TechnicianSpecialtyBadge key={specialty} label={specialty} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <ExpertBadgeGrid badges={allBadges} />
    </div>
  );
}
