"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type CustomerListState =
  | { status: "loading" }
  | {
      status: "ready";
      customers: CustomerRow[];
      serviceRequests: ServiceRequestRow[];
      appliances: CustomerApplianceRow[];
    }
  | { status: "unavailable"; message: string };

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "No jobs yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function DashboardCustomersIndex() {
  const [state, setState] = useState<CustomerListState>({ status: "loading" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadCustomers() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer records are not configured in this environment.",
          });
        }
        return;
      }

      const [customersResult, requestsResult, appliancesResult] = await Promise.all([
        supabase.from("customers").select("*").order("updated_at", { ascending: false }),
        supabase
          .from("service_requests")
          .select("*")
          .not("customer_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_appliances")
          .select("*")
          .order("updated_at", { ascending: false }),
      ]);

      if (customersResult.error) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer records are not ready in this environment yet.",
          });
        }
        return;
      }

      if (isMounted) {
        setState({
          status: "ready",
          customers: (customersResult.data ?? []) as CustomerRow[],
          serviceRequests: (requestsResult.data ?? []) as ServiceRequestRow[],
          appliances: (appliancesResult.data ?? []) as CustomerApplianceRow[],
        });
      }
    }

    void loadCustomers();

    return () => {
      isMounted = false;
    };
  }, []);

  const customers = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return state.customers;
    }

    return state.customers.filter((customer) =>
      [customer.full_name, customer.email, customer.phone]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [query, state]);

  if (state.status === "loading") {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-bold text-slate-600">Loading customers...</p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <h1 className="text-2xl font-black text-slate-950">Customers unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5">
      <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
              Customer CRM
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Customers</h1>
            <p className="mt-2 text-sm text-slate-600">
              Customer profiles are built from real saved requests and appliances.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:w-80">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, phone, email"
              className="h-11 rounded-xl border border-slate-200 px-3 text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </div>
      </header>

      {customers.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {customers.map((customer) => {
            const requests = state.serviceRequests.filter(
              (request) => request.customer_id === customer.id,
            );
            const appliances = state.appliances.filter(
              (appliance) => appliance.customer_id === customer.id,
            );
            const latestRequest = requests[0];

            return (
              <article
                key={customer.id}
                className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-slate-950">
                      {customer.full_name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {customer.phone || customer.email || "No contact saved"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700">
                    {customer.customer_status}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-[#F7F9FC] p-3">
                    <p className="text-lg font-black text-slate-950">{requests.length}</p>
                    <p className="text-xs font-semibold text-slate-500">Jobs</p>
                  </div>
                  <div className="rounded-2xl bg-[#F7F9FC] p-3">
                    <p className="text-lg font-black text-slate-950">{appliances.length}</p>
                    <p className="text-xs font-semibold text-slate-500">Appliances</p>
                  </div>
                  <div className="rounded-2xl bg-[#F7F9FC] p-3">
                    <p className="text-xs font-black text-slate-950">
                      {formatDate(latestRequest?.created_at)}
                    </p>
                    <p className="text-xs font-semibold text-slate-500">Last job</p>
                  </div>
                </div>
                {latestRequest ? (
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">
                    {latestRequest.appliance_brand || "Appliance"}{" "}
                    {latestRequest.appliance_type}: {latestRequest.issue_description}
                  </p>
                ) : null}
                <Link
                  href={`/dashboard/customers/${customer.id}`}
                  className="mt-5 inline-flex w-full justify-center rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0057D9]"
                >
                  Open customer
                </Link>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-black text-slate-950">No customers yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Customer profiles appear after customer-linked service requests are saved.
          </p>
          <Link
            href="/dashboard/leads"
            className="mt-5 inline-flex rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-bold text-white"
          >
            Open jobs
          </Link>
        </section>
      )}
    </div>
  );
}

export function DashboardCustomerDetail({ customerId }: { customerId: string }) {
  const [state, setState] = useState<CustomerListState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function loadCustomer() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer records are not configured in this environment.",
          });
        }
        return;
      }

      const [customerResult, requestsResult, appliancesResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
        supabase
          .from("service_requests")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_appliances")
          .select("*")
          .eq("customer_id", customerId)
          .order("updated_at", { ascending: false }),
      ]);

      if (customerResult.error) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer record could not be loaded.",
          });
        }
        return;
      }

      if (isMounted) {
        setState({
          status: "ready",
          customers: customerResult.data ? [customerResult.data as CustomerRow] : [],
          serviceRequests: (requestsResult.data ?? []) as ServiceRequestRow[],
          appliances: (appliancesResult.data ?? []) as CustomerApplianceRow[],
        });
      }
    }

    void loadCustomer();

    return () => {
      isMounted = false;
    };
  }, [customerId]);

  if (state.status === "loading") {
    return <div className="rounded-[24px] bg-white p-6">Loading customer...</div>;
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-black text-slate-950">Customer unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
      </div>
    );
  }

  const customer = state.customers[0];

  if (!customer) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-black text-slate-950">Customer not found</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5">
      <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <Link href="/dashboard/customers" className="text-sm font-bold text-[#0F6BFF]">
          Back to customers
        </Link>
        <h1 className="mt-3 text-3xl font-black text-slate-950">{customer.full_name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {customer.phone || "No phone"} · {customer.email || "No email"}
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-black text-slate-950">Repair history</h2>
          <div className="mt-4 grid gap-3">
            {state.serviceRequests.length > 0 ? (
              state.serviceRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/dashboard/leads/${request.id}`}
                  className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 transition hover:border-[#0F6BFF]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-950">
                        {request.appliance_brand || "Appliance"} {request.appliance_type}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDate(request.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-slate-700">
                      {request.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                    {request.issue_description}
                  </p>
                </Link>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4 text-sm text-slate-600">
                No service requests are linked yet.
              </p>
            )}
          </div>
        </div>

        <aside className="grid gap-5">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-black text-slate-950">Appliances</h2>
            <div className="mt-4 grid gap-3">
              {state.appliances.length > 0 ? (
                state.appliances.map((appliance) => (
                  <div
                    key={appliance.id}
                    className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4"
                  >
                    <p className="font-black text-slate-950">
                      {appliance.brand || "Brand"} {appliance.appliance_type}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {appliance.model_number || "No model saved"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4 text-sm text-slate-600">
                  No appliances saved yet.
                </p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
