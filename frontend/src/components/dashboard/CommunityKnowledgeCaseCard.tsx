import { StatusBadge } from "@/components/StatusBadge";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import type { CommunityKnowledgeCase, KnowledgeConfidenceLevel } from "@/types/community";

type CommunityKnowledgeCaseCardProps = {
  knowledgeCase: CommunityKnowledgeCase;
};

const confidenceTone: Record<KnowledgeConfidenceLevel, "cyan" | "emerald" | "amber" | "slate"> = {
  low: "amber",
  medium: "cyan",
  high: "emerald",
};

export function CommunityKnowledgeCaseCard({ knowledgeCase }: CommunityKnowledgeCaseCardProps) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={confidenceTone[knowledgeCase.confidenceLevel]}>
          {knowledgeCase.confidenceLevel} confidence
        </StatusBadge>
        <CommunityLanguageBadge language={knowledgeCase.languageOriginal} />
        <StatusBadge tone="slate">{knowledgeCase.visibility}</StatusBadge>
      </div>

      <h3 className="mt-4 text-lg font-bold text-white">{knowledgeCase.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{knowledgeCase.symptomSummary}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-slate-950 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Confirmed root cause
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {knowledgeCase.confirmedRootCause}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-slate-950 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Final fix
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{knowledgeCase.finalFix}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Parts used
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {knowledgeCase.partsUsed.map((part) => (
            <span
              className="rounded-md border border-white/10 bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-300"
              key={part}
            >
              {part}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
