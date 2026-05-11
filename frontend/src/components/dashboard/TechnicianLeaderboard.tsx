import { TechnicianExpertCard } from "@/components/dashboard/TechnicianExpertCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TechnicianReputation } from "@/types/reputation";

type TechnicianLeaderboardProps = {
  technicians: TechnicianReputation[];
};

export function TechnicianLeaderboard({ technicians }: TechnicianLeaderboardProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Private leaderboard
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {technicians.length} technician{technicians.length === 1 ? "" : "s"}
          </h2>
        </div>
        <p className="text-sm text-slate-400">
          Local sorting/filtering only. Scores are static demonstration data.
        </p>
      </div>

      {technicians.length > 0 ? (
        <div className="space-y-4">
          {technicians.map((technician, index) => (
            <TechnicianExpertCard
              key={technician.id}
              rank={index + 1}
              technician={technician}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No technicians match these filters"
          description="Try another specialty, expert level, language, appliance type, or brand expertise."
        />
      )}
    </section>
  );
}
