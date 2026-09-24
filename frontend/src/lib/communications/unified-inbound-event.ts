import type { Json } from "@/lib/supabase/types";

export const UNIFIED_INBOUND_CHANNELS = [
  "phone",
  "sms",
  "website_form",
  "booking_widget",
  "lead_generator",
  "email",
  "social",
  "manual",
  "other",
] as const;

export const UNIFIED_INBOUND_EVENT_TYPES = [
  "phone_call",
  "sms_message",
  "website_form_submission",
  "booking_request",
  "lead",
  "email_message",
  "social_message",
  "manual_intake",
  "other",
] as const;

export const UNIFIED_INBOUND_DIRECTIONS = [
  "inbound",
  "outbound",
  "internal",
] as const;

export type UnifiedInboundChannel = (typeof UNIFIED_INBOUND_CHANNELS)[number];
export type UnifiedInboundEventType =
  (typeof UNIFIED_INBOUND_EVENT_TYPES)[number];
export type UnifiedInboundDirection =
  (typeof UNIFIED_INBOUND_DIRECTIONS)[number];

export type UnifiedInboundSource = {
  companyId?: string;
  inboundSourceId?: string;
  sourceAccountId?: string;
  sourceKey?: string;
  sourceName?: string;
};

export type UnifiedInboundAttribution = {
  websiteDomain?: string;
  landingPageUrl?: string;
  referrerUrl?: string;
  trackingPhoneNumber?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  metadata?: Record<string, Json>;
};

export type UnifiedInboundCustomer = {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

export type UnifiedInboundServiceAddress = {
  formatted?: string;
  streetAddress?: string;
  unit?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
};

export type UnifiedInboundProperty = {
  propertyType?: string;
  yearBuilt?: number;
  squareFeet?: number;
  metadata?: Record<string, Json>;
};

export type UnifiedInboundRequestedService = {
  serviceType?: string;
  applianceType?: string;
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  problemDescription?: string;
};

export type UnifiedInboundRequestedAppointment = {
  date?: string;
  windowStartTime?: string;
  windowEndTime?: string;
  preferredWindow?: string;
  timezone?: string;
};

export type UnifiedInboundMessage = {
  subject?: string;
  body?: string;
  summary?: string;
};

export type UnifiedInboundTranscript = {
  text?: string;
  reference?: string;
  recordingReference?: string;
};

export type UnifiedInboundEvent = {
  channel: UnifiedInboundChannel;
  eventType: UnifiedInboundEventType;
  occurredAt: string;
  direction?: UnifiedInboundDirection;
  providerName?: string;
  providerEventId?: string;
  providerLeadId?: string;
  externalConversationId?: string;
  externalMessageId?: string;
  source?: UnifiedInboundSource;
  attribution?: UnifiedInboundAttribution;
  customer?: UnifiedInboundCustomer;
  serviceAddress?: UnifiedInboundServiceAddress;
  property?: UnifiedInboundProperty;
  requestedService?: UnifiedInboundRequestedService;
  requestedAppointment?: UnifiedInboundRequestedAppointment;
  message?: UnifiedInboundMessage;
  transcript?: UnifiedInboundTranscript;
  rawPayloadReference?: string;
  providerMetadata?: Record<string, Json>;
};

export type UnifiedInboundEventInput = Omit<
  UnifiedInboundEvent,
  "occurredAt"
> & {
  occurredAt?: string | number | Date | null;
};

export type UnifiedInboundValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanOptionalString(value: unknown, maxLength = 1_000): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanTimestamp(value: string | number | Date | null | undefined): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? new Date().toISOString()
      : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  }

  const text = cleanOptionalString(value, 64);
  if (!text) {
    return new Date().toISOString();
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cleanJsonRecord(value: unknown): Record<string, Json> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const json = JSON.parse(JSON.stringify(value)) as Record<string, Json>;
  return Object.keys(json).length > 0 ? json : undefined;
}

function cleanObject<T extends Record<string, unknown>>(value: T): T | undefined {
  const cleaned = Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function normalizeInboundPhone(value: unknown): string | undefined {
  const text = cleanOptionalString(value, 40);
  if (!text) {
    return undefined;
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return text;
}

export function normalizeInboundEmail(value: unknown): string | undefined {
  const text = cleanOptionalString(value, 320)?.toLowerCase();
  return text && text.includes("@") ? text : undefined;
}

export function normalizeUnifiedInboundAttribution(
  attribution: Partial<UnifiedInboundAttribution> | null | undefined,
): UnifiedInboundAttribution | undefined {
  if (!attribution) {
    return undefined;
  }

  const utm = cleanObject({
    source: cleanOptionalString(attribution.utm?.source, 160),
    medium: cleanOptionalString(attribution.utm?.medium, 160),
    campaign: cleanOptionalString(attribution.utm?.campaign, 240),
    term: cleanOptionalString(attribution.utm?.term, 240),
    content: cleanOptionalString(attribution.utm?.content, 240),
  });

  return cleanObject({
    websiteDomain: cleanOptionalString(attribution.websiteDomain, 255),
    landingPageUrl: cleanOptionalString(attribution.landingPageUrl, 2_000),
    referrerUrl: cleanOptionalString(attribution.referrerUrl, 2_000),
    trackingPhoneNumber: normalizeInboundPhone(attribution.trackingPhoneNumber),
    utm,
    metadata: cleanJsonRecord(attribution.metadata),
  });
}

export function createUnifiedInboundEvent(
  input: UnifiedInboundEventInput,
): UnifiedInboundEvent {
  return {
    channel: input.channel,
    eventType: input.eventType,
    occurredAt: cleanTimestamp(input.occurredAt),
    direction: input.direction,
    providerName: cleanOptionalString(input.providerName, 120),
    providerEventId: cleanOptionalString(input.providerEventId, 255),
    providerLeadId: cleanOptionalString(input.providerLeadId, 255),
    externalConversationId: cleanOptionalString(input.externalConversationId, 255),
    externalMessageId: cleanOptionalString(input.externalMessageId, 255),
    source: cleanObject({
      companyId: cleanOptionalString(input.source?.companyId, 64),
      inboundSourceId: cleanOptionalString(input.source?.inboundSourceId, 64),
      sourceAccountId: cleanOptionalString(input.source?.sourceAccountId, 64),
      sourceKey: cleanOptionalString(input.source?.sourceKey, 255),
      sourceName: cleanOptionalString(input.source?.sourceName, 255),
    }),
    attribution: normalizeUnifiedInboundAttribution(input.attribution),
    customer: cleanObject({
      name: cleanOptionalString(input.customer?.name, 255),
      firstName: cleanOptionalString(input.customer?.firstName, 120),
      lastName: cleanOptionalString(input.customer?.lastName, 120),
      phone: normalizeInboundPhone(input.customer?.phone),
      email: normalizeInboundEmail(input.customer?.email),
    }),
    serviceAddress: cleanObject({
      formatted: cleanOptionalString(input.serviceAddress?.formatted, 500),
      streetAddress: cleanOptionalString(input.serviceAddress?.streetAddress, 255),
      unit: cleanOptionalString(input.serviceAddress?.unit, 120),
      city: cleanOptionalString(input.serviceAddress?.city, 120),
      state: cleanOptionalString(input.serviceAddress?.state, 80),
      postalCode: cleanOptionalString(input.serviceAddress?.postalCode, 32),
      country: cleanOptionalString(input.serviceAddress?.country, 80),
      placeId: cleanOptionalString(input.serviceAddress?.placeId, 255),
      latitude: cleanNumber(input.serviceAddress?.latitude),
      longitude: cleanNumber(input.serviceAddress?.longitude),
    }),
    property: cleanObject({
      propertyType: cleanOptionalString(input.property?.propertyType, 120),
      yearBuilt: cleanNumber(input.property?.yearBuilt),
      squareFeet: cleanNumber(input.property?.squareFeet),
      metadata: cleanJsonRecord(input.property?.metadata),
    }),
    requestedService: cleanObject({
      serviceType: cleanOptionalString(input.requestedService?.serviceType, 160),
      applianceType: cleanOptionalString(input.requestedService?.applianceType, 160),
      brand: cleanOptionalString(input.requestedService?.brand, 160),
      modelNumber: cleanOptionalString(input.requestedService?.modelNumber, 160),
      serialNumber: cleanOptionalString(input.requestedService?.serialNumber, 160),
      problemDescription: cleanOptionalString(
        input.requestedService?.problemDescription,
        2_000,
      ),
    }),
    requestedAppointment: cleanObject({
      date: cleanOptionalString(input.requestedAppointment?.date, 32),
      windowStartTime: cleanOptionalString(
        input.requestedAppointment?.windowStartTime,
        32,
      ),
      windowEndTime: cleanOptionalString(
        input.requestedAppointment?.windowEndTime,
        32,
      ),
      preferredWindow: cleanOptionalString(
        input.requestedAppointment?.preferredWindow,
        255,
      ),
      timezone: cleanOptionalString(input.requestedAppointment?.timezone, 120),
    }),
    message: cleanObject({
      subject: cleanOptionalString(input.message?.subject, 255),
      body: cleanOptionalString(input.message?.body, 10_000),
      summary: cleanOptionalString(input.message?.summary, 2_000),
    }),
    transcript: cleanObject({
      text: cleanOptionalString(input.transcript?.text, 50_000),
      reference: cleanOptionalString(input.transcript?.reference, 2_000),
      recordingReference: cleanOptionalString(
        input.transcript?.recordingReference,
        2_000,
      ),
    }),
    rawPayloadReference: cleanOptionalString(input.rawPayloadReference, 2_000),
    providerMetadata: cleanJsonRecord(input.providerMetadata),
  };
}

export function validateUnifiedInboundEventIdentity(
  event: UnifiedInboundEvent,
): UnifiedInboundValidationResult {
  if (!UNIFIED_INBOUND_CHANNELS.includes(event.channel)) {
    return { ok: false, reason: "Unified inbound event channel is not supported." };
  }

  if (!UNIFIED_INBOUND_EVENT_TYPES.includes(event.eventType)) {
    return {
      ok: false,
      reason: "Unified inbound event type is not supported.",
    };
  }

  if (
    event.direction &&
    !UNIFIED_INBOUND_DIRECTIONS.includes(event.direction)
  ) {
    return {
      ok: false,
      reason: "Unified inbound event direction is not supported.",
    };
  }

  if (Number.isNaN(new Date(event.occurredAt).getTime())) {
    return {
      ok: false,
      reason: "Unified inbound event occurredAt must be a valid timestamp.",
    };
  }

  return { ok: true };
}
