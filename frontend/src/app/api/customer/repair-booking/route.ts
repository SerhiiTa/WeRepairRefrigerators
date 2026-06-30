import { NextResponse } from "next/server";

import { getCustomerRepairReference } from "@/lib/customer-repair-utils";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type CustomerRepairBookingPayload = {
  customerApplianceId?: unknown;
  customer_appliance_id?: unknown;
  problemDescription?: unknown;
  preferredContactMethod?: unknown;
  notes?: unknown;
  serviceZipCode?: unknown;
  serviceCity?: unknown;
  serviceState?: unknown;
  selectedTechnicianSlug?: unknown;
  appointmentDate?: unknown;
  windowStartTime?: unknown;
  windowEndTime?: unknown;
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

function cleanText(value: unknown, maxLength = 120): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNullableText(value: unknown, maxLength = 120): string | null {
  const cleaned = cleanText(value, maxLength);

  return cleaned.length > 0 ? cleaned : null;
}

function cleanZip(value: unknown): string {
  return cleanText(value).replace(/[^0-9]/g, "").slice(0, 5);
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    trimmed,
  )
    ? trimmed
    : null;
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

function formatBookingError(message: string): string {
  if (
    message.includes("create_customer_asset_booking_rpc") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  ) {
    return "Customer booking is waiting for the Task 147 database update.";
  }

  if (message.includes("already has an active repair appointment")) {
    return "This appliance already has an active repair appointment.";
  }

  if (message.includes("already has an appointment in that window")) {
    return "That appointment window was just taken. Choose another window.";
  }

  if (message.includes("does not cover")) {
    return "The selected technician does not cover that service ZIP.";
  }

  if (message.includes("not available")) {
    return "The selected technician is not available for that window.";
  }

  if (
    message.includes("Authentication") ||
    message.includes("not linked") ||
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This customer account cannot book that repair.";
  }

  if (message.includes("required") || message.includes("valid")) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "We could not book this repair yet."
    : `Customer booking failed: ${message}`;
}

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in customer session is required.", 401);
  }

  let payload: CustomerRepairBookingPayload;

  try {
    payload = (await request.json()) as CustomerRepairBookingPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const customerApplianceId = cleanUuid(
    payload.customerApplianceId ?? payload.customer_appliance_id,
  );

  if (!customerApplianceId) {
    return fail("Choose a valid appliance.");
  }

  const problemDescription = cleanText(payload.problemDescription, 1200);
  const preferredContactMethod = cleanNullableText(payload.preferredContactMethod, 40);
  const notes = cleanNullableText(payload.notes, 800);
  const serviceZipCode = cleanZip(payload.serviceZipCode);
  const serviceCity = cleanNullableText(payload.serviceCity, 80);
  const serviceState = cleanNullableText(payload.serviceState, 20) ?? "TX";
  const selectedTechnicianSlug = cleanText(payload.selectedTechnicianSlug, 160);

  if (!problemDescription) {
    return fail("Describe the appliance problem.");
  }

  if (serviceZipCode.length !== 5) {
    return fail("Enter a valid 5-digit service ZIP.");
  }

  if (!selectedTechnicianSlug) {
    return fail("Choose a technician.");
  }

  if (!isDate(payload.appointmentDate)) {
    return fail("Choose a valid appointment date.");
  }

  const windowStartTime = cleanTime(payload.windowStartTime);
  const windowEndTime = cleanTime(payload.windowEndTime);

  if (!windowStartTime || !windowEndTime) {
    return fail("Choose a valid appointment window.");
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for customer booking.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid customer session is required.", 401);
  }

  const { data, error } = await supabase.rpc("create_customer_asset_booking_rpc", {
    p_customer_appliance_id: customerApplianceId,
    p_problem_description: problemDescription,
    p_preferred_contact_method: preferredContactMethod,
    p_notes: notes,
    p_service_zip_code: serviceZipCode,
    p_service_city: serviceCity,
    p_service_state: serviceState,
    p_selected_technician_slug: selectedTechnicianSlug,
    p_appointment_date: payload.appointmentDate,
    p_window_start_time: windowStartTime,
    p_window_end_time: windowEndTime,
  });

  if (error) {
    return fail(formatBookingError(error.message), 403);
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as { service_request_id?: unknown })
      : {};
  const serviceRequestId =
    typeof result.service_request_id === "string" ? result.service_request_id : null;
  let serviceRequestCreatedAt: string | null = null;

  if (serviceRequestId) {
    const { data: requestRow } = await supabase
      .from("service_requests")
      .select("id,created_at")
      .eq("id", serviceRequestId)
      .maybeSingle();

    serviceRequestCreatedAt =
      typeof requestRow?.created_at === "string" ? requestRow.created_at : null;
  }

  const publicReference = serviceRequestId
    ? getCustomerRepairReference({
        id: serviceRequestId,
        created_at: serviceRequestCreatedAt,
      })
    : null;

  return NextResponse.json({
    ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}),
    service_request_created_at: serviceRequestCreatedAt,
    public_reference: publicReference,
  });
}
