"use client";

import { useMemo, useState } from "react";

import { getTechniciansByService, getTechniciansByZip } from "@/lib/public-seo-data";
import {
  uploadCustomerServiceRequestPhotos,
  validateServiceRequestPhotoFiles,
} from "@/lib/service-request-photos";
import { submitServiceRequest } from "@/lib/service-requests";
import type { TechnicianProfilePreview } from "@/types/public-seo";

import { ServiceRequestForm, type ServiceRequestFormValues } from "./ServiceRequestForm";
import { ServiceRequestSuccess } from "./ServiceRequestSuccess";

type ServiceRequestFlowProps = {
  technicians: TechnicianProfilePreview[];
  initialValues: ServiceRequestFormValues;
  requestedTechnician?: TechnicianProfilePreview | null;
};

export function ServiceRequestFlow({
  technicians,
  initialValues,
  requestedTechnician = null,
}: ServiceRequestFlowProps) {
  const [values, setValues] = useState(initialValues);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUploadWarning, setPhotoUploadWarning] = useState<string | null>(
    null,
  );
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState(0);

  const selectedTechnician = useMemo(() => {
    if (!values.technicianPreference) {
      return null;
    }

    return technicians.find((technician) => technician.slug === values.technicianPreference) ?? null;
  }, [technicians, values.technicianPreference]);

  const matchedTechnician = useMemo(() => {
    if (values.technicianPreference) {
      return selectedTechnician;
    }

    const zipMatches = getTechniciansByZip(values.zipCode);
    const serviceMatches = getTechniciansByService(values.applianceType, zipMatches);

    return serviceMatches[0] ?? zipMatches[0] ?? technicians[0] ?? null;
  }, [
    selectedTechnician,
    technicians,
    values.applianceType,
    values.technicianPreference,
    values.zipCode,
  ]);

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError(null);
    setPhotoUploadWarning(null);

    const result = await submitServiceRequest({ values });

    if (!result.ok) {
      setIsSubmitting(false);
      setSubmitError(result.message);
      return;
    }

    if (photoFiles.length > 0) {
      const uploadResult = await uploadCustomerServiceRequestPhotos({
        requestId: result.requestId,
        files: photoFiles,
      });

      setUploadedPhotoCount(uploadResult.uploadedCount);

      if (!uploadResult.ok) {
        setPhotoUploadWarning(uploadResult.message);
      }
    }

    setIsSubmitting(false);
    setIsSubmitted(true);
  }

  function handlePhotoFilesChange(files: File[]) {
    const validation = validateServiceRequestPhotoFiles(files);

    if (!validation.ok) {
      setPhotoFiles([]);
      setPhotoError(validation.message);
      return;
    }

    setPhotoFiles(validation.files);
    setPhotoError(null);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1fr_24rem] lg:items-start">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-blue-950/5">
        {isSubmitted ? (
          <ServiceRequestSuccess
            onReset={() => {
              setIsSubmitted(false);
              setPhotoFiles([]);
              setPhotoError(null);
              setPhotoUploadWarning(null);
              setUploadedPhotoCount(0);
            }}
            photoUploadWarning={photoUploadWarning}
            uploadedPhotoCount={uploadedPhotoCount}
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
            {selectedTechnician ? (
              <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/80 p-5">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">
                  Selected technician
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  Requesting service from {selectedTechnician.name}
                </h2>
                <p className="mt-2 font-semibold text-blue-800">
                  {selectedTechnician.serviceArea}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedTechnician.specialties.slice(0, 4).map((specialty) => (
                    <span
                      className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-black text-blue-800"
                      key={specialty}
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              </div>
            ) : values.technicianPreference && requestedTechnician ? (
              <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-6 text-amber-900">
                Technician context changed or became unavailable. The request will continue as a
                generic marketplace intake.
              </div>
            ) : null}
            <div className="mt-6">
              <ServiceRequestForm
                onChange={setValues}
                onPhotosChange={handlePhotoFilesChange}
                onSubmit={handleSubmit}
                photoError={photoError}
                photoFiles={photoFiles}
                isSubmitting={isSubmitting}
                technicians={technicians}
                values={values}
              />
              {submitError ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-800">
                  {submitError}
                </div>
              ) : null}
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
          <h2 className="text-xl font-black text-slate-950">Private request safety</h2>
          <p className="mt-3 leading-7 text-slate-600">
            Request details are saved for technician review. Booking, dispatch,
            SMS, email, payment, and customer portal access are still future
            workflow steps.
          </p>
        </section>
      </aside>
    </div>
  );
}
