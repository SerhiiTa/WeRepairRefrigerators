"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getApplianceIconLabel,
  getApplianceSubtitle,
  getApplianceTitle,
} from "@/components/customer/customer-appliance-ui";
import { CustomerPortalHeader } from "@/components/customer/CustomerPortalHeader";
import {
  getCustomerRepairReference,
  splitCustomerRepairDetails,
} from "@/lib/customer-repair-utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type RepairDetailState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "not_found" }
  | {
      status: "ready";
      customer: CustomerRow;
      repair: ServiceRequestRow;
      appliance: CustomerApplianceRow | null;
    }
  | { status: "unavailable"; message: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_EDITABLE_STATUSES = new Set([
  "new",
  "contacted",
  "scheduled",
  "waiting_customer",
]);

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const [hourValue = "0", minuteValue = "0"] = value.split(":");
  const hour = Number(hourValue);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minuteValue.padStart(2, "0")} ${suffix}`;
}

function formatStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function getAppointmentLabel(repair: ServiceRequestRow): string {
  if (!repair.scheduled_date) {
    return "Not scheduled yet";
  }

  return `${formatDate(repair.scheduled_date)} ${formatTime(repair.scheduled_window_start_time)}-${formatTime(repair.scheduled_window_end_time)}`;
}

function findRepairByReference(
  repairs: ServiceRequestRow[],
  repairReference: string,
): ServiceRequestRow | null {
  const decodedReference = decodeURIComponent(repairReference).trim();

  return (
    repairs.find((repair) =>
      UUID_PATTERN.test(decodedReference)
        ? repair.id === decodedReference
        : getCustomerRepairReference(repair).toLowerCase() ===
          decodedReference.toLowerCase(),
    ) ?? null
  );
}

export function CustomerRepairDetailShell({
  repairReference,
}: {
  repairReference: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<RepairDetailState>({ status: "loading" });
  const [problemDescription, setProblemDescription] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRepair() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer repairs are not configured in this environment yet.",
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
            `/customer/login?next=/customer/repairs/${encodeURIComponent(repairReference)}`,
          );
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
      const repairsResult = await supabase
        .from("service_requests")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });

      const repair = findRepairByReference(
        (repairsResult.data ?? []) as ServiceRequestRow[],
        repairReference,
      );

      if (repairsResult.error || !repair) {
        if (isMounted) {
          setState({ status: "not_found" });
        }
        return;
      }

      let appliance: CustomerApplianceRow | null = null;

      if (repair.customer_appliance_id) {
        const applianceResult = await supabase
          .from("customer_appliances")
          .select("*")
          .eq("id", repair.customer_appliance_id)
          .eq("customer_id", customer.id)
          .maybeSingle();

        appliance = (applianceResult.data as CustomerApplianceRow | null) ?? null;
      }

      if (isMounted) {
        const details = splitCustomerRepairDetails(repair.issue_description);

        setProblemDescription(details.problemDescription);
        setCustomerNotes(details.customerNotes);
        setState({
          status: "ready",
          customer,
          repair,
          appliance,
        });
      }
    }

    void loadRepair();

    return () => {
      isMounted = false;
    };
  }, [repairReference, router]);

  const detailRows = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return [
      ["Status", formatStatus(state.repair.status)],
      ["Technician", state.repair.selected_technician_business_name || "Pending"],
      ["Appointment", getAppointmentLabel(state.repair)],
      ["Preferred contact", state.customer.preferred_contact_method || "Saved on profile"],
      ["Created", formatDate(state.repair.created_at)],
    ];
  }, [state]);

  async function saveRepairDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready") {
      return;
    }

    const cleanedProblem = problemDescription.trim();

    if (!cleanedProblem) {
      setSaveStatus("Problem details cannot be empty.");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setSaveStatus("Customer repair updates are not configured yet.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      router.push(
        `/customer/login?next=/customer/repairs/${encodeURIComponent(repairReference)}`,
      );
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      const response = await fetch(`/api/customer/repairs/${state.repair.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          problemDescription: cleanedProblem,
          customerNotes: customerNotes.trim(),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        request?: ServiceRequestRow;
        message?: string;
      };

      if (!response.ok || result.ok === false || !result.request) {
        setSaveStatus(result.message || "We could not update this repair yet.");
        return;
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              repair: result.request!,
            }
          : current,
      );
      setSaveStatus("Repair details updated.");
    } finally {
      setIsSaving(false);
    }
  }

  if (state.status === "loading" || state.status === "signed_out") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-bold text-slate-600">Loading repair...</p>
        </div>
      </main>
    );
  }

  if (state.status === "unavailable" || state.status === "not_found") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-black">
            {state.status === "not_found" ? "Repair not found" : "Repair unavailable"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {state.status === "not_found"
              ? "We could not find that repair in your customer account."
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

  const { repair, appliance } = state;
  const reference = getCustomerRepairReference(repair);
  const canEditDetails = CUSTOMER_EDITABLE_STATUSES.has(repair.status);

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-slate-950">
      <CustomerPortalHeader customer={state.customer} />
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
          <Link
            href="/customer/dashboard"
            className="text-sm font-bold text-[#0F6BFF]"
          >
            Back to dashboard
          </Link>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.12em] text-[#0F6BFF]">
                {reference}
              </p>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Repair Details
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Track the repair request, appointment window, and customer-provided details.
              </p>
            </div>
            <span className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-black uppercase text-[#0F6BFF]">
              {formatStatus(repair.status)}
            </span>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="grid gap-4">
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-6">
              <h2 className="text-xl font-black">Repair summary</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {detailRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-950">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <form
              onSubmit={saveRepairDetails}
              className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-6"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black">Problem details</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Add customer details before technician work begins.
                  </p>
                </div>
                {!canEditDetails ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    Read-only
                  </span>
                ) : null}
              </div>

              <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
                Problem description
                <textarea
                  value={problemDescription}
                  onChange={(event) => setProblemDescription(event.target.value)}
                  disabled={!canEditDetails || isSaving}
                  rows={5}
                  className="rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </label>

              <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
                Additional information
                <textarea
                  value={customerNotes}
                  onChange={(event) => setCustomerNotes(event.target.value)}
                  disabled={!canEditDetails || isSaving}
                  rows={4}
                  placeholder="Add access notes, symptoms, error codes, or other details..."
                  className="rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </label>

              {saveStatus ? (
                <p className="mt-4 rounded-xl bg-[#F7F9FC] px-4 py-3 text-sm font-semibold text-slate-700">
                  {saveStatus}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!canEditDetails || isSaving}
                className="mt-5 h-12 w-full rounded-xl bg-[#0F6BFF] px-4 text-base font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? "Saving..." : "Update details"}
              </button>
            </form>
          </div>

          <aside className="grid gap-4">
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-black">Appliance</h2>
              {appliance ? (
                <div className="mt-4 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
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
                    <Link
                      href={`/customer/appliances/${appliance.id}`}
                      className="mt-3 inline-flex text-sm font-bold text-[#0F6BFF]"
                    >
                      View appliance
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4 text-sm font-semibold text-slate-600">
                  Appliance details are linked to this repair internally.
                </p>
              )}
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-black">Next steps</h2>
              <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-700">
                <p className="rounded-2xl bg-[#F7F9FC] p-4">
                  Your appointment remains linked to the repair. Appointment changes are handled by the service team.
                </p>
                <p className="rounded-2xl bg-[#F7F9FC] p-4">
                  You can update details here until technician work begins.
                </p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
