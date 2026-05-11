import { StatusBadge } from "@/components/StatusBadge";
import type { CommunityDiscussion, CommunityKnowledgeCase } from "@/types/community";

type DiscussionAISummaryPanelProps = {
  discussion: CommunityDiscussion;
  knowledgeCase?: CommunityKnowledgeCase;
};

function getSummaryStatusTone(status: CommunityDiscussion["aiSummaryStatus"]) {
  if (status === "approved") {
    return "emerald";
  }

  if (status === "draft_available") {
    return "amber";
  }

  return "slate";
}

export function DiscussionAISummaryPanel({
  discussion,
  knowledgeCase,
}: DiscussionAISummaryPanelProps) {
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={getSummaryStatusTone(discussion.aiSummaryStatus)}>
          {discussion.aiSummaryStatus}
        </StatusBadge>
        <StatusBadge tone="slate">RAG-ready preview</StatusBadge>
      </div>

      <h2 className="mt-4 text-xl font-bold text-white">AI TechAdvisor structured summary</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Static mock output only. No AI, summarization, translation, or storage API is called.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {[
          ["Symptom summary", knowledgeCase?.symptomSummary ?? discussion.symptom],
          [
            "Diagnostic steps",
            knowledgeCase?.diagnosticSteps.join(" · ") ??
              "Review technician replies, confirm live readings, and document the tested path.",
          ],
          [
            "False leads",
            knowledgeCase?.falseLeads.join(", ") ?? "Awaiting technician consensus",
          ],
          [
            "Confirmed root cause",
            knowledgeCase?.confirmedRootCause ??
              discussion.finalRootCause ??
              "Not confirmed yet",
          ],
          ["Final repair", knowledgeCase?.finalFix ?? discussion.finalFix ?? "Not finalized yet"],
          ["Recommended parts", knowledgeCase?.partsUsed.join(", ") ?? "Not confirmed yet"],
        ].map(([label, value]) => (
          <div className="rounded-md border border-white/10 bg-slate-950 p-3" key={label}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
          Normalized English summary
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-200">
          {knowledgeCase
            ? `${knowledgeCase.brand} ${knowledgeCase.applianceType} presented with ${knowledgeCase.symptomSummary.toLowerCase()} The confirmed repair path was: ${knowledgeCase.finalFix}`
            : `${discussion.brand} ${discussion.applianceType} discussion is waiting for a technician-approved final cause and fix before becoming a normalized private knowledge case.`}
        </p>
      </div>
    </section>
  );
}
