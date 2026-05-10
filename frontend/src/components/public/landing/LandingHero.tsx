import { LandingCtaButtons } from "@/components/public/landing/LandingCtaButtons";
import { TrustBadges } from "@/components/public/landing/TrustBadges";
import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { CoolingAccent } from "@/components/public/visuals/CoolingAccent";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";
import { RefrigeratorHeroGraphic } from "@/components/public/visuals/RefrigeratorHeroGraphic";
import { SnowflakeMotif } from "@/components/public/visuals/SnowflakeMotif";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-blue-100 bg-gradient-to-b from-blue-50 via-white to-white">
      <RefrigerationBackground />
      <PublicSiteHeader />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-12 pt-6 sm:px-6 lg:grid-cols-[1fr_28rem] lg:items-center lg:pb-20">
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

        <div className="relative">
          <div className="absolute -right-2 -top-5 hidden sm:block">
            <SnowflakeMotif size="lg" tone="strong" />
          </div>
          <RefrigeratorHeroGraphic />
          <div className="mt-5 rounded-3xl border border-blue-100 bg-white/90 p-5 shadow-2xl shadow-blue-950/10 backdrop-blur">
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
                  <div key={step} className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                    {step}
                  </div>
                ),
              )}
            </div>
            <CoolingAccent className="mt-5" />
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
