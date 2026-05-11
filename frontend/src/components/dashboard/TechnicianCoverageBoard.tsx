"use client";

import { useMemo, useState } from "react";

import { TechnicianCoverageCard } from "@/components/dashboard/TechnicianCoverageCard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getCoverageProfilesByWorkload,
  getCoverageProfilesByZip,
} from "@/data/mock-technician-availability";
import type { TechnicianCoverageProfile, WorkloadLevel } from "@/types/technician-availability";

type TechnicianCoverageBoardProps = {
  coverageProfiles: TechnicianCoverageProfile[];
};

const workloadOptions: Array<WorkloadLevel | "All workloads"> = [
  "All workloads",
  "Light",
  "Moderate",
  "Heavy",
];

export function TechnicianCoverageBoard({ coverageProfiles }: TechnicianCoverageBoardProps) {
  const [zipFilter, setZipFilter] = useState("All ZIP codes");
  const [workloadFilter, setWorkloadFilter] =
    useState<WorkloadLevel | "All workloads">("All workloads");

  const zipOptions = useMemo(() => {
    const zipCodes = coverageProfiles.flatMap((profile) => [
      ...(profile.zipCodes ?? []),
      ...profile.availability.extendedAreaZips,
    ]);

    return ["All ZIP codes", ...Array.from(new Set(zipCodes)).sort()];
  }, [coverageProfiles]);

  const filteredProfiles = useMemo(() => {
    const zipMatches =
      zipFilter === "All ZIP codes" ? coverageProfiles : getCoverageProfilesByZip(zipFilter);

    return getCoverageProfilesByWorkload(workloadFilter, zipMatches);
  }, [coverageProfiles, workloadFilter, zipFilter]);

  const totalMockJobs = filteredProfiles.reduce(
    (total, profile) => total + profile.availability.mockDailyJobCount,
    0,
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-bold text-slate-100">ZIP coverage</span>
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

        <label className="block">
          <span className="text-sm font-bold text-slate-100">Workload</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) =>
              setWorkloadFilter(event.target.value as WorkloadLevel | "All workloads")
            }
            value={workloadFilter}
          >
            {workloadOptions.map((workload) => (
              <option key={workload}>{workload}</option>
            ))}
          </select>
        </label>

        <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Mock daily jobs
          </p>
          <p className="mt-1 text-2xl font-bold text-white">{totalMockJobs}</p>
        </div>
      </section>

      {filteredProfiles.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredProfiles.map((profile) => (
            <TechnicianCoverageCard key={profile.slug} profile={profile} />
          ))}
        </section>
      ) : (
        <EmptyState
          title="No technician coverage matches these filters"
          description="Try another ZIP or workload level. Coverage and availability are static mock data only."
        />
      )}
    </div>
  );
}
