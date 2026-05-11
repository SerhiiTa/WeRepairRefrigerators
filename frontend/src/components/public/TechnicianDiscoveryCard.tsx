"use client";

import Link from "next/link";

import { TechnicianTrustStats } from "@/components/public/TechnicianTrustStats";
import { buildScheduleServiceHref } from "@/lib/schedule-service";
import type { TechnicianProfilePreview } from "@/types/public-seo";
import type {
  AvailabilityStatus,
  TechnicianAvailabilityContext,
  WorkloadLevel,
} from "@/types/technician-availability";

type TechnicianDiscoveryCardProps = {
  technician: TechnicianProfilePreview;
  searchedZip: string;
  availability: TechnicianAvailabilityContext | null;
};

const availabilityClasses: Record<AvailabilityStatus, string> = {
  "Available Today": "border-emerald-100 bg-emerald-50 text-emerald-700",
  "Available Tomorrow": "border-blue-100 bg-blue-50 text-blue-700",
  "Limited Availability": "border-amber-100 bg-amber-50 text-amber-800",
  "Fully Booked": "border-slate-200 bg-slate-100 text-slate-700",
};

const workloadClasses: Record<WorkloadLevel, string> = {
  Light: "bg-emerald-500",
  Moderate: "bg-blue-500",
  Heavy: "bg-amber-500",
};

export function TechnicianDiscoveryCard({
  technician,
  searchedZip,
  availability,
}: TechnicianDiscoveryCardProps) {
  const hasExactZip = searchedZip ? technician.zipCodes?.includes(searchedZip) : false;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
            {hasExactZip ? `Serves ${searchedZip}` : "Nearby service area"}
          </span>
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
            {technician.verificationStatus ?? "Verified Technician"}
          </span>
          {availability ? (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${availabilityClasses[availability.availabilityStatus]}`}
            >
              {availability.availabilityStatus}
            </span>
          ) : null}
        </div>

        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{technician.name}</h2>
          <p className="mt-2 font-semibold text-blue-700">{technician.serviceArea}</p>
          <p className="mt-3 leading-7 text-slate-600">{technician.summary}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[...technician.specialties, ...(technician.brandFocus ?? [])].slice(0, 6).map((item) => (
            <span
              key={item}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>

        <TechnicianTrustStats technician={technician} />

        {availability ? (
          <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Next window", availability.nextAvailableWindow],
              ["Coverage match", availability.coverageMatch],
              ["Workload", availability.workloadLevel],
              ["Mock jobs today", `${availability.mockDailyJobCount}`],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${workloadClasses[availability.workloadLevel]}`}
                />
                <p className="text-sm font-semibold text-slate-700">
                  Availability is mock-only and does not reserve a real service window.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/technicians/${technician.slug}`}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
          >
            View Profile
          </Link>
          <Link
            href={buildScheduleServiceHref({
              technician: technician.slug,
              zip: searchedZip,
            })}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-800 shadow-sm"
          >
            Request Service
          </Link>
        </div>
      </div>
    </article>
  );
}
