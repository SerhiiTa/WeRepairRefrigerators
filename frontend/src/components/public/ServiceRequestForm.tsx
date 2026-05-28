"use client";

import type { FormEvent } from "react";

import type { TechnicianProfilePreview } from "@/types/public-seo";

export type ServiceRequestFormValues = {
  zipCode: string;
  applianceType: string;
  brand: string;
  issueDescription: string;
  preferredServiceWindow: string;
  technicianPreference: string;
  customerFirstName: string;
  phone: string;
};

type ServiceRequestFormProps = {
  values: ServiceRequestFormValues;
  technicians: TechnicianProfilePreview[];
  photoFiles?: File[];
  photoError?: string | null;
  isSubmitting?: boolean;
  onChange: (values: ServiceRequestFormValues) => void;
  onPhotosChange?: (files: File[]) => void;
  onSubmit: () => void;
};

const applianceTypes = [
  "Refrigerator",
  "Built-in refrigerator",
  "Wine cooler",
  "Ice machine",
  "Refrigerator ice maker",
];

const brandOptions = [
  "Sub-Zero",
  "Thermador",
  "Bosch",
  "Viking",
  "JennAir",
  "KitchenAid",
  "Whirlpool",
  "GE",
  "Samsung",
  "LG",
  "Scotsman",
  "Other / Not sure",
];

const preferredWindows = [
  "First available",
  "Morning",
  "Afternoon",
  "Evening",
  "Weekend",
];

export function ServiceRequestForm({
  values,
  technicians,
  photoFiles = [],
  photoError = null,
  isSubmitting = false,
  onChange,
  onPhotosChange,
  onSubmit,
}: ServiceRequestFormProps) {
  function updateField<Key extends keyof ServiceRequestFormValues>(
    key: Key,
    value: ServiceRequestFormValues[Key],
  ) {
    onChange({
      ...values,
      [key]: value,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-sm leading-6 text-slate-700">
        This is a preview intake flow. Live dispatch and booking will be added later.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-black text-slate-900">
          ZIP code
          <input
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            inputMode="numeric"
            onChange={(event) => updateField("zipCode", event.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
            placeholder="77024"
            required
            value={values.zipCode}
          />
        </label>

        <label className="space-y-2 text-sm font-black text-slate-900">
          Appliance type
          <select
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("applianceType", event.target.value)}
            required
            value={values.applianceType}
          >
            {applianceTypes.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-black text-slate-900">
          Brand
          <select
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("brand", event.target.value)}
            value={values.brand}
          >
            {brandOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-black text-slate-900">
          Preferred service window
          <select
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("preferredServiceWindow", event.target.value)}
            value={values.preferredServiceWindow}
          >
            {preferredWindows.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-2 text-sm font-black text-slate-900">
        Optional technician preference
        <select
          className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          onChange={(event) => updateField("technicianPreference", event.target.value)}
          value={values.technicianPreference}
        >
          <option value="">Match me with an available technician</option>
          {technicians.map((technician) => (
            <option key={technician.slug} value={technician.slug}>
              {technician.name} · {technician.serviceArea}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm font-black text-slate-900">
        Issue description
        <textarea
          className="min-h-32 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-6 text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          onChange={(event) => updateField("issueDescription", event.target.value)}
          placeholder="Tell us what the refrigerator is doing."
          required
          value={values.issueDescription}
        />
      </label>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="block space-y-2 text-sm font-black text-slate-900">
          Appliance photos
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="block w-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-bold text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
            disabled={isSubmitting}
            multiple
            onChange={(event) =>
              onPhotosChange?.(Array.from(event.target.files ?? []))
            }
            type="file"
          />
        </label>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          Upload up to 5 refrigerator photos. JPG, PNG, WebP, HEIC, or HEIF up
          to 5 MB each.
        </p>
        {photoFiles.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs font-bold text-slate-700">
            {photoFiles.map((file) => (
              <li key={`${file.name}-${file.size}`}>{file.name}</li>
            ))}
          </ul>
        ) : null}
        {photoError ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            {photoError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-black text-slate-900">
          Customer first name
          <input
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("customerFirstName", event.target.value)}
            placeholder="First name only"
            required
            type="text"
            value={values.customerFirstName}
          />
        </label>

        <label className="space-y-2 text-sm font-black text-slate-900">
          Optional phone placeholder
          <input
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="Not sent in preview"
            type="tel"
            value={values.phone}
          />
        </label>
      </div>

      <button
        className="min-h-12 w-full rounded-full bg-blue-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving Request..." : "Submit Service Request"}
      </button>
    </form>
  );
}
