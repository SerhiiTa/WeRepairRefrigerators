import Link from "next/link";

type PublicCtaSectionProps = {
  title?: string;
  description?: string;
};

export function PublicCtaSection({
  title = "Built for privacy-first refrigerator repair content.",
  description = "WeRepairRefrigerators keeps public SEO pages focused on brands, symptoms, locations, and technical summaries instead of customer personal data.",
}: PublicCtaSectionProps) {
  return (
    <section className="border-t border-white/10 bg-slate-900/70">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-14 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">{title}</h2>
          <p className="mt-3 max-w-3xl leading-7 text-slate-300">{description}</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex justify-center rounded-md border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
        >
          Technician dashboard
        </Link>
      </div>
    </section>
  );
}
