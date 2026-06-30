import { NextResponse } from "next/server";

import { syncAppointmentCreatedToCalendar } from "@/server/integrations/calendar/appointment-calendar-sync";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type AppointmentRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type AppointmentPayload = {
  technicianProfileId?: unknown;
  appointmentDate?: unknown;
  windowStartTime?: unknown;
  windowEndTime?: unknown;
  dispatcherSnapshotId?: unknown;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cleanTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);

  if (!match) {
    return null;
  }

  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

function formatAppointmentError(message: string): string {
  if (
    message.includes("book_service_request_appointment_rpc") ||
    message.includes("appointments") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Appointment booking is not ready yet. Apply migration 0032 in Supabase, then try again.";
  }

  if (message.includes("already has an active appointment")) {
    return "This service request already has an active appointment.";
  }

  if (message.includes("already has an appointment in that window")) {
    return "That technician already has an appointment in that window.";
  }

  if (message.includes("not available")) {
    return "That technician is not available for the selected window.";
  }

  if (message.includes("does not cover")) {
    return "That technician does not cover this service ZIP code.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("cannot book") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to book that appointment.";
  }

  if (
    message.includes("Invalid") ||
    message.includes("window") ||
    message.includes("not found") ||
    message.includes("eligible")
  ) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "We could not book this appointment yet."
    : `Appointment booking failed: ${message}`;
}

export async function POST(
  request: Request,
  { params }: AppointmentRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: AppointmentPayload;

  try {
    payload = (await request.json()) as AppointmentPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  if (!isUuid(payload.technicianProfileId)) {
    return fail("Choose a valid technician.");
  }

  if (!isDate(payload.appointmentDate)) {
    return fail("Choose a valid appointment date.");
  }

  const windowStartTime = cleanTime(payload.windowStartTime);
  const windowEndTime = cleanTime(payload.windowEndTime);

  if (!windowStartTime || !windowEndTime) {
    return fail("Choose a valid appointment window.");
  }

  const dispatcherSnapshotId =
    payload.dispatcherSnapshotId === null ||
    payload.dispatcherSnapshotId === undefined ||
    payload.dispatcherSnapshotId === ""
      ? null
      : isUuid(payload.dispatcherSnapshotId)
        ? payload.dispatcherSnapshotId
        : undefined;

  if (dispatcherSnapshotId === undefined) {
    return fail("Choose a valid dispatcher snapshot.");
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for appointment booking.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data, error } = await supabase.rpc(
    "book_service_request_appointment_rpc",
    {
      p_service_request_id: id,
      p_technician_profile_id: payload.technicianProfileId,
      p_appointment_date: payload.appointmentDate,
      p_window_start_time: windowStartTime,
      p_window_end_time: windowEndTime,
      p_dispatcher_snapshot_id: dispatcherSnapshotId,
      p_source: "dispatcher",
    },
  );

  if (error) {
    return fail(formatAppointmentError(error.message), 403);
  }

  const appointment = data as
    | {
        id?: string;
        appointment_date?: string;
        window_start_time?: string;
        window_end_time?: string;
        technician_profile_id?: string | null;
      }
    | null;

  let calendarSync = null;

  if (
    appointment?.id &&
    appointment.appointment_date &&
    appointment.window_start_time &&
    appointment.window_end_time
  ) {
    const { data: serviceRequest } = await supabase
      .from("service_requests")
      .select(
        "id,customer_name,appliance_type,appliance_brand,issue_description,full_address,street_address,unit,city,state,zip_code",
      )
      .eq("id", id)
      .maybeSingle();

    if (serviceRequest) {
      calendarSync = await syncAppointmentCreatedToCalendar({
        supabase,
        appointment: {
          id: appointment.id,
          appointment_date: appointment.appointment_date,
          window_start_time: appointment.window_start_time,
          window_end_time: appointment.window_end_time,
          technician_profile_id: appointment.technician_profile_id,
        },
        serviceRequest,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    appointment: data,
    calendarSync,
  });
}
