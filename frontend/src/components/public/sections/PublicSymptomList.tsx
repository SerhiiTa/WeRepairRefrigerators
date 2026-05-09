type PublicSymptomListProps = {
  title?: string;
  symptoms: string[];
};

export function PublicSymptomList({
  title = "Common refrigerator symptoms",
  symptoms,
}: PublicSymptomListProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {symptoms.map((symptom) => (
          <li key={symptom} className="rounded-md border border-white/10 bg-slate-950 p-4 text-slate-300">
            {symptom}
          </li>
        ))}
      </ul>
    </section>
  );
}
