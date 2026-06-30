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
  SERVICE_REQUEST_STATUS_TONES,
  type DashboardServiceRequest,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ServiceRequestRow } from "@/lib/supabase/types";

type LoadState =
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: string };

type DateFilter = "all" | "today" | "scheduled" | "unscheduled";

function getReadErrorMessage(message: string): string {
  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "This account cannot read jobs yet. Confirm the dashboard account has access to the selected technician or company workspace.";
  }

  if (message.includes("service_requests") && message.includes("schema cache")) {
    return "Job storage is not ready for this workspace yet.";
  }

  return message;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getJobAddress(request: DashboardServiceRequest) {
  if (request.fullAddress) {
    return request.fullAddress;
  }

  const cityState = [request.city, request.state].filter(Boolean).join(", ");
  return [cityState, request.zipCode ? `ZIP ${request.zipCode}` : null]
    .filter(Boolean)
    .join(" · ");
}

function getAppointmentLabel(request: DashboardServiceRequest) {
  if (
    request.scheduledDate &&
    request.scheduledWindowStartTime &&
    request.scheduledWindowEndTime
  ) {
    return `${request.scheduledDate} · ${request.scheduledWindowStartTime.slice(
      0,
      5,
    )}-${request.scheduledWindowEndTime.slice(0, 5)}`;
  }

  return request.preferredTimeWindow ?? "Not scheduled";
}

function getTechnicianLabel(request: DashboardServiceRequest) {
  if (request.selectedTechnicianBusinessName) {
    return request.selectedTechnicianBusinessName;
  }

  if (request.assignedTechnicianProfileId) {
    return "Assigned technician";
  }

  return "Unassigned";
}

function getEstimateLabel(request: DashboardServiceRequest) {
  if (request.status === "estimate_sent") {
    return "Estimate sent";
  }

  if (request.status === "estimate_approved") {
    return "Estimate approved";
  }

  if (request.status === "estimate_declined") {
    return "Estimate declined";
  }

  return "No active estimate";
}

function requestMatchesDateFilter(
  request: DashboardServiceRequest,
  dateFilter: DateFilter,
) {
  if (dateFilter === "all") {
    return true;
  }

  if (dateFilter === "scheduled") {
    return Boolean(request.scheduledDate || request.appointmentId);
  }

  if (dateFilter === "unscheduled") {
    return !request.scheduledDate && !request.appointmentId;
  }

  return request.scheduledDate === getTodayKey();
}

export function ServiceRequestsInbox() {
  const [requests, setRequests] = useState<DashboardServiceRequest[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    error: null,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [technicianFilter, setTechnicianFilter] = useState("All technicians");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  useEffect(() => {
    let isMounted = true;

    async function loadRequests() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setLoadState({
            status: "error",
            error: "Job reads are not configured for this dashboard session.",
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

  const technicianOptions = useMemo(
    () => [
      "All technicians",
      ...Array.from(new Set(requests.map(getTechnicianLabel))).filter(
        (label) => label !== "Unassigned",
      ),
      "Unassigned",
    ],
    [requests],
  );

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return requests.filter((request) => {
      const statusMatches =
        statusFilter === "All statuses" ? true : request.status === statusFilter;
      const technicianMatches =
        technicianFilter === "All technicians"
          ? true
          : getTechnicianLabel(request) === technicianFilter;
      const dateMatches = requestMatchesDateFilter(request, dateFilter);
      const queryMatches =
        query.length === 0
          ? true
          : [
              request.customerName,
              request.applianceType,
              request.applianceBrand,
              request.issueDescription,
              request.city,
              request.state,
              request.zipCode,
              getTechnicianLabel(request),
            ]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(query));

      return statusMatches && technicianMatches && dateMatches && queryMatches;
    });
  }, [dateFilter, requests, searchQuery, statusFilter, technicianFilter]);

  const summary = useMemo(() => {
    const today = getTodayKey();

    return {
      total: requests.length,
      scheduledToday: requests.filter((request) => request.scheduledDate === today)
        .length,
      needsReview: requests.filter((request) => request.status === "new").length,
      waitingCustomer: requests.filter((request) => request.status === "waiting_customer")
        .length,
    };
  }, [requests]);

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("All statuses");
    setTechnicianFilter("All technicians");
    setDateFilter("all");
  }

  if (loadState.status === "loading") {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 text-sm font-semibold text-[#64748B] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        Loading jobs...
      </section>
    );
  }

  if (loadState.status === "error") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">
          Jobs unavailable
        </p>
        <h2 className="mt-3 text-2xl font-black text-[#0F172A]">
          The job inbox could not load.
        </h2>
        <p className="mt-3 max-w-3xl leading-7 text-amber-800">
          {loadState.error}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["All Jobs", summary.total],
          ["Today", summary.scheduledToday],
          ["Needs Review", summary.needsReview],
          ["Waiting Customer", summary.waitingCustomer],
        ].map(([label, value]) => (
          <article
            className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
            key={label}
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
              {label}
            </p>
            <p className="mt-2 text-3xl font-black text-[#0F172A]">{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">Search</span>
            <input
              className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Customer, appliance, ZIP, technician..."
              value={searchQuery}
            />
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">Status</span>
            <select
              className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
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
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">Technician</span>
            <select
              className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
              onChange={(event) => setTechnicianFilter(event.target.value)}
              value={technicianFilter}
            >
              {technicianOptions.map((technician) => (
                <option key={technician}>{technician}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">Schedule</span>
            <select
              className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
              value={dateFilter}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="scheduled">Scheduled</option>
              <option value="unscheduled">Unscheduled</option>
            </select>
          </label>

          <button
            className="rounded-[10px] border border-[#E5E7EB] px-4 py-2.5 text-sm font-bold text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={clearFilters}
            type="button"
          >
            Clear
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
          {filteredRequests.length} job{filteredRequests.length === 1 ? "" : "s"} shown
        </p>
      </div>

      {filteredRequests.length > 0 ? (
        <div className="grid gap-4">
          {filteredRequests.map((request) => (
            <article
              className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-[#0F6BFF]/30 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
              key={request.id}
            >
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={SERVICE_REQUEST_STATUS_TONES[request.status] ?? "slate"}>
                      {formatServiceRequestSource(request.status)}
                    </StatusBadge>
                    <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1 text-xs font-bold text-[#64748B]">
                      {getEstimateLabel(request)}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-black tracking-tight text-[#0F172A]">
                    {request.customerName}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-[#334155]">
                    {request.applianceBrand ?? "Unknown brand"} {request.applianceType}
                  </p>
                  <p className="mt-2 line-clamp-1 max-w-3xl text-sm leading-6 text-[#64748B]">
                    {request.issueDescription}
                  </p>
                </div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Address", getJobAddress(request) || "Address needed"],
                    ["Time", getAppointmentLabel(request)],
                    ["Tech", getTechnicianLabel(request)],
                    ["Submitted", formatServiceRequestDate(request.createdAt)],
                  ].map(([label, value]) => (
                    <div
                      className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2"
                      key={label}
                    >
                      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                        {label}
                      </dt>
                      <dd className="mt-0.5 line-clamp-1 text-xs font-bold leading-5 text-[#0F172A]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Link
                  className="inline-flex justify-center rounded-[10px] bg-[#0F6BFF] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0057D9] lg:min-w-32"
                  href={`/dashboard/leads/${request.id}`}
                >
                  Open Job
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No jobs match these filters"
          description="Clear filters or adjust the search to see more technician jobs."
        />
      )}
    </div>
  );
}
