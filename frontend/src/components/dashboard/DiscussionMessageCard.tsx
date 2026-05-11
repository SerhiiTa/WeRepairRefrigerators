import { StatusBadge } from "@/components/StatusBadge";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import type { CommunityMessage } from "@/types/community";

type DiscussionMessageCardProps = {
  isExpertResponse?: boolean;
  isOriginalPoster?: boolean;
  message: CommunityMessage;
};

export function DiscussionMessageCard({
  isExpertResponse = false,
  isOriginalPoster = false,
  message,
}: DiscussionMessageCardProps) {
  return (
    <article
      className={`rounded-lg border p-5 ${
        message.isAcceptedAnswer
          ? "border-emerald-300/30 bg-emerald-300/10"
          : isOriginalPoster
            ? "border-cyan-300/30 bg-cyan-300/10"
            : "border-white/10 bg-slate-900"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CommunityLanguageBadge language={message.language} />
            {isOriginalPoster ? <StatusBadge tone="cyan">original poster</StatusBadge> : null}
            {isExpertResponse ? <StatusBadge tone="amber">expert response</StatusBadge> : null}
            {message.isAcceptedAnswer ? (
              <StatusBadge tone="emerald">accepted answer</StatusBadge>
            ) : null}
          </div>
          <h3 className="mt-3 text-base font-bold text-white">{message.technicianName}</h3>
          <p className="mt-1 text-sm text-slate-400">{message.technicianRole}</p>
        </div>
        <p className="text-sm text-slate-500">{message.createdAt}</p>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-200">{message.message}</p>

      {message.translatedPreview ? (
        <div className="mt-4 rounded-md border border-cyan-300/20 bg-slate-950 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Static English translated preview
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {message.translatedPreview}
          </p>
        </div>
      ) : null}
    </article>
  );
}
