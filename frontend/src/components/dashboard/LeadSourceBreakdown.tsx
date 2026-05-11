import type { AnalyticsBreakdownItem } from "@/types/analytics";

type LeadSourceBreakdownProps = {
  title: string;
  description: string;
  items: AnalyticsBreakdownItem[];
};

export function LeadSourceBreakdown({ title, description, items }: LeadSourceBreakdownProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          Marketplace mix
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>

      <div className="mt-5 space-y-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-bold text-slate-100">{item.label}</p>
                <p className="text-sm font-bold text-cyan-200">
                  {item.count} · {item.percent}%
                </p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-cyan-300"
                  style={{ width: `${Math.max(item.percent, 6)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed border-white/15 p-4 text-sm text-slate-400">
            No analytics rows match the current filters.
          </p>
        )}
      </div>
    </section>
  );
}
