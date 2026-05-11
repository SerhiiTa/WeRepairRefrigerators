import { StatusBadge } from "@/components/StatusBadge";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import type {
  CommunityDiscussion,
  CommunityDiscussionPriority,
  CommunityDiscussionStatus,
} from "@/types/community";

type DiscussionSidebarProps = {
  discussion: CommunityDiscussion;
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

export function DiscussionSidebar({ discussion }: DiscussionSidebarProps) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-6">
      <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          Discussion details
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge tone={statusTone[discussion.status]}>{discussion.status}</StatusBadge>
          <StatusBadge tone={priorityTone[discussion.priority]}>
            {discussion.priority}
          </StatusBadge>
          <CommunityLanguageBadge language={discussion.language} />
          <StatusBadge tone="slate">{discussion.visibility}</StatusBadge>
        </div>

        <dl className="mt-5 grid gap-3">
          {[
            ["Appliance", `${discussion.brand} ${discussion.applianceType}`],
            ["Model", discussion.modelNumber ?? "Not provided"],
            ["Opened by", discussion.createdByTechnicianName],
            ["Role", discussion.createdByTechnicianRole],
            ["Service area", discussion.serviceArea ?? "Not provided"],
            ["Created", discussion.createdAt],
            ["Updated", discussion.updatedAt],
            ["Messages", discussion.messageCount.toString()],
            ["Helpful marks", discussion.helpfulCount.toString()],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/10 bg-slate-950 p-3" key={label}>
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">Tags</p>
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
      </section>
    </aside>
  );
}
