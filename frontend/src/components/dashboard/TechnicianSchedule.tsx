"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import {
  APPOINTMENT_SELECT_COLUMNS,
  APPOINTMENT_WITH_CALENDAR_SELECT_COLUMNS,
  formatServiceRequestDate,
  formatServiceRequestSource,
  mapAppointmentRow,
  SERVICE_REQUEST_STATUS_TONES,
  type DashboardServiceRequestAppointment,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppointmentRow, ServiceRequestRow } from "@/lib/supabase/types";

type ScheduleState =
  | {
      status: "loading";
      appointments: DashboardServiceRequestAppointment[];
      error: null;
    }
  | {
      status: "ready";
      appointments: DashboardServiceRequestAppointment[];
      error: null;
    }
  | {
      status: "error";
      appointments: DashboardServiceRequestAppointment[];
      error: string;
    };

type TechnicianGroup = {
  technicianProfileId: string;
  label: string;
  appointments: DashboardServiceRequestAppointment[];
};

const activeAppointmentStatuses = new Set([
  "scheduled",
  "confirmed",
  "en_route",
]);

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function formatAppointmentWindow(appointment: DashboardServiceRequestAppointment) {
  const start = appointment.windowStartTime.slice(0, 5);
  const end = appointment.windowEndTime.slice(0, 5);

  return `${start}-${end}`;
}

function getScheduleReadError(message: string): string {
  if (
    message.includes("appointments") &&
    (message.includes("schema cache") || message.includes("Could not find"))
  ) {
    return "Technician schedule is not ready yet. Apply migration 0032 in Supabase.";
  }

  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "This account is not allowed to read appointment schedules.";
  }

  return message;
}

function getCalendarSyncLabel(appointment: DashboardServiceRequestAppointment) {
  if (appointment.externalCalendarStatus === "synced") {
    return "Calendar Sync: Synced";
  }

  if (appointment.externalCalendarStatus === "failed") {
    return "Calendar Sync: Failed";
  }

  if (appointment.externalCalendarStatus === "pending") {
    return "Calendar Sync: Pending";
  }

  if (appointment.externalCalendarStatus === "canceled") {
    return "Calendar Sync: Canceled";
  }

  return "Calendar Sync: Not configured";
}

function getCalendarSyncTone(appointment: DashboardServiceRequestAppointment) {
  if (appointment.externalCalendarStatus === "synced") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  }

  if (appointment.externalCalendarStatus === "failed") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  return "border-white/10 bg-slate-900 text-slate-300";
}

function getStatusTone(appointment: DashboardServiceRequestAppointment) {
  if (appointment.status === "completed") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  }

  if (appointment.status === "canceled" || appointment.status === "no_show") {
    return "border-slate-300/20 bg-slate-300/10 text-slate-300";
  }

  if (appointment.status === "en_route") {
    return "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";
  }

  return "border-blue-300/20 bg-blue-300/10 text-blue-100";
}

function getOperationalStatusLabel(appointment: DashboardServiceRequestAppointment) {
  if (appointment.status === "en_route") {
    return "In progress";
  }

  return formatServiceRequestSource(appointment.status);
}

function getTechnicianLabel(appointment: DashboardServiceRequestAppointment) {
  return `Technician ${appointment.technicianProfileId.slice(0, 8).toUpperCase()}`;
}

function getAppointmentCityZip(appointment: DashboardServiceRequestAppointment) {
  const city = appointment.request?.city;
  const zip = appointment.request?.zipCode ?? "unknown";

  return `${city ? `${city} · ` : ""}ZIP ${zip}`;
}

function AppointmentCard({
  appointment,
}: {
  appointment: DashboardServiceRequestAppointment;
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-950 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            {formatAppointmentWindow(appointment)}
          </p>
          <h3 className="mt-2 text-lg font-bold text-white">
            {appointment.request?.customerName ?? "Service appointment"}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {appointment.request?.applianceBrand
              ? `${appointment.request.applianceBrand} `
              : ""}
            {appointment.request?.applianceType ?? "Appliance"} ·{" "}
            {getAppointmentCityZip(appointment)}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${getStatusTone(
            appointment,
          )}`}
        >
          {getOperationalStatusLabel(appointment)}
        </span>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-300">
        {appointment.request?.issueDescription ?? "No issue summary available."}
      </p>

      {appointment.request ? (
        <div className="mt-4">
          <StatusBadge
            tone={SERVICE_REQUEST_STATUS_TONES[appointment.request.status] ?? "slate"}
          >
            Job: {formatServiceRequestSource(appointment.request.status)}
          </StatusBadge>
        </div>
      ) : null}

      <div
        className={`mt-4 rounded-md border px-3 py-2 text-xs font-bold ${getCalendarSyncTone(
          appointment,
        )}`}
      >
        {getCalendarSyncLabel(appointment)}
        {appointment.externalCalendarEventId ? (
          <span className="ml-2 opacity-80">
            Event {appointment.externalCalendarEventId.slice(0, 10)}
          </span>
        ) : null}
        {appointment.externalCalendarError ? (
          <p className="mt-1 font-semibold opacity-80">
            {appointment.externalCalendarError}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="cursor-not-allowed rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-slate-500"
          disabled
          type="button"
        >
          Call via Platform
        </button>
        <button
          className="cursor-not-allowed rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-slate-500"
          disabled
          type="button"
        >
          Message via Platform
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Source: {formatServiceRequestSource(appointment.source)}</span>
        <span>Created {formatServiceRequestDate(appointment.createdAt)}</span>
      </div>

      {appointment.request ? (
        <Link
          className="mt-4 inline-flex rounded-md bg-cyan-200 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
          href={`/dashboard/leads/${appointment.request.id}`}
        >
          Open Job Workspace
        </Link>
      ) : null}
    </article>
  );
}

export function TechnicianSchedule() {
  const [state, setState] = useState<ScheduleState>({
    status: "loading",
    appointments: [],
    error: null,
  });
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("all");

  useEffect(() => {
    let isMounted = true;

    async function loadAppointments() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "error",
            appointments: [],
            error: "Supabase is not configured for appointment schedules.",
          });
        }
        return;
      }

      let { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_WITH_CALENDAR_SELECT_COLUMNS)
        .order("appointment_date", { ascending: true })
        .order("window_start_time", { ascending: true });

      if (
        error &&
        (error.message.includes("external_calendar") ||
          error.message.includes("schema cache"))
      ) {
        const fallbackResult = await supabase
          .from("appointments")
          .select(APPOINTMENT_SELECT_COLUMNS)
          .order("appointment_date", { ascending: true })
          .order("window_start_time", { ascending: true });

        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (!isMounted) {
        return;
      }

      if (error) {
        setState({
          status: "error",
          appointments: [],
          error: getScheduleReadError(error.message),
        });
        return;
      }

      setState({
        status: "ready",
        appointments: (
          data as unknown as (AppointmentRow & {
            service_requests?: ServiceRequestRow | null;
          })[]
        ).map(mapAppointmentRow),
        error: null,
      });
    }

    void loadAppointments();

    return () => {
      isMounted = false;
    };
  }, []);

  const technicianOptions = useMemo(() => {
    const options = new Map<string, string>();

    state.appointments.forEach((appointment) => {
      options.set(appointment.technicianProfileId, getTechnicianLabel(appointment));
    });

    return Array.from(options.entries()).map(([id, label]) => ({ id, label }));
  }, [state.appointments]);

  const appointmentsForDay = useMemo(
    () =>
      state.appointments.filter(
        (appointment) =>
          appointment.appointmentDate === selectedDate &&
          (selectedTechnicianId === "all" ||
            appointment.technicianProfileId === selectedTechnicianId),
      ),
    [state.appointments, selectedDate, selectedTechnicianId],
  );

  const groupedAppointments = useMemo<TechnicianGroup[]>(() => {
    const technicianIds =
      selectedTechnicianId === "all"
        ? technicianOptions.map((option) => option.id)
        : [selectedTechnicianId];

    return technicianIds.map((technicianProfileId) => {
      const option = technicianOptions.find((item) => item.id === technicianProfileId);

      return {
        technicianProfileId,
        label:
          option?.label ??
          `Technician ${technicianProfileId.slice(0, 8).toUpperCase()}`,
        appointments: appointmentsForDay.filter(
          (appointment) =>
            appointment.technicianProfileId === technicianProfileId,
        ),
      };
    });
  }, [appointmentsForDay, selectedTechnicianId, technicianOptions]);

  const todaysJobs = appointmentsForDay.filter((appointment) =>
    activeAppointmentStatuses.has(appointment.status),
  );

  if (state.status === "loading") {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950 p-6 text-sm font-semibold text-slate-300">
        Loading dispatch board...
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-6 text-sm leading-6 text-amber-50">
        {state.error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-white/10 bg-slate-950 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
              Dispatch Board
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              {formatDateLabel(selectedDate)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Internal CRM appointments are the source of truth. Google Calendar
              is optional outbound sync only.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              className="rounded-md border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
              type="button"
            >
              Previous day
            </button>
            <button
              className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
              onClick={() => setSelectedDate(getTodayKey())}
              type="button"
            >
              Today
            </button>
            <button
              className="rounded-md border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
              type="button"
            >
              Next day
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-100">Date</span>
            <input
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-100">
              Technician
            </span>
            <select
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
              onChange={(event) => setSelectedTechnicianId(event.target.value)}
              value={selectedTechnicianId}
            >
              <option value="all">All technicians</option>
              {technicianOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4 md:hidden">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
          My Jobs Today
        </p>
        {todaysJobs.length > 0 ? (
          <div className="mt-3 space-y-3">
            {todaysJobs.map((appointment) => (
              <AppointmentCard appointment={appointment} key={appointment.id} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-cyan-50/80">
            No active jobs are scheduled for this day and technician filter.
          </p>
        )}
      </section>

      {state.appointments.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-slate-950 p-6">
          <p className="text-sm font-bold text-white">No appointments yet.</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Book a dispatcher-recommended appointment from a job detail page to
            see it here.
          </p>
        </div>
      ) : null}

      {state.appointments.length > 0 && groupedAppointments.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-slate-950 p-6">
          <p className="text-sm font-bold text-white">No technicians found.</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Change the technician filter or book an appointment first.
          </p>
        </div>
      ) : null}

      <section className="hidden gap-4 md:grid xl:grid-cols-2">
        {groupedAppointments.map((group) => (
          <div
            className="rounded-lg border border-white/10 bg-slate-900 p-4"
            key={group.technicianProfileId}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Technician
                </p>
                <h3 className="mt-2 text-xl font-bold text-white">
                  {group.label}
                </h3>
              </div>
              <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-cyan-100">
                {group.appointments.length} job
                {group.appointments.length === 1 ? "" : "s"}
              </span>
            </div>

            {group.appointments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {group.appointments.map((appointment) => (
                  <AppointmentCard
                    appointment={appointment}
                    key={appointment.id}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-white/10 bg-slate-950 p-4">
                <p className="text-sm font-bold text-white">
                  No jobs scheduled.
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  This technician has no appointments for the selected day.
                </p>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
