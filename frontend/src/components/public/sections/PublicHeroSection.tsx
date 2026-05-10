import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";
import { RefrigeratorHeroGraphic } from "@/components/public/visuals/RefrigeratorHeroGraphic";
import { SnowflakeMotif } from "@/components/public/visuals/SnowflakeMotif";

type PublicHeroSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  variant?: "dark" | "light";
};

export function PublicHeroSection({
  eyebrow,
  title,
  description,
  variant = "dark",
}: PublicHeroSectionProps) {
  const isLight = variant === "light";

  return (
    <section
      className={
        isLight
          ? "relative overflow-hidden border-b border-blue-100 bg-[linear-gradient(135deg,#f8fbff_0%,#eef7ff_48%,#ffffff_100%)]"
          : "border-b border-white/10 bg-[radial-gradient(circle_at_20%_16%,rgba(34,211,238,0.2),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_52%,#111827_100%)]"
      }
    >
      {isLight ? <RefrigerationBackground /> : null}
      {isLight ? <PublicSiteHeader /> : null}
      <div
        className={
          isLight
            ? "relative mx-auto grid max-w-7xl gap-10 px-6 pb-14 pt-8 sm:pb-16 lg:grid-cols-[1fr_19rem] lg:items-center lg:pb-20"
            : "mx-auto max-w-7xl px-6 py-14 sm:py-16 lg:py-20"
        }
      >
        <div>
          <div
            className={
              isLight
                ? "inline-flex rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-700 shadow-sm"
                : "text-sm font-bold uppercase tracking-[0.24em] text-cyan-200"
            }
          >
            {eyebrow}
          </div>
          <h1
            className={
              isLight
                ? "mt-5 max-w-4xl text-4xl font-black text-slate-950 md:text-6xl"
                : "mt-4 max-w-4xl text-4xl font-bold tracking-tight text-white md:text-6xl"
            }
          >
            {title}
          </h1>
          <p
            className={
              isLight
                ? "mt-5 max-w-3xl text-lg leading-8 text-slate-600"
                : "mt-5 max-w-3xl text-lg leading-8 text-slate-300"
            }
          >
            {description}
          </p>
          {isLight ? (
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold text-slate-700">
              <span className="rounded-full border border-blue-100 bg-white px-4 py-2 shadow-sm">
                Houston MVP
              </span>
              <span className="rounded-full border border-blue-100 bg-white px-4 py-2 shadow-sm">
                Privacy-safe repair content
              </span>
              <span className="rounded-full border border-blue-100 bg-white px-4 py-2 shadow-sm">
                Brand, service, and city pages
              </span>
            </div>
          ) : null}
        </div>
        {isLight ? (
          <div className="relative hidden lg:block">
            <SnowflakeMotif className="absolute -left-5 top-4" size="sm" />
            <RefrigeratorHeroGraphic compact />
          </div>
        ) : null}
      </div>
    </section>
  );
}
