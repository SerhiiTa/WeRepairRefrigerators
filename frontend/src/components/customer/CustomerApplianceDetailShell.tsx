"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getApplianceIconLabel,
  getApplianceSubtitle,
  getApplianceTitle,
} from "@/components/customer/customer-appliance-ui";
import { CustomerPortalHeader } from "@/components/customer/CustomerPortalHeader";
import { getCustomerRepairReference } from "@/lib/customer-repair-utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type ApplianceDetailState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "not_found" }
  | {
      status: "ready";
      customer: CustomerRow;
      appliance: CustomerApplianceRow;
      serviceRequests: ServiceRequestRow[];
    }
  | { status: "unavailable"; message: string };

function formatDetailValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Not saved";
  }

  return String(value);
}

export function CustomerApplianceDetailShell({
  applianceId,
}: {
  applianceId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ApplianceDetailState>({
    status: "loading",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadAppliance() {
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
            `/customer/login?next=/customer/appliances/${encodeURIComponent(applianceId)}`,
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
      const applianceResult = await supabase
        .from("customer_appliances")
        .select("*")
        .eq("id", applianceId)
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (applianceResult.error || !applianceResult.data) {
        if (isMounted) {
          setState({ status: "not_found" });
        }
        return;
      }

      const requestsResult = await supabase
        .from("service_requests")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("customer_appliance_id", applianceId)
        .order("created_at", { ascending: false });

      if (isMounted) {
        setState({
          status: "ready",
          customer,
          appliance: applianceResult.data as CustomerApplianceRow,
          serviceRequests: (requestsResult.data ?? []) as ServiceRequestRow[],
        });
      }
    }

    void loadAppliance();

    return () => {
      isMounted = false;
    };
  }, [applianceId, router]);

  if (state.status === "loading" || state.status === "signed_out") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-bold text-slate-600">Loading appliance...</p>
        </div>
      </main>
    );
  }

  if (state.status === "unavailable" || state.status === "not_found") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-black">
            {state.status === "not_found" ? "Appliance not found" : "Appliance unavailable"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {state.status === "not_found"
              ? "We could not find that appliance in your customer account."
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
  const details = [
    ["Appliance type", appliance.appliance_type],
    ["Brand", appliance.brand],
    ["Model number", appliance.model_number],
    ["Serial number", appliance.serial_number],
    ["Purchase year", appliance.purchase_year],
    ["Location", appliance.location_label],
    ["Notes", appliance.notes],
  ];

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-slate-950">
      <CustomerPortalHeader customer={state.customer} />
      <div className="mx-auto grid max-w-4xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="min-w-0">
            <Link
              href="/customer/dashboard"
              className="text-sm font-bold text-[#0F6BFF]"
            >
              Back to dashboard
            </Link>
            <div className="mt-4 flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-[#0F6BFF]">
                {getApplianceIconLabel(appliance.appliance_type)}
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-black text-slate-950">
                  {getApplianceTitle(appliance)}
                </h1>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {getApplianceSubtitle(appliance)}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Appliance details</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Start repair requests from the appliance that needs service.
              </p>
            </div>
            <Link
              href={`/customer/request-repair?appliance=${encodeURIComponent(appliance.id)}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0F6BFF] px-4 text-sm font-bold text-white transition hover:bg-[#0057D9]"
            >
              Request Repair
            </Link>
          </div>

          <dl className="mt-5 grid gap-3">
            {details.map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4"
              >
                <dt className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                  {label}
                </dt>
                <dd className="mt-1 break-words text-sm font-bold text-slate-950">
                  {formatDetailValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-6">
          <h2 className="text-xl font-black">Repair History</h2>
          <div className="mt-4 grid gap-3">
            {state.serviceRequests.length > 0 ? (
              state.serviceRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#0F6BFF]">
                        {getCustomerRepairReference(request)}
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {request.status.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Link
                      href={`/customer/repairs/${encodeURIComponent(getCustomerRepairReference(request))}`}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-white px-3 text-xs font-black text-[#0F6BFF] transition hover:bg-blue-50"
                    >
                      View repair
                    </Link>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                    {request.issue_description}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4 text-sm font-semibold text-slate-600">
                No repair history yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
