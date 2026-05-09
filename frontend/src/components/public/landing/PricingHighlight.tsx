import { LandingCtaButtons } from "@/components/public/landing/LandingCtaButtons";

export function PricingHighlight() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-16">
      <div className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-8 lg:grid-cols-[1fr_22rem] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
            Diagnostic pricing
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Clear diagnostic visit, clear next steps.
          </h2>
          <p className="mt-4 max-w-3xl leading-8 text-slate-600">
            Use the diagnostic visit to identify the refrigerator issue, confirm brand
            and model details, and understand repair options before approving work.
          </p>
          <LandingCtaButtons className="mt-6" />
        </div>
        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-6 text-slate-950">
          <p className="text-sm font-bold text-blue-700">Starting diagnostic visit</p>
          <p className="mt-3 text-5xl font-black text-blue-700">$89</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Mock pricing for MVP UI. Final pricing rules can be connected later.
          </p>
        </div>
      </div>
    </section>
  );
}
