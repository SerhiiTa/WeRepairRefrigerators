"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getApplianceIconLabel,
  getApplianceSubtitle,
  getApplianceTitle,
} from "@/components/customer/customer-appliance-ui";
import { CustomerPortalHeader } from "@/components/customer/CustomerPortalHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CustomerApplianceRow, CustomerRow } from "@/lib/supabase/types";

type RepairRequestState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "not_found" }
  | {
      status: "ready";
      customer: CustomerRow;
      appliance: CustomerApplianceRow;
    }
  | { status: "unavailable"; message: string };

const REPAIR_DRAFT_STORAGE_KEY = "wra_customer_repair_draft";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function CustomerRepairRequestShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applianceId = searchParams.get("appliance");
  const [state, setState] = useState<RepairRequestState>({
    status: "loading",
  });
  const [problemDescription, setProblemDescription] = useState("");
  const [preferredContactMethod, setPreferredContactMethod] = useState("phone");
  const [serviceZipCode, setServiceZipCode] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [serviceState, setServiceState] = useState("TX");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSelectedAppliance() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer accounts are not configured in this environment yet.",
          });
        }
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        if (isMounted) {
          setState({ status: "signed_out" });
          router.replace(
            `/customer/login?next=/customer/request-repair${applianceId ? `?appliance=${encodeURIComponent(applianceId)}` : ""}`,
          );
        }
        return;
      }

      if (!isUuid(applianceId)) {
        if (isMounted) {
          setState({ status: "not_found" });
        }
        return;
      }

      const customerResult = await supabase
        .from("customers")
        .select("*")
        .eq("auth_user_id", sessionData.session.user.id)
        .maybeSingle();

      if (customerResult.error || !customerResult.data) {
        if (isMounted) {
          setState({ status: "not_found" });
        }
        return;
      }

      const customer = customerResult.data as CustomerRow;
      const applianceResult = await supabase
        .from("customer_appliances")
        .select("*")
        .eq("id", applianceId.trim())
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (applianceResult.error || !applianceResult.data) {
        if (isMounted) {
          setState({ status: "not_found" });
        }
        return;
      }

      if (isMounted) {
        setState({
          status: "ready",
          customer,
          appliance: applianceResult.data as CustomerApplianceRow,
        });
      }
    }

    void loadSelectedAppliance();

    return () => {
      isMounted = false;
    };
  }, [applianceId, router]);

  function continueRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready") {
      return;
    }

    const cleanedProblem = problemDescription.trim();
    const cleanedZip = serviceZipCode.replace(/[^0-9]/g, "").slice(0, 5);
    const customerApplianceId = state.appliance.id?.trim();

    if (!cleanedProblem) {
      setStatus("Describe the appliance problem before choosing a technician.");
      return;
    }

    if (cleanedZip.length !== 5) {
      setStatus("Enter the 5-digit service ZIP so we can match technicians.");
      return;
    }

    if (!isUuid(customerApplianceId)) {
      setStatus(
        "This appliance is missing its saved record ID. Return to your dashboard and start from the appliance card again.",
      );
      return;
    }

    window.sessionStorage.setItem(
      REPAIR_DRAFT_STORAGE_KEY,
      JSON.stringify({
        applianceId: customerApplianceId,
        customer_appliance_id: customerApplianceId,
        problemDescription: cleanedProblem,
        preferredContactMethod,
        notes: notes.trim(),
        serviceZipCode: cleanedZip,
        serviceCity: serviceCity.trim(),
        serviceState: serviceState.trim() || "TX",
      }),
    );

    router.push(
      `/customer/choose-technician?appliance=${encodeURIComponent(customerApplianceId)}`,
    );
  }

  if (state.status === "loading" || state.status === "signed_out") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-bold text-slate-600">Loading repair intake...</p>
        </div>
      </main>
    );
  }

  if (state.status === "unavailable" || state.status === "not_found") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-black">
            {state.status === "not_found" ? "Choose an appliance first" : "Repair intake unavailable"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {state.status === "not_found"
              ? "Open an appliance from your dashboard before starting a repair request."
              : state.message}
          </p>
          <Link
            href="/customer/dashboard"
            className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#0F6BFF] px-4 text-sm font-bold text-white"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const { appliance } = state;

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-slate-950">
      <CustomerPortalHeader customer={state.customer} />
      <div className="mx-auto grid max-w-3xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="min-w-0">
            <Link
              href={`/customer/appliances/${appliance.id}`}
              className="text-sm font-bold text-[#0F6BFF]"
            >
              Back to appliance
            </Link>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              Request Repair
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Start from the appliance, describe the issue, then choose a technician and appointment window.
            </p>
          </div>
        </header>

        <form
          onSubmit={continueRequest}
          className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-6"
        >
          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[#0F6BFF]">
              Selected Appliance
            </p>
            <div className="mt-3 flex gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-white text-sm font-black text-[#0F6BFF]">
                {getApplianceIconLabel(appliance.appliance_type)}
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-950">
                  {getApplianceTitle(appliance)}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {getApplianceSubtitle(appliance)}
                </p>
              </div>
            </div>
          </section>

          <label className="mt-5 grid gap-2 text-sm font-bold text-slate-700">
            Problem Description
            <textarea
              value={problemDescription}
              onChange={(event) => setProblemDescription(event.target.value)}
              rows={5}
              placeholder="Tell us what is happening: not cooling, leaking, loud noise, error code..."
              className="rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Service ZIP
              <input
                value={serviceZipCode}
                onChange={(event) =>
                  setServiceZipCode(
                    event.target.value.replace(/[^0-9]/g, "").slice(0, 5),
                  )
                }
                inputMode="numeric"
                placeholder="77494"
                className="h-12 rounded-xl border border-slate-200 px-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              City
              <input
                value={serviceCity}
                onChange={(event) => setServiceCity(event.target.value)}
                placeholder="Katy"
                className="h-12 rounded-xl border border-slate-200 px-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              State
              <input
                value={serviceState}
                onChange={(event) => setServiceState(event.target.value.slice(0, 2).toUpperCase())}
                placeholder="TX"
                className="h-12 rounded-xl border border-slate-200 px-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </div>

          <label className="mt-5 grid gap-2 text-sm font-bold text-slate-700">
            Preferred Contact Method
            <select
              value={preferredContactMethod}
              onChange={(event) => setPreferredContactMethod(event.target.value)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            >
              <option value="phone">Phone</option>
              <option value="sms">Text message</option>
              <option value="email">Email</option>
            </select>
          </label>

          <label className="mt-5 grid gap-2 text-sm font-bold text-slate-700">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Gate code, parking note, preferred callback details..."
              className="rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            />
          </label>

          {status ? (
            <p className="mt-4 rounded-xl bg-[#F7F9FC] px-4 py-3 text-sm font-semibold text-slate-700">
              {status}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-5 h-12 w-full rounded-xl bg-[#0F6BFF] px-4 text-base font-bold text-white transition hover:bg-[#0057D9]"
          >
            Continue to Technician
          </button>
        </form>
      </div>
    </main>
  );
}
