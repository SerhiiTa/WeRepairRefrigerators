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
  onChange: (values: ServiceRequestFormValues) => void;
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
  onChange,
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
            value={values.zipCode}
          />
        </label>

        <label className="space-y-2 text-sm font-black text-slate-900">
          Appliance type
          <select
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("applianceType", event.target.value)}
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
          value={values.issueDescription}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-black text-slate-900">
          Customer first name
          <input
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("customerFirstName", event.target.value)}
            placeholder="First name only"
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
        className="min-h-12 w-full rounded-full bg-blue-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
        type="submit"
      >
        Prepare Service Request
      </button>
    </form>
  );
}
