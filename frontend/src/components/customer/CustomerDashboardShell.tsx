"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { customerApplianceGroups } from "@/components/customer/customer-appliance-options";
import {
  getApplianceIconLabel,
  getApplianceSubtitle,
  getApplianceTitle,
} from "@/components/customer/customer-appliance-ui";
import {
  getCustomerGreetingName,
  getLocalTimeGreeting,
  splitCustomerName,
} from "@/components/customer/customer-account-utils";
import { CustomerPortalHeader } from "@/components/customer/CustomerPortalHeader";
import { resolveAuthenticatedWorkspace } from "@/lib/auth/account-routing";
import { getCustomerRepairReference } from "@/lib/customer-repair-utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type CustomerDashboardState =
  | { status: "loading" }
  | { status: "signed_out" }
  | {
      status: "ready";
      customer: CustomerRow | null;
      appliances: CustomerApplianceRow[];
      serviceRequests: ServiceRequestRow[];
    }
  | { status: "unavailable"; message: string };

type ApplianceFormState = {
  applianceType: string;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  purchaseYear: string;
  locationLabel: string;
};

const emptyApplianceForm: ApplianceFormState = {
  applianceType: "Refrigerator",
  brand: "",
  modelNumber: "",
  serialNumber: "",
  purchaseYear: "",
  locationLabel: "",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

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

export function CustomerDashboardShell() {
  const router = useRouter();
  const [state, setState] = useState<CustomerDashboardState>({
    status: "loading",
  });
  const [applianceForm, setApplianceForm] =
    useState<ApplianceFormState>(emptyApplianceForm);
  const [applianceStatus, setApplianceStatus] = useState<string | null>(null);
  const [isSavingAppliance, setIsSavingAppliance] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
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
          router.replace("/customer/login?next=/customer/dashboard");
        }
        return;
      }

      const userId = sessionData.session.user.id;
      const userEmail = sessionData.session.user.email ?? null;
      const userFullName =
        typeof sessionData.session.user.user_metadata.full_name === "string"
          ? sessionData.session.user.user_metadata.full_name
          : null;
      const userPhone =
        typeof sessionData.session.user.user_metadata.phone === "string"
          ? sessionData.session.user.user_metadata.phone
          : null;
      const workspace = await resolveAuthenticatedWorkspace({
        supabase,
        session: sessionData.session,
        roleIntent: "customer",
      });

      if (workspace.path === "/dashboard") {
        if (isMounted) {
          router.replace("/dashboard");
        }
        return;
      }

      const customerResult = await supabase
        .from("customers")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (customerResult.error) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message:
              "Customer account records are not ready in this environment yet.",
          });
        }
        return;
      }

      const customer = customerResult.data as CustomerRow | null;

      if (!customer) {
        const { firstName, lastName } = splitCustomerName(userFullName);
        const linkResult = await supabase.rpc("link_current_customer_account_rpc", {
          p_first_name: firstName,
          p_last_name: lastName,
          p_phone: userPhone,
          p_email: userEmail,
        });

        if (linkResult.error) {
          if (isMounted) {
            setState({
              status: "ready",
              customer: null,
              appliances: [],
              serviceRequests: [],
            });
          }
          return;
        }

        const linkedCustomerResult = await supabase
          .from("customers")
          .select("*")
          .eq("auth_user_id", userId)
          .maybeSingle();

        const linkedCustomer = linkedCustomerResult.data as CustomerRow | null;

        if (linkedCustomer) {
          if (isMounted) {
            setState({
              status: "ready",
              customer: linkedCustomer,
              appliances: [],
              serviceRequests: [],
            });
          }
          return;
        }

        if (isMounted) {
          setState({
            status: "ready",
            customer: null,
            appliances: [],
            serviceRequests: [],
          });
        }
        return;
      }

      const [appliancesResult, requestsResult] = await Promise.all([
        supabase
          .from("customer_appliances")
          .select("*")
          .eq("customer_id", customer.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("service_requests")
          .select("*")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false }),
      ]);

      if (isMounted) {
        setState({
          status: "ready",
          customer,
          appliances: (appliancesResult.data ?? []) as CustomerApplianceRow[],
          serviceRequests: (requestsResult.data ?? []) as ServiceRequestRow[],
        });
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const sections = useMemo(
    () => [
      "Repairs",
      "Appliances",
      "Estimates",
      "Invoices",
    ],
    [],
  );

  async function saveAppliance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready" || !state.customer) {
      setApplianceStatus("Finish customer profile setup before adding appliances.");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setApplianceStatus("Customer appliance storage is not configured yet.");
      return;
    }

    setIsSavingAppliance(true);
    setApplianceStatus(null);

    try {
      const purchaseYear = applianceForm.purchaseYear.trim()
        ? Number(applianceForm.purchaseYear)
        : null;
      const { data, error } = await supabase
        .from("customer_appliances")
        .insert({
          customer_id: state.customer.id,
          appliance_type: applianceForm.applianceType.trim() || "Refrigerator",
          brand: applianceForm.brand.trim() || null,
          model_number: applianceForm.modelNumber.trim() || null,
          serial_number: applianceForm.serialNumber.trim() || null,
          purchase_year:
            purchaseYear && Number.isFinite(purchaseYear) ? purchaseYear : null,
          location_label: applianceForm.locationLabel.trim() || null,
        })
        .select("*")
        .single();

      if (error) {
        setApplianceStatus("We could not save this appliance yet.");
        return;
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              appliances: [
                data as CustomerApplianceRow,
                ...current.appliances,
              ],
            }
          : current,
      );
      setApplianceForm(emptyApplianceForm);
      setApplianceStatus("Appliance saved.");
    } finally {
      setIsSavingAppliance(false);
    }
  }

  if (state.status === "loading" || state.status === "signed_out") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-5xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-bold text-slate-600">Loading customer dashboard...</p>
        </div>
      </main>
    );
  }

  if (state.status === "unavailable") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-5xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-black">Customer dashboard unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
        </div>
      </main>
    );
  }

  const greetingName = getCustomerGreetingName(state.customer);
  const greeting = getLocalTimeGreeting();

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-slate-950">
      <CustomerPortalHeader customer={state.customer} />
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
              Customer portal
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              {greeting}, {greetingName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track repairs, appliances, estimates, and invoices from one mobile-first account.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {sections.map((section) => (
              <span
                key={section}
                className="rounded-full border border-slate-200 bg-[#F7F9FC] px-3 py-1 text-xs font-bold text-slate-700"
              >
                {section}
              </span>
            ))}
          </div>
        </header>

        {!state.customer ? (
          <section className="rounded-[24px] border border-blue-100 bg-blue-50 p-5">
            <h2 className="text-lg font-black text-slate-950">
              Finish connecting your customer record
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Your login works. A linked customer profile will appear after the first
              saved customer request or account setup flow.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">My repairs</h2>
              <Link href="/customer" className="text-sm font-bold text-[#0F6BFF]">
                Start new request
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {state.serviceRequests.length > 0 ? (
                state.serviceRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">
                          {request.appliance_brand || "Appliance"} {request.appliance_type}
                        </p>
                        <p className="mt-1 text-sm font-black text-[#0F6BFF]">
                          {getCustomerRepairReference(request)}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {request.city || "Service area"} {request.zip_code}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-slate-700">
                        {request.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-700">
                      {request.issue_description}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                      <p className="rounded-xl bg-white px-3 py-2">
                        Created {formatDate(request.created_at)}
                      </p>
                      <p className="rounded-xl bg-white px-3 py-2">
                        Technician: {request.selected_technician_business_name || "Pending"}
                      </p>
                      <p className="rounded-xl bg-white px-3 py-2 sm:col-span-2">
                        Appointment:{" "}
                        {request.scheduled_date
                          ? `${formatDate(request.scheduled_date)} ${formatTime(request.scheduled_window_start_time)}-${formatTime(request.scheduled_window_end_time)}`
                          : "Not scheduled yet"}
                      </p>
                    </div>
                    <Link
                      href={`/customer/repairs/${encodeURIComponent(getCustomerRepairReference(request))}`}
                      className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#0F6BFF] px-3 text-sm font-bold text-white transition hover:bg-[#0057D9]"
                    >
                      View repair
                    </Link>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-5 text-sm text-slate-600">
                  No repair requests are linked to this account yet.
                </div>
              )}
            </div>
          </div>

          <aside className="grid gap-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-black">My appliances</h2>
              {state.customer ? (
                <form onSubmit={saveAppliance} className="mt-4 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Type
                      <select
                        value={applianceForm.applianceType}
                        onChange={(event) =>
                          setApplianceForm((current) => ({
                            ...current,
                            applianceType: event.target.value,
                          }))
                        }
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                      >
                        {customerApplianceGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((option) => (
                              <option key={option}>{option}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Brand
                      <input
                        value={applianceForm.brand}
                        onChange={(event) =>
                          setApplianceForm((current) => ({
                            ...current,
                            brand: event.target.value,
                          }))
                        }
                        placeholder="LG, Sub-Zero..."
                        className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={applianceForm.modelNumber}
                      onChange={(event) =>
                        setApplianceForm((current) => ({
                          ...current,
                          modelNumber: event.target.value,
                        }))
                      }
                      placeholder="Model"
                      className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                    />
                    <input
                      value={applianceForm.locationLabel}
                      onChange={(event) =>
                        setApplianceForm((current) => ({
                          ...current,
                          locationLabel: event.target.value,
                        }))
                      }
                      placeholder="Location"
                      className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={applianceForm.serialNumber}
                      onChange={(event) =>
                        setApplianceForm((current) => ({
                          ...current,
                          serialNumber: event.target.value,
                        }))
                      }
                      placeholder="Serial"
                      className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                    />
                    <input
                      value={applianceForm.purchaseYear}
                      onChange={(event) =>
                        setApplianceForm((current) => ({
                          ...current,
                          purchaseYear: event.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                        }))
                      }
                      placeholder="Purchase year"
                      inputMode="numeric"
                      className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingAppliance}
                    className="h-10 rounded-xl bg-[#0F6BFF] px-3 text-sm font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSavingAppliance ? "Saving..." : "Add appliance"}
                  </button>
                  {applianceStatus ? (
                    <p className="rounded-xl bg-[#F7F9FC] px-3 py-2 text-sm font-semibold text-slate-700">
                      {applianceStatus}
                    </p>
                  ) : null}
                  <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-black text-slate-950">
                      Appliance label photo
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Future feature: upload a model label photo for assisted brand and model capture.
                    </p>
                    <button
                      type="button"
                      disabled
                      className="mt-3 h-10 rounded-xl border border-blue-200 bg-white px-3 text-sm font-bold text-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Upload label photo - future
                    </button>
                  </div>
                </form>
              ) : null}
              <div className="mt-4 grid gap-3">
                {state.appliances.length > 0 ? (
                  state.appliances.map((appliance) => {
                    const hasSavedApplianceId = isUuid(appliance.id);

                    return (
                      <div
                        key={appliance.id}
                        className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4"
                      >
                        <div className="flex gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-[#0F6BFF]">
                            {getApplianceIconLabel(appliance.appliance_type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-slate-950">
                              {getApplianceTitle(appliance)}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {getApplianceSubtitle(appliance)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                          <Link
                            href={`/customer/appliances/${appliance.id}`}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                          >
                            View appliance
                          </Link>
                          {hasSavedApplianceId ? (
                            <Link
                              href={`/customer/request-repair?appliance=${encodeURIComponent(appliance.id.trim())}`}
                              className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0F6BFF] px-3 text-sm font-bold text-white transition hover:bg-[#0057D9]"
                            >
                              Request Repair
                            </Link>
                          ) : (
                            <span className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-200 px-3 text-sm font-bold text-slate-500">
                              Save appliance first
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4 text-sm text-slate-600">
                    Appliance registry is ready for saved customer appliances.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-black">Estimates & invoices</h2>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4">
                  <p className="text-sm font-black text-slate-950">Estimates</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Approved and pending repair estimates will appear here.
                  </p>
                </div>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4">
                  <p className="text-sm font-black text-slate-950">Invoices</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Repair invoices and payment status will appear here.
                  </p>
                </div>
                {state.customer ? (
                  <Link
                    href="/customer/profile"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                  >
                    Manage profile
                  </Link>
                ) : null}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
