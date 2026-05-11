import { StatusBadge } from "@/components/StatusBadge";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import type { CommunityDiscussion, CommunityDiscussionPriority, CommunityDiscussionStatus } from "@/types/community";

type CommunityDiscussionCardProps = {
  discussion: CommunityDiscussion;
  isSelected: boolean;
  onSelect: (discussionId: string) => void;
};

const statusTone: Record<CommunityDiscussionStatus, "cyan" | "emerald" | "amber" | "slate"> = {
  open: "cyan",
  in_discussion: "amber",
  solved: "emerald",
  archived: "slate",
};

const priorityTone: Record<CommunityDiscussionPriority, "cyan" | "emerald" | "amber" | "slate"> = {
  normal: "slate",
  urgent: "amber",
  expert_needed: "amber",
};

export function CommunityDiscussionCard({
  discussion,
  isSelected,
  onSelect,
}: CommunityDiscussionCardProps) {
  return (
    <article
      className={`rounded-lg border bg-slate-900 p-5 transition ${
        isSelected ? "border-cyan-300/60" : "border-white/10 hover:border-cyan-300/30"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone[discussion.status]}>{discussion.status}</StatusBadge>
            <StatusBadge tone={priorityTone[discussion.priority]}>
              {discussion.priority}
            </StatusBadge>
            <CommunityLanguageBadge language={discussion.language} />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-white">
            {discussion.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{discussion.symptom}</p>
        </div>

        <button
          className="rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          onClick={() => onSelect(discussion.id)}
          type="button"
        >
          Open Discussion
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Appliance", `${discussion.brand} ${discussion.applianceType}`],
          ["Model", discussion.modelNumber ?? "Not provided"],
          ["Opened by", `${discussion.createdByTechnicianName}, ${discussion.createdByTechnicianRole}`],
          ["Updated", discussion.updatedAt],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {discussion.tags.map((tag) => (
          <span
            className="rounded-md border border-white/10 bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-300"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-4 text-sm text-slate-400">
        <span>{discussion.messageCount} messages</span>
        <span>{discussion.helpfulCount} helpful marks</span>
        <span>{discussion.visibility}</span>
      </div>
    </article>
  );
}
