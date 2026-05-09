type PublicSymptomListProps = {
  title?: string;
  symptoms: string[];
  variant?: "dark" | "light";
};

export function PublicSymptomList({
  title = "Common refrigerator symptoms",
  symptoms,
  variant = "dark",
}: PublicSymptomListProps) {
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
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {symptoms.map((symptom) => (
          <li
            key={symptom}
            className={
              isLight
                ? "rounded-2xl border border-blue-100 bg-blue-50/60 p-4 font-semibold text-slate-700"
                : "rounded-md border border-white/10 bg-slate-950 p-4 text-slate-300"
            }
          >
            {symptom}
          </li>
        ))}
      </ul>
    </section>
  );
}
