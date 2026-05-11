import { StatusBadge } from "@/components/StatusBadge";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import { ExpertBadgeGrid } from "@/components/dashboard/ExpertBadgeGrid";
import { TechnicianSpecialtyBadge } from "@/components/dashboard/TechnicianSpecialtyBadge";
import type { ExpertLevel, TechnicianReputation } from "@/types/reputation";

type TechnicianExpertCardProps = {
  rank?: number;
  technician: TechnicianReputation;
};

const levelTone: Record<ExpertLevel, "cyan" | "emerald" | "amber" | "slate"> = {
  rising: "slate",
  trusted: "cyan",
  expert: "emerald",
  master: "amber",
};

export function TechnicianExpertCard({ rank, technician }: TechnicianExpertCardProps) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {rank ? <StatusBadge tone="slate">#{rank}</StatusBadge> : null}
            <StatusBadge tone={levelTone[technician.expertLevel]}>
              {technician.expertLevel}
            </StatusBadge>
            <StatusBadge tone="slate">{technician.visibility}</StatusBadge>
          </div>
          <h3 className="mt-4 text-xl font-bold text-white">{technician.technicianName}</h3>
          <p className="mt-1 text-sm text-slate-400">{technician.role}</p>
        </div>
        <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-left md:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Reputation score
          </p>
          <p className="mt-1 text-3xl font-bold text-white">{technician.reputationScore}</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Helpful points", technician.helpfulPoints.toString()],
          ["Accepted solutions", technician.acceptedSolutions.toString()],
          ["Helpful replies", technician.helpfulReplies.toString()],
          ["Discussions started", technician.discussionsStarted.toString()],
        ].map(([label, value]) => (
          <div className="rounded-md border border-white/10 bg-slate-950 p-3" key={label}>
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 text-sm font-bold text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Specialties
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {technician.specialties.map((specialty) => (
              <TechnicianSpecialtyBadge key={specialty} label={specialty} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Languages
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {technician.languages.map((language) => (
              <CommunityLanguageBadge key={language} language={language} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Service areas
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {technician.serviceAreas.join(", ")}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Activity
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Joined {technician.joinedAt}; last active {technician.lastActiveAt}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-5">
        <ExpertBadgeGrid badges={technician.badges} compact />
      </div>
    </article>
  );
}
