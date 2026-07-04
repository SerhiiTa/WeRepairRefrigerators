import type {
  CommunicationDirection,
  CommunicationSourceType,
} from "@/lib/communications/types";
import type { Json } from "@/lib/supabase/types";

export type PhoneWorkflowProvider = "telnyx" | "retell";

export type PhoneTranscriptSpeaker = "customer" | "ai" | "human_transfer";

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

function cleanDate(value: unknown): string | null {
  const text = cleanText(value, 20);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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

function pickDate(payload: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const date = cleanDate(getPath(payload, path));
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
    serviceAddress: pickText(payload, [
      "call.call_analysis.custom_analysis_data.address",
      "call_analysis.custom_analysis_data.address",
      "service_address",
      "address",
      "customer.address",
      "call_analysis.custom_analysis_data.service_address",
      "call.call_analysis.custom_analysis_data.service_address",
    ], 240),
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
    ),
    appointmentDate: pickDate(payload, [
      "call.call_analysis.custom_analysis_data.appointment_date",
      "call_analysis.custom_analysis_data.appointment_date",
      "appointment_date",
      "call_analysis.custom_analysis_data.appointment_date",
      "call.call_analysis.custom_analysis_data.appointment_date",
    ]),
    preferredAppointmentWindow: pickText(payload, [
      "call.call_analysis.custom_analysis_data.appointment_time",
      "call_analysis.custom_analysis_data.appointment_time",
      "preferred_appointment_window",
      "preferredAppointmentWindow",
    ], 180),
    windowStartTime: pickTime(payload, [
      "window_start_time",
      "call.call_analysis.custom_analysis_data.window_start_time",
      "call_analysis.custom_analysis_data.window_start_time",
      "call.call_analysis.custom_analysis_data.window_start_time",
    ]),
    windowEndTime: pickTime(payload, [
      "window_end_time",
      "call.call_analysis.custom_analysis_data.window_end_time",
      "call_analysis.custom_analysis_data.window_end_time",
      "call.call_analysis.custom_analysis_data.window_end_time",
    ]),
    bookingStatus,
    callStatus,
    occurredAt,
    callStartedAt: pickIso(payload, [
      "start_time",
      "started_at",
      "call.start_timestamp",
      "data.payload.start_time",
    ]),
    callEndedAt: pickIso(payload, [
      "end_time",
      "ended_at",
      "call.end_timestamp",
      "data.payload.end_time",
    ]),
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
    },
  };
}
