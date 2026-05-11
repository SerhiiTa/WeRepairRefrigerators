"use client";

import { type FormEvent, useState } from "react";

import type { TechnicianProfilePreview } from "@/types/public-seo";

const applianceTypes = [
  "Refrigerator",
  "Built-in refrigerator",
  "Wine cooler",
  "Ice machine",
  "Refrigerator ice maker",
];

const brandOptions = [
  "Sub-Zero",
  "LG",
  "Samsung",
  "Thermador",
  "Scotsman",
  "Whirlpool",
  "KitchenAid",
  "Other / Not sure",
];

const preferredWindows = [
  "First available",
  "Morning",
  "Afternoon",
  "Evening",
  "Weekend",
];

type TechnicianLeadRequestFormProps = {
  technician: TechnicianProfilePreview;
  defaultZipCode?: string;
  defaultApplianceType?: string;
  defaultBrand?: string;
  onSubmitSuccess: () => void;
};

export function TechnicianLeadRequestForm({
  technician,
  defaultZipCode = "",
  defaultApplianceType = "Refrigerator",
  defaultBrand = "Other / Not sure",
  onSubmitSuccess,
}: TechnicianLeadRequestFormProps) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [zipCode, setZipCode] = useState(defaultZipCode);
  const [applianceType, setApplianceType] = useState(defaultApplianceType);
  const [brand, setBrand] = useState(defaultBrand);
  const [problemDescription, setProblemDescription] = useState("");
  const [preferredTimeWindow, setPreferredTimeWindow] =
    useState("First available");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitSuccess();
  }

  return (
    <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-slate-700">
        This mock request is prepared for {technician.name}. Nothing is sent,
        stored, or shared in this demo.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-slate-800">
          Customer name
          <input
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Name for follow-up"
            type="text"
            value={customerName}
          />
        </label>

        <label className="space-y-2 text-sm font-semibold text-slate-800">
          Phone
          <input
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Best callback number"
            type="tel"
            value={phone}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-slate-800">
          ZIP code
          <input
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            inputMode="numeric"
            onChange={(event) => setZipCode(event.target.value)}
            placeholder="77024"
            type="text"
            value={zipCode}
          />
        </label>

        <label className="space-y-2 text-sm font-semibold text-slate-800">
          Appliance type
          <select
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setApplianceType(event.target.value)}
            value={applianceType}
          >
            {applianceTypes.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-slate-800">
          Brand
          <select
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setBrand(event.target.value)}
            value={brand}
          >
            {brandOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-semibold text-slate-800">
          Preferred time
          <select
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setPreferredTimeWindow(event.target.value)}
            value={preferredTimeWindow}
          >
            {preferredWindows.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-2 text-sm font-semibold text-slate-800">
        Problem description
        <textarea
          className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          onChange={(event) => setProblemDescription(event.target.value)}
          placeholder="Briefly describe what is happening with the appliance."
          value={problemDescription}
        />
      </label>

      <button
        className="min-h-12 w-full rounded-full bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
        type="submit"
      >
        Prepare Request
      </button>
    </form>
  );
}
