import Link from "next/link";

import { TechnicianTrustStats } from "@/components/public/TechnicianTrustStats";
import type { TechnicianProfilePreview } from "@/types/public-seo";

type TechnicianCardProps = {
  technician: TechnicianProfilePreview;
};

export function TechnicianCard({ technician }: TechnicianCardProps) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5 transition hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10">
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
              {technician.verificationStatus ?? "Verified Technician"}
            </span>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              {technician.responseTime ?? "Fast response"}
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
            {technician.name}
          </h2>
          <p className="mt-2 font-semibold text-blue-700">{technician.serviceArea}</p>
          <p className="mt-3 leading-7 text-slate-600">{technician.summary}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {technician.specialties.map((specialty) => (
            <span
              key={specialty}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-700"
            >
              {specialty}
            </span>
          ))}
        </div>

        <TechnicianTrustStats technician={technician} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/technicians/${technician.slug}`}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
          >
            View Profile
          </Link>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-800 shadow-sm"
          >
            Request This Technician
          </button>
        </div>
      </div>
    </article>
  );
}
