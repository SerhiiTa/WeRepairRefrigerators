import Link from "next/link";

import type { PublicRepairCase } from "@/types/public-seo";

type TechnicianRepairCaseListProps = {
  repairCases: PublicRepairCase[];
};

export function TechnicianRepairCaseList({ repairCases }: TechnicianRepairCaseListProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
            Public repair cases
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Recent privacy-safe work examples
          </h2>
        </div>
        <Link href="/repair-cases" className="text-sm font-bold text-blue-700 hover:text-blue-900">
          View all cases
        </Link>
      </div>
      <div className="mt-6 grid gap-4">
        {repairCases.length > 0 ? (
          repairCases.map((repairCase) => (
            <Link
              key={repairCase.slug}
              href={`/repair-cases/${repairCase.slug}`}
              className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 transition hover:border-blue-300 hover:bg-white hover:shadow-md hover:shadow-blue-950/5"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                {repairCase.brand} / {repairCase.applianceType ?? repairCase.service}
              </p>
              <h3 className="mt-2 text-lg font-black text-slate-950">{repairCase.title}</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">
                {repairCase.city ?? repairCase.location} · {repairCase.symptom ?? repairCase.issue}
              </p>
            </Link>
          ))
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-bold leading-6 text-slate-600">
              Public repair case examples are not linked to this real technician profile yet.
              Future repair case attribution will use privacy-safe published case records only.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
