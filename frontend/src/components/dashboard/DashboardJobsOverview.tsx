"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { DashboardMobileDrawer } from "@/components/dashboard/DashboardMobileDrawer";
import { StatusBadge } from "@/components/StatusBadge";
import {
  formatServiceRequestSource,
  mapAppointmentRow,
  mapServiceRequestRow,
  SERVICE_REQUEST_SELECT_COLUMNS,
  SERVICE_REQUEST_STATUS_TONES,
  type DashboardServiceRequest,
  type DashboardServiceRequestAppointment,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AppointmentRow,
  DatabaseCommunicationConversationStatus,
  DatabaseCommunicationSourceType,
  DatabaseEstimateStatus,
  DatabaseInvoiceStatus,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type JobsOverviewState =
  | { status: "loading" }
  | {
      status: "ready";
      requests: DashboardServiceRequest[];
      appointments: DashboardServiceRequestAppointment[];
      conversations: DashboardCommunicationConversation[];
      estimates: DashboardEstimateSummary[];
      invoices: DashboardInvoiceSummary[];
    };

type DashboardCommunicationConversation = {
  primarySourceType: DatabaseCommunicationSourceType;
  status: DatabaseCommunicationConversationStatus;
};

type DashboardEstimateSummary = {
  estimateStatus: DatabaseEstimateStatus;
};

type DashboardInvoiceSummary = {
  invoiceStatus: DatabaseInvoiceStatus;
};

type TodayJobCard = {
  appointment?: DashboardServiceRequestAppointment;
  city: string;
  customerName: string;
  href: string;
  id: string;
  issue: string;
  machine: string;
  status: DashboardServiceRequest["status"];
  timeWindow: string;
};

type AssistantMessage = {
  href?: string;
  text: string;
};

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

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
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

function formatAppointmentWindow(appointment?: DashboardServiceRequestAppointment) {
  if (!appointment) {
    return "Time not scheduled";
  }

  return `${appointment.windowStartTime.slice(0, 5)}-${appointment.windowEndTime.slice(0, 5)}`;
}

function getRequestCity(request: DashboardServiceRequest) {
  return [request.city, request.zipCode ? `ZIP ${request.zipCode}` : null]
    .filter(Boolean)
    .join(" · ");
}

function mapRequestById(requests: DashboardServiceRequest[]) {
  return new Map(requests.map((request) => [request.id, request]));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAssistantTime(windowLabel: string) {
  const [startTime] = windowLabel.split("-");
  const [hourValue, minuteValue = "00"] = startTime.split(":");
  const hour = Number(hourValue);

  if (!Number.isFinite(hour)) {
    return windowLabel;
  }

  const displayHour = hour % 12 || 12;
  const meridiem = hour < 12 ? "AM" : "PM";

  return `${displayHour}:${minuteValue} ${meridiem}`;
}

function buildAssistantMessage({
  attention,
  calls,
  firstTodayJob,
  messages,
  openJobs,
  partsWaiting,
  pendingEstimates,
  unpaidInvoices,
}: {
  attention: number;
  calls: number;
  firstTodayJob?: TodayJobCard;
  messages: number;
  openJobs: number;
  partsWaiting: number;
  pendingEstimates: number;
  unpaidInvoices: number;
}): AssistantMessage {
  if (attention > 0) {
    return {
      href: "/dashboard#attention",
      text: `${pluralize(attention, "job")} need attention. Start with the one blocking today's work.`,
    };
  }

  if (calls > 0) {
    return {
      href: "/dashboard/communications?channel=phone",
      text: `${pluralize(calls, "phone call")} waiting for review. Start there.`,
    };
  }

  if (messages > 0) {
    return {
      href: "/dashboard/communications?channel=messages",
      text: `${pluralize(messages, "customer conversation")} need attention. Check the newest reply first.`,
    };
  }

  if (firstTodayJob) {
    return {
      href: firstTodayJob.href,
      text: `Your first job starts at ${formatAssistantTime(firstTodayJob.timeWindow)} with ${firstTodayJob.customerName}.`,
    };
  }

  if (openJobs > 0) {
    return {
      href: "/dashboard/leads",
      text: `${pluralize(openJobs, "open job")} need a next step. Pick the one closest to completion.`,
    };
  }

  if (pendingEstimates > 0) {
    return {
      href: "/dashboard/leads",
      text: `${pluralize(pendingEstimates, "estimate")} waiting. One approval could turn into today's revenue.`,
    };
  }

  if (unpaidInvoices > 0) {
    return {
      href: "/dashboard/leads",
      text: `${pluralize(unpaidInvoices, "invoice")} unpaid. A quick follow-up may close the loop.`,
    };
  }

  if (partsWaiting > 0) {
    return {
      text: `${pluralize(partsWaiting, "parts item")} waiting. Check parts before promising a return visit.`,
    };
  }

  return {
    text: "Nothing urgent is waiting. You are free to work, rest, or finally go to the gym.",
  };
}

function buildTodayJobCard({
  appointment,
  request,
}: {
  appointment?: DashboardServiceRequestAppointment;
  request: DashboardServiceRequest;
}): TodayJobCard {
  return {
    appointment,
    city: getRequestCity(request) || "Address needed",
    customerName: request.customerName || "Customer",
    href: `/dashboard/leads/${request.id}`,
    id: appointment?.id ?? request.id,
    issue: request.issueDescription || "Issue details pending",
    machine:
      [request.applianceBrand, request.applianceType].filter(Boolean).join(" ") ||
      "Appliance details pending",
    status: request.status,
    timeWindow: formatAppointmentWindow(appointment),
  };
}

async function safeQueryRows<T>(
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const result = await query;
  return result.error ? [] : (result.data as T[] | null) ?? [];
}

export function DashboardJobsOverview() {
  const [state, setState] = useState<JobsOverviewState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function loadToday() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "ready",
            requests: [],
            appointments: [],
            conversations: [],
            estimates: [],
            invoices: [],
          });
        }
        return;
      }

      const [
        requestRows,
        appointmentRows,
        conversationRows,
        estimateRows,
        invoiceRows,
      ] = await Promise.all([
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
        safeQueryRows<{
          primary_source_type: DatabaseCommunicationSourceType;
          status: DatabaseCommunicationConversationStatus;
        }>(
          supabase
            .from("communication_conversations")
            .select("primary_source_type,status")
            .order("updated_at", { ascending: false })
            .limit(100),
        ),
        safeQueryRows<{ estimate_status: DatabaseEstimateStatus }>(
          supabase
            .from("service_request_estimates")
            .select("estimate_status")
            .order("updated_at", { ascending: false })
            .limit(100),
        ),
        safeQueryRows<{ invoice_status: DatabaseInvoiceStatus }>(
          supabase
            .from("service_request_invoices")
            .select("invoice_status")
            .order("updated_at", { ascending: false })
            .limit(100),
        ),
      ]);

      if (!isMounted) {
        return;
      }

      setState({
        status: "ready",
        requests: requestRows.map(mapServiceRequestRow),
        appointments: appointmentRows.map(mapAppointmentRow),
        conversations: conversationRows.map((conversation) => ({
          primarySourceType: conversation.primary_source_type,
          status: conversation.status,
        })),
        estimates: estimateRows.map((estimate) => ({
          estimateStatus: estimate.estimate_status,
        })),
        invoices: invoiceRows.map((invoice) => ({
          invoiceStatus: invoice.invoice_status,
        })),
      });
    }

    void loadToday();

    return () => {
      isMounted = false;
    };
  }, []);

  const todayJobs = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    const today = getTodayDateKey();
    const requestsById = mapRequestById(state.requests);
    const todayAppointmentCards = state.appointments
      .filter(
        (appointment) =>
          appointment.appointmentDate === today &&
          activeAppointmentStatuses.has(appointment.status),
      )
      .map((appointment) => {
        const request = requestsById.get(appointment.serviceRequestId);
        return request ? buildTodayJobCard({ appointment, request }) : null;
      })
      .filter((card): card is TodayJobCard => Boolean(card));

    const appointmentRequestIds = new Set(
      todayAppointmentCards.map((card) => card.appointment?.serviceRequestId),
    );

    const scheduledWithoutAppointments = state.requests
      .filter(
        (request) =>
          request.scheduledDate === today && !appointmentRequestIds.has(request.id),
      )
      .map((request) => buildTodayJobCard({ request }));

    return [...todayAppointmentCards, ...scheduledWithoutAppointments].slice(0, 12);
  }, [state]);

  const actionCounts = useMemo(() => {
    if (state.status !== "ready") {
      return {
        attention: 0,
        calls: 0,
        jobs: 0,
        messages: 0,
        openJobs: 0,
        partsWaiting: 0,
        pendingEstimates: 0,
        todayJobs: 0,
        unpaidInvoices: 0,
      };
    }

    const activeJobs = state.requests.filter(
      (request) => !["completed", "closed", "canceled"].includes(request.status),
    );
    const needsActionConversations = state.conversations.filter(
      (conversation) => conversation.status === "needs_action",
    );
    const calls = needsActionConversations.filter(
      (conversation) => conversation.primarySourceType === "phone",
    ).length;
    const messages = needsActionConversations.filter((conversation) =>
      ["sms", "email", "website", "manual", "other"].includes(
        conversation.primarySourceType,
      ),
    ).length;
    const attention = activeJobs.filter((request) =>
      ["waiting_customer", "parts_ordered", "parts_received"].includes(request.status),
    ).length;
    const partsWaiting = activeJobs.filter((request) =>
      ["parts_needed", "parts_ordered", "parts_received"].includes(request.status),
    ).length;
    const pendingEstimates = state.estimates.filter((estimate) =>
      ["draft", "sent", "presented"].includes(estimate.estimateStatus),
    ).length;
    const unpaidInvoices = state.invoices.filter(
      (invoice) => invoice.invoiceStatus === "sent",
    ).length;

    return {
      attention,
      calls,
      jobs: activeJobs.length,
      messages,
      openJobs: activeJobs.length,
      partsWaiting,
      pendingEstimates,
      todayJobs: todayJobs.length,
      unpaidInvoices,
    };
  }, [state, todayJobs.length]);

  const assistantMessage = buildAssistantMessage({
    attention: actionCounts.attention,
    calls: actionCounts.calls,
    firstTodayJob: todayJobs[0],
    messages: actionCounts.messages,
    openJobs: actionCounts.openJobs,
    partsWaiting: actionCounts.partsWaiting,
    pendingEstimates: actionCounts.pendingEstimates,
    unpaidInvoices: actionCounts.unpaidInvoices,
  });

  if (state.status === "loading") {
    return (
      <section className="rounded-[28px] border border-[#E5E7EB] bg-white p-5 text-sm font-semibold text-[#64748B] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        Loading today...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.07)] sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <div className="min-w-0 xl:pr-6">
            <p className="text-xs font-bold text-[#64748B]">{getCurrentDayLabel()}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0F172A] sm:text-3xl">
              {getGreeting()},{" "}
              <Link
                className="rounded-xl text-[#0F172A] underline decoration-[#0F6BFF]/30 decoration-2 underline-offset-4 transition hover:text-[#0F6BFF] hover:decoration-[#0F6BFF]"
                href="/dashboard/technician-profile"
              >
                Serhii
              </Link>
            </h1>
            {assistantMessage.href ? (
              <Link
                className="mt-3 block max-w-3xl rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold leading-6 text-[#334155] transition hover:border-[#0F6BFF] hover:bg-white hover:text-[#0F172A]"
                href={assistantMessage.href}
              >
                {assistantMessage.text}
              </Link>
            ) : (
              <p className="mt-3 max-w-3xl rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold leading-6 text-[#334155]">
                {assistantMessage.text}
              </p>
            )}
          </div>

          <div className="rounded-[22px] border border-[#E5E7EB] bg-white/80 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
            <form action="/dashboard/leads" className="relative w-full" method="get">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                <SearchIcon />
              </span>
              <input
                className="h-10 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] pl-10 pr-4 text-sm font-semibold text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF] focus:bg-white"
                name="search"
                placeholder="Search"
                type="search"
              />
            </form>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-5">
              <DashboardIconLink
                count={actionCounts.calls}
                href="/dashboard/communications?channel=phone"
                label="Calls"
              >
                <PhoneIcon />
              </DashboardIconLink>
              <DashboardIconLink
                count={actionCounts.messages}
                href="/dashboard/communications?channel=messages"
                label="Messages"
              >
                <MessageIcon />
              </DashboardIconLink>
              <DashboardIconLink
                count={actionCounts.jobs}
                href="/dashboard/leads"
                label="Jobs"
              >
                <JobsIcon />
              </DashboardIconLink>
              <DashboardIconLink
                count={actionCounts.todayJobs}
                href="/dashboard/technician-schedule"
                label="Schedule"
              >
                <CalendarIcon />
              </DashboardIconLink>
              <DashboardIconLink
                count={actionCounts.attention}
                href="/dashboard#attention"
                label="Attention"
              >
                <BellIcon />
              </DashboardIconLink>
              <DashboardMenuLauncher />
            </div>
          </div>
        </div>
      </header>

      <section aria-labelledby="todays-jobs-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
              Right now
            </p>
            <h2
              className="mt-1 text-2xl font-black tracking-tight text-[#0F172A]"
              id="todays-jobs-heading"
            >
              Today&apos;s Jobs
            </h2>
          </div>
          <Link
            className="hidden rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-bold text-[#0F172A] shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] sm:inline-flex"
            href="/dashboard/technician-schedule"
          >
            Schedule
          </Link>
        </div>

        {todayJobs.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {todayJobs.map((job) => (
              <TodayJobCardLink job={job} key={job.id} />
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-[#CBD5E1] bg-white p-6 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <p className="text-lg font-black text-[#0F172A]">
              No jobs scheduled for today
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#64748B]">
              When a job is scheduled for today, it will appear here as the next
              action.
            </p>
          </div>
        )}
      </section>
    </section>
  );
}

function TodayJobCardLink({ job }: { job: TodayJobCard }) {
  return (
    <Link
      className="group block rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#0F6BFF]/50 hover:shadow-[0_18px_42px_rgba(15,23,42,0.11)]"
      href={job.href}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black tracking-tight text-[#0F172A]">
            {job.timeWindow}
          </p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#64748B]">
            {job.city}
          </p>
        </div>
        <span className="shrink-0">
          <StatusBadge tone={SERVICE_REQUEST_STATUS_TONES[job.status] ?? "slate"}>
            {formatServiceRequestSource(job.status)}
          </StatusBadge>
        </span>
      </div>

      <div className="mt-5">
        <h3 className="line-clamp-1 text-lg font-black text-[#0F172A]">
          {job.customerName}
        </h3>
        <p className="mt-1 line-clamp-1 text-sm font-bold text-[#334155]">
          {job.machine}
        </p>
        <p className="mt-3 line-clamp-3 min-h-[60px] text-sm leading-5 text-[#64748B]">
          {job.issue}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
        <span className="text-sm font-black text-[#0F6BFF]">Open Job</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F8FAFC] text-[#0F6BFF] transition group-hover:bg-[#0F6BFF] group-hover:text-white">
          <ArrowIcon />
        </span>
      </div>
    </Link>
  );
}

function DashboardIconLink({
  children,
  count,
  href,
  label,
}: {
  children: ReactNode;
  count?: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-label={label}
      className="group flex min-w-0 flex-col items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-2 text-center text-[#334155] transition hover:border-[#0F6BFF] hover:bg-white hover:text-[#0F6BFF]"
      href={href}
      title={label}
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white">
        {children}
        {typeof count === "number" && count > 0 ? (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0F6BFF] px-1 text-[10px] font-black text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate text-[11px] font-black leading-4 text-[#334155] group-hover:text-[#0F6BFF]">
        {label}
      </span>
    </Link>
  );
}

function DashboardMenuLauncher() {
  return <DashboardMobileDrawer trigger="dashboard-shortcut" />;
}
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

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M7 5h4l2 5-2.5 1.5a12 12 0 0 0 4 4L16 13l5 2v4c0 1-1 2-2 2A16 16 0 0 1 3 5c0-1 1-2 2-2h2v2Z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 5h16v12H8l-4 4zM8 9h8M8 13h5" />
    </svg>
  );
}

function JobsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M7 7h10M7 12h10M7 17h6M5 3h14v18H5z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M7 3v4M17 3v4M4 9h16M5 5h14v16H5z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2ZM5 17h14l-2-3V9a5 5 0 0 0-10 0v5z" />
    </svg>
  );
}

function ArrowIcon() {
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
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
