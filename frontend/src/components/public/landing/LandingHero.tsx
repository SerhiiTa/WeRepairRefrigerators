import { LandingCtaButtons } from "@/components/public/landing/LandingCtaButtons";
import { TrustBadges } from "@/components/public/landing/TrustBadges";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-blue-100 bg-gradient-to-b from-blue-50 via-white to-white">
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_25%_10%,rgba(37,99,235,0.16),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(14,165,233,0.12),transparent_28%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-12 pt-5 sm:px-6 lg:grid-cols-[1fr_28rem] lg:items-center lg:pb-20">
        <nav className="flex items-center justify-between lg:col-span-2">
          <a href="#" className="text-base font-black tracking-tight text-slate-950">
            WeRepairRefrigerators
          </a>
          <a
            href="tel:+17135550134"
            className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm"
          >
            (713) 555-0134
          </a>
        </nav>

        <div className="pt-8">
          <p className="inline-flex rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
            Houston refrigerator repair
          </p>
          <h1 className="mt-5 max-w-4xl text-4xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Fast, focused refrigerator repair for Houston homes.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Get help with warm refrigerators, leaking ice makers, noisy compressors,
            built-in units, wine coolers, and brand-specific diagnostic questions.
          </p>
          <LandingCtaButtons className="mt-7" />
          <div className="mt-8">
            <TrustBadges />
          </div>
        </div>

        <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-2xl shadow-blue-950/10">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-slate-950">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-blue-700">Today’s service focus</p>
                <h2 className="mt-1 text-2xl font-black">Refrigerator not cooling</h2>
              </div>
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                Priority
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              {["Check airflow", "Inspect condenser", "Verify model details", "Explain next steps"].map(
                (step) => (
                  <div key={step} className="rounded-xl border border-blue-100 bg-white p-4">
                    {step}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-slate-700">
            Diagnostic visit pricing and repair options are presented clearly before
            work moves forward.
          </div>
        </div>
      </div>
    </section>
  );
}
