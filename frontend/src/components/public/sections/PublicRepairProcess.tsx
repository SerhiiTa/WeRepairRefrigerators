const defaultSteps = [
  "Document the reported refrigerator symptom.",
  "Capture brand, model, city, ZIP code, and public-safe job context.",
  "Summarize technician findings without private customer details.",
  "Prepare approved repair content for a future public SEO page.",
];

type PublicRepairProcessProps = {
  title?: string;
  steps?: string[];
  variant?: "dark" | "light";
};

export function PublicRepairProcess({
  title = "Public repair content process",
  steps = defaultSteps,
  variant = "dark",
}: PublicRepairProcessProps) {
  const isLight = variant === "light";

  return (
    <section
      className={
        isLight
          ? "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5"
          : "rounded-lg border border-white/10 bg-slate-900 p-6"
      }
    >
      <h2
        className={
          isLight
            ? "text-2xl font-black tracking-tight text-slate-950"
            : "text-2xl font-bold tracking-tight text-white"
        }
      >
        {title}
      </h2>
      <ol className="mt-5 grid gap-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className={
              isLight
                ? "flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
                : "flex gap-3 rounded-md border border-white/10 bg-slate-950 p-4"
            }
          >
            <span
              className={
                isLight
                  ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-black text-white"
                  : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-300/10 text-sm font-bold text-cyan-200"
              }
            >
              {index + 1}
            </span>
            <span className={isLight ? "font-semibold leading-7 text-slate-700" : "text-slate-300"}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
