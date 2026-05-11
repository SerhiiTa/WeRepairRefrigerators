"use client";

import type { TechnicianProfilePreview } from "@/types/public-seo";

import { TechnicianLeadRequestForm } from "./TechnicianLeadRequestForm";

const brandFilters = new Set([
  "Sub-Zero",
  "LG",
  "Samsung",
  "Thermador",
  "Scotsman",
]);

type TechnicianLeadRequestPanelProps = {
  technician: TechnicianProfilePreview | null;
  zipCode: string;
  service: string;
  specialty: string;
  isSubmitted: boolean;
  onReset: () => void;
  onSubmitSuccess: () => void;
};

function getDefaultApplianceType(service: string) {
  if (service === "Ice Machine Repair") {
    return "Ice machine";
  }

  if (service === "Built-In Refrigerator Repair") {
    return "Built-in refrigerator";
  }

  return "Refrigerator";
}

function getDefaultBrand(specialty: string) {
  return brandFilters.has(specialty) ? specialty : "Other / Not sure";
}

export function TechnicianLeadRequestPanel({
  technician,
  zipCode,
  service,
  specialty,
  isSubmitted,
  onReset,
  onSubmitSuccess,
}: TechnicianLeadRequestPanelProps) {
  if (!technician) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
          Request service
        </p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">
          Choose a technician to prepare a request.
        </h2>
        <p className="mt-3 leading-7 text-slate-600">
          Select Request Service on a matching technician card. The form will
          stay on this page and only create a local mock request.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm shadow-blue-950/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
            Request service
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            {technician.name}
          </h2>
          <p className="mt-1 font-semibold text-blue-700">
            {technician.serviceArea}
          </p>
        </div>
        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          Mock only
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {technician.specialties.slice(0, 4).map((item) => (
          <span
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-700"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>

      {isSubmitted ? (
        <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-bold text-emerald-800">
            Your request has been prepared. A technician would be notified in the
            live version.
          </p>
          <p className="mt-3 leading-7 text-emerald-700">
            No message was sent, no technician was contacted, and no customer
            details were stored.
          </p>
          <button
            className="mt-5 rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-800"
            onClick={onReset}
            type="button"
          >
            Prepare Another Request
          </button>
        </div>
      ) : (
        <TechnicianLeadRequestForm
          defaultApplianceType={getDefaultApplianceType(service)}
          defaultBrand={getDefaultBrand(specialty)}
          defaultZipCode={zipCode}
          onSubmitSuccess={onSubmitSuccess}
          technician={technician}
        />
      )}
    </section>
  );
}
