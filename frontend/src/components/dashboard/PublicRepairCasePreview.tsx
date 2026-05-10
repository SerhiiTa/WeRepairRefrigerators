import type { PublicRepairCase } from "@/types/public-seo";

type PublicRepairCasePreviewProps = {
  repairCase: PublicRepairCase;
};

export function PublicRepairCasePreview({ repairCase }: PublicRepairCasePreviewProps) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="border-b border-white/10 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
          Public repair case preview
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">{repairCase.title}</h2>
        <p className="mt-3 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300">
          /repair-cases/{repairCase.slug}
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Location", repairCase.location],
          ["Brand", repairCase.brand],
          ["Service", repairCase.service],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-200">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {[
          ["Issue", repairCase.issue],
          ["Diagnosis", repairCase.diagnosis],
          ["Resolution", repairCase.resolution],
        ].map(([label, value]) => (
          <section key={label} className="rounded-md border border-white/10 bg-slate-950 p-4">
            <h3 className="font-bold text-white">{label}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{value}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
