"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import {
  formatServiceRequestMoney,
  formatServiceRequestSource,
  mapAppointmentRow,
  mapServiceRequestEstimateRow,
  mapServiceRequestInvoiceRow,
  mapServiceRequestRow,
  SERVICE_REQUEST_SELECT_COLUMNS,
  SERVICE_REQUEST_STATUS_TONES,
  type DashboardServiceRequest,
  type DashboardServiceRequestAppointment,
  type DashboardServiceRequestEstimate,
  type DashboardServiceRequestInvoice,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AppointmentRow,
  ServiceRequestEstimateRow,
  ServiceRequestInvoiceRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type JobsOverviewState =
  | { status: "loading" }
  | {
      status: "ready";
      requests: DashboardServiceRequest[];
      appointments: DashboardServiceRequestAppointment[];
      estimates: DashboardServiceRequestEstimate[];
      invoices: DashboardServiceRequestInvoice[];
    };

type UpcomingWorkItem = {
  appointment: DashboardServiceRequestAppointment;
  request: DashboardServiceRequest;
};

type ScheduleCard = {
  id: string;
  href?: string;
  customerName: string;
  appliance: string;
  issue: string;
  timeWindow: string;
  city: string;
  status: DashboardServiceRequest["status"];
};

type ActionTone = "rose" | "amber" | "purple" | "blue";

const activeAppointmentStatuses = new Set([
  "scheduled",
  "confirmed",
  "en_route",
]);

const appointmentDashboardSelectColumns = [
  "id",
  "company_id",
  "service_request_id",
  "technician_profile_id",
  "appointment_date",
  "window_start_time",
  "window_end_time",
  "status",
  "source",
  "dispatcher_snapshot_id",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

const estimateDashboardSelectColumns = [
  "id",
  "service_request_id",
  "created_by_profile_id",
  "subtotal",
  "tax",
  "total",
  "estimate_status",
  "estimate_number",
  "customer_preview_notes",
  "warranty_text",
  "disclaimer_text",
  "public_approval_token_hash",
  "sent_at",
  "customer_responded_at",
  "created_at",
  "updated_at",
].join(",");

const invoiceDashboardSelectColumns = [
  "id",
  "service_request_id",
  "estimate_id",
  "created_by_profile_id",
  "invoice_number",
  "subtotal",
  "tax",
  "total",
  "invoice_status",
  "sent_at",
  "paid_at",
  "voided_at",
  "created_at",
  "updated_at",
].join(",");

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

function getMonthStartDate() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

function getCurrentDayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function formatAppointmentWindow(appointment: DashboardServiceRequestAppointment) {
  return `${appointment.windowStartTime.slice(0, 5)}-${appointment.windowEndTime.slice(0, 5)}`;
}

function isOnOrAfter(value: string | null, date: Date) {
  return value ? new Date(value).getTime() >= date.getTime() : false;
}

function mapRequestById(requests: DashboardServiceRequest[]) {
  return new Map(requests.map((request) => [request.id, request]));
}

function getRequestCity(request: DashboardServiceRequest) {
  return [request.city, request.zipCode ? `ZIP ${request.zipCode}` : null]
    .filter(Boolean)
    .join(" · ");
}

function buildScheduleCard({
  appointment,
  request,
}: UpcomingWorkItem): ScheduleCard {
  return {
    id: appointment.id,
    href: `/dashboard/leads/${request.id}`,
    customerName: request.customerName,
    appliance: [request.applianceBrand, request.applianceType]
      .filter(Boolean)
      .join(" "),
    issue: request.issueDescription || "Issue details pending",
    timeWindow: formatAppointmentWindow(appointment),
    city: getRequestCity(request) || "Address needed",
    status: request.status,
  };
}

const demoScheduleCards: ScheduleCard[] = [
  {
    id: "demo-katy-built-in",
    customerName: "Sarah Johnson",
    appliance: "Sub-Zero built-in refrigerator",
    issue: "Not cooling after overnight temperature rise",
    timeWindow: "09:00-11:00",
    city: "Katy · ZIP 77494",
    status: "scheduled",
  },
  {
    id: "demo-houston-ice-maker",
    customerName: "Marco Alvarez",
    appliance: "Samsung refrigerator",
    issue: "Ice maker frozen and leaking",
    timeWindow: "11:30-13:00",
    city: "Houston · ZIP 77084",
    status: "contacted",
  },
  {
    id: "demo-cypress-lg",
    customerName: "Priya Shah",
    appliance: "LG French door refrigerator",
    issue: "Compressor noise and warm freezer",
    timeWindow: "14:00-16:00",
    city: "Cypress · ZIP 77433",
    status: "diagnosed",
  },
  {
    id: "demo-sugar-land-ge",
    customerName: "Michael Reed",
    appliance: "GE Profile refrigerator",
    issue: "Water dispenser stopped working",
    timeWindow: "16:00-18:00",
    city: "Sugar Land · ZIP 77479",
    status: "waiting_customer",
  },
];

async function safeQueryRows<T>(
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const result = await query;
  return result.error ? [] : (result.data as T[] | null) ?? [];
}

export function DashboardJobsOverview() {
  const [state, setState] = useState<JobsOverviewState>({ status: "loading" });
  const [schedulePage, setSchedulePage] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadOperations() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "ready",
            requests: [],
            appointments: [],
            estimates: [],
            invoices: [],
          });
        }
        return;
      }

      const [requestRows, appointmentRows, estimateRows, invoiceRows] =
        await Promise.all([
          safeQueryRows<ServiceRequestRow>(
            supabase
              .from("service_requests")
              .select(SERVICE_REQUEST_SELECT_COLUMNS)
              .order("created_at", { ascending: false }),
          ),
          safeQueryRows<AppointmentRow>(
            supabase
              .from("appointments")
              .select(appointmentDashboardSelectColumns)
              .order("appointment_date", { ascending: true })
              .order("window_start_time", { ascending: true }),
          ),
          safeQueryRows<ServiceRequestEstimateRow>(
            supabase
              .from("service_request_estimates")
              .select(estimateDashboardSelectColumns)
              .order("created_at", { ascending: false }),
          ),
          safeQueryRows<ServiceRequestInvoiceRow>(
            supabase
              .from("service_request_invoices")
              .select(invoiceDashboardSelectColumns)
              .order("created_at", { ascending: false }),
          ),
        ]);

      if (!isMounted) {
        return;
      }

      setState({
        status: "ready",
        requests: requestRows.map(mapServiceRequestRow),
        appointments: appointmentRows.map(mapAppointmentRow),
        estimates: estimateRows.map(mapServiceRequestEstimateRow),
        invoices: invoiceRows.map(mapServiceRequestInvoiceRow),
      });
    }

    void loadOperations();

    return () => {
      isMounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    if (state.status !== "ready") {
      return null;
    }

    const today = getTodayDateKey();
    const weekStart = getWeekStartDate();
    const monthStart = getMonthStartDate();
    const requestsById = mapRequestById(state.requests);
    const activeAppointments = state.appointments.filter((appointment) =>
      activeAppointmentStatuses.has(appointment.status),
    );
    const todaysAppointmentRequestIds = new Set(
      activeAppointments
        .filter((appointment) => appointment.appointmentDate === today)
        .map((appointment) => appointment.serviceRequestId),
    );
    const jobsToday = state.requests.filter(
      (request) =>
        request.scheduledDate === today ||
        todaysAppointmentRequestIds.has(request.id),
    );
    const upcomingWork = activeAppointments
      .filter((appointment) => appointment.appointmentDate >= today)
      .map((appointment): UpcomingWorkItem | null => {
        const request = requestsById.get(appointment.serviceRequestId);
        return request ? { appointment, request } : null;
      })
      .filter((item): item is UpcomingWorkItem => Boolean(item));
    const waitingCustomer = state.requests.filter(
      (request) => request.status === "waiting_customer",
    );
    const partsOrdered = state.requests.filter((request) =>
      ["parts_ordered", "parts_needed", "parts_received"].includes(request.status),
    );
    const estimatesWaiting = state.estimates.filter(
      (estimate) => estimate.estimateStatus === "sent",
    );
    const pendingEstimates = state.estimates.filter((estimate) =>
      ["draft", "sent"].includes(estimate.estimateStatus),
    );
    const scheduledRequestIds = new Set(
      activeAppointments.map((appointment) => appointment.serviceRequestId),
    );
    const scheduledRevenue = state.estimates
      .filter((estimate) => scheduledRequestIds.has(estimate.serviceRequestId))
      .reduce((total, estimate) => total + estimate.total, 0);
    const completedThisWeek = state.requests.filter(
      (request) =>
        ["completed", "closed"].includes(request.status) &&
        isOnOrAfter(request.updatedAt, weekStart),
    );
    const completedToday = state.requests.filter(
      (request) =>
        ["completed", "closed"].includes(request.status) &&
        request.updatedAt?.slice(0, 10) === today,
    );
    const jobsCancelled = state.requests.filter(
      (request) => request.status === "canceled",
    );
    const paidInvoices = state.invoices.filter(
      (invoice) => invoice.invoiceStatus === "paid",
    );
    const collected = paidInvoices.reduce((total, invoice) => total + invoice.total, 0);
    const todayTotal = paidInvoices
      .filter((invoice) => (invoice.paidAt ?? invoice.updatedAt).slice(0, 10) === today)
      .reduce((total, invoice) => total + invoice.total, 0);
    const monthTotal = paidInvoices
      .filter((invoice) => isOnOrAfter(invoice.paidAt ?? invoice.updatedAt, monthStart))
      .reduce((total, invoice) => total + invoice.total, 0);

    return {
      jobsToday,
      upcomingWork,
      waitingCustomer,
      partsOrdered,
      estimatesWaiting,
      pendingEstimates,
      completedThisWeek,
      completedToday,
      jobsCancelled,
      collected,
      scheduledRevenue,
      monthTotal,
      todayTotal,
      jobsCreated: state.requests.length,
    };
  }, [state]);

  if (state.status === "loading") {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm font-semibold text-[#64748B] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        Loading dashboard...
      </section>
    );
  }

  if (!summary) {
    return null;
  }

  const scheduleWindowSize = 5;
  const activeJobsCount = state.requests.filter(
    (request) => !["completed", "closed", "canceled"].includes(request.status),
  ).length;
  const maxSchedulePage = Math.max(
    0,
    Math.ceil(
      Math.max(summary.upcomingWork.length, demoScheduleCards.length) /
        scheduleWindowSize,
    ) - 1,
  );
  const scheduleCards =
    summary.upcomingWork.length > 0
      ? summary.upcomingWork.map(buildScheduleCard)
      : demoScheduleCards;
  const visibleWork = scheduleCards.slice(
    schedulePage * scheduleWindowSize,
    schedulePage * scheduleWindowSize + scheduleWindowSize,
  );

  const summaryCards = [
    {
      label: "Today's Jobs",
      value: summary.jobsToday.length,
      helper: "Scheduled",
      href: "/dashboard/leads",
    },
    {
      label: "Pending Estimates",
      value: summary.estimatesWaiting.length,
      helper: "Approval",
      href: "/dashboard/leads",
    },
    {
      label: "Parts Waiting",
      value: summary.partsOrdered.length,
      helper: "Parts",
      href: "/dashboard/leads",
    },
    {
      label: "Callbacks",
      value:
        summary.waitingCustomer.length,
      helper: "Customers",
      href: "/dashboard/leads",
    },
  ];

  const salesRows = [
    ["Revenue This Week", formatServiceRequestMoney(summary.todayTotal)],
    ["Revenue This Month", formatServiceRequestMoney(summary.monthTotal)],
    ["Jobs Completed", String(summary.completedThisWeek.length)],
  ];

  const nextActions = [
    ...summary.waitingCustomer.slice(0, 2).map((request) => ({
      id: `call-${request.id}`,
      action: `Call ${request.customerName}`,
      appliance: [request.applianceBrand, request.applianceType]
        .filter(Boolean)
        .join(" "),
      reason: "Waiting customer callback",
      href: `/dashboard/leads/${request.id}`,
      tone: "rose" as const,
    })),
    ...summary.estimatesWaiting.slice(0, 2).map((estimate) => ({
      id: `send-${estimate.id}`,
      action: "Follow up on estimate",
      appliance: estimate.estimateNumber ?? "Estimate",
      reason: `${formatServiceRequestMoney(estimate.total)} waiting approval`,
      href: `/dashboard/leads/${estimate.serviceRequestId}`,
      tone: "purple" as const,
    })),
    ...summary.partsOrdered.slice(0, 2).map((request) => ({
      id: `parts-${request.id}`,
      action:
        request.status === "parts_received"
          ? "Schedule return visit"
          : "Check ordered parts",
      appliance: [request.applianceBrand, request.applianceType]
        .filter(Boolean)
        .join(" "),
      reason:
        request.status === "parts_received"
          ? "Parts received"
          : "Parts workflow active",
      href: `/dashboard/leads/${request.id}`,
      tone: "amber" as const,
    })),
  ].slice(0, 8);
  const displayNextActions =
    nextActions.length > 0
      ? nextActions
      : [
          {
            id: "sample-call",
            action: "Call Marco Alvarez",
            appliance: "LG refrigerator",
            reason: "Waiting customer callback",
            href: "/dashboard/leads",
            tone: "rose" as const,
          },
          {
            id: "sample-estimate",
            action: "Send estimate to Michael Reed",
            appliance: "GE Profile refrigerator",
            reason: "Estimate pending approval",
            href: "/dashboard/leads",
            tone: "purple" as const,
          },
          {
            id: "sample-return",
            action: "Schedule return visit",
            appliance: "Samsung refrigerator",
            reason: "Parts received",
            href: "/dashboard/leads",
            tone: "amber" as const,
          },
          {
            id: "sample-order",
            action: "Order evaporator fan",
            appliance: "Sub-Zero built-in",
            reason: "Diagnosis ready",
            href: "/dashboard/leads",
            tone: "blue" as const,
          },
        ];

  return (
    <section className="space-y-3">
      <header className="rounded-[20px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-bold text-[#64748B]">{getCurrentDayLabel()}</p>
            <h1 className="mt-0.5 text-xl font-black tracking-tight text-[#0F172A] md:text-2xl">
              {getGreeting()}, Serhii
            </h1>
            <p className="mt-0.5 text-xs font-semibold text-[#64748B]">
              {activeJobsCount} active jobs in your workspace
            </p>
          </div>
          <div className="flex flex-col gap-2 xl:min-w-[700px] xl:flex-row xl:items-center">
            <label className="relative block flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-[#94A3B8]">
                <SearchIcon />
              </span>
              <input
                className="h-10 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] pl-10 pr-4 text-sm font-semibold text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF] focus:bg-white"
                placeholder="Search jobs, customers, parts, models..."
                type="search"
              />
            </label>
            <div className="flex items-center gap-2">
              <HeaderIconButton label="Calls" value="3" />
              <HeaderIconButton label="Messages" value="5" />
              <HeaderIconButton label="Alerts" value="2" />
              <div className="ml-1 flex h-10 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-2.5">
                <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#071D36] text-xs font-black text-white">
                  S
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
                </span>
                <div className="hidden min-w-0 sm:block">
                  <p className="text-xs font-black text-[#0F172A]">Serhii</p>
                  <p className="text-[11px] font-bold text-[#64748B]">Available</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <DashboardPanel compact title="Next Actions">
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <Link
              className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 transition hover:border-[#0F6BFF]/40 hover:bg-white"
              href={card.href}
              key={card.label}
            >
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-black uppercase tracking-[0.1em] text-[#64748B]">
                  {card.label}
                </span>
                <span className="mt-0.5 block text-xs font-bold text-[#334155]">
                  {card.helper}
                </span>
              </span>
              <span className="text-xl font-black text-[#0F172A]">{card.value}</span>
            </Link>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {displayNextActions.map((item) => (
            <Link
              className={`flex min-h-[96px] gap-3 rounded-2xl border px-3 py-3 transition hover:border-[#0F6BFF]/40 ${
                attentionToneClassName[item.tone]
              }`}
              href={item.href}
              key={item.id}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#0F6BFF] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                <ActionIcon tone={item.tone} />
              </span>
              <span className="min-w-0">
                <span className="line-clamp-1 text-sm font-black text-[#0F172A]">
                  {item.action}
                </span>
                <span className="mt-1 line-clamp-1 text-xs font-bold text-[#334155]">
                  {item.appliance || "Appliance"}
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-4 text-[#64748B]">
                  {item.reason}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </DashboardPanel>

      <div>
        <DashboardPanel
          compact
          title="Today's Schedule"
          href="/dashboard/technician-schedule"
          linkLabel="Open Calendar"
          actions={
            <div className="flex gap-1.5">
              <button
                className="rounded-[10px] border border-[#E5E7EB] px-2.5 py-1.5 text-[11px] font-black text-[#334155] transition hover:border-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={schedulePage === 0}
                onClick={() => setSchedulePage((page) => Math.max(0, page - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-[10px] border border-[#E5E7EB] px-2.5 py-1.5 text-[11px] font-black text-[#334155] transition hover:border-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={schedulePage >= maxSchedulePage}
                onClick={() =>
                  setSchedulePage((page) => Math.min(maxSchedulePage, page + 1))
                }
                type="button"
              >
                Next
              </button>
            </div>
          }
        >
          {visibleWork.length > 0 ? (
            <div className="grid max-h-[240px] gap-2.5 overflow-hidden md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {visibleWork.map((item) => {
                const cardBody = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-black text-[#0F172A]">
                        {item.timeWindow}
                      </p>
                      <span className="max-w-[92px] shrink-0 text-right">
                      <StatusBadge
                        tone={SERVICE_REQUEST_STATUS_TONES[item.status] ?? "slate"}
                      >
                        {formatServiceRequestSource(item.status)}
                      </StatusBadge>
                      </span>
                    </div>
                    <h3 className="mt-2 line-clamp-1 text-sm font-black text-[#0F172A]">
                      {item.customerName}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-xs font-black text-[#334155]">
                      {item.appliance || "Appliance details pending"}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-4 text-[#64748B]">
                      {item.issue}
                    </p>
                    <p className="mt-1.5 line-clamp-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#64748B]">
                      {item.city}
                    </p>
                  </>
                );

                const className =
                  "h-[154px] rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 transition hover:border-[#0F6BFF]/40 hover:bg-white";

                return item.href ? (
                  <Link className={className} href={item.href} key={item.id}>
                    {cardBody}
                  </Link>
                ) : (
                  <article className={className} key={item.id}>
                    {cardBody}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyDashboardState>No scheduled jobs for this view.</EmptyDashboardState>
          )}
        </DashboardPanel>

      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MiniOpsCard
          title="Recent Calls"
          rows={[
            ["Katy customer", "(281) 555-0147 · inbound · 9:12 AM"],
            ["Sugar Land job", "(832) 555-0198 · outbound · 8:40 AM"],
            ["Cypress follow-up", "(713) 555-0124 · missed · 8:05 AM"],
          ]}
        />
        <MiniOpsCard
          title="Recent Messages"
          rows={[
            ["Sergio M.", "Estimate question · 10 min"],
            ["Houston customer", "Gate code sent · 32 min"],
            ["Katy customer", "Confirmed window · 1 hr"],
          ]}
        />

        <DashboardPanel compact title="AI Technician Advisor">
          <SearchField placeholder="Ask symptoms, model, or error code" />
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-[10px] bg-[#0F6BFF] px-3 py-2 text-xs font-black text-white transition hover:bg-[#0057D9]"
              type="button"
            >
              New Chat
            </button>
            <button
              className="rounded-[10px] border border-[#E5E7EB] px-3 py-2 text-xs font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
              type="button"
            >
              View All
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              "LG not cooling",
              "Samsung FF-E",
              "Sub-Zero ice build-up",
              "Compressor amps",
            ].map((chip) => (
              <span
                className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-black text-[#0F6BFF]"
                key={chip}
              >
                {chip}
              </span>
            ))}
          </div>
          <CompactList
            items={[
              ["GE Oven F97 error code", "recent session"],
              ["Sub-Zero 650 not cooling", "saved answer"],
              ["LG FF-E error", "draft session"],
            ]}
          />
        </DashboardPanel>

      </div>

      <PartsVendorCenter />

      <div className="grid gap-3 md:grid-cols-3">
        <DashboardPanel compact title="Manuals Library">
          <SearchField placeholder="Search model, brand, or part" />
          <CompactList
            items={[
              ["Sub-Zero 648PRO", "service manual"],
              ["LG LFXS26973S", "tech sheet"],
            ]}
          />
        </DashboardPanel>
        <CommunityFeedCard />
        <SalesSnapshot rows={salesRows} />
      </div>
    </section>
  );
}

const attentionToneClassName: Record<ActionTone, string> = {
  amber: "border-amber-100 bg-amber-50",
  blue: "border-blue-100 bg-blue-50",
  purple: "border-purple-100 bg-purple-50",
  rose: "border-rose-100 bg-rose-50",
};

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
    </svg>
  );
}

function HeaderIconButton({ label, value }: { label: string; value: string }) {
  const pathByLabel: Record<string, string> = {
    Calls: "M7 5h4l2 5-2.5 1.5a12 12 0 0 0 4 4L16 13l5 2v4c0 1-1 2-2 2A16 16 0 0 1 3 5c0-1 1-2 2-2h2v2Z",
    Messages: "M4 5h16v12H8l-4 4zM8 9h8M8 13h5",
    Alerts: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2ZM5 17h14l-2-3V9a5 5 0 0 0-10 0v5z",
  };

  return (
    <button
      aria-label={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] transition hover:border-[#0F6BFF] hover:bg-white hover:text-[#0F6BFF]"
      type="button"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <path d={pathByLabel[label] ?? "M5 12h14"} />
      </svg>
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0F6BFF] px-1 text-[9px] font-black text-white">
        {value}
      </span>
    </button>
  );
}

function SalesSnapshot({
  rows,
}: {
  rows: string[][];
}) {
  return (
    <article className="h-full rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_10px_26px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">Sales Snapshot</h2>
          <p className="mt-0.5 text-[11px] font-semibold text-[#64748B]">
            Technician view
          </p>
        </div>
      </div>
      <div className="mt-2.5 grid gap-1.5">
        {rows.map(([label, value]) => (
          <div
            className="flex items-center justify-between gap-3 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2"
            key={label}
          >
            <p className="truncate text-[11px] font-black uppercase tracking-[0.1em] text-[#64748B]">
              {label}
            </p>
            <p className="shrink-0 text-sm font-black text-[#0F172A]">
              {value}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function SearchField({ placeholder }: { placeholder: string }) {
  return (
    <input
      className="h-10 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#0F6BFF] focus:bg-white"
      placeholder={placeholder}
      type="search"
    />
  );
}

function ActionIcon({ tone }: { tone: ActionTone }) {
  const pathByTone: Record<ActionTone, string> = {
    amber: "M4 7h16v13H4zM7 4h10v3H7zM8 12h8",
    blue: "M5 12h14M12 5v14",
    purple: "M12 8v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    rose: "M7 5h4l2 5-2.5 1.5a12 12 0 0 0 4 4L16 13l5 2v4c0 1-1 2-2 2A16 16 0 0 1 3 5c0-1 1-2 2-2h2v2Z",
  };

  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={pathByTone[tone]} />
    </svg>
  );
}

function PartsVendorCenter() {
  return (
    <DashboardPanel compact title="Parts & Vendors">
      <div className="grid gap-3 xl:grid-cols-3">
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.1em] text-[#64748B]">
            Parts Search
          </p>
          <SearchField placeholder="Search part, model, appliance" />
          <CompactList
            items={[
              ["DA97-07603B", "Marcone · available"],
              ["WR60X26866", "Truck stock · 2 on hand"],
              ["W10882923", "Reliable Parts · tomorrow"],
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.1em] text-[#64748B]">
            Inventory
          </p>
          <CompactList
            items={[
              ["Compressors", "3 ready"],
              ["Evaporator fans", "2 low stock"],
              ["Defrost heaters", "6 ready"],
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.1em] text-[#64748B]">
            Vendors
          </p>
          <SearchField placeholder="Search vendor stock" />
          <CompactList
            items={[
              ["Encompass", "$84 · available today"],
              ["Marcone", "$91 · counter pickup"],
              ["Parts Town", "$96 · ships today"],
            ]}
          />
        </div>
      </div>
    </DashboardPanel>
  );
}

function DashboardPanel({
  actions,
  children,
  compact = false,
  title,
  href,
  linkLabel,
}: {
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <article
      className={`rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-black text-[#0F172A]">{title}</h2>
        <div className="flex flex-wrap gap-2">
          {actions}
          {href && linkLabel ? (
            <Link className="text-sm font-bold text-[#0F6BFF]" href={href}>
              {linkLabel}
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </article>
  );
}

function EmptyDashboardState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
      {children}
    </p>
  );
}

function CompactList({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {items.map(([title, helper]) => (
        <div
          className="flex items-center justify-between gap-3 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1.5"
          key={title}
        >
          <p className="truncate text-xs font-bold text-[#0F172A]">{title}</p>
          <p className="shrink-0 text-[11px] font-semibold text-[#64748B]">{helper}</p>
        </div>
      ))}
    </div>
  );
}

function CommunityFeedCard() {
  const discussions = [
    ["S", "Samsung RF28 leak issue", "18 replies", "active"],
    ["Z", "Sub-Zero 650 board failure", "11 replies", "today"],
    ["L", "LG compressor warranty question", "8 replies", "2 hr"],
    ["G", "GE oven F97 error code", "5 replies", "new"],
  ];

  return (
    <Link href="/dashboard/community">
    <article className="h-full rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-[#0F6BFF]/40 hover:shadow-[0_16px_34px_rgba(15,23,42,0.1)]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black text-[#0F172A]">Community Feed</h2>
          <span className="text-xs font-black text-[#0F6BFF]">Open</span>
        </div>
        <div className="mt-2 space-y-1.5">
          {discussions.map(([avatar, title, replies, activity]) => (
            <div
              className="flex items-center gap-2.5 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1.5"
              key={title}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#071D36] text-[11px] font-black text-white">
                {avatar}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#0F172A]">
                  {title}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[#64748B]">
                  {replies} · {activity}
                </p>
              </div>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            </div>
          ))}
        </div>
      </article>
    </Link>
  );
}

function MiniOpsCard({
  href,
  rows,
  title,
}: {
  href?: string;
  rows: [string, string][];
  title: string;
}) {
  const content = (
    <article className="h-full rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-[#0F172A]">{title}</h2>
        {href ? <span className="text-xs font-black text-[#0F6BFF]">Open</span> : null}
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map(([label, helper]) => (
          <div
            className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1.5"
            key={label}
          >
            <p className="truncate text-xs font-bold text-[#0F172A]">{label}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-[#64748B]">
              {helper}
            </p>
          </div>
        ))}
      </div>
    </article>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
