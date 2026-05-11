import { StatusBadge } from "@/components/StatusBadge";
import type {
  CommunityDiscussion,
  CommunityKnowledgeCase,
  CommunityMessage,
  KnowledgeConfidenceLevel,
} from "@/types/community";

type AcceptedSolutionCardProps = {
  acceptedMessage?: CommunityMessage;
  discussion: CommunityDiscussion;
  knowledgeCase?: CommunityKnowledgeCase;
};

const confidenceTone: Record<KnowledgeConfidenceLevel, "cyan" | "emerald" | "amber" | "slate"> = {
  low: "amber",
  medium: "cyan",
  high: "emerald",
};

export function AcceptedSolutionCard({
  acceptedMessage,
  discussion,
  knowledgeCase,
}: AcceptedSolutionCardProps) {
  const rootCause =
    knowledgeCase?.confirmedRootCause ?? discussion.finalRootCause ?? "Not confirmed yet";
  const finalFix = knowledgeCase?.finalFix ?? discussion.finalFix ?? "Not finalized yet";
  const partsUsed = knowledgeCase?.partsUsed ?? ["Not confirmed yet"];
  const confidence = knowledgeCase?.confidenceLevel;

  return (
    <section className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="emerald">Marked as Accepted Solution</StatusBadge>
        {confidence ? (
          <StatusBadge tone={confidenceTone[confidence]}>{confidence} confidence</StatusBadge>
        ) : (
          <StatusBadge tone="slate">confidence pending</StatusBadge>
        )}
      </div>

      <h2 className="mt-4 text-xl font-bold text-white">Accepted repair solution</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Solved by {acceptedMessage?.technicianName ?? "technician consensus"}.
      </p>

      <div className="mt-5 grid gap-3">
        {[
          ["Confirmed root cause", rootCause],
          ["Final fix", finalFix],
          ["Parts used", partsUsed.join(", ")],
        ].map(([label, value]) => (
          <div className="rounded-md border border-emerald-300/20 bg-slate-950 p-3" key={label}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              {label}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
