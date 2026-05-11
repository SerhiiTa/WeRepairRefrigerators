"use client";

import Link from "next/link";

import { getTechnicianAvailabilityContext } from "@/data/mock-technician-availability";
import {
  buildDashboardLeadPreviewHref,
  mapIntakeToMarketplaceLead,
} from "@/lib/intake-to-lead";
import type { TechnicianProfilePreview } from "@/types/public-seo";

import type { ServiceRequestFormValues } from "./ServiceRequestForm";

type ServiceRequestSuccessProps = {
  request: ServiceRequestFormValues;
  technician: TechnicianProfilePreview | null;
  onReset: () => void;
};

export function ServiceRequestSuccess({
  request,
  technician,
  onReset,
}: ServiceRequestSuccessProps) {
  const availability =
    technician && request.zipCode
      ? getTechnicianAvailabilityContext(technician, request.zipCode)
      : null;
  const previewLead = mapIntakeToMarketplaceLead(request, { technician });

  return (
    <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 shadow-xl shadow-emerald-100/70">
      <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-700">
        Lead Prepared
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        Your service request is ready for dashboard review.
      </h2>
      <p className="mt-3 leading-7 text-slate-700">
        Nothing was booked, sent, or stored. In the live version, this would become a marketplace
        request for technician review.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-emerald-200 bg-white p-5">
          <h3 className="font-black text-slate-950">Request summary</h3>
          <dl className="mt-4 space-y-3">
            {[
              ["ZIP", request.zipCode || "Not provided"],
              ["Appliance", `${request.brand} ${request.applianceType}`],
              ["Preferred window", request.preferredServiceWindow],
              ["Customer", request.customerFirstName || "First name not entered"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-bold text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-white p-5">
          <h3 className="font-black text-slate-950">Technician matching preview</h3>
          {technician ? (
            <div className="mt-4">
              <p className="text-lg font-black text-slate-950">{technician.name}</p>
              <p className="mt-1 text-sm font-bold text-blue-700">{technician.serviceArea}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {availability
                  ? `${availability.coverageMatch} · ${availability.availabilityStatus}`
                  : "Mock technician match prepared."}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-800">
                Estimated next availability:{" "}
                {availability?.nextAvailableWindow ?? technician.responseTime ?? "Preview pending"}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              A technician match would be calculated after ZIP and service details are reviewed.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-emerald-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
              Dashboard Lead Preview
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              How this appears in the CRM
            </h3>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            {previewLead.status}
          </span>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Customer first name", previewLead.customerFirstName],
            ["ZIP", previewLead.zipCode],
            ["Appliance", `${previewLead.applianceBrand} ${previewLead.applianceType}`],
            ["Issue summary", previewLead.issueSummary],
            ["Matched technician", previewLead.matchedTechnician],
            ["Source", previewLead.source],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-sm font-bold leading-6 text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-800"
          onClick={onReset}
          type="button"
        >
          Prepare Another Request
        </button>
        <Link
          className="rounded-full border border-emerald-200 bg-white px-5 py-3 text-center text-sm font-black text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
          href={buildDashboardLeadPreviewHref(previewLead)}
        >
          Preview In Dashboard
        </Link>
      </div>
    </section>
  );
}
