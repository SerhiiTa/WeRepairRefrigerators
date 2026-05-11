import Link from "next/link";

type PublicCtaSectionProps = {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  variant?: "dark" | "light";
};

export function PublicCtaSection({
  title = "Built for privacy-first refrigerator repair content.",
  description = "WeRepairRefrigerators keeps public SEO pages focused on brands, symptoms, locations, and technical summaries instead of customer personal data.",
  primaryHref = "/schedule-service",
  primaryLabel = "Schedule refrigerator service",
  secondaryHref = "/repair-cases",
  secondaryLabel = "View repair examples",
  variant = "dark",
}: PublicCtaSectionProps) {
  const isLight = variant === "light";

  return (
    <section
      className={
        isLight
          ? "border-y border-blue-100 bg-blue-50/80"
          : "border-t border-white/10 bg-slate-900/70"
      }
    >
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-14 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2
            className={
              isLight
                ? "text-3xl font-black tracking-tight text-slate-950"
                : "text-3xl font-bold tracking-tight text-white"
            }
          >
            {title}
          </h2>
          <p
            className={
              isLight
                ? "mt-3 max-w-3xl leading-7 text-slate-600"
                : "mt-3 max-w-3xl leading-7 text-slate-300"
            }
          >
            {description}
          </p>
        </div>
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:justify-start lg:justify-end">
          <Link
            href={isLight ? primaryHref : "/dashboard"}
            className={
              isLight
                ? "inline-flex min-h-12 justify-center rounded-full bg-blue-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
                : "inline-flex justify-center rounded-md border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
            }
          >
            {isLight ? primaryLabel : "Technician dashboard"}
          </Link>
          {isLight ? (
            <Link
              href={secondaryHref}
              className="inline-flex min-h-12 justify-center rounded-full border border-blue-200 bg-white px-6 py-3 text-sm font-black text-blue-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
