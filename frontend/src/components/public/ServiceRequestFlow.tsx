"use client";

import { useMemo, useState } from "react";

import { getTechniciansByService, getTechniciansByZip } from "@/lib/public-seo-data";
import type { TechnicianProfilePreview } from "@/types/public-seo";

import { ServiceRequestForm, type ServiceRequestFormValues } from "./ServiceRequestForm";
import { ServiceRequestSuccess } from "./ServiceRequestSuccess";

type ServiceRequestFlowProps = {
  technicians: TechnicianProfilePreview[];
  initialValues: ServiceRequestFormValues;
};

export function ServiceRequestFlow({ technicians, initialValues }: ServiceRequestFlowProps) {
  const [values, setValues] = useState(initialValues);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const matchedTechnician = useMemo(() => {
    if (values.technicianPreference) {
      return (
        technicians.find((technician) => technician.slug === values.technicianPreference) ?? null
      );
    }

    const zipMatches = getTechniciansByZip(values.zipCode);
    const serviceMatches = getTechniciansByService(values.applianceType, zipMatches);

    return serviceMatches[0] ?? zipMatches[0] ?? technicians[0] ?? null;
  }, [technicians, values.applianceType, values.technicianPreference, values.zipCode]);

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1fr_24rem] lg:items-start">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-blue-950/5">
        {isSubmitted ? (
          <ServiceRequestSuccess
            onReset={() => setIsSubmitted(false)}
            request={values}
            technician={matchedTechnician}
          />
        ) : (
          <>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-600">
              Schedule service
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
              Tell us what needs repair.
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">
              One public intake flow supports homepage scheduling, technician requests, service
              pages, brand pages, and ZIP-based discovery. This preview does not book a real visit.
            </p>
            <div className="mt-6">
              <ServiceRequestForm
                onChange={setValues}
                onSubmit={() => setIsSubmitted(true)}
                technicians={technicians}
                values={values}
              />
            </div>
          </>
        )}
      </section>

      <aside className="space-y-5">
        <section className="rounded-[2rem] border border-blue-100 bg-blue-50/80 p-6 shadow-sm shadow-blue-950/5">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
            Matching preview
          </p>
          {matchedTechnician ? (
            <div className="mt-4">
              <h2 className="text-2xl font-black text-slate-950">{matchedTechnician.name}</h2>
              <p className="mt-2 font-semibold text-blue-700">{matchedTechnician.serviceArea}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[...matchedTechnician.specialties, ...(matchedTechnician.brandFocus ?? [])]
                  .slice(0, 5)
                  .map((item) => (
                    <span
                      className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-black text-blue-800"
                      key={item}
                    >
                      {item}
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 leading-7 text-slate-600">
              Enter a ZIP code to preview technician matching.
            </p>
          )}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
          <h2 className="text-xl font-black text-slate-950">Preview-only safety</h2>
          <p className="mt-3 leading-7 text-slate-600">
            No backend, booking, dispatch, SMS, email, payment, or persistence is connected.
            Customer details remain local to this browser view.
          </p>
        </section>
      </aside>
    </div>
  );
}
