import Link from "next/link";

import { AcceptedSolutionCard } from "@/components/dashboard/AcceptedSolutionCard";
import { DashboardNotice } from "@/components/dashboard/DashboardNotice";
import { DiscussionAISummaryPanel } from "@/components/dashboard/DiscussionAISummaryPanel";
import { DiscussionSidebar } from "@/components/dashboard/DiscussionSidebar";
import { DiscussionThread } from "@/components/dashboard/DiscussionThread";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  getCommunityDiscussionById,
  getCommunityDiscussions,
  getCommunityMessagesByDiscussion,
  getKnowledgeCaseByDiscussion,
} from "@/data/mock-community";
import type {
  CommunityDiscussionPriority,
  CommunityDiscussionStatus,
} from "@/types/community";

type CommunityDiscussionDetailPageProps = {
  params: Promise<{
    discussionId?: string;
  }>;
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

export function generateStaticParams() {
  return getCommunityDiscussions().map((discussion) => ({
    discussionId: discussion.id,
  }));
}

export default async function CommunityDiscussionDetailPage({
  params,
}: CommunityDiscussionDetailPageProps) {
  const { discussionId } = await params;
  const discussion = discussionId ? getCommunityDiscussionById(discussionId) : undefined;

  if (!discussion) {
    return (
      <div className="space-y-6">
        <ErrorState
          title="Discussion not found"
          description="The requested mock technician discussion does not exist. Return to the community board to open an available thread."
        />
        <Link
          className="inline-flex justify-center rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          href="/dashboard/community"
        >
          Back to community
        </Link>
      </div>
    );
  }

  const messages = getCommunityMessagesByDiscussion(discussion.id);
  const knowledgeCase = getKnowledgeCaseByDiscussion(discussion.id);
  const acceptedMessage = messages.find((message) => message.isAcceptedAnswer);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_32%),#0f172a] p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">
              Private discussion thread
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">{discussion.title}</h1>
            <p className="mt-3 max-w-3xl text-slate-300">{discussion.symptom}</p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
            href="/dashboard/community"
          >
            Back to Community
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <StatusBadge tone={statusTone[discussion.status]}>{discussion.status}</StatusBadge>
          <StatusBadge tone={priorityTone[discussion.priority]}>
            {discussion.priority}
          </StatusBadge>
          <CommunityLanguageBadge language={discussion.language} />
          <StatusBadge tone="slate">{discussion.visibility}</StatusBadge>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Appliance", `${discussion.brand} ${discussion.applianceType}`],
            ["Model", discussion.modelNumber ?? "Not provided"],
            ["Opened by", discussion.createdByTechnicianName],
            ["Updated", discussion.updatedAt],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/10 bg-slate-950/80 p-3" key={label}>
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <DashboardNotice tone="emerald">
        Dashboard-only private technician thread. No public SEO route, indexing, customer contact
        information, full address, payment data, AI API, or translation API is used here.
      </DashboardNotice>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="space-y-6">
          <AcceptedSolutionCard
            acceptedMessage={acceptedMessage}
            discussion={discussion}
            knowledgeCase={knowledgeCase}
          />
          <DiscussionThread discussion={discussion} messages={messages} />
          <DiscussionAISummaryPanel discussion={discussion} knowledgeCase={knowledgeCase} />
        </div>
        <DiscussionSidebar discussion={discussion} />
      </div>
    </div>
  );
}
