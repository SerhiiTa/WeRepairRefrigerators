"use client";

import { useMemo, useState } from "react";

import { AiArticlePreview } from "@/components/dashboard/AiArticlePreview";
import { AiWorkflowCard } from "@/components/dashboard/AiWorkflowCard";
import { DetailSection } from "@/components/dashboard/DetailSection";
import { ImagePromptPreview } from "@/components/dashboard/ImagePromptPreview";
import { PrivacyCheckList } from "@/components/dashboard/PrivacyCheckList";
import { PublicRepairCasePreview } from "@/components/dashboard/PublicRepairCasePreview";
import { PublishReadinessSteps } from "@/components/dashboard/PublishReadinessSteps";
import { RepairCaseSelector } from "@/components/dashboard/RepairCaseSelector";
import { TelegramIntakeMock } from "@/components/dashboard/TelegramIntakeMock";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  aiWorkflowCards,
  buildAiArticleDraftPreview,
  buildImagePromptMocks,
  buildPublicRepairCasePreview,
  telegramIntakeMock,
  voiceNoteConversionMock,
} from "@/lib/mock-ai-workflows";
import type { AiWorkflowReviewStatus, AiWorkflowStatusTone } from "@/types/ai-workflow";
import type { RepairCase } from "@/types/repair-case";

type AiWorkflowWorkspaceProps = {
  repairCases: RepairCase[];
};

type WorkflowTab = "Intake" | "Privacy Transform" | "Article Draft" | "Image Prompts" | "Review & Publish";

const workflowTabs: WorkflowTab[] = [
  "Intake",
  "Privacy Transform",
  "Article Draft",
  "Image Prompts",
  "Review & Publish",
];

const reviewStatuses: AiWorkflowReviewStatus[] = [
  "Draft",
  "Technician Review",
  "Privacy Checked",
  "SEO Checked",
  "Ready to Publish",
];

const reviewStatusTone: Record<AiWorkflowReviewStatus, AiWorkflowStatusTone> = {
  Draft: "slate",
  "Technician Review": "amber",
  "Privacy Checked": "cyan",
  "SEO Checked": "cyan",
  "Ready to Publish": "emerald",
};

const privateFieldRows = [
  ["Customer identity", "Hidden from public output"],
  ["Phone number", "Hidden from public output"],
  ["Exact address", "Replaced by city/service area"],
  ["Internal notes", "Technician/admin only"],
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildReadinessSteps(currentStatus: AiWorkflowReviewStatus) {
  const currentIndex = reviewStatuses.indexOf(currentStatus);

  return reviewStatuses.map((status, index) => ({
    label: status,
    description:
      index === 0
        ? "Mock draft is generated from selected repair case data."
        : index === 1
          ? "Technician confirms findings, parts, repair result, and tone."
          : index === 2
            ? "Customer identity, phone, exact address, and private notes are excluded."
            : index === 3
              ? "Title, meta description, slug, FAQ ideas, and internal links are checked."
              : "Content is ready for a future publish action after auth and database work exist.",
    status: index < currentIndex ? "Complete" : index === currentIndex ? "Current" : "Locked",
    tone:
      index < currentIndex
        ? "emerald"
        : index === currentIndex
          ? reviewStatusTone[status]
          : "slate",
  }));
}

export function AiWorkflowWorkspace({ repairCases }: AiWorkflowWorkspaceProps) {
  const firstRepairCase = repairCases[0];
  const [selectedRepairCaseId, setSelectedRepairCaseId] = useState(firstRepairCase?.id ?? "");
  const [activeTab, setActiveTab] = useState<WorkflowTab>("Intake");
  const [reviewStatus, setReviewStatus] = useState<AiWorkflowReviewStatus>("Draft");

  const selectedRepairCase = useMemo(
    () => repairCases.find((repairCase) => repairCase.id === selectedRepairCaseId),
    [repairCases, selectedRepairCaseId],
  );

  const workflowOutput = useMemo(() => {
    if (!selectedRepairCase) {
      return null;
    }

    return {
      articlePreview: buildAiArticleDraftPreview(selectedRepairCase),
      publicRepairCasePreview: buildPublicRepairCasePreview(selectedRepairCase),
      imagePrompts: buildImagePromptMocks(selectedRepairCase),
    };
  }, [selectedRepairCase]);

  const readinessSteps = useMemo(() => buildReadinessSteps(reviewStatus), [reviewStatus]);

  if (!selectedRepairCase || !workflowOutput) {
    return (
      <EmptyState
        title="No repair case selected"
        description="Add or select a mock repair case before previewing the AI workflow."
        action={{
          label: "View repair cases",
          href: "/dashboard/repair-cases",
        }}
      />
    );
  }

  const currentStatusIndex = reviewStatuses.indexOf(reviewStatus);
  const nextStatus = reviewStatuses[currentStatusIndex + 1];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),#0f172a] p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
              AI workflow mock
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
              Turn repair case notes into privacy-safe public SEO content.
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-300">
              Select a mock repair case, review the private fields, transform it into public-safe
              content, and walk the draft through local-only review states.
            </p>
          </div>
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
            <p className="text-sm font-bold text-cyan-100">Workflow status</p>
            <div className="mt-3">
              <StatusBadge tone={reviewStatusTone[reviewStatus]}>{reviewStatus}</StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Static UI state only. No publishing or persistence.
            </p>
          </div>
        </div>
      </section>

      <RepairCaseSelector
        repairCases={repairCases}
        selectedRepairCaseId={selectedRepairCase.id}
        onSelectRepairCase={(repairCaseId) => {
          setSelectedRepairCaseId(repairCaseId);
          setActiveTab("Intake");
          setReviewStatus("Draft");
        }}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {aiWorkflowCards.map((workflow) => (
          <AiWorkflowCard key={workflow.title} workflow={workflow} />
        ))}
      </section>

      <nav className="rounded-lg border border-white/10 bg-slate-900 p-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {workflowTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-3 text-sm font-bold transition ${
                activeTab === tab
                  ? "bg-cyan-300/10 text-cyan-100"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === "Intake" ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <DetailSection
            title="Private repair case data"
            description="Dashboard-only repair case fields shown before privacy transformation."
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Case number", selectedRepairCase.caseNumber],
                ["Technician", selectedRepairCase.technician],
                ["Location", `${selectedRepairCase.location.label}, ${selectedRepairCase.location.zipCode}`],
                [
                  "Appliance",
                  `${selectedRepairCase.appliance.brand} ${selectedRepairCase.appliance.modelNumber}`,
                ],
                ["Serial number", selectedRepairCase.appliance.serialNumber],
                ["Estimated repair cost", formatCurrency(selectedRepairCase.estimatedRepairCost)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="rounded-md border border-white/10 bg-slate-950 p-4">
                <h3 className="font-bold text-white">Issue description</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {selectedRepairCase.issueDescription}
                </p>
              </section>
              <section className="rounded-md border border-white/10 bg-slate-950 p-4">
                <h3 className="font-bold text-white">Technician findings</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {selectedRepairCase.technicianFindings}
                </p>
              </section>
            </div>
          </DetailSection>
          <TelegramIntakeMock intake={telegramIntakeMock} />
        </section>
      ) : null}

      {activeTab === "Privacy Transform" ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <DetailSection
            title="AI-safe public version"
            description="Deterministic mock output generated from the selected repair case."
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Public location", workflowOutput.publicRepairCasePreview.location],
                ["Brand", workflowOutput.publicRepairCasePreview.brand],
                ["Service", workflowOutput.publicRepairCasePreview.service],
                ["Public slug", workflowOutput.publicRepairCasePreview.slug],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-4">
              <h3 className="font-bold text-amber-100">Removed from public output</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {privateFieldRows.map(([label, value]) => (
                  <div key={label} className="rounded-md border border-amber-300/20 bg-slate-950/40 p-3">
                    <p className="text-sm font-bold text-amber-100">{label}</p>
                    <p className="mt-1 text-xs text-amber-100/75">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </DetailSection>
          <PrivacyCheckList />
        </section>
      ) : null}

      {activeTab === "Article Draft" ? (
        <section className="space-y-6">
          <AiArticlePreview preview={workflowOutput.articlePreview} />
          <PublicRepairCasePreview repairCase={workflowOutput.publicRepairCasePreview} />
        </section>
      ) : null}

      {activeTab === "Image Prompts" ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <ImagePromptPreview prompts={workflowOutput.imagePrompts} />
          <DetailSection
            title="Voice note mock"
            description="The same selected workflow can use voice notes as structured context."
          >
            <div className="rounded-md border border-white/10 bg-slate-950 p-4">
              <p className="text-sm leading-6 text-slate-300">
                “{voiceNoteConversionMock.transcript}”
              </p>
            </div>
          </DetailSection>
        </section>
      ) : null}

      {activeTab === "Review & Publish" ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <PublishReadinessSteps steps={readinessSteps} />
          <aside className="rounded-lg border border-white/10 bg-slate-900 p-5">
            <h2 className="text-lg font-bold text-white">Local status controls</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              These controls change local UI state only. They do not publish, save, or call an API.
            </p>
            <div className="mt-5 grid gap-3">
              {reviewStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setReviewStatus(status)}
                  className={`rounded-md border px-3 py-3 text-left text-sm font-bold transition ${
                    reviewStatus === status
                      ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-slate-950 text-slate-300 hover:border-cyan-300/40"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!nextStatus}
              onClick={() => {
                if (nextStatus) {
                  setReviewStatus(nextStatus);
                }
              }}
              className="mt-5 w-full rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {nextStatus ? `Move to ${nextStatus}` : "Ready state reached"}
            </button>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
