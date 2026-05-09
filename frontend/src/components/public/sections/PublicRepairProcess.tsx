const defaultSteps = [
  "Document the reported refrigerator symptom.",
  "Capture brand, model, city, ZIP code, and public-safe job context.",
  "Summarize technician findings without private customer details.",
  "Prepare approved repair content for a future public SEO page.",
];

type PublicRepairProcessProps = {
  title?: string;
  steps?: string[];
};

export function PublicRepairProcess({
  title = "Public repair content process",
  steps = defaultSteps,
}: PublicRepairProcessProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
      <ol className="mt-5 grid gap-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-md border border-white/10 bg-slate-950 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-300/10 text-sm font-bold text-cyan-200">
              {index + 1}
            </span>
            <span className="text-slate-300">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
