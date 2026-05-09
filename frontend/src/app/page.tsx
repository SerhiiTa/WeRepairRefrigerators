const features = [
  {
    title: "Technician Profiles",
    description:
      "Show service areas, refrigerator specialties, certifications, and trust signals for local Houston customers.",
  },
  {
    title: "Repair Case Creation",
    description:
      "Capture appliance symptoms, model details, customer notes, photos, and technician findings in a clean workflow.",
  },
  {
    title: "AI-Assisted SEO Articles",
    description:
      "Turn completed repair cases into useful refrigerator repair pages built for local search and customer education.",
  },
];

const platformSteps = ["Create case", "Add diagnosis", "Review AI draft", "Publish SEO page"];

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <section className="relative isolate border-b border-white/10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_16%,rgba(34,211,238,0.24),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#111827_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-slate-950 to-transparent" />

        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <a href="#" className="text-sm font-bold tracking-wide text-cyan-100">
            WeRepairRefrigerators
          </a>
          <a
            href="/dashboard"
            className="hidden rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:text-white sm:inline-flex"
          >
            Dashboard
          </a>
        </nav>

        <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-28 lg:pt-16">
          <div>
            <p className="mb-5 inline-flex rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-200">
              Houston MVP for refrigerator repair technicians
            </p>

            <h1 className="max-w-4xl text-5xl font-bold leading-[1.03] tracking-tight text-white md:text-7xl">
              The AI-powered operating system for refrigerator repair pros.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              WeRepairRefrigerators helps Houston technicians document repair cases,
              build trusted profiles, and turn real field work into useful local SEO
              content without adding back-office complexity.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <a
                href="/repair-cases/new"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-200"
              >
                Create Repair Case
                <ArrowIcon />
              </a>
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-md border border-white/15 px-6 py-3 text-sm font-bold text-white transition hover:border-emerald-300 hover:bg-white/5"
              >
                Technician Dashboard
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="rounded-md border border-slate-700 bg-slate-950/80 p-5">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-sm text-slate-400">MVP workflow</p>
                  <h2 className="mt-1 text-2xl font-bold text-white">Houston repair case</h2>
                </div>
                <span className="rounded-md bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  Draft
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {platformSteps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] p-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-300/10 text-sm font-bold text-cyan-200">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-slate-100">{step}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4">
                <p className="text-sm font-semibold text-cyan-100">AI article preview</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Refrigerator not cooling in Houston: common causes, diagnosis notes,
                  and when to call a qualified technician.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">
            MVP platform
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Built around the work refrigerator repair businesses already do.
          </h2>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-lg border border-white/10 bg-slate-900 p-6 transition hover:border-cyan-300/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">
                <CheckIcon />
              </div>
              <h3 className="mt-6 text-xl font-bold text-white">{feature.title}</h3>
              <p className="mt-3 leading-7 text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-slate-900/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-300">
              Houston first
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-4xl">
              Focused on refrigerator repair before expanding anywhere else.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Local MVP", "Designed for the Houston market."],
              ["Repair only", "No broad appliance marketplace."],
              ["Secure foundation", "Ready for auth and Supabase later."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-slate-950 p-5">
                <h3 className="font-bold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
