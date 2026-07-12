import {
  INTAKE_REQUEST_SELECT_COLUMNS,
  mapIntakeRequestRow,
  type DashboardIntakeRequest,
} from "@/lib/intake-records";
import type {
  DatabaseIntakeSourceType,
  DatabaseIntakeStatus,
  IntakeRequestRow,
  Json,
} from "@/lib/supabase/types";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

import { extractIntakeFields } from "./intake-extraction";

export type IntakeWritePayload = {
  sourceType?: unknown;
  source_type?: unknown;
  sourceName?: unknown;
  source_name?: unknown;
  sourceIdentifier?: unknown;
  source_identifier?: unknown;
  customerFirstName?: unknown;
  customer_first_name?: unknown;
  customerLastName?: unknown;
  customer_last_name?: unknown;
  customerName?: unknown;
  customer_name?: unknown;
  customerPhone?: unknown;
  customer_phone?: unknown;
  customerEmail?: unknown;
  customer_email?: unknown;
  serviceAddress?: unknown;
  service_address?: unknown;
  unit?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  zip_code?: unknown;
  country?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  placeId?: unknown;
  place_id?: unknown;
  applianceType?: unknown;
  appliance_type?: unknown;
  brand?: unknown;
  modelNumber?: unknown;
  model_number?: unknown;
  serialNumber?: unknown;
  serial_number?: unknown;
  problemDescription?: unknown;
  problem_description?: unknown;
  preferredAppointmentWindow?: unknown;
  preferred_appointment_window?: unknown;
  appointmentDate?: unknown;
  appointment_date?: unknown;
  windowStartTime?: unknown;
  window_start_time?: unknown;
  windowEndTime?: unknown;
  window_end_time?: unknown;
  rawMessage?: unknown;
  raw_message?: unknown;
  transcript?: unknown;
  extractedData?: unknown;
  extracted_data?: unknown;
  duplicateCandidate?: unknown;
  duplicate_candidate?: unknown;
  duplicateConfirmed?: unknown;
  duplicate_confirmed?: unknown;
  dismissalReason?: unknown;
  dismissal_reason?: unknown;
  extractionConfidence?: unknown;
  extraction_confidence?: unknown;
  status?: unknown;
  assignedTechnicianId?: unknown;
  assigned_technician_id?: unknown;
  rawPayload?: unknown;
  raw_payload?: unknown;
};

export type IntakeConversionResult = {
  intakeRequestId: string;
  serviceRequestId: string | null;
  appointmentId: string | null;
  alreadyConverted: boolean;
  duplicateCandidate: Json;
};

export type IntakeDuplicateSummary = {
  hasDuplicate: boolean;
  intakeMatches: number;
  serviceRequestMatches: number;
  checkedAt: string;
};

const MAX_SHORT_TEXT = 180;
const MAX_LONG_TEXT = 3000;

function cleanText(value: unknown, maxLength = MAX_SHORT_TEXT): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function cleanZip(value: unknown): string | null {
  const cleaned =
    typeof value === "string"
      ? value.replace(/[^0-9]/g, "").slice(0, 5)
      : "";

  return cleaned.length === 5 ? cleaned : null;
}

function isDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function cleanTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(
    value.trim(),
  );

  return match ? `${match[1]}:${match[2]}:${match[3] ?? "00"}` : null;
}

function cleanUuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
    ? value.trim()
    : null;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function pick(payload: IntakeWritePayload, camelKey: keyof IntakeWritePayload, snakeKey: keyof IntakeWritePayload) {
  return payload[camelKey] ?? payload[snakeKey];
}

function cleanSourceType(value: unknown): DatabaseIntakeSourceType {
  const allowed: readonly DatabaseIntakeSourceType[] = [
    "phone",
    "sms",
    "website_form",
    "email",
    "yelp",
    "google",
    "retell_ai",
    "manual",
    "other",
  ];
  const text = cleanText(value)?.toLowerCase();

  return allowed.includes(text as DatabaseIntakeSourceType)
    ? (text as DatabaseIntakeSourceType)
    : "other";
}

function cleanStatus(value: unknown): DatabaseIntakeStatus | null {
  const allowed: readonly DatabaseIntakeStatus[] = [
    "new",
    "reviewed",
    "needs_info",
    "customer_matched",
    "ready_to_convert",
    "converted",
    "dismissed",
    "archived",
  ];
  const text = cleanText(value)?.toLowerCase();

  return allowed.includes(text as DatabaseIntakeStatus)
    ? (text as DatabaseIntakeStatus)
    : null;
}

function asJsonObject(value: unknown): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

export function normalizeIntakeWritePayload(
  payload: IntakeWritePayload,
  extraction?: Awaited<ReturnType<typeof extractIntakeFields>>,
): Record<string, Json> {
  const extracted = extraction?.fields ?? {};
  const rawMessage = cleanText(
    pick(payload, "rawMessage", "raw_message"),
    MAX_LONG_TEXT,
  );
  const transcript = cleanText(payload.transcript, MAX_LONG_TEXT);
  const extractedConfidence =
    typeof extraction?.confidence === "number" ? extraction.confidence : null;
  const explicitConfidence = Number(
    pick(payload, "extractionConfidence", "extraction_confidence"),
  );

  return {
    source_type: cleanSourceType(pick(payload, "sourceType", "source_type")),
    source_name: cleanText(pick(payload, "sourceName", "source_name")),
    source_identifier: cleanText(
      pick(payload, "sourceIdentifier", "source_identifier"),
    ),
    customer_first_name:
      cleanText(pick(payload, "customerFirstName", "customer_first_name"), 120) ??
      (extracted.customer_first_name as string | undefined) ??
      null,
    customer_last_name:
      cleanText(pick(payload, "customerLastName", "customer_last_name"), 120) ??
      (extracted.customer_last_name as string | undefined) ??
      null,
    customer_name:
      cleanText(pick(payload, "customerName", "customer_name")) ??
      (extracted.customer_name as string | undefined) ??
      null,
    customer_phone:
      cleanText(pick(payload, "customerPhone", "customer_phone"), 60) ??
      (extracted.customer_phone as string | undefined) ??
      null,
    customer_email:
      cleanText(pick(payload, "customerEmail", "customer_email"), 180) ??
      (extracted.customer_email as string | undefined) ??
      null,
    service_address:
      cleanText(pick(payload, "serviceAddress", "service_address"), 240) ??
      (extracted.service_address as string | undefined) ??
      null,
    unit: cleanText(payload.unit, 80),
    city:
      cleanText(payload.city, 120) ??
      (extracted.city as string | undefined) ??
      null,
    state:
      cleanText(payload.state, 20) ??
      (extracted.state as string | undefined) ??
      "TX",
    zip_code:
      cleanZip(pick(payload, "zipCode", "zip_code")) ??
      cleanZip(extracted.zip_code),
    country:
      cleanText(payload.country, 20) ??
      (extracted.country as string | undefined) ??
      "US",
    latitude: cleanNumber(payload.latitude),
    longitude: cleanNumber(payload.longitude),
    place_id: cleanText(pick(payload, "placeId", "place_id"), 240),
    appliance_type:
      cleanText(pick(payload, "applianceType", "appliance_type"), 120) ??
      (extracted.appliance_type as string | undefined) ??
      null,
    brand:
      cleanText(payload.brand, 120) ??
      (extracted.brand as string | undefined) ??
      null,
    model_number:
      cleanText(pick(payload, "modelNumber", "model_number"), 120) ??
      (extracted.model_number as string | undefined) ??
      null,
    serial_number:
      cleanText(pick(payload, "serialNumber", "serial_number"), 120) ??
      (extracted.serial_number as string | undefined) ??
      null,
    problem_description:
      cleanText(
        pick(payload, "problemDescription", "problem_description"),
        1200,
      ) ??
      (extracted.problem_description as string | undefined) ??
      rawMessage ??
      transcript,
    preferred_appointment_window:
      cleanText(
        pick(
          payload,
          "preferredAppointmentWindow",
          "preferred_appointment_window",
        ),
        180,
      ) ??
      (extracted.preferred_appointment_window as string | undefined) ??
      null,
    appointment_date: isDate(pick(payload, "appointmentDate", "appointment_date")),
    window_start_time: cleanTime(
      pick(payload, "windowStartTime", "window_start_time"),
    ),
    window_end_time: cleanTime(pick(payload, "windowEndTime", "window_end_time")),
    raw_message: rawMessage,
    transcript,
    raw_payload: asJsonObject(pick(payload, "rawPayload", "raw_payload")),
    extracted_data: {
      ...asJsonObject(pick(payload, "extractedData", "extracted_data")),
      ...(extraction
        ? {
            extraction_source: extraction.source,
            extraction_warning: extraction.warning,
            fields: extraction.fields,
          }
        : {}),
    },
    duplicate_candidate: asJsonObject(
      pick(payload, "duplicateCandidate", "duplicate_candidate"),
    ),
    duplicate_confirmed:
      pick(payload, "duplicateConfirmed", "duplicate_confirmed") === true,
    dismissal_reason: cleanText(
      pick(payload, "dismissalReason", "dismissal_reason"),
      300,
    ),
    extraction_confidence:
      Number.isFinite(explicitConfidence) && explicitConfidence >= 0
        ? Math.min(1, explicitConfidence)
        : extractedConfidence,
    status: cleanStatus(payload.status) ?? "new",
    assigned_technician_id: cleanUuid(
      pick(payload, "assignedTechnicianId", "assigned_technician_id"),
    ),
  };
}

function hasDuplicateCandidate(value: Json): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const intakeMatches = Number(record.intake_matches ?? 0);
  const serviceRequestMatches = Number(record.service_request_matches ?? 0);

  return intakeMatches > 0 || serviceRequestMatches > 0;
}

export async function findPossibleDuplicateIntake(
  accessToken: string,
  payload: IntakeWritePayload,
): Promise<IntakeDuplicateSummary> {
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    throw new Error("Supabase is not configured for intake.");
  }

  const phone = cleanText(pick(payload, "customerPhone", "customer_phone"), 60);
  const zipCode = cleanZip(pick(payload, "zipCode", "zip_code"));
  const applianceType = cleanText(
    pick(payload, "applianceType", "appliance_type"),
    120,
  )?.toLowerCase();
  const serviceAddress = cleanText(
    pick(payload, "serviceAddress", "service_address"),
    240,
  )?.toLowerCase();
  const unit = cleanText(payload.unit, 80)?.toLowerCase() ?? "";

  let intakeMatches = 0;
  let serviceRequestMatches = 0;

  if (phone || (zipCode && applianceType)) {
    const { data } = await supabase
      .from("intake_requests")
      .select("id,customer_phone,zip_code,appliance_type,service_address,unit,status")
      .in("status", ["new", "reviewed", "needs_info", "customer_matched", "ready_to_convert"])
      .limit(25);

    intakeMatches = ((data ?? []) as Array<Record<string, unknown>>).filter(
      (row) => {
        const rowPhone =
          typeof row.customer_phone === "string" ? row.customer_phone : null;
        const rowZip = typeof row.zip_code === "string" ? row.zip_code : null;
        const rowAppliance =
          typeof row.appliance_type === "string"
            ? row.appliance_type.toLowerCase()
            : null;
        const rowAddress =
          typeof row.service_address === "string"
            ? row.service_address.toLowerCase()
            : null;
        const rowUnit =
          typeof row.unit === "string" ? row.unit.toLowerCase() : "";

        return (
          (phone && rowPhone === phone) ||
          (zipCode && applianceType && rowZip === zipCode && rowAppliance === applianceType) ||
          (serviceAddress &&
            rowAddress === serviceAddress &&
            rowUnit === unit &&
            rowAppliance === applianceType)
        );
      },
    ).length;
  }

  if (phone || (zipCode && applianceType)) {
    const { data } = await supabase
      .from("service_requests")
      .select("id,customer_phone,zip_code,appliance_type,street_address,full_address,unit,status")
      .limit(25);

    serviceRequestMatches = ((data ?? []) as Array<Record<string, unknown>>).filter(
      (row) => {
        const rowPhone =
          typeof row.customer_phone === "string" ? row.customer_phone : null;
        const rowZip = typeof row.zip_code === "string" ? row.zip_code : null;
        const rowStatus = typeof row.status === "string" ? row.status : "";
        const rowAppliance =
          typeof row.appliance_type === "string"
            ? row.appliance_type.toLowerCase()
            : null;
        const rowAddress =
          typeof row.street_address === "string"
            ? row.street_address.toLowerCase()
            : typeof row.full_address === "string"
              ? row.full_address.toLowerCase()
              : null;
        const rowUnit =
          typeof row.unit === "string" ? row.unit.toLowerCase() : "";

        if (["completed", "closed", "canceled", "archived", "spam"].includes(rowStatus)) {
          return false;
        }

        return (
          (phone && rowPhone === phone) ||
          (zipCode && applianceType && rowZip === zipCode && rowAppliance === applianceType) ||
          (serviceAddress &&
            rowAddress === serviceAddress &&
            rowUnit === unit &&
            rowAppliance === applianceType)
        );
      },
    ).length;
  }

  return {
    hasDuplicate: intakeMatches > 0 || serviceRequestMatches > 0,
    intakeMatches,
    serviceRequestMatches,
    checkedAt: new Date().toISOString(),
  };
}

export function formatIntakeError(message: string): string {
  if (
    message.includes("intake_requests") ||
    message.includes("create_intake_request_rpc") ||
    message.includes("update_intake_request_rpc") ||
    message.includes("convert_intake_request_rpc") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  ) {
    return "Intake Inbox is waiting for the Task 150 database migration.";
  }

  if (
    message.includes("Authentication") ||
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account cannot manage that intake request.";
  }

  if (
    message.includes("required") ||
    message.includes("valid") ||
    message.includes("Choose an assigned technician") ||
    message.includes("resolved company") ||
    message.includes("Assign a technician") ||
    message.includes("Converted intake is read-only") ||
    message.includes("Archived intake is read-only") ||
    message.includes("cannot be converted")
  ) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "We could not complete that intake action yet."
    : message;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
}

export async function listIntakeRequests(accessToken: string): Promise<{
  requests: DashboardIntakeRequest[];
}> {
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    throw new Error("Supabase is not configured for intake.");
  }

  const { data, error } = await supabase
    .from("intake_requests")
    .select(INTAKE_REQUEST_SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(formatIntakeError(error.message));
  }

  return {
    requests: ((data ?? []) as unknown as IntakeRequestRow[]).map(
      mapIntakeRequestRow,
    ),
  };
}

export async function getIntakeRequest(
  accessToken: string,
  id: string,
): Promise<DashboardIntakeRequest | null> {
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    throw new Error("Supabase is not configured for intake.");
  }

  const { data, error } = await supabase
    .from("intake_requests")
    .select(INTAKE_REQUEST_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(formatIntakeError(error.message));
  }

  return data ? mapIntakeRequestRow(data as unknown as IntakeRequestRow) : null;
}

export async function createIntakeRequest(
  accessToken: string,
  payload: IntakeWritePayload,
): Promise<DashboardIntakeRequest> {
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    throw new Error("Supabase is not configured for intake.");
  }

  const extraction = await extractIntakeFields({
    rawMessage: cleanText(pick(payload, "rawMessage", "raw_message"), MAX_LONG_TEXT),
    transcript: cleanText(payload.transcript, MAX_LONG_TEXT),
  });
  const normalized = normalizeIntakeWritePayload(payload, extraction);
  const duplicateSummary = await findPossibleDuplicateIntake(accessToken, payload);

  if (duplicateSummary.hasDuplicate) {
    normalized.duplicate_candidate = {
      intake_matches: duplicateSummary.intakeMatches,
      service_request_matches: duplicateSummary.serviceRequestMatches,
      checked_at: duplicateSummary.checkedAt,
      source: "server_precreate_check",
    };
    if (normalized.duplicate_confirmed !== true) {
      normalized.status = "needs_info";
    }
  }

  const { data, error } = await supabase.rpc("create_intake_request_rpc", {
    p_payload: normalized,
  });

  if (error) {
    throw new Error(formatIntakeError(error.message));
  }

  return mapIntakeRequestRow(data as IntakeRequestRow);
}

export async function updateIntakeRequest(
  accessToken: string,
  id: string,
  payload: IntakeWritePayload,
): Promise<DashboardIntakeRequest> {
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    throw new Error("Supabase is not configured for intake.");
  }

  const normalized = normalizeIntakeWritePayload(payload);
  const { data, error } = await supabase.rpc("update_intake_request_rpc", {
    p_intake_request_id: id,
    p_payload: normalized,
  });

  if (error) {
    throw new Error(formatIntakeError(error.message));
  }

  return mapIntakeRequestRow(data as IntakeRequestRow);
}

export async function convertIntakeRequest(
  accessToken: string,
  id: string,
  options: { allowPossibleDuplicate?: boolean } = {},
): Promise<IntakeConversionResult> {
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    throw new Error("Supabase is not configured for intake.");
  }

  const { data, error } = await supabase.rpc("convert_intake_request_rpc", {
    p_intake_request_id: id,
    p_allow_possible_duplicate: options.allowPossibleDuplicate === true,
  });

  if (error) {
    throw new Error(formatIntakeError(error.message));
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return {
    intakeRequestId:
      typeof result.intake_request_id === "string" ? result.intake_request_id : id,
    serviceRequestId:
      typeof result.service_request_id === "string"
        ? result.service_request_id
        : null,
    appointmentId:
      typeof result.appointment_id === "string" ? result.appointment_id : null,
    alreadyConverted: result.already_converted === true,
    duplicateCandidate:
      result.duplicate_candidate &&
      typeof result.duplicate_candidate === "object"
        ? (result.duplicate_candidate as Json)
        : {},
  };
}

export { hasDuplicateCandidate };
