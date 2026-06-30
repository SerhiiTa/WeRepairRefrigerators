"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { getCustomerRepairReference } from "@/lib/customer-repair-utils";

const BOOKING_RESULT_STORAGE_KEY = "wra_customer_booking_result";

type BookingResult = {
  service_request_id?: string;
  service_request_created_at?: string;
  public_reference?: string;
  appointment_id?: string;
  applianceTitle?: string;
  technicianName?: string;
  appointment_date?: string;
  window_start_time?: string;
  window_end_time?: string;
  problemDescription?: string;
  serviceZipCode?: string;
};

function formatTime(value?: string): string {
  if (!value) {
    return "Selected window";
  }

  const [hourValue = "0", minuteValue = "0"] = value.split(":");
  const hour = Number(hourValue);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minuteValue.padStart(2, "0")} ${suffix}`;
}

function formatDate(value?: string): string {
  if (!value) {
    return "Appointment scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function CustomerBookingConfirmationShell() {
  const searchParams = useSearchParams();
  const [result] = useState<BookingResult | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.sessionStorage.getItem(BOOKING_RESULT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as BookingResult) : null;
    } catch {
      return null;
    }
  });

  const reference =
    searchParams.get("reference") ||
    result?.public_reference ||
    getCustomerRepairReference({
      id: result?.service_request_id ?? "",
      created_at: result?.service_request_created_at ?? null,
    });

  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl font-black text-emerald-700">
          ✓
        </div>
        <p className="mt-5 text-sm font-black uppercase tracking-[0.12em] text-[#0F6BFF]">
          Request Submitted
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">
          Appointment Scheduled
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your repair request is now a real CRM job. You can track it from your customer dashboard.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
              Reference Number
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">
              {reference}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
              Appointment
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {formatDate(result?.appointment_date)}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {formatTime(result?.window_start_time)} - {formatTime(result?.window_end_time)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
              Appliance
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {result?.applianceTitle || "Selected appliance"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
              Technician
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {result?.technicianName || "Selected technician"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/customer/repairs/${encodeURIComponent(reference)}`}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0F6BFF] px-4 text-sm font-black text-white transition hover:bg-[#0057D9]"
          >
            View Repair
          </Link>
          <Link
            href="/customer/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
          >
            Return to Dashboard
          </Link>
        </div>
        <div className="mt-3">
          <Link
            href="/"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
          >
            Explore Marketplace
          </Link>
        </div>
      </div>
    </main>
  );
}
