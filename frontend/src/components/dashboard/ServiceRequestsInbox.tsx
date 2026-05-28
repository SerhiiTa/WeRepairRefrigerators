"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatServiceRequestDate,
  formatServiceRequestSource,
  mapServiceRequestRow,
  SERVICE_REQUEST_SELECT_COLUMNS,
  type DashboardServiceRequest,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ServiceRequestRow } from "@/lib/supabase/types";

type LoadState =
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: string };

const statusTone: Record<string, "cyan" | "emerald" | "amber" | "slate"> = {
  new: "cyan",
  contacted: "amber",
  scheduled: "cyan",
  completed: "emerald",
  canceled: "slate",
  reviewed: "amber",
  lead_created: "emerald",
  archived: "slate",
  spam: "slate",
};

function getReadErrorMessage(message: string): string {
  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "Service request dashboard reads are not available for this account yet. Apply migration 0018 and confirm the request is selected for your public technician profile, or use an admin account.";
  }

  if (message.includes("service_requests") && message.includes("schema cache")) {
    return "Service request storage is not available yet. Apply migration 0017 first, then 0018.";
  }

  return message;
}

export function ServiceRequestsInbox() {
  const [requests, setRequests] = useState<DashboardServiceRequest[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    error: null,
  });
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [zipFilter, setZipFilter] = useState("All ZIP codes");

  useEffect(() => {
    let isMounted = true;

    async function loadRequests() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setLoadState({
            status: "error",
            error: "Supabase is not configured for dashboard service request reads.",
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select(SERVICE_REQUEST_SELECT_COLUMNS)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setLoadState({
          status: "error",
          error: getReadErrorMessage(error.message),
        });
        return;
      }

      setRequests((data as unknown as ServiceRequestRow[]).map(mapServiceRequestRow));
      setLoadState({ status: "ready", error: null });
    }

    void loadRequests();

    return () => {
      isMounted = false;
    };
  }, []);

  const statusOptions = useMemo(
    () => ["All statuses", ...Array.from(new Set(requests.map((request) => request.status)))],
    [requests],
  );
  const zipOptions = useMemo(
    () => ["All ZIP codes", ...Array.from(new Set(requests.map((request) => request.zipCode)))],
    [requests],
  );

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const statusMatches =
          statusFilter === "All statuses" ? true : request.status === statusFilter;
        const zipMatches = zipFilter === "All ZIP codes" ? true : request.zipCode === zipFilter;

        return statusMatches && zipMatches;
      }),
    [requests, statusFilter, zipFilter],
  );

  if (loadState.status === "loading") {
    return (
      <section className="rounded-lg border border-white/10 bg-slate-900 p-6 text-slate-300">
        Loading real service requests...
      </section>
    );
  }

  if (loadState.status === "error") {
    return (
      <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-100">
          Service requests unavailable
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">Real inbox reads are blocked.</h2>
        <p className="mt-3 max-w-3xl leading-7 text-amber-50/90">{loadState.error}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-2 md:items-end">
        <label className="block">
          <span className="text-sm font-bold text-slate-100">Request status</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "All statuses" ? status : formatServiceRequestSource(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-100">ZIP code</span>
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            onChange={(event) => setZipFilter(event.target.value)}
            value={zipFilter}
          >
            {zipOptions.map((zipCode) => (
              <option key={zipCode}>{zipCode}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          {filteredRequests.length} request{filteredRequests.length === 1 ? "" : "s"} shown
        </p>
        <p className="text-sm text-slate-400">Loaded from Supabase `service_requests`.</p>
      </div>

      {filteredRequests.length > 0 ? (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <article
              className="rounded-lg border border-white/10 bg-slate-900 p-5 transition hover:border-cyan-300/30"
              key={request.id}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusTone[request.status] ?? "slate"}>
                      {formatServiceRequestSource(request.status)}
                    </StatusBadge>
                    <span className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300">
                      ZIP {request.zipCode}
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-bold tracking-tight text-white">
                    {request.customerName} · {request.applianceBrand ?? "Unknown brand"}{" "}
                    {request.applianceType}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    {request.issueDescription}
                  </p>
                </div>
                <Link
                  className="rounded-md bg-cyan-300 px-4 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
                  href={`/dashboard/leads/${request.id}`}
                >
                  Review Details
                </Link>
              </div>

              <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Contact", request.customerPhone ?? request.customerEmail ?? "Not provided"],
                  ["Preferred time", request.preferredTimeWindow ?? "Not provided"],
                  ["Selected technician", request.selectedTechnicianBusinessName ?? "Unassigned"],
                  ["Submitted", formatServiceRequestDate(request.createdAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
                    <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-300">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No service requests yet"
          description="New public schedule-service submissions will appear here when RLS allows this dashboard account to read them."
        />
      )}
    </div>
  );
}
