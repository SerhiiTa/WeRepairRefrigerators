import { StatusBadge } from "@/components/StatusBadge";
import { CommunityLanguageBadge } from "@/components/dashboard/CommunityLanguageBadge";
import type {
  CommunityDiscussionPriority,
  RepairHelpRequestDraft,
} from "@/types/community";

type RepairHelpRequestPreviewProps = {
  draft: RepairHelpRequestDraft;
  isSubmitted: boolean;
};

const urgencyTone: Record<CommunityDiscussionPriority, "cyan" | "emerald" | "amber" | "slate"> = {
  normal: "slate",
  urgent: "amber",
  expert_needed: "amber",
};

function buildTitle(draft: RepairHelpRequestDraft) {
  const brand = draft.brand || "Brand";
  const appliance = draft.applianceType || "appliance";
  const symptom = draft.symptom || "repair help needed";

  return `${brand} ${appliance}: ${symptom}`;
}

export function RepairHelpRequestPreview({
  draft,
  isSubmitted,
}: RepairHelpRequestPreviewProps) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-6">
      {isSubmitted ? (
        <section className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-5">
          <p className="text-sm font-bold text-emerald-100">
            Mock help request created. In production, this would open a private technician
            discussion.
          </p>
        </section>
      ) : null}

      <section className="rounded-lg border border-cyan-300/20 bg-slate-900 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          Community preview
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">{buildTitle(draft)}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This preview shows how the request could appear as a private technician discussion.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {draft.urgency ? (
            <StatusBadge tone={urgencyTone[draft.urgency]}>{draft.urgency}</StatusBadge>
          ) : (
            <StatusBadge tone="slate">urgency pending</StatusBadge>
          )}
          {draft.language ? (
            <CommunityLanguageBadge language={draft.language} />
          ) : (
            <StatusBadge tone="slate">language pending</StatusBadge>
          )}
          <StatusBadge tone="slate">{draft.visibility}</StatusBadge>
        </div>

        <dl className="mt-5 grid gap-3">
          {[
            ["Model", draft.modelNumber || "Not entered"],
            ["Serial", draft.serialNumber ? "Private/internal only" : "Not entered"],
            ["Service area", draft.serviceArea || "Optional"],
            ["AI summary", draft.allowAISummaryPreview ? "Eligible for mock preview" : "Disabled"],
            [
              "Translation",
              draft.allowTranslatedPreview ? "Eligible for mock translated preview" : "Disabled",
            ],
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
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          AI-ready structured summary
        </p>
        <div className="mt-4 grid gap-3">
          {[
            ["Symptom", draft.symptom || "Awaiting symptom"],
            ["Customer complaint", draft.customerComplaint || "Generalized complaint only"],
            ["Checked so far", draft.whatWasChecked || "No diagnostic steps entered yet"],
            ["Suspected cause", draft.suspectedCause || "Unknown"],
            ["Error codes", draft.errorCodes || "None entered"],
            ["Parts replaced", draft.partsAlreadyReplaced || "None entered"],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/10 bg-slate-950 p-3" key={label}>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Technician-only draft. No AI, translation, save, upload, or public publishing happens in
          this mock.
        </p>
      </section>
    </aside>
  );
}
