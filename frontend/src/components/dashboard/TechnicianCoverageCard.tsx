import { StatusBadge } from "@/components/StatusBadge";
import type { TechnicianCoverageProfile, WorkloadLevel } from "@/types/technician-availability";

type TechnicianCoverageCardProps = {
  profile: TechnicianCoverageProfile;
};

const workloadTone: Record<WorkloadLevel, "cyan" | "emerald" | "amber" | "slate"> = {
  Light: "emerald",
  Moderate: "cyan",
  Heavy: "amber",
};

export function TechnicianCoverageCard({ profile }: TechnicianCoverageCardProps) {
  const assignedZips = profile.zipCodes ?? [];

  return (
    <article className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            {profile.city ?? "Houston MVP"}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{profile.name}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{profile.serviceArea}</p>
        </div>
        <StatusBadge tone={workloadTone[profile.availability.workloadLevel]}>
          {profile.availability.workloadLevel} workload
        </StatusBadge>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["Next window", profile.availability.nextAvailableWindow],
          ["Mock jobs today", `${profile.availability.mockDailyJobCount}`],
          ["Coverage status", profile.availability.coverageStatus],
          ["Availability", profile.availability.availabilityStatus],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Assigned ZIP coverage
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...assignedZips, ...profile.availability.extendedAreaZips].map((zipCode) => (
            <span
              className="rounded-md border border-white/10 bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-300"
              key={zipCode}
            >
              {zipCode}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
