import { StatusBadge } from "@/components/StatusBadge";
import type { TechnicianPerformanceMetric } from "@/types/analytics";

type TechnicianPerformanceBoardProps = {
  metrics: TechnicianPerformanceMetric[];
};

function getConversionTone(conversionRate: number) {
  if (conversionRate >= 60) {
    return "emerald";
  }

  if (conversionRate >= 35) {
    return "cyan";
  }

  return "amber";
}

export function TechnicianPerformanceBoard({ metrics }: TechnicianPerformanceBoardProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
        Technician performance
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
        Most requested technicians
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Mock marketplace performance for future dispatch optimization and payout reporting.
      </p>

      <div className="mt-5 space-y-3">
        {metrics.map((metric) => (
          <article key={metric.technician} className="rounded-md border border-white/10 bg-slate-950 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-bold text-white">{metric.technician}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {metric.leads} leads · {metric.converted} converted · top brand{" "}
                  {metric.mostRequestedBrand}
                </p>
              </div>
              <StatusBadge tone={getConversionTone(metric.conversionRate)}>
                {metric.conversionRate}% conversion
              </StatusBadge>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
