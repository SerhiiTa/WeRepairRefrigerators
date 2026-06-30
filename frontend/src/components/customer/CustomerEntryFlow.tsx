"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  emptyCustomerPreviewState,
  type CustomerPreviewState,
  writeCustomerPreviewState,
} from "./customer-preview-state";
import { customerApplianceGroups } from "./customer-appliance-options";

export function CustomerEntryFlow() {
  const router = useRouter();
  const [values, setValues] = useState<CustomerPreviewState>(
    emptyCustomerPreviewState,
  );

  function updateValue(key: keyof CustomerPreviewState, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    writeCustomerPreviewState(values);
    router.push("/customer/diagnosis-preview");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7"
    >
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Appliance
          <select
            value={values.applianceType}
            onChange={(event) => updateValue("applianceType", event.target.value)}
            className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Choose appliance</option>
            {customerApplianceGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((appliance) => (
                  <option key={appliance} value={appliance}>
                    {appliance}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Brand
          <input
            value={values.brand}
            onChange={(event) => updateValue("brand", event.target.value)}
            placeholder="Sub-Zero, LG, Samsung..."
            className="h-12 rounded-xl border border-slate-200 px-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          ZIP code
          <input
            value={values.zipCode}
            onChange={(event) =>
              updateValue("zipCode", event.target.value.replace(/[^0-9]/g, "").slice(0, 5))
            }
            placeholder="77494"
            inputMode="numeric"
            className="h-12 rounded-xl border border-slate-200 px-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          What is happening?
          <textarea
            value={values.issue}
            onChange={(event) => updateValue("issue", event.target.value)}
            placeholder="Not cooling, frost build-up, leaking, loud compressor..."
            rows={4}
            className="rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Preferred time
          <select
            value={values.preferredWindow}
            onChange={(event) => updateValue("preferredWindow", event.target.value)}
            className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
          >
            <option value="">No preference yet</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Evening">Evening</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        className="mt-5 h-12 w-full rounded-xl bg-[#0F6BFF] px-4 text-base font-bold text-white shadow-[0_12px_24px_rgba(15,107,255,0.24)] transition hover:bg-[#0057D9]"
      >
        Preview repair options
      </button>
    </form>
  );
}
