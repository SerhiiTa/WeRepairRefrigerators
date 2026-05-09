type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
};

export function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{helper}</p>
    </article>
  );
}
