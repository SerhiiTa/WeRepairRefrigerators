"use client";

import { useMemo, useState } from "react";

import { MetricCard } from "@/components/MetricCard";
import { CommunityAISummaryPreview } from "@/components/dashboard/CommunityAISummaryPreview";
import { CommunityDiscussionCard } from "@/components/dashboard/CommunityDiscussionCard";
import { CommunityFilters } from "@/components/dashboard/CommunityFilters";
import { CommunityKnowledgeCaseCard } from "@/components/dashboard/CommunityKnowledgeCaseCard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  filterCommunityDiscussions,
  getCommunityMessagesByDiscussion,
  getKnowledgeCaseByDiscussion,
} from "@/data/mock-community";
import type {
  CommunityDiscussion,
  CommunityFilters as CommunityFiltersType,
  CommunityKnowledgeCase,
} from "@/types/community";

type CommunityOverviewProps = {
  discussions: CommunityDiscussion[];
  knowledgeCases: CommunityKnowledgeCase[];
};

const defaultFilters: CommunityFiltersType = {
  applianceType: "All appliances",
  brand: "All brands",
  language: "All languages",
  priority: "All priorities",
  status: "All statuses",
};

function buildOptions(label: string, values: string[]) {
  return [label, ...Array.from(new Set(values)).sort()];
}

export function CommunityOverview({ discussions, knowledgeCases }: CommunityOverviewProps) {
  const [filters, setFilters] = useState<CommunityFiltersType>(defaultFilters);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState(discussions[0]?.id ?? "");

  const brandOptions = useMemo(
    () => buildOptions("All brands", discussions.map((discussion) => discussion.brand)),
    [discussions],
  );
  const applianceOptions = useMemo(
    () =>
      buildOptions(
        "All appliances",
        discussions.map((discussion) => discussion.applianceType),
      ),
    [discussions],
  );

  const filteredDiscussions = useMemo(
    () => filterCommunityDiscussions(discussions, filters),
    [discussions, filters],
  );

  const selectedDiscussion =
    discussions.find((discussion) => discussion.id === selectedDiscussionId) ??
    filteredDiscussions[0] ??
    null;

  const selectedMessages = selectedDiscussion
    ? getCommunityMessagesByDiscussion(selectedDiscussion.id)
    : [];
  const selectedKnowledgeCase = selectedDiscussion
    ? getKnowledgeCaseByDiscussion(selectedDiscussion.id)
    : undefined;

  const activeDiscussions = filteredDiscussions.filter(
    (discussion) => discussion.status === "open" || discussion.status === "in_discussion",
  );
  const solvedCases = filteredDiscussions.filter((discussion) => discussion.status === "solved");
  const expertNeeded = filteredDiscussions.filter(
    (discussion) => discussion.priority === "expert_needed",
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          helper="Open and in-discussion technician repair threads."
          label="Active Discussions"
          value={activeDiscussions.length.toString()}
        />
        <MetricCard
          helper="Solved private cases available for future knowledge base review."
          label="Solved Cases"
          value={solvedCases.length.toString()}
        />
        <MetricCard
          helper="Repair questions flagged for sealed-system or senior technician help."
          label="Expert Needed"
          value={expertNeeded.length.toString()}
        />
        <MetricCard
          helper="Approved private knowledge cases prepared from discussions."
          label="Knowledge Cases"
          value={knowledgeCases.length.toString()}
        />
      </section>

      <CommunityFilters
        applianceOptions={applianceOptions}
        brandOptions={brandOptions}
        filters={filters}
        onChange={setFilters}
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_24rem] xl:items-start">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
                Private repair help
              </p>
              <h2 className="mt-1 text-2xl font-bold text-white">
                {filteredDiscussions.length} discussion
                {filteredDiscussions.length === 1 ? "" : "s"}
              </h2>
            </div>
            <p className="text-sm text-slate-400">
              Technician-only mock data. No customer contact details are shown.
            </p>
          </div>

          {filteredDiscussions.length > 0 ? (
            <div className="space-y-4">
              {filteredDiscussions.map((discussion) => (
                <CommunityDiscussionCard
                  discussion={discussion}
                  isSelected={selectedDiscussion?.id === discussion.id}
                  key={discussion.id}
                  onSelect={setSelectedDiscussionId}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No community discussions match these filters"
              description="Try another brand, appliance type, language, status, or priority. This community board uses static mock discussion data."
            />
          )}
        </div>

        <CommunityAISummaryPreview
          discussion={selectedDiscussion}
          knowledgeCase={selectedKnowledgeCase}
          messages={selectedMessages}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">
              Private knowledge base preview
            </p>
            <h2 className="mt-1 text-2xl font-bold text-white">
              Technician-approved repair cases
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">
            These cases are normalized for future TechAdvisor/RAG workflows and stay private to
            verified technicians.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {knowledgeCases.map((knowledgeCase) => (
            <CommunityKnowledgeCaseCard
              key={knowledgeCase.id}
              knowledgeCase={knowledgeCase}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
