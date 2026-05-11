import type { ZipDemandMetric } from "@/types/analytics";

type ZipDemandBoardProps = {
  metrics: ZipDemandMetric[];
};

export function ZipDemandBoard({ metrics }: ZipDemandBoardProps) {
  const maxLeads = Math.max(...metrics.map((metric) => metric.leads), 1);

  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
        ZIP demand
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
        Busiest service areas
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Mock ZIP-level demand for future coverage, paid lead routing, and service-area strategy.
      </p>

      <div className="mt-5 grid gap-3">
        {metrics.map((metric) => {
          const percent = Math.round((metric.leads / maxLeads) * 100);

          return (
            <article key={metric.zipCode} className="rounded-md border border-white/10 bg-slate-950 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-white">
                    {metric.zipCode} · {metric.serviceArea}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {metric.topApplianceType} · {metric.topBrand}
                  </p>
                </div>
                <p className="text-sm font-bold text-cyan-200">{metric.leads} leads</p>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-800">
                <div className="h-2 rounded-full bg-cyan-300" style={{ width: `${percent}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
