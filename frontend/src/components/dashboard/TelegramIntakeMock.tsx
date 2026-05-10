import type { TelegramIntakeMockModel } from "@/types/ai-workflow";

type TelegramIntakeMockProps = {
  intake: TelegramIntakeMockModel;
};

export function TelegramIntakeMock({ intake }: TelegramIntakeMockProps) {
  return (
    <section id="telegram-intake" className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="border-b border-white/10 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
          Telegram intake mock
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">Field submission to repair case draft</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          UI-only concept for technician intake. No Telegram API, uploads, transcription, or AI calls.
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3 rounded-lg border border-white/10 bg-slate-950 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {intake.submittedAt}
            </p>
            <h3 className="mt-1 font-bold text-white">{intake.technician}</h3>
          </div>
          <div className="rounded-md border border-white/10 bg-slate-900 p-4">
            <p className="text-sm leading-6 text-slate-300">{intake.textNote}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-dashed border-cyan-300/30 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-100">
              {intake.modelStickerLabel}
            </div>
            <div className="rounded-md border border-dashed border-cyan-300/30 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-100">
              {intake.voiceNoteLabel}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <section className="rounded-lg border border-white/10 bg-slate-950 p-4">
            <h3 className="font-bold text-white">AI extracted fields</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.entries(intake.extracted).map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-slate-900 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-lg border border-white/10 bg-slate-950 p-4">
            <h3 className="font-bold text-white">Generated draft repair case</h3>
            <dl className="mt-3 grid gap-3">
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Case
                </dt>
                <dd className="mt-1 text-sm text-slate-300">{intake.draftRepairCase.caseNumber}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Issue
                </dt>
                <dd className="mt-1 text-sm leading-6 text-slate-300">
                  {intake.draftRepairCase.issueDescription}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Review note
                </dt>
                <dd className="mt-1 text-sm leading-6 text-slate-300">
                  {intake.draftRepairCase.repairSummary}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
