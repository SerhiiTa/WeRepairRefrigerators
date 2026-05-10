import type { TechnicianProfilePreview } from "@/types/public-seo";

type TechnicianTrustStatsProps = {
  technician: TechnicianProfilePreview;
};

export function TechnicianTrustStats({ technician }: TechnicianTrustStatsProps) {
  const stats = [
    ["Rating", technician.rating ?? "4.9 mock rating"],
    ["Response", technician.responseTime ?? "Same-day response window"],
    ["Completed repairs", `${technician.completedRepairs ?? 100}+`],
    ["Experience", `${technician.yearsExperience ?? 5}+ years`],
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"
        >
          <dt className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            {label}
          </dt>
          <dd className="mt-2 text-lg font-black text-slate-950">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
