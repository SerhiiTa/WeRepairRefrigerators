import { StatusBadge } from "@/components/StatusBadge";
import type { ExpertBadge, ExpertBadgeRarity } from "@/types/reputation";

type ExpertBadgeGridProps = {
  badges: ExpertBadge[];
  compact?: boolean;
  title?: string;
};

const rarityTone: Record<ExpertBadgeRarity, "cyan" | "emerald" | "amber" | "slate"> = {
  common: "slate",
  advanced: "cyan",
  elite: "amber",
};

export function ExpertBadgeGrid({
  badges,
  compact = false,
  title = "Expert badge showcase",
}: ExpertBadgeGridProps) {
  return (
    <section className={compact ? "space-y-3" : "space-y-4"}>
      {!compact ? (
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Private recognition
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
        </div>
      ) : null}

      <div className={compact ? "grid gap-3" : "grid gap-4 md:grid-cols-2 xl:grid-cols-4"}>
        {badges.map((badge) => (
          <article
            className="rounded-lg border border-white/10 bg-slate-900 p-4"
            key={badge.id}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-sm font-black text-cyan-100">
                {badge.iconLabel}
              </span>
              <StatusBadge tone={rarityTone[badge.rarity]}>{badge.rarity}</StatusBadge>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">{badge.label}</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {badge.category}
            </p>
            {!compact ? (
              <p className="mt-3 text-sm leading-6 text-slate-400">{badge.description}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
