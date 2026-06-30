"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  readCustomerPreviewState,
} from "./customer-preview-state";

function scoreUrgency(issue: string): string {
  const normalized = issue.toLowerCase();
  if (normalized.includes("leak") || normalized.includes("not cooling")) {
    return "High priority";
  }

  if (normalized.includes("noise") || normalized.includes("frost")) {
    return "Needs diagnosis";
  }

  return "Repair review";
}

export function CustomerPreviewCard() {
  const [values] = useState(() => readCustomerPreviewState());

  const summary = useMemo(() => {
    const appliance = values.applianceType || "Refrigerator";
    const brand = values.brand || "Brand not selected";
    const zip = values.zipCode || "ZIP needed";

    return { appliance, brand, zip, priority: scoreUrgency(values.issue) };
  }, [values]);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
        Diagnosis preview
      </p>
      <h2 className="mt-3 text-2xl font-black text-slate-950">
        {summary.priority}
      </h2>
      <div className="mt-5 grid gap-3">
        {[
          ["Appliance", summary.appliance],
          ["Brand", summary.brand],
          ["Service ZIP", summary.zip],
          ["Preferred time", values.preferredWindow || "Flexible"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3"
          >
            <span className="text-sm font-semibold text-slate-600">{label}</span>
            <span className="text-right text-sm font-bold text-slate-950">{value}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm leading-6 text-slate-600">
        This preview helps route the repair conversation. A registered customer
        account is required before choosing a technician or starting a booking request.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link
          href="/customer/pros"
          className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-[#0057D9]"
        >
          View technicians
        </Link>
        <Link
          href="/customer/price-prediction"
          className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-800 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
        >
          Preview price range
        </Link>
      </div>
    </div>
  );
}
