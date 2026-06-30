import type { SupabaseClient } from "@supabase/supabase-js";

import { createGoogleCalendarProvider, isGoogleCalendarConfigured } from "./google-calendar";
import type { Database, DatabaseCalendarSyncStatus } from "@/lib/supabase/types";

type AppointmentSyncInput = {
  id: string;
  appointment_date: string;
  window_start_time: string;
  window_end_time: string;
  technician_profile_id?: string | null;
};

type ServiceRequestCalendarInput = {
  id: string;
  customer_name?: string | null;
  appliance_type?: string | null;
  appliance_brand?: string | null;
  issue_description?: string | null;
  full_address?: string | null;
  street_address?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

export type AppointmentCalendarSyncResult = {
  provider: "google" | null;
  status: DatabaseCalendarSyncStatus;
  eventId: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  migrationReady: boolean;
};

function toLocalDateTime(date: string, time: string): string {
  return `${date}T${time.slice(0, 8)}`;
}

function formatAddress(request: ServiceRequestCalendarInput): string | undefined {
  const address =
    request.full_address?.trim() ||
    [
      request.street_address,
      request.unit,
      request.city,
      request.state,
      request.zip_code,
    ]
      .filter(Boolean)
      .join(", ");

  return address || undefined;
}

function buildEventTitle(request: ServiceRequestCalendarInput): string {
  const brand = request.appliance_brand?.trim();
  const appliance = request.appliance_type?.trim() || "Appliance";

  return `${request.customer_name ?? "Customer"} - ${brand ? `${brand} ` : ""}${appliance}`;
}

function buildEventDescription(request: ServiceRequestCalendarInput): string {
  const lines = [
    "Created by WeRepairRefrigerators appointment booking.",
    `Job ID: ${request.id}`,
    request.issue_description ? `Issue: ${request.issue_description}` : null,
    "No SMS, email, phone call, or customer notification was sent by this calendar sync.",
  ];

  return lines.filter(Boolean).join("\n");
}

function safeError(message: string): string {
  return message.replace(/\s+/g, " ").slice(0, 500);
}

async function persistCalendarSyncMetadata({
  supabase,
  appointmentId,
  result,
}: {
  supabase: SupabaseClient<Database>;
  appointmentId: string;
  result: AppointmentCalendarSyncResult;
}): Promise<AppointmentCalendarSyncResult> {
  const { data, error } = await supabase.rpc("set_appointment_calendar_sync_rpc", {
    p_appointment_id: appointmentId,
    p_external_calendar_provider: result.provider,
    p_external_calendar_event_id: result.eventId,
    p_external_calendar_status: result.status,
    p_external_calendar_error: result.error,
  });

  if (error) {
    return {
      ...result,
      migrationReady: false,
      error:
        result.error ??
        (error.message.includes("set_appointment_calendar_sync_rpc") ||
        error.message.includes("schema cache")
          ? "Calendar sync metadata migration 0033 has not been applied yet."
          : safeError(error.message)),
    };
  }

  const row = data as
    | {
        external_calendar_provider?: string | null;
        external_calendar_event_id?: string | null;
        external_calendar_status?: DatabaseCalendarSyncStatus;
        external_calendar_last_synced_at?: string | null;
        external_calendar_error?: string | null;
      }
    | null;

  return {
    provider: row?.external_calendar_provider === "google" ? "google" : result.provider,
    status: row?.external_calendar_status ?? result.status,
    eventId: row?.external_calendar_event_id ?? result.eventId,
    lastSyncedAt:
      row?.external_calendar_last_synced_at ??
      result.lastSyncedAt ??
      new Date().toISOString(),
    error: row?.external_calendar_error ?? result.error,
    migrationReady: true,
  };
}

export async function syncAppointmentCreatedToCalendar({
  supabase,
  appointment,
  serviceRequest,
}: {
  supabase: SupabaseClient<Database>;
  appointment: AppointmentSyncInput;
  serviceRequest: ServiceRequestCalendarInput;
}): Promise<AppointmentCalendarSyncResult> {
  if (!isGoogleCalendarConfigured()) {
    const result: AppointmentCalendarSyncResult = {
      provider: null,
      status: "not_configured",
      eventId: null,
      lastSyncedAt: null,
      error: null,
      migrationReady: true,
    };

    return persistCalendarSyncMetadata({
      supabase,
      appointmentId: appointment.id,
      result,
    });
  }

  const provider = createGoogleCalendarProvider();
  const calendarResult = await provider.createEvent({
    title: buildEventTitle(serviceRequest),
    startsAt: toLocalDateTime(
      appointment.appointment_date,
      appointment.window_start_time,
    ),
    endsAt: toLocalDateTime(
      appointment.appointment_date,
      appointment.window_end_time,
    ),
    location: formatAddress(serviceRequest),
    description: buildEventDescription(serviceRequest),
  });

  const result: AppointmentCalendarSyncResult = calendarResult.ok
    ? {
        provider: "google",
        status: "synced",
        eventId: calendarResult.data.providerEventId,
        lastSyncedAt: new Date().toISOString(),
        error: null,
        migrationReady: true,
      }
    : {
        provider: "google",
        status: "failed",
        eventId: null,
        lastSyncedAt: new Date().toISOString(),
        error: safeError(calendarResult.error.message),
        migrationReady: true,
      };

  return persistCalendarSyncMetadata({
    supabase,
    appointmentId: appointment.id,
    result,
  });
}
