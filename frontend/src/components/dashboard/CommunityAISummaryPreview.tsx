import { StatusBadge } from "@/components/StatusBadge";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import type {
  CommunityDiscussion,
  CommunityKnowledgeCase,
  CommunityMessage,
} from "@/types/community";

type CommunityAISummaryPreviewProps = {
  discussion: CommunityDiscussion | null;
  knowledgeCase?: CommunityKnowledgeCase;
  messages: CommunityMessage[];
};

function getSummaryTone(status: CommunityDiscussion["aiSummaryStatus"]) {
  if (status === "approved") {
    return "emerald";
  }

  if (status === "draft_available") {
    return "amber";
  }

  return "slate";
}

export function CommunityAISummaryPreview({
  discussion,
  knowledgeCase,
  messages,
}: CommunityAISummaryPreviewProps) {
  if (!discussion) {
    return (
      <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          AI summary preview
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Select a discussion to preview how technician replies could become a private,
          normalized knowledge case later.
        </p>
      </section>
    );
  }

  const translatedMessages = messages.filter((message) => message.translatedPreview);
  const acceptedAnswer = messages.find((message) => message.isAcceptedAnswer);

  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={getSummaryTone(discussion.aiSummaryStatus)}>
          {discussion.aiSummaryStatus}
        </StatusBadge>
        <CommunityLanguageBadge language={discussion.language} />
      </div>

      <p className="mt-4 text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
        AI summary preview
      </p>
      <h2 className="mt-2 text-xl font-bold text-white">{discussion.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        This is a static mock preview. No AI, translation, or summarization API is called.
      </p>

      <div className="mt-5 grid gap-3">
        {[
          ["Symptom", knowledgeCase?.symptomSummary ?? discussion.symptom],
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
          ["Final fix", knowledgeCase?.finalFix ?? discussion.finalFix ?? "Not confirmed yet"],
          ["Parts used", knowledgeCase?.partsUsed.join(", ") ?? "Not confirmed yet"],
          [
            "Confidence level",
            knowledgeCase?.confidenceLevel ?? "Draft confidence unavailable",
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{value}</p>
          </div>
        ))}
      </div>

      {acceptedAnswer ? (
        <div className="mt-5 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
            Accepted technician answer
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-200">{acceptedAnswer.message}</p>
        </div>
      ) : null}

      {translatedMessages.length > 0 ? (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Static translated previews
          </p>
          {translatedMessages.map((message) => (
            <div className="rounded-md border border-white/10 bg-slate-950 p-3" key={message.id}>
              <p className="text-sm font-bold text-white">{message.technicianName}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {message.translatedPreview}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 rounded-md border border-white/10 bg-slate-950 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Normalized English summary
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Future TechAdvisor can transform private technician collaboration into a structured
          English knowledge case for RAG training and repair assistance, after technician approval.
        </p>
      </div>
    </section>
  );
}
