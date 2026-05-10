import { ApplianceSilhouette } from "@/components/public/visuals/ApplianceSilhouette";

const problems = [
  ["Not cooling", "Fresh-food or freezer sections are warming up."],
  ["Ice maker leaking", "Water under the refrigerator or ice bin issues."],
  ["Noisy compressor", "Buzzing, clicking, or startup trouble."],
  ["Built-in service", "Premium integrated refrigerators need careful access."],
  ["Wine cooler issues", "Temperature swings in undercounter units."],
  ["Sealed system concern", "Possible refrigerant, evaporator, or compressor issue."],
];

export function ProblemCards() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
          Common problems
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          Refrigerator issues we’re built to document and solve.
        </h2>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {problems.map(([title, description]) => (
          <article
            key={title}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5"
          >
            <ApplianceSilhouette />
            <h3 className="mt-5 text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-3 leading-7 text-slate-600">{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
