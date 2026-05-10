import Link from "next/link";

import { StatusBadge } from "@/components/StatusBadge";
import type { AiWorkflowCardModel } from "@/types/ai-workflow";

type AiWorkflowCardProps = {
  workflow: AiWorkflowCardModel;
};

export function AiWorkflowCard({ workflow }: AiWorkflowCardProps) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-bold text-white">{workflow.title}</h2>
        <StatusBadge tone={workflow.statusTone}>{workflow.status}</StatusBadge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{workflow.purpose}</p>
      <dl className="mt-5 grid gap-3 text-sm">
        <div className="rounded-md border border-white/10 bg-slate-950 p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Input</dt>
          <dd className="mt-1 font-semibold text-slate-200">{workflow.inputType}</dd>
        </div>
        <div className="rounded-md border border-white/10 bg-slate-950 p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Output</dt>
          <dd className="mt-1 font-semibold text-slate-200">{workflow.outputType}</dd>
        </div>
      </dl>
      <Link
        href={workflow.ctaHref}
        className="mt-5 inline-flex justify-center rounded-md border border-cyan-300/30 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10"
      >
        {workflow.ctaLabel}
      </Link>
    </article>
  );
}
