export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Houston MVP
          </p>

          <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
            AI-powered refrigerator repair platform for technicians.
          </h1>

          <p className="mt-6 text-lg leading-8 text-slate-300">
            WeRepairRefrigerators helps repair technicians turn real repair cases
            into SEO pages, local leads, technician profiles, and AI-assisted
            diagnostic knowledge.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a
              href="/dashboard"
              className="rounded-xl bg-cyan-400 px-6 py-3 text-center font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Technician Dashboard
            </a>

            <a
              href="/repair-cases/new"
              className="rounded-xl border border-white/20 px-6 py-3 text-center font-semibold text-white hover:bg-white/10"
            >
              Create Repair Case
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
