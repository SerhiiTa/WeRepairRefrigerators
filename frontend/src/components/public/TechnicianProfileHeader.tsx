import { TechnicianTrustStats } from "@/components/public/TechnicianTrustStats";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";
import { SnowflakeMotif } from "@/components/public/visuals/SnowflakeMotif";
import type { TechnicianProfilePreview } from "@/types/public-seo";

type TechnicianProfileHeaderProps = {
  technician: TechnicianProfilePreview;
};

export function TechnicianProfileHeader({ technician }: TechnicianProfileHeaderProps) {
  return (
    <section className="relative overflow-hidden border-b border-blue-100 bg-[linear-gradient(135deg,#f8fbff_0%,#eef7ff_48%,#ffffff_100%)]">
      <RefrigerationBackground />
      <div className="relative mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-end">
          <div>
            <p className="inline-flex rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-700 shadow-sm">
              Public technician profile
            </p>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 md:text-6xl">
              {technician.name}
            </h1>
            <p className="mt-4 text-xl font-bold text-blue-700">{technician.role}</p>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
              {technician.summary}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {(technician.badges ?? ["Verified Technician"]).map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-black text-blue-800 shadow-sm"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
          <aside className="rounded-3xl border border-blue-100 bg-white/90 p-6 shadow-xl shadow-blue-950/10 backdrop-blur">
            <SnowflakeMotif size="md" tone="strong" />
            <p className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-blue-700">
              Service area
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">{technician.serviceArea}</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Mock availability and request controls are placeholders only. Live booking is not
              connected yet.
            </p>
          </aside>
        </div>
        <div className="mt-8">
          <TechnicianTrustStats technician={technician} />
        </div>
      </div>
    </section>
  );
}
