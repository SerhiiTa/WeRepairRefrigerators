import type {
  CommunicationDirection,
  CommunicationSourceType,
} from "@/lib/communications/types";
import type { Json } from "@/lib/supabase/types";

export type PhoneWorkflowProvider = "telnyx" | "retell";

export type PhoneTranscriptSpeaker = "customer" | "ai" | "human_transfer";

const PHONE_WORKFLOW_TIME_ZONE = "America/Chicago";

export type NormalizedPhoneTranscriptSegment = {
  speaker: PhoneTranscriptSpeaker;
  text: string;
  startTimeSeconds?: number | null;
  endTimeSeconds?: number | null;
  occurredAt?: string | null;
};

export type NormalizedPhoneWorkflow = {
  provider: PhoneWorkflowProvider;
  sourceType: Extract<CommunicationSourceType, "phone">;
  direction: CommunicationDirection;
  externalConversationId: string | null;
  externalMessageId: string | null;
  fromPhone: string | null;
  toPhone: string | null;
  customerName: string | null;
  customerEmail: string | null;
  serviceAddress: string | null;
  serviceUnit: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceCountry: string | null;
  applianceType: string | null;
  brand: string | null;
  modelNumber: string | null;
  issueDescription: string | null;
  zipCode: string | null;
  appointmentDate: string | null;
  preferredAppointmentWindow: string | null;
  windowStartTime: string | null;
  windowEndTime: string | null;
  bookingStatus: "complete" | "incomplete" | "unknown";
  callStatus: string | null;
  occurredAt: string;
  callStartedAt: string | null;
  callEndedAt: string | null;
  transcriptText: string | null;
  transcriptSegments: NormalizedPhoneTranscriptSegment[];
  summary: string | null;
  nextAction: string;
  providerMetadata: Record<string, Json>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 500): string | null {
  if (Array.isArray(value)) {
    const text = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(", ");

    return text.length > 0 ? text.slice(0, maxLength) : null;
  }

  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function cleanIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = cleanText(value, 32);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function datePartsFromReference(referenceIso?: string): DateParts {
  const referenceDate = referenceIso ? new Date(referenceIso) : new Date();
  const reference = Number.isNaN(referenceDate.getTime())
    ? new Date()
    : referenceDate;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHONE_WORKFLOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function toDateOnly(parts: DateParts): string | null {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function weekdayIndex(value: string): number | null {
  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const normalized = value.toLowerCase();
  const index = weekdays.findIndex((day) => normalized.includes(day));

  return index >= 0 ? index : null;
}

function monthIndex(value: string): number | null {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const lower = value.toLowerCase();
  const index = months.findIndex((month) => lower.includes(month));

  return index >= 0 ? index + 1 : null;
}

function cleanDate(value: unknown, referenceIso?: string): string | null {
  const text = cleanText(value, 80);
  if (!text) {
    return null;
  }

  const referenceParts = datePartsFromReference(referenceIso);
  const lower = text
    .toLowerCase()
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (lower.includes("today")) {
    return toDateOnly(referenceParts);
  }

  if (lower.includes("tomorrow")) {
    return toDateOnly(addDays(referenceParts, 1));
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const yearText = slashMatch[3];
    const year = yearText
      ? Number(yearText.length === 2 ? `20${yearText}` : yearText)
      : referenceParts.year;
    return toDateOnly({ year, month, day });
  }

  const month = monthIndex(lower);
  if (month) {
    const dayMatch = lower.match(/\b(\d{1,2})\b/);
    if (dayMatch) {
      let year = Number(lower.match(/\b(20\d{2})\b/)?.[1] ?? referenceParts.year);
      const day = Number(dayMatch[1]);
      let normalized = toDateOnly({ year, month, day });

      if (
        normalized &&
        !/\b(20\d{2})\b/.test(lower) &&
        normalized < toDateOnly(referenceParts)!
      ) {
        year += 1;
        normalized = toDateOnly({ year, month, day });
      }

      return normalized;
    }
  }

  const targetWeekday = weekdayIndex(lower);
  if (targetWeekday !== null) {
    const referenceDate = new Date(
      Date.UTC(referenceParts.year, referenceParts.month - 1, referenceParts.day),
    );
    const currentWeekday = referenceDate.getUTCDay();
    const delta = (targetWeekday - currentWeekday + 7) % 7 || 7;

    return toDateOnly(addDays(referenceParts, delta));
  }

  return null;
}

function cleanZip(value: unknown): string | null {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length === 5 ? digits : null;
}

function cleanTime(value: unknown): string | null {
  const text = cleanText(value, 16);
  const match = text?.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  return match ? `${match[1]}:${match[2]}:${match[3] ?? "00"}` : null;
}

type ParsedAddressParts = {
  street: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
};

type ParsedWindow = {
  start: string | null;
  end: string | null;
};

function parseServiceAddressParts(value: unknown): ParsedAddressParts {
  const raw = cleanText(value, 300);
  if (!raw) {
    return {
      street: null,
      unit: null,
      city: null,
      state: null,
      zip: null,
      country: null,
    };
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let street = parts[0] ?? raw;
  let city: string | null = null;
  let state: string | null = null;
  let zip = cleanZip(raw);
  let country: string | null = null;
  let unit: string | null = null;

  const unitMatch = street.match(
    /\b(?:apt|apartment|unit|suite|ste|#)\s*[A-Za-z0-9-]+(?:\b|$)/i,
  );
  unit = unitMatch?.[0]?.trim() ?? null;
  if (unit && unitMatch) {
    street = street.replace(unitMatch[0], "").replace(/[,\s]+$/, "").trim();
  }

  for (const part of parts.slice(1)) {
    const partUnit = part.match(
      /\b(?:apt|apartment|unit|suite|ste|#)\s*[A-Za-z0-9-]+(?:\b|$)/i,
    )?.[0]?.trim();
    if (!unit && partUnit) {
      unit = partUnit;
      continue;
    }

    const stateZipMatch = part.match(/\b([A-Za-z]{2})\b(?:\s+(\d{5})(?:-\d{4})?)?/);
    if (stateZipMatch && (stateZipMatch[2] || part.trim().length <= 12)) {
      state = stateZipMatch[1].toUpperCase();
      zip = stateZipMatch[2] ?? zip;
      continue;
    }

    const partZip = cleanZip(part);
    if (partZip && !zip) {
      zip = partZip;
      continue;
    }

    if (!city && /^[A-Za-z][A-Za-z\s.'-]{1,80}$/.test(part)) {
      city = cleanText(part, 120);
      continue;
    }

    if (!country && /\b(united states|usa|us)\b/i.test(part)) {
      country = cleanText(part, 20);
    }
  }

  return {
    street: cleanText(street, 240) ?? raw,
    unit,
    city,
    state,
    zip,
    country,
  };
}

function parseClockToken(
  token: string,
  fallbackMeridiem?: "am" | "pm" | null,
): { hour: number; minute: number; meridiem: "am" | "pm" | null } | null {
  const match = token
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!match) {
    return null;
  }

  const rawHour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const explicitMeridiem = match[3]?.startsWith("p")
    ? "pm"
    : match[3]?.startsWith("a")
      ? "am"
      : null;
  const meridiem = explicitMeridiem ?? fallbackMeridiem ?? null;
  if (rawHour < 1 || rawHour > 23 || minute > 59) {
    return null;
  }

  let hour = rawHour;
  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  return { hour, minute, meridiem };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function parseAppointmentWindow(value: unknown): ParsedWindow {
  const text = cleanText(value, 180)?.toLowerCase();
  if (!text) {
    return { start: null, end: null };
  }

  const normalized = text
    .replace(/[–—]/g, "-")
    .replace(/\bbetween\b|\bfrom\b/g, " ")
    .replace(/\bto\b|\band\b|\buntil\b|\bthrough\b/g, "-")
    .replace(/\s+/g, " ");
  const rangeMatch = normalized.match(
    /(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/,
  );

  if (!rangeMatch) {
    return { start: null, end: null };
  }

  const contextMeridiem = text.includes("afternoon") || text.includes("evening")
    ? "pm"
    : text.includes("morning")
      ? "am"
      : null;
  const endMeridiem = rangeMatch[2].toLowerCase().includes("p")
    ? "pm"
    : rangeMatch[2].toLowerCase().includes("a")
      ? "am"
      : contextMeridiem;
  const startMeridiem = rangeMatch[1].toLowerCase().includes("p")
    ? "pm"
    : rangeMatch[1].toLowerCase().includes("a")
      ? "am"
      : endMeridiem ?? contextMeridiem ?? "am";
  const start = parseClockToken(rangeMatch[1], startMeridiem);
  const end = parseClockToken(rangeMatch[2], endMeridiem);

  if (
    !start ||
    !end ||
    start.hour > end.hour ||
    (start.hour === end.hour && start.minute >= end.minute)
  ) {
    return { start: null, end: null };
  }

  return {
    start: formatTime(start.hour, start.minute),
    end: formatTime(end.hour, end.minute),
  };
}

export function normalizePhoneNumber(value?: unknown): string | null {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits.length > 0 ? digits : null;
}

function getPath(payload: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[key];
  }, payload);
}

function pickText(payload: unknown, paths: string[], maxLength = 500): string | null {
  for (const path of paths) {
    const text = cleanText(getPath(payload, path), maxLength);
    if (text) {
      return text;
    }
  }
  return null;
}

function pickDate(payload: unknown, paths: string[], referenceIso?: string): string | null {
  for (const path of paths) {
    const date = cleanDate(getPath(payload, path), referenceIso);
    if (date) {
      return date;
    }
  }
  return null;
}

function pickTime(payload: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const time = cleanTime(getPath(payload, path));
    if (time) {
      return time;
    }
  }
  return null;
}

function pickIso(payload: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const iso = cleanIsoDate(getPath(payload, path));
    if (iso) {
      return iso;
    }
  }
  return null;
}

function normalizeSpeaker(value: unknown): PhoneTranscriptSpeaker {
  const text = cleanText(value, 80)?.toLowerCase() ?? "";
  if (text.includes("agent") || text.includes("ai") || text.includes("assistant")) {
    return "ai";
  }
  if (text.includes("human") || text.includes("dispatcher")) {
    return "human_transfer";
  }
  return "customer";
}

function normalizeTranscriptSegments(payload: unknown): NormalizedPhoneTranscriptSegment[] {
  const candidates = [
    getPath(payload, "transcript_object"),
    getPath(payload, "transcript.segments"),
    getPath(payload, "call.transcript_object"),
    getPath(payload, "data.transcript_object"),
    getPath(payload, "data.payload.transcript_object"),
  ];

  const segmentSource = candidates.find(Array.isArray);
  if (!Array.isArray(segmentSource)) {
    return [];
  }

  return segmentSource
    .map((segment): NormalizedPhoneTranscriptSegment | null => {
      if (!isRecord(segment)) {
        return null;
      }

      const text =
        cleanText(segment.text, 1200) ??
        cleanText(segment.content, 1200) ??
        cleanText(segment.words, 1200);

      if (!text) {
        return null;
      }

      return {
        speaker: normalizeSpeaker(segment.speaker ?? segment.role),
        text,
        startTimeSeconds:
          typeof segment.start === "number"
            ? segment.start
            : typeof segment.start_time === "number"
              ? segment.start_time
              : null,
        endTimeSeconds:
          typeof segment.end === "number"
            ? segment.end
            : typeof segment.end_time === "number"
              ? segment.end_time
              : null,
        occurredAt: cleanIsoDate(segment.occurred_at),
      };
    })
    .filter((segment): segment is NormalizedPhoneTranscriptSegment =>
      Boolean(segment),
    );
}

function inferBookingStatus(payload: unknown): "complete" | "incomplete" | "unknown" {
  const explicit = pickText(payload, [
    "booking_status",
    "bookingStatus",
    "call.call_analysis.call_successful",
    "call_analysis.custom_analysis_data.booking_status",
    "call.call_analysis.custom_analysis_data.booking_status",
  ])?.toLowerCase();

  if (
    explicit?.includes("complete") ||
    explicit === "booked" ||
    explicit === "true"
  ) {
    return "complete";
  }

  if (explicit?.includes("incomplete") || explicit?.includes("callback")) {
    return "incomplete";
  }

  return "unknown";
}

export function normalizePhoneWorkflowPayload(
  provider: PhoneWorkflowProvider,
  payload: unknown,
): NormalizedPhoneWorkflow {
  const occurredAt =
    pickIso(payload, [
      "occurred_at",
      "created_at",
      "data.occurred_at",
      "data.payload.occurred_at",
      "call.created_at",
      "call.start_timestamp",
    ]) ?? new Date().toISOString();

  const transcriptSegments = normalizeTranscriptSegments(payload);
  const transcriptFromSegments = transcriptSegments
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");
  const transcriptText =
    pickText(payload, [
      "transcript",
      "transcript_text",
      "call.transcript",
      "call.transcript_text",
      "data.transcript",
      "data.payload.transcript",
    ], 8000) ?? (transcriptFromSegments.length > 0 ? transcriptFromSegments : null);

  const issueDescription = pickText(payload, [
    "problem_description",
    "issue_description",
    "customer_issue",
    "issues",
    "call_analysis.custom_analysis_data.problem_description",
    "call_analysis.custom_analysis_data.issues",
    "call.call_analysis.custom_analysis_data.problem_description",
    "call.call_analysis.custom_analysis_data.issues",
    "data.payload.problem_description",
  ], 1200);

  const summary =
    pickText(payload, [
      "summary",
      "call_summary",
      "call_analysis.call_summary",
      "call.call_analysis.call_summary",
    ], 1200) ??
    issueDescription ??
    (transcriptText ? transcriptText.slice(0, 500) : null);

  const callStatus = pickText(payload, [
    "call_status",
    "status",
    "event_type",
    "data.event_type",
    "data.payload.call_status",
    "call.call_status",
  ], 120);

  const bookingStatus = inferBookingStatus(payload);
  const callStartedAt = pickIso(payload, [
    "start_time",
    "started_at",
    "call.start_timestamp",
    "data.payload.start_time",
  ]);
  const callEndedAt = pickIso(payload, [
    "end_time",
    "ended_at",
    "call.end_timestamp",
    "data.payload.end_time",
  ]);
  const rawServiceAddress = pickText(payload, [
    "call.call_analysis.custom_analysis_data.address",
    "call_analysis.custom_analysis_data.address",
    "service_address",
    "address",
    "customer.address",
    "call_analysis.custom_analysis_data.service_address",
    "call.call_analysis.custom_analysis_data.service_address",
  ], 300);
  const rawAppointmentDate = pickText(payload, [
    "call.call_analysis.custom_analysis_data.appointment_date",
    "call.call_analysis.custom_analysis_data.requested_date",
    "call.call_analysis.custom_analysis_data.preferred_date",
    "call_analysis.custom_analysis_data.appointment_date",
    "call_analysis.custom_analysis_data.requested_date",
    "call_analysis.custom_analysis_data.preferred_date",
    "appointment_date",
    "requested_date",
    "preferred_date",
  ], 120);
  const parsedAddress = parseServiceAddressParts(rawServiceAddress);
  const structuredUnit = pickText(payload, [
    "call.call_analysis.custom_analysis_data.unit",
    "call.call_analysis.custom_analysis_data.apartment",
    "call_analysis.custom_analysis_data.unit",
    "call_analysis.custom_analysis_data.apartment",
    "unit",
    "apartment",
  ], 80);
  const structuredCity = pickText(payload, [
    "call.call_analysis.custom_analysis_data.city",
    "call_analysis.custom_analysis_data.city",
    "city",
  ], 120);
  const structuredState = pickText(payload, [
    "call.call_analysis.custom_analysis_data.state",
    "call_analysis.custom_analysis_data.state",
    "state",
  ], 20)?.toUpperCase() ?? null;
  const structuredCountry = pickText(payload, [
    "call.call_analysis.custom_analysis_data.country",
    "call_analysis.custom_analysis_data.country",
    "country",
  ], 20);
  const preferredAppointmentWindow = pickText(payload, [
    "call.call_analysis.custom_analysis_data.appointment_time",
    "call_analysis.custom_analysis_data.appointment_time",
    "preferred_appointment_window",
    "preferredAppointmentWindow",
  ], 180);
  const parsedAppointmentWindow = parseAppointmentWindow(preferredAppointmentWindow);

  return {
    provider,
    sourceType: "phone",
    direction: "inbound",
    externalConversationId: pickText(payload, [
      "call_id",
      "call.call_id",
      "call.call_control_id",
      "data.id",
      "data.payload.call_control_id",
      "data.payload.call_session_id",
      "conversation_id",
    ], 240),
    externalMessageId: pickText(payload, ["message_id", "event_id", "data.id"], 240),
    fromPhone: normalizePhoneNumber(
      pickText(payload, [
        "call.call_analysis.custom_analysis_data.best_phone",
        "call_analysis.custom_analysis_data.best_phone",
        "from_number",
        "from",
        "call.from_number",
        "data.payload.from.phone_number",
        "data.payload.from",
      ], 80),
    ),
    toPhone: normalizePhoneNumber(
      pickText(payload, [
        "to_number",
        "to",
        "call.to_number",
        "data.payload.to.phone_number",
        "data.payload.to",
      ], 80),
    ),
    customerName: pickText(payload, [
      "call.call_analysis.custom_analysis_data.name",
      "call_analysis.custom_analysis_data.name",
      "customer_name",
      "customer.name",
      "call_analysis.custom_analysis_data.customer_name",
      "call.call_analysis.custom_analysis_data.customer_name",
    ], 180),
    customerEmail: pickText(payload, [
      "customer_email",
      "customer.email",
      "call_analysis.custom_analysis_data.customer_email",
      "call.call_analysis.custom_analysis_data.customer_email",
    ], 180),
    serviceAddress: parsedAddress.street ?? rawServiceAddress,
    serviceUnit: structuredUnit ?? parsedAddress.unit,
    serviceCity: structuredCity ?? parsedAddress.city,
    serviceState: structuredState ?? parsedAddress.state,
    serviceCountry: structuredCountry ?? parsedAddress.country,
    applianceType: pickText(payload, [
      "call.call_analysis.custom_analysis_data.appliance_type",
      "call_analysis.custom_analysis_data.appliance_type",
      "appliance_type",
      "appliance",
      "call_analysis.custom_analysis_data.appliance_type",
      "call.call_analysis.custom_analysis_data.appliance_type",
    ], 120),
    brand: pickText(payload, [
      "call.call_analysis.custom_analysis_data.brand",
      "call_analysis.custom_analysis_data.brand",
      "brand",
      "appliance_brand",
      "call_analysis.custom_analysis_data.brand",
      "call.call_analysis.custom_analysis_data.brand",
    ], 120),
    modelNumber: pickText(payload, [
      "call.call_analysis.custom_analysis_data.model_number",
      "call_analysis.custom_analysis_data.model_number",
      "model_number",
      "model",
      "call_analysis.custom_analysis_data.model_number",
      "call.call_analysis.custom_analysis_data.model_number",
    ], 120),
    issueDescription,
    zipCode: cleanZip(
      pickText(payload, [
        "call.call_analysis.custom_analysis_data.zip",
        "call_analysis.custom_analysis_data.zip",
        "zip",
        "zip_code",
      ], 20),
    ) ?? parsedAddress.zip,
    appointmentDate: pickDate(payload, [
      "call.call_analysis.custom_analysis_data.appointment_date",
      "call.call_analysis.custom_analysis_data.requested_date",
      "call.call_analysis.custom_analysis_data.preferred_date",
      "call_analysis.custom_analysis_data.appointment_date",
      "call_analysis.custom_analysis_data.requested_date",
      "call_analysis.custom_analysis_data.preferred_date",
      "appointment_date",
      "requested_date",
      "preferred_date",
      "call_analysis.custom_analysis_data.appointment_date",
      "call.call_analysis.custom_analysis_data.appointment_date",
    ], callStartedAt ?? occurredAt),
    preferredAppointmentWindow,
    windowStartTime: pickTime(payload, [
      "window_start_time",
      "call.call_analysis.custom_analysis_data.window_start_time",
      "call_analysis.custom_analysis_data.window_start_time",
      "call.call_analysis.custom_analysis_data.window_start_time",
    ]) ?? parsedAppointmentWindow.start,
    windowEndTime: pickTime(payload, [
      "window_end_time",
      "call.call_analysis.custom_analysis_data.window_end_time",
      "call_analysis.custom_analysis_data.window_end_time",
      "call.call_analysis.custom_analysis_data.window_end_time",
    ]) ?? parsedAppointmentWindow.end,
    bookingStatus,
    callStatus,
    occurredAt,
    callStartedAt,
    callEndedAt,
    transcriptText,
    transcriptSegments,
    summary,
    nextAction:
      bookingStatus === "complete"
        ? "Review booked phone intake"
        : "Review phone intake",
    providerMetadata: {
      provider,
      payload_shape: isRecord(payload) ? Object.keys(payload).slice(0, 20) : [],
      call_status: callStatus,
      booking_status: bookingStatus,
      normalized_fields: {
        parsed_address: Boolean(
          parsedAddress.street || parsedAddress.city || parsedAddress.zip,
        ),
        parsed_window: Boolean(
          parsedAppointmentWindow.start && parsedAppointmentWindow.end,
        ),
      },
      raw_inputs: {
        service_address: rawServiceAddress,
        appointment_date: rawAppointmentDate,
        appointment_window: preferredAppointmentWindow,
      },
    },
  };
}
