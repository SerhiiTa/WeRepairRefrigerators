"use client";

import { useMemo, useState } from "react";

import { TechnicianDiscoveryCard } from "@/components/public/TechnicianDiscoveryCard";
import { TechnicianLeadRequestPanel } from "@/components/public/TechnicianLeadRequestPanel";
import { getTechnicianAvailabilityContext } from "@/data/mock-technician-availability";
import {
  getTechniciansByService,
  getTechniciansBySpecialty,
  getTechniciansByZip,
} from "@/lib/public-seo-data";
import type { TechnicianProfilePreview } from "@/types/public-seo";

type TechnicianZipDiscoveryProps = {
  technicians: TechnicianProfilePreview[];
};

const serviceOptions = [
  "Any service",
  "Refrigerator Repair",
  "Built-In Refrigerator Repair",
  "Sealed System Repair",
  "Ice Machine Repair",
];

const specialtyOptions = [
  "Any brand or specialty",
  "Sub-Zero",
  "LG",
  "Samsung",
  "Thermador",
  "Scotsman",
];

const coverageZips = ["77024", "77079", "77494", "77441", "77043", "77008", "77002"];

function getNearbyTechnicians(zipCode: string, technicians: TechnicianProfilePreview[]) {
  if (!zipCode) {
    return technicians.slice(0, 2);
  }

  if (zipCode.startsWith("770")) {
    return technicians.filter((technician) => technician.city === "Houston").slice(0, 2);
  }

  if (zipCode.startsWith("774")) {
    return technicians.filter((technician) => technician.serviceArea.includes("Katy")).slice(0, 2);
  }

  return technicians.slice(0, 2);
}

export function TechnicianZipDiscovery({ technicians }: TechnicianZipDiscoveryProps) {
  const [zipCode, setZipCode] = useState("77024");
  const [service, setService] = useState("Any service");
  const [specialty, setSpecialty] = useState("Any brand or specialty");
  const [selectedTechnician, setSelectedTechnician] =
    useState<TechnicianProfilePreview | null>(null);
  const [isLeadSubmitted, setIsLeadSubmitted] = useState(false);

  const normalizedZip = zipCode.trim();

  const exactZipMatches = useMemo(() => getTechniciansByZip(normalizedZip), [normalizedZip]);

  const filteredTechnicians = useMemo(() => {
    const serviceMatches = getTechniciansByService(service, exactZipMatches);
    return getTechniciansBySpecialty(specialty, serviceMatches);
  }, [exactZipMatches, service, specialty]);

  const fallbackTechnicians = useMemo(() => {
    const nearbyMatches = getNearbyTechnicians(normalizedZip, technicians);
    const serviceMatches = getTechniciansByService(service, nearbyMatches);
    return getTechniciansBySpecialty(specialty, serviceMatches);
  }, [normalizedZip, service, specialty, technicians]);

  const hasExactZip = exactZipMatches.length > 0;
  const visibleTechnicians = filteredTechnicians.length > 0 ? filteredTechnicians : fallbackTechnicians;

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
            <div className="grid gap-4 lg:grid-cols-[1fr_14rem_14rem]">
              <label className="grid gap-2">
                <span className="text-sm font-black text-slate-950">ZIP code</span>
                <input
                  value={zipCode}
                  onChange={(event) => setZipCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                  inputMode="numeric"
                  placeholder="77024"
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-950 outline-none transition focus:border-blue-400"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-black text-slate-950">Service</span>
                <select
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400"
                >
                  {serviceOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-black text-slate-950">Brand or specialty</span>
                <select
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400"
                >
                  {specialtyOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                {filteredTechnicians.length} exact result{filteredTechnicians.length === 1 ? "" : "s"}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                {hasExactZip ? `Technicians serving ${normalizedZip}` : "Nearby technician options"}
              </h2>
            </div>
            {!hasExactZip ? (
              <p className="rounded-full border border-amber-100 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
                ZIP fallback shown
              </p>
            ) : null}
          </div>

          {visibleTechnicians.length > 0 ? (
            <div className="grid gap-5">
              {visibleTechnicians.map((technician) => (
                <TechnicianDiscoveryCard
                  availability={getTechnicianAvailabilityContext(technician, normalizedZip)}
                  key={technician.slug}
                  onRequestTechnician={(selected) => {
                    setSelectedTechnician(selected);
                    setIsLeadSubmitted(false);
                  }}
                  technician={technician}
                  searchedZip={normalizedZip}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="text-2xl font-black text-slate-950">No matching technician yet</h2>
              <p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-600">
                This ZIP or filter combination is not supported in the current mock data. Try a
                Houston MVP ZIP such as 77024, 77079, 77494, 77441, or 77043.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-blue-100 bg-blue-50/80 p-6 shadow-sm shadow-blue-950/5">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
              Coverage preview
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Map preview coming soon</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Map and live availability are not connected yet. These chips show static mock ZIP
              coverage for the Houston MVP.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {coverageZips.map((zip) => (
                <button
                  key={zip}
                  type="button"
                  onClick={() => setZipCode(zip)}
                  className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-black text-blue-800 shadow-sm transition hover:border-blue-300"
                >
                  {zip}
                </button>
              ))}
            </div>
          </section>

          <TechnicianLeadRequestPanel
            isSubmitted={isLeadSubmitted}
            onReset={() => setIsLeadSubmitted(false)}
            onSubmitSuccess={() => setIsLeadSubmitted(true)}
            service={service}
            specialty={specialty}
            technician={selectedTechnician}
            zipCode={normalizedZip}
          />

          {!hasExactZip ? (
            <section className="rounded-3xl border border-amber-100 bg-amber-50 p-6">
              <h2 className="text-xl font-black text-slate-950">Nearby fallback</h2>
              <p className="mt-3 leading-7 text-slate-700">
                No exact ZIP coverage was found, so the page shows nearby service-area matches
                based on the ZIP prefix. This is mock-only and not a dispatch promise.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
