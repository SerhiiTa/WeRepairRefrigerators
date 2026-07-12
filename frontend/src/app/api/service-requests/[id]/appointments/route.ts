import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
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

type AppointmentUpdatePayload = {
  operation?: unknown;
  appointmentId?: unknown;
  technicianProfileId?: unknown;
  appointmentDate?: unknown;
  windowStartTime?: unknown;
  windowEndTime?: unknown;
};

type AppointmentUpsertPayload = AppointmentUpdatePayload & {
  dispatcherSnapshotId?: unknown;
};

type TechnicianProfileSlugRow = {
  id: string;
  business_name: string | null;
  display_name: string | null;
  archived_at: string | null;
  marketplace_enabled: boolean | null;
  public_profile_ready: boolean | null;
  rejected_at: string | null;
  suspended_at: string | null;
  technician_status: string | null;
};

type TechnicianProfileAssignmentRow = {
  id: string;
  profile_id: string;
  company_id: string | null;
  display_name: string | null;
  business_name: string | null;
  service_zip_codes: string[] | null;
  avatar_color: string | null;
  technician_status: string | null;
  marketplace_enabled: boolean | null;
  public_profile_ready: boolean | null;
  archived_at: string | null;
  rejected_at: string | null;
  suspended_at: string | null;
};

const ACTIVE_APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "en_route",
] as const;
const DEFAULT_APPOINTMENT_TIMEZONE = "America/Chicago";
const DEFAULT_BUSINESS_START_TIME = "08:00:00";
const DEFAULT_BUSINESS_END_TIME = "17:00:00";
const DEFAULT_BUSINESS_DAYS = new Set([1, 2, 3, 4, 5]);

type SupabaseServiceRoleClient = NonNullable<
  ReturnType<typeof getSupabaseServiceRoleClient>
>;

type AvailabilityRuleRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
};

type AvailabilityDecision = {
  ok: boolean;
  message?: string;
  source:
    | "technician_availability_rule"
    | "technician_unavailable_rule"
    | "default_business_hours"
    | "outside_default_business_hours"
    | "outside_technician_working_hours";
  timezone: string;
  dayOfWeek: number;
  availableRuleCount: number;
  blockedRuleCount: number;
  matchingRuleCount: number;
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

function getDayOfWeekInTimezone(
  appointmentDate: string,
  timezone = DEFAULT_APPOINTMENT_TIMEZONE,
): number {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(new Date(`${appointmentDate}T12:00:00Z`));
    const weekdays: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return weekdays[weekday] ?? new Date(`${appointmentDate}T12:00:00`).getDay();
  } catch {
    return new Date(`${appointmentDate}T12:00:00`).getDay();
  }
}

function formatAppointmentTimeForMessage(value: string): string {
  const [hourValue = "0", minuteValue = "0"] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value.slice(0, 5);
  }

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function windowsOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): boolean {
  return firstStart < secondEnd && firstEnd > secondStart;
}

async function evaluateTechnicianAvailabilityWindow({
  serviceRole,
  technicianProfileId,
  appointmentDate,
  windowStartTime,
  windowEndTime,
}: {
  serviceRole: SupabaseServiceRoleClient;
  technicianProfileId: string;
  appointmentDate: string;
  windowStartTime: string;
  windowEndTime: string;
}): Promise<
  | { ok: true; decision: AvailabilityDecision }
  | { ok: false; decision?: AvailabilityDecision; error: string }
> {
  const dayOfWeek = getDayOfWeekInTimezone(appointmentDate);
  const { data: rules, error } = await serviceRole
    .from("technician_availability_rules")
    .select("id,day_of_week,start_time,end_time,is_available")
    .eq("technician_profile_id", technicianProfileId);

  if (error) {
    console.error("[appointments.upsert] availability lookup failed", {
      operation: "select_availability_rules",
      technicianProfileId,
      appointmentDate,
      windowStartTime,
      windowEndTime,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: formatAppointmentError(error.message) };
  }

  const ruleRows = (rules ?? []) as AvailabilityRuleRow[];
  const availableRules = ruleRows.filter((rule) => rule.is_available);
  const matchingAvailableRules = availableRules.filter(
    (rule) =>
      rule.day_of_week === dayOfWeek &&
      rule.start_time <= windowStartTime &&
      rule.end_time >= windowEndTime,
  );
  const blockingUnavailableRules = ruleRows.filter(
    (rule) =>
      !rule.is_available &&
      rule.day_of_week === dayOfWeek &&
      windowsOverlap(
        rule.start_time,
        rule.end_time,
        windowStartTime,
        windowEndTime,
      ),
  );
  const baseDecision = {
    timezone: DEFAULT_APPOINTMENT_TIMEZONE,
    dayOfWeek,
    availableRuleCount: availableRules.length,
    blockedRuleCount: blockingUnavailableRules.length,
    matchingRuleCount: matchingAvailableRules.length,
  };

  if (blockingUnavailableRules.length > 0) {
    return {
      ok: false,
      decision: {
        ...baseDecision,
        ok: false,
        source: "technician_unavailable_rule",
        message: "Technician is blocked for this time.",
      },
      error: "Technician is blocked for this time.",
    };
  }

  if (availableRules.length > 0) {
    if (matchingAvailableRules.length === 0) {
      return {
        ok: false,
        decision: {
          ...baseDecision,
          ok: false,
          source: "outside_technician_working_hours",
          message: "Technician is not scheduled to work at this time.",
        },
        error: "Technician is not scheduled to work at this time.",
      };
    }

    return {
      ok: true,
      decision: {
        ...baseDecision,
        ok: true,
        source: "technician_availability_rule",
      },
    };
  }

  if (
    !DEFAULT_BUSINESS_DAYS.has(dayOfWeek) ||
    windowStartTime < DEFAULT_BUSINESS_START_TIME ||
    windowEndTime > DEFAULT_BUSINESS_END_TIME
  ) {
    return {
      ok: false,
      decision: {
        ...baseDecision,
        ok: false,
        source: "outside_default_business_hours",
        message: "Appointment is outside company business hours.",
      },
      error: "Appointment is outside company business hours.",
    };
  }

  return {
    ok: true,
    decision: {
      ...baseDecision,
      ok: true,
      source: "default_business_hours",
    },
  };
}

async function findBlockingAppointment({
  serviceRole,
  technicianProfileId,
  appointmentDate,
  windowStartTime,
  windowEndTime,
  excludeAppointmentId,
}: {
  serviceRole: SupabaseServiceRoleClient;
  technicianProfileId: string;
  appointmentDate: string;
  windowStartTime: string;
  windowEndTime: string;
  excludeAppointmentId?: string | null;
}): Promise<
  | {
      ok: true;
      appointment: {
        id: string;
        window_start_time: string;
        window_end_time: string;
      } | null;
    }
  | { ok: false; error: string }
> {
  let query = serviceRole
    .from("appointments")
    .select("id,window_start_time,window_end_time")
    .eq("technician_profile_id", technicianProfileId)
    .eq("appointment_date", appointmentDate)
    .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
    .lt("window_start_time", windowEndTime)
    .gt("window_end_time", windowStartTime)
    .order("window_start_time", { ascending: true })
    .limit(1);

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[appointments.upsert] overlap lookup failed", {
      operation: "select_overlapping_appointments",
      technicianProfileId,
      appointmentDate,
      windowStartTime,
      windowEndTime,
      excludeAppointmentId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: formatAppointmentError(error.message) };
  }

  return {
    ok: true,
    appointment: data?.[0] ?? null,
  };
}

function formatConflictMessage(appointment: {
  window_start_time: string;
  window_end_time: string;
}): string {
  return `Technician already has an appointment from ${formatAppointmentTimeForMessage(
    appointment.window_start_time,
  )} to ${formatAppointmentTimeForMessage(appointment.window_end_time)}.`;
}

function getTechnicianDisplayName(row: TechnicianProfileAssignmentRow): string {
  return (
    row.display_name?.trim() ||
    row.business_name?.trim() ||
    "Assigned technician"
  );
}

function normalizeZip(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^0-9]/g, "").slice(0, 5)
    : "";
}

async function handleTechnicianAssignment({
  accessToken,
  serviceRequestId,
  payload,
}: {
  accessToken: string;
  serviceRequestId: string;
  payload: AppointmentUpdatePayload;
}) {
  const requestedTechnicianProfileId =
    payload.technicianProfileId === null ||
    payload.technicianProfileId === undefined ||
    payload.technicianProfileId === ""
      ? null
      : isUuid(payload.technicianProfileId)
        ? payload.technicianProfileId
        : undefined;

  if (requestedTechnicianProfileId === undefined || requestedTechnicianProfileId === null) {
    return fail("Choose a valid technician.");
  }

  const requestedAppointmentId =
    payload.appointmentId === null ||
    payload.appointmentId === undefined ||
    payload.appointmentId === ""
      ? null
      : isUuid(payload.appointmentId)
        ? payload.appointmentId
        : undefined;

  if (requestedAppointmentId === undefined) {
    return fail("Choose a valid appointment.");
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for technician assignment.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data: serviceRequest, error: serviceRequestError } = await supabase
    .from("service_requests")
    .select(
      "id,appointment_id,assigned_technician_profile_id,zip_code,scheduled_date,scheduled_window_start_time,scheduled_window_end_time",
    )
    .eq("id", serviceRequestId)
    .maybeSingle();

  if (serviceRequestError || !serviceRequest) {
    return fail("This account is not allowed to assign that job.", 403);
  }

  if (
    requestedAppointmentId &&
    serviceRequest.appointment_id &&
    serviceRequest.appointment_id !== requestedAppointmentId
  ) {
    return fail("This appointment is not linked to the current job.", 409);
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return fail("Server technician assignment is not configured.", 503);
  }

  const { data: technician, error: technicianError } = await serviceRole
    .from("technician_profiles")
    .select(
      "id,profile_id,company_id,display_name,business_name,service_zip_codes,avatar_color,technician_status,marketplace_enabled,public_profile_ready,archived_at,rejected_at,suspended_at",
    )
    .eq("id", requestedTechnicianProfileId)
    .maybeSingle();

  if (technicianError || !technician) {
    return fail("Choose a valid technician.", 404);
  }

  const technicianRow = technician as TechnicianProfileAssignmentRow;

  const { data: canManageTechnician, error: manageError } = await supabase.rpc(
    "can_manage_technician_profile" as never,
    {
      target_technician_profile_id: requestedTechnicianProfileId,
    } as never,
  );

  if (manageError || canManageTechnician !== true) {
    return fail("This account cannot assign that technician.", 403);
  }

  if (
    technicianRow.technician_status !== "verified" ||
    technicianRow.marketplace_enabled !== true ||
    technicianRow.archived_at ||
    technicianRow.rejected_at ||
    technicianRow.suspended_at
  ) {
    return fail("Technician is not active for assignment.", 422);
  }

  const serviceZip = normalizeZip(serviceRequest.zip_code);
  const technicianZips = (technicianRow.service_zip_codes ?? []).map(normalizeZip);

  if (serviceZip && !technicianZips.includes(serviceZip)) {
    return fail("That technician does not cover this service ZIP code.", 422);
  }

  const { data: appointments, error: appointmentError } = await serviceRole
    .from("appointments")
    .select(
      "id,service_request_id,technician_profile_id,status,company_id,appointment_date,window_start_time,window_end_time,updated_at",
    )
    .eq("service_request_id", serviceRequestId)
    .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(5);

  if (appointmentError) {
    return fail(formatAppointmentError(appointmentError.message), 403);
  }

  const activeAppointmentRows = appointments ?? [];
  const appointment =
    requestedAppointmentId !== null
      ? activeAppointmentRows.find(
          (row) => row.id === requestedAppointmentId,
        ) ?? null
      : serviceRequest.appointment_id !== null
        ? activeAppointmentRows.find(
            (row) => row.id === serviceRequest.appointment_id,
          ) ?? null
        : activeAppointmentRows.length === 1
          ? activeAppointmentRows[0]
          : null;

  if (activeAppointmentRows.length > 1 && !appointment) {
    return fail(
      "Appointment records are inconsistent for this job and could not be reconciled.",
      409,
    );
  }

  if (appointment) {
    const appointmentDate = appointment.appointment_date;
    const windowStartTime = appointment.window_start_time;
    const windowEndTime = appointment.window_end_time;

    const availabilityDecision = await evaluateTechnicianAvailabilityWindow({
      serviceRole,
      technicianProfileId: requestedTechnicianProfileId,
      appointmentDate,
      windowStartTime,
      windowEndTime,
    });

    if (!availabilityDecision.ok) {
      return fail(availabilityDecision.error);
    }

    const overlapDecision = await findBlockingAppointment({
      serviceRole,
      technicianProfileId: requestedTechnicianProfileId,
      appointmentDate,
      windowStartTime,
      windowEndTime,
      excludeAppointmentId: appointment.id,
    });

    if (!overlapDecision.ok) {
      return fail(overlapDecision.error, 403);
    }

    if (overlapDecision.appointment) {
      return fail(formatConflictMessage(overlapDecision.appointment));
    }

    const { data: updatedAppointment, error: updateAppointmentError } =
      await serviceRole
        .from("appointments")
        .update({
          technician_profile_id: requestedTechnicianProfileId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", appointment.id)
        .select(
          "id,technician_profile_id,appointment_date,window_start_time,window_end_time,updated_at",
        )
        .maybeSingle();

    if (updateAppointmentError) {
      return fail(formatAppointmentError(updateAppointmentError.message), 403);
    }

    if (!updatedAppointment?.id) {
      return fail("Appointment technician could not be updated.", 503);
    }

    const { error: requestUpdateError } = await serviceRole
      .from("service_requests")
      .update({
        appointment_id: updatedAppointment.id,
        assigned_technician_profile_id: requestedTechnicianProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serviceRequestId);

    if (requestUpdateError) {
      return fail(formatAppointmentError(requestUpdateError.message), 403);
    }

    return NextResponse.json({
      ok: true,
      operation: "assigned",
      appointment: updatedAppointment,
      technician: {
        id: technicianRow.id,
        displayName: getTechnicianDisplayName(technicianRow),
        businessName: technicianRow.business_name,
        avatarColor: technicianRow.avatar_color,
      },
      calendarSync: null,
    });
  }

  const { error: requestUpdateError } = await serviceRole
    .from("service_requests")
    .update({
      assigned_technician_profile_id: requestedTechnicianProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", serviceRequestId);

  if (requestUpdateError) {
    return fail(formatAppointmentError(requestUpdateError.message), 403);
  }

  return NextResponse.json({
    ok: true,
    operation: "assigned",
    appointment: null,
    technician: {
      id: technicianRow.id,
      displayName: getTechnicianDisplayName(technicianRow),
      businessName: technicianRow.business_name,
      avatarColor: technicianRow.avatar_color,
    },
    calendarSync: null,
  });
}

function buildPublicTechnicianSlug(row: TechnicianProfileSlugRow): string {
  const rawBase =
    row.business_name?.trim() ||
    row.display_name?.trim() ||
    "houston-appliance-technician";
  const base =
    rawBase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "houston-appliance-technician";
  const hash = createHash("md5").update(row.id).digest("hex").slice(0, 8);

  return `${base}-${hash}`;
}

async function resolveTechnicianProfileIdFromSlug(
  serviceRole: ReturnType<typeof getSupabaseServiceRoleClient>,
  selectedTechnicianSlug: string | null,
): Promise<string | null> {
  if (!serviceRole || !selectedTechnicianSlug) {
    return null;
  }

  const normalizedSlug = selectedTechnicianSlug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const { data, error } = await serviceRole
    .from("technician_profiles")
    .select(
      "id,business_name,display_name,technician_status,marketplace_enabled,public_profile_ready,archived_at,rejected_at,suspended_at",
    )
    .eq("technician_status", "verified")
    .eq("marketplace_enabled", true)
    .eq("public_profile_ready", true)
    .is("archived_at", null)
    .is("rejected_at", null)
    .is("suspended_at", null)
    .limit(100);

  if (error) {
    console.error("[appointments.upsert] selected technician lookup failed", {
      operation: "resolve_selected_technician_slug",
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  const match = (data as TechnicianProfileSlugRow[] | null)?.find(
    (row) => buildPublicTechnicianSlug(row) === normalizedSlug,
  );

  return match?.id ?? null;
}

function formatAppointmentError(message: string): string {
  if (
    message.includes("permission denied") &&
    message.includes("appointments")
  ) {
    return "Appointment rescheduling is not configured yet. Apply migration 0061 in Supabase, then try again.";
  }

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

  if (
    message.includes("not scheduled to work") ||
    message.includes("outside company business hours") ||
    message.includes("blocked for this time")
  ) {
    return message;
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

export async function PATCH(
  request: Request,
  { params }: AppointmentRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: AppointmentUpdatePayload;

  try {
    payload = (await request.json()) as AppointmentUpdatePayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  if (payload.operation === "assign_technician") {
    const { id } = await params;

    return handleTechnicianAssignment({
      accessToken,
      serviceRequestId: id,
      payload,
    });
  }

  if (!isDate(payload.appointmentDate)) {
    return fail("Choose a valid appointment date.");
  }

  const requestedAppointmentId =
    payload.appointmentId === null ||
    payload.appointmentId === undefined ||
    payload.appointmentId === ""
      ? null
      : isUuid(payload.appointmentId)
        ? payload.appointmentId
        : undefined;

  if (requestedAppointmentId === undefined) {
    return fail("Choose a valid appointment.");
  }

  const requestedTechnicianProfileId =
    payload.technicianProfileId === null ||
    payload.technicianProfileId === undefined ||
    payload.technicianProfileId === ""
      ? null
      : isUuid(payload.technicianProfileId)
        ? payload.technicianProfileId
        : undefined;

  if (requestedTechnicianProfileId === undefined) {
    return fail("Choose a valid technician.");
  }

  const windowStartTime = cleanTime(payload.windowStartTime);
  const windowEndTime = cleanTime(payload.windowEndTime);

  if (!windowStartTime || !windowEndTime) {
    return fail("Choose a valid appointment window.");
  }

  if (windowStartTime >= windowEndTime) {
    return fail("Appointment window start must be before end.");
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for appointment rescheduling.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data: serviceRequest, error: serviceRequestError } = await supabase
    .from("service_requests")
    .select(
      "id,appointment_id,assigned_technician_profile_id,scheduled_date,scheduled_window_start_time,scheduled_window_end_time",
    )
    .eq("id", id)
    .maybeSingle();

  if (serviceRequestError || !serviceRequest) {
    return fail("This account is not allowed to update that appointment.", 403);
  }

  if (
    requestedAppointmentId &&
    serviceRequest.appointment_id &&
    serviceRequest.appointment_id !== requestedAppointmentId
  ) {
    return fail("This appointment is not linked to the current job.", 409);
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return fail("Server appointment rescheduling is not configured.", 503);
  }

  const appointmentIdForLookup =
    requestedAppointmentId ?? serviceRequest.appointment_id ?? null;

  let appointmentQuery = serviceRole
    .from("appointments")
    .select(
      "id,service_request_id,technician_profile_id,status,company_id,appointment_date,window_start_time,window_end_time,updated_at",
    )
    .eq("service_request_id", id)
    .in("status", ["scheduled", "confirmed", "en_route"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (appointmentIdForLookup) {
    appointmentQuery = appointmentQuery.eq("id", appointmentIdForLookup);
  } else if (serviceRequest.assigned_technician_profile_id) {
    appointmentQuery = appointmentQuery.eq(
      "technician_profile_id",
      serviceRequest.assigned_technician_profile_id,
    );
  }

  const { data: appointments, error: appointmentError } = await appointmentQuery;

  if (appointmentError) {
    return fail(formatAppointmentError(appointmentError.message), 403);
  }

  const appointment = appointments?.[0] ?? null;

  if (!appointment) {
    return fail(
      "Existing appointment not found. Book a new appointment before rescheduling.",
      404,
    );
  }

  if (
    requestedTechnicianProfileId &&
    requestedTechnicianProfileId !== appointment.technician_profile_id
  ) {
    return fail(
      "Changing technicians is not supported in this reschedule sheet yet.",
      409,
    );
  }

  const availabilityDecision = await evaluateTechnicianAvailabilityWindow({
    serviceRole,
    technicianProfileId: appointment.technician_profile_id,
    appointmentDate: payload.appointmentDate,
    windowStartTime,
    windowEndTime,
  });

  if (!availabilityDecision.ok) {
    return fail(availabilityDecision.error);
  }

  console.info("[appointments.patch] availability decision", {
    operation: "reschedule_existing",
    serviceRequestId: id,
    appointmentId: appointment.id,
    technicianProfileId: appointment.technician_profile_id,
    appointmentDate: payload.appointmentDate,
    windowStartTime,
    windowEndTime,
    decision: availabilityDecision.decision,
  });

  const overlapDecision = await findBlockingAppointment({
    serviceRole,
    technicianProfileId: appointment.technician_profile_id,
    appointmentDate: payload.appointmentDate,
    windowStartTime,
    windowEndTime,
    excludeAppointmentId: appointment.id,
  });

  if (!overlapDecision.ok) {
    return fail(overlapDecision.error, 403);
  }

  if (overlapDecision.appointment) {
    return fail(formatConflictMessage(overlapDecision.appointment));
  }

  const { data: updatedAppointment, error: updateError } = await serviceRole
    .from("appointments")
    .update({
      appointment_date: payload.appointmentDate,
      window_start_time: windowStartTime,
      window_end_time: windowEndTime,
    })
    .eq("id", appointment.id)
    .select(
      "id,technician_profile_id,appointment_date,window_start_time,window_end_time,updated_at",
    )
    .maybeSingle();

  if (updateError) {
    return fail(formatAppointmentError(updateError.message), 403);
  }

  if (!updatedAppointment?.id) {
    return fail("Appointment could not be updated.", 503);
  }

  const { error: requestUpdateError } = await serviceRole
    .from("service_requests")
    .update({
      scheduled_date: payload.appointmentDate,
      scheduled_window_start_time: windowStartTime,
      scheduled_window_end_time: windowEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (requestUpdateError) {
    return fail(formatAppointmentError(requestUpdateError.message), 403);
  }

  return NextResponse.json({
    ok: true,
    operation: "updated",
    appointment: updatedAppointment,
    calendarSync: null,
  });
}

export async function PUT(
  request: Request,
  { params }: AppointmentRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: AppointmentUpsertPayload;

  try {
    payload = (await request.json()) as AppointmentUpsertPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  if (!isDate(payload.appointmentDate)) {
    return fail("Choose a valid appointment date.");
  }

  const requestedAppointmentId =
    payload.appointmentId === null ||
    payload.appointmentId === undefined ||
    payload.appointmentId === ""
      ? null
      : isUuid(payload.appointmentId)
        ? payload.appointmentId
        : undefined;

  if (requestedAppointmentId === undefined) {
    return fail("Choose a valid appointment.");
  }

  const requestedTechnicianProfileId =
    payload.technicianProfileId === null ||
    payload.technicianProfileId === undefined ||
    payload.technicianProfileId === ""
      ? null
      : isUuid(payload.technicianProfileId)
        ? payload.technicianProfileId
        : undefined;

  if (requestedTechnicianProfileId === undefined) {
    return fail("Choose a valid technician.");
  }

  const windowStartTime = cleanTime(payload.windowStartTime);
  const windowEndTime = cleanTime(payload.windowEndTime);

  if (!windowStartTime || !windowEndTime) {
    return fail("Choose a valid appointment window.");
  }

  if (windowStartTime >= windowEndTime) {
    return fail("Appointment window start must be before end.");
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
    return fail("Supabase is not configured for appointment scheduling.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data: serviceRequest, error: serviceRequestError } = await supabase
    .from("service_requests")
    .select(
      "id,appointment_id,assigned_technician_profile_id,selected_technician_slug,scheduled_date,scheduled_window_start_time,scheduled_window_end_time",
    )
    .eq("id", id)
    .maybeSingle();

  if (serviceRequestError || !serviceRequest) {
    console.error("[appointments.upsert] service request lookup failed", {
      operation: "select_service_request",
      serviceRequestId: id,
      code: serviceRequestError?.code ?? null,
      message: serviceRequestError?.message ?? "not found",
      details: serviceRequestError?.details ?? null,
      hint: serviceRequestError?.hint ?? null,
    });
    return fail("This account is not allowed to schedule that job.", 403);
  }

  const serviceRole = getSupabaseServiceRoleClient();
  const resolvedTechnicianProfileId =
    requestedTechnicianProfileId ??
    serviceRequest.assigned_technician_profile_id ??
    (await resolveTechnicianProfileIdFromSlug(
      serviceRole,
      typeof serviceRequest.selected_technician_slug === "string"
        ? serviceRequest.selected_technician_slug
        : null,
    ));

  const { data: activeAppointments, error: activeAppointmentError } =
    await supabase
      .from("appointments")
      .select(
        "id,service_request_id,technician_profile_id,status,company_id,appointment_date,window_start_time,window_end_time,updated_at",
      )
      .eq("service_request_id", id)
      .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(5);

  if (activeAppointmentError) {
    console.error("[appointments.upsert] active appointment lookup failed", {
      operation: "select_active_appointments",
      serviceRequestId: id,
      code: activeAppointmentError.code,
      message: activeAppointmentError.message,
      details: activeAppointmentError.details,
      hint: activeAppointmentError.hint,
    });
    return fail(formatAppointmentError(activeAppointmentError.message), 403);
  }

  const activeAppointmentRows = activeAppointments ?? [];
  const linkedActiveAppointment =
    serviceRequest.appointment_id !== null
      ? activeAppointmentRows.find(
          (appointment) => appointment.id === serviceRequest.appointment_id,
        ) ?? null
      : null;
  const requestedActiveAppointment =
    requestedAppointmentId !== null
      ? activeAppointmentRows.find(
          (appointment) => appointment.id === requestedAppointmentId,
        ) ?? null
      : null;
  const matchingTechnicianAppointment =
    resolvedTechnicianProfileId !== null
      ? activeAppointmentRows.find(
          (appointment) =>
            appointment.technician_profile_id === resolvedTechnicianProfileId,
        ) ?? null
      : null;
  const appointment =
    linkedActiveAppointment ??
    requestedActiveAppointment ??
    (activeAppointmentRows.length === 1 ? activeAppointmentRows[0] : null) ??
    matchingTechnicianAppointment;

  console.info("[appointments.upsert] appointment lookup", {
    serviceRequestId: id,
    serviceRequestAppointmentId: serviceRequest.appointment_id,
    activeAppointmentCount: activeAppointmentRows.length,
    requestedAppointmentId,
    requestedTechnicianProfileId,
    resolvedTechnicianProfileId,
    operation: appointment ? "update_existing" : "create_initial",
  });

  if (activeAppointmentRows.length > 1 && !appointment) {
    return fail(
      "Appointment records are inconsistent for this job and could not be reconciled.",
      409,
    );
  }

  if (!appointment) {
    if (!resolvedTechnicianProfileId) {
      return fail(
        "Assign a technician before creating an appointment for this job.",
        422,
      );
    }

    const { data, error } = await supabase.rpc(
      "book_service_request_appointment_rpc",
      {
        p_service_request_id: id,
        p_technician_profile_id: resolvedTechnicianProfileId,
        p_appointment_date: payload.appointmentDate,
        p_window_start_time: windowStartTime,
        p_window_end_time: windowEndTime,
        p_dispatcher_snapshot_id: dispatcherSnapshotId,
        p_source: "dispatcher",
      },
    );

    if (error) {
      console.error("[appointments.upsert] initial appointment create failed", {
        operation: "create_initial_appointment",
        serviceRequestId: id,
        technicianProfileId: resolvedTechnicianProfileId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return fail(formatAppointmentError(error.message), 403);
    }

    const createdAppointment = data as
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
      createdAppointment?.id &&
      createdAppointment.appointment_date &&
      createdAppointment.window_start_time &&
      createdAppointment.window_end_time
    ) {
      const { data: calendarServiceRequest } = await supabase
        .from("service_requests")
        .select(
          "id,customer_name,appliance_type,appliance_brand,issue_description,full_address,street_address,unit,city,state,zip_code",
        )
        .eq("id", id)
        .maybeSingle();

      if (calendarServiceRequest) {
        calendarSync = await syncAppointmentCreatedToCalendar({
          supabase,
          appointment: {
            id: createdAppointment.id,
            appointment_date: createdAppointment.appointment_date,
            window_start_time: createdAppointment.window_start_time,
            window_end_time: createdAppointment.window_end_time,
            technician_profile_id: createdAppointment.technician_profile_id,
          },
          serviceRequest: calendarServiceRequest,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      operation: "created",
      appointment: data,
      calendarSync,
    });
  }

  if (
    requestedTechnicianProfileId &&
    requestedTechnicianProfileId !== appointment.technician_profile_id
  ) {
    return fail(
      "Changing technicians is not supported in this schedule sheet yet.",
      409,
    );
  }

  if (!serviceRole) {
    return fail("Server appointment rescheduling is not configured.", 503);
  }

  const availabilityDecision = await evaluateTechnicianAvailabilityWindow({
    serviceRole,
    technicianProfileId: appointment.technician_profile_id,
    appointmentDate: payload.appointmentDate,
    windowStartTime,
    windowEndTime,
  });

  if (!availabilityDecision.ok) {
    return fail(availabilityDecision.error);
  }

  console.info("[appointments.upsert] availability decision", {
    operation: "update_existing",
    serviceRequestId: id,
    appointmentId: appointment.id,
    technicianProfileId: appointment.technician_profile_id,
    appointmentDate: payload.appointmentDate,
    windowStartTime,
    windowEndTime,
    decision: availabilityDecision.decision,
  });

  const overlapDecision = await findBlockingAppointment({
    serviceRole,
    technicianProfileId: appointment.technician_profile_id,
    appointmentDate: payload.appointmentDate,
    windowStartTime,
    windowEndTime,
    excludeAppointmentId: appointment.id,
  });

  if (!overlapDecision.ok) {
    return fail(overlapDecision.error, 403);
  }

  if (overlapDecision.appointment) {
    return fail(formatConflictMessage(overlapDecision.appointment));
  }

  const { data: updatedAppointment, error: updateError } = await serviceRole
    .from("appointments")
    .update({
      appointment_date: payload.appointmentDate,
      window_start_time: windowStartTime,
      window_end_time: windowEndTime,
    })
    .eq("id", appointment.id)
    .select(
      "id,technician_profile_id,appointment_date,window_start_time,window_end_time,updated_at",
    )
    .maybeSingle();

  if (updateError) {
    console.error("[appointments.upsert] appointment update failed", {
      operation: "update_existing_appointment",
      serviceRequestId: id,
      appointmentId: appointment.id,
      code: updateError.code,
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
    });
    return fail(formatAppointmentError(updateError.message), 403);
  }

  if (!updatedAppointment?.id) {
    return fail("Appointment could not be updated.", 503);
  }

  const { error: requestUpdateError } = await serviceRole
    .from("service_requests")
    .update({
      appointment_id: updatedAppointment.id,
      assigned_technician_profile_id: appointment.technician_profile_id,
      scheduled_date: payload.appointmentDate,
      scheduled_window_start_time: windowStartTime,
      scheduled_window_end_time: windowEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (requestUpdateError) {
    console.error("[appointments.upsert] service request schedule mirror failed", {
      operation: "update_service_request_schedule_fields",
      serviceRequestId: id,
      appointmentId: appointment.id,
      code: requestUpdateError.code,
      message: requestUpdateError.message,
      details: requestUpdateError.details,
      hint: requestUpdateError.hint,
    });
    return fail(formatAppointmentError(requestUpdateError.message), 403);
  }

  return NextResponse.json({
    ok: true,
    operation: "updated",
    appointment: updatedAppointment,
    calendarSync: null,
  });
}
