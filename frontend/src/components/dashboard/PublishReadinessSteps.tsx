import { StatusBadge } from "@/components/StatusBadge";
import type { PublishReadinessStep } from "@/types/ai-workflow";

type PublishReadinessStepsProps = {
  steps: PublishReadinessStep[];
};

export function PublishReadinessSteps({ steps }: PublishReadinessStepsProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="border-b border-white/10 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
          Review and publish concept
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">Human review stays in control</h2>
      </div>
      <ol className="mt-5 grid gap-3">
        {steps.map((step, index) => (
          <li key={step.label} className="flex gap-3 rounded-md border border-white/10 bg-slate-950 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-300/10 text-sm font-bold text-cyan-200">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold text-white">{step.label}</h3>
                <StatusBadge tone={step.tone}>{step.status}</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
