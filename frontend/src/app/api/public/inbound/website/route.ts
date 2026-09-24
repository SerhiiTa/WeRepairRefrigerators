import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import {
  createUnifiedInboundEvent,
  normalizeUnifiedInboundAttribution,
  type UnifiedInboundAttribution,
  type UnifiedInboundEventType,
} from "@/lib/communications/unified-inbound-event";
import type { Json } from "@/lib/supabase/types";
import { verifyInboundSourceCredential } from "@/server/communications/inbound-source-credentials";
import { persistUnifiedInboundEvent } from "@/server/communications/unified-inbound-persistence";
import { processUnifiedInboundEvent } from "@/server/communications/unified-intake-gateway";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_000;

type PublicWebsiteInboundPayload = {
  formId?: unknown;
  customer?: {
    name?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    phone?: unknown;
    email?: unknown;
  };
  serviceAddress?: {
    formatted?: unknown;
    streetAddress?: unknown;
    unit?: unknown;
    city?: unknown;
    state?: unknown;
    postalCode?: unknown;
    country?: unknown;
    placeId?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };
  requestedService?: {
    serviceType?: unknown;
    applianceType?: unknown;
    brand?: unknown;
    modelNumber?: unknown;
    serialNumber?: unknown;
    problemDescription?: unknown;
  };
  requestedAppointment?: {
    date?: unknown;
    windowStartTime?: unknown;
    windowEndTime?: unknown;
    preferredWindow?: unknown;
    timezone?: unknown;
  };
  attribution?: {
    websiteDomain?: unknown;
    landingPageUrl?: unknown;
    referrerUrl?: unknown;
    trackingPhoneNumber?: unknown;
    utm?: {
      source?: unknown;
      medium?: unknown;
      campaign?: unknown;
      term?: unknown;
      content?: unknown;
    };
    metadata?: unknown;
  };
  message?: {
    subject?: unknown;
    body?: unknown;
    summary?: unknown;
  };
  occurredAt?: unknown;
  providerEventId?: unknown;
  providerLeadId?: unknown;
  externalConversationId?: unknown;
  externalMessageId?: unknown;
  idempotencyKey?: unknown;
  submissionId?: unknown;
  providerMetadata?: unknown;
};

const FORM_ROUTING_EVENT_TYPES = [
  "booking_request",
  "lead",
  "website_form_submission",
] as const satisfies readonly UnifiedInboundEventType[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 1_000): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanJsonRecord(value: unknown): Record<string, Json> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const json = JSON.parse(JSON.stringify(value)) as Record<string, Json>;
  return Object.keys(json).length > 0 ? json : undefined;
}

function parseAuthorizationHeader(value: string | null):
  | { ok: true; publicKey: string; secret: string }
  | { ok: false } {
  const prefix = "WRA-Source ";
  if (!value?.startsWith(prefix)) {
    return { ok: false };
  }

  const token = value.slice(prefix.length).trim();
  const separatorIndex = token.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return { ok: false };
  }

  const publicKey = token.slice(0, separatorIndex).trim();
  const secret = token.slice(separatorIndex + 1);
  return publicKey && secret ? { ok: true, publicKey, secret } : { ok: false };
}

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    null
  );
}

async function readJsonPayload(request: Request): Promise<
  | { ok: true; payload: PublicWebsiteInboundPayload }
  | { ok: false; status: number; message: string }
> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "Inbound request payload is too large.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Inbound request payload must be valid JSON.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      status: 400,
      message: "Inbound request payload must be a JSON object.",
    };
  }

  return { ok: true, payload: parsed as PublicWebsiteInboundPayload };
}

function buildAttribution(
  attribution: PublicWebsiteInboundPayload["attribution"],
): UnifiedInboundAttribution | undefined {
  return normalizeUnifiedInboundAttribution({
    websiteDomain: cleanText(attribution?.websiteDomain, 255),
    landingPageUrl: cleanText(attribution?.landingPageUrl, 2_000),
    referrerUrl: cleanText(attribution?.referrerUrl, 2_000),
    trackingPhoneNumber: cleanText(attribution?.trackingPhoneNumber, 40),
    utm: {
      source: cleanText(attribution?.utm?.source, 160),
      medium: cleanText(attribution?.utm?.medium, 160),
      campaign: cleanText(attribution?.utm?.campaign, 240),
      term: cleanText(attribution?.utm?.term, 240),
      content: cleanText(attribution?.utm?.content, 240),
    },
    metadata: cleanJsonRecord(attribution?.metadata),
  });
}

function eventTypeForChannel(channel: string): UnifiedInboundEventType {
  if (channel === "booking_widget") {
    return "booking_request";
  }
  if (channel === "lead_generator") {
    return "lead";
  }
  return "website_form_submission";
}

function resolveEventTypeForPayload(
  payload: PublicWebsiteInboundPayload,
  credentialMetadata: Json,
  channel: string,
):
  | { ok: true; eventType: UnifiedInboundEventType; formId?: string }
  | { ok: false; message: string } {
  const formId = cleanText(payload.formId, 120);
  if (!formId) {
    return { ok: true, eventType: eventTypeForChannel(channel) };
  }

  const metadata = isRecord(credentialMetadata) ? credentialMetadata : {};
  const formRouting = metadata.form_routing;
  if (!isRecord(formRouting)) {
    return {
      ok: false,
      message: "Inbound form is not configured for this source.",
    };
  }

  const routedEventType = formRouting[formId];
  if (
    typeof routedEventType !== "string" ||
    !FORM_ROUTING_EVENT_TYPES.includes(
      routedEventType as (typeof FORM_ROUTING_EVENT_TYPES)[number],
    )
  ) {
    return {
      ok: false,
      message: "Inbound form is not configured for this source.",
    };
  }

  return {
    ok: true,
    eventType: routedEventType as UnifiedInboundEventType,
    formId,
  };
}

function validatePayload(payload: PublicWebsiteInboundPayload): string[] {
  const errors: string[] = [];
  const customerName = cleanText(payload.customer?.name, 255);
  const customerPhone = cleanText(payload.customer?.phone, 40);
  const customerEmail = cleanText(payload.customer?.email, 320);
  const formattedAddress = cleanText(payload.serviceAddress?.formatted, 500);
  const postalCode = cleanText(payload.serviceAddress?.postalCode, 32);
  const problemDescription = cleanText(
    payload.requestedService?.problemDescription,
    2_000,
  );

  if (!customerName) {
    errors.push("customer.name is required.");
  }
  if (!customerPhone && !customerEmail) {
    errors.push("customer.phone or customer.email is required.");
  }
  if (!formattedAddress) {
    errors.push("serviceAddress.formatted is required.");
  }
  if (!postalCode) {
    errors.push("serviceAddress.postalCode is required.");
  }
  if (!problemDescription) {
    errors.push("requestedService.problemDescription is required.");
  }

  return errors;
}

export async function POST(request: Request) {
  const parsedAuth = parseAuthorizationHeader(request.headers.get("authorization"));
  if (!parsedAuth.ok) {
    return NextResponse.json(
      { ok: false, accepted: false, message: "Inbound request is not authorized." },
      { status: 401 },
    );
  }

  const authResult = await verifyInboundSourceCredential({
    publicKey: parsedAuth.publicKey,
    secret: parsedAuth.secret,
    requestIp: getRequestIp(request),
  });

  if (!authResult.ok) {
    const status = authResult.code === "server_not_configured" ? 503 : 401;
    return NextResponse.json(
      { ok: false, accepted: false, message: "Inbound request is not authorized." },
      { status },
    );
  }

  const bodyResult = await readJsonPayload(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { ok: false, accepted: false, message: bodyResult.message },
      { status: bodyResult.status },
    );
  }

  const validationErrors = validatePayload(bodyResult.payload);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        message: "Inbound request payload is incomplete.",
        errors: validationErrors,
      },
      { status: 400 },
    );
  }

  const payload = bodyResult.payload;
  const credential = authResult.credential;
  const eventTypeResult = resolveEventTypeForPayload(
    bodyResult.payload,
    credential.metadata,
    credential.channel,
  );
  if (!eventTypeResult.ok) {
    return NextResponse.json(
      { ok: false, accepted: false, message: eventTypeResult.message },
      { status: 400 },
    );
  }

  const providerEventId =
    cleanText(payload.providerEventId, 255) ??
    cleanText(payload.submissionId, 255) ??
    cleanText(payload.idempotencyKey, 255);
  const problemDescription = cleanText(
    payload.requestedService?.problemDescription,
    2_000,
  );

  const event = createUnifiedInboundEvent({
    channel: credential.channel,
    eventType: eventTypeResult.eventType,
    direction: "inbound",
    occurredAt: cleanText(payload.occurredAt, 64) ?? new Date().toISOString(),
    providerName: credential.providerName ?? "website",
    providerEventId,
    providerLeadId: cleanText(payload.providerLeadId, 255),
    externalConversationId: cleanText(payload.externalConversationId, 255),
    externalMessageId: cleanText(payload.externalMessageId, 255),
    source: {
      companyId: credential.companyId,
      inboundSourceId: credential.inboundSourceId,
      sourceAccountId: credential.sourceAccountId ?? undefined,
      sourceKey: credential.sourceKey,
      sourceName: credential.sourceName,
    },
    attribution: buildAttribution(payload.attribution),
    customer: {
      name: cleanText(payload.customer?.name, 255),
      firstName: cleanText(payload.customer?.firstName, 120),
      lastName: cleanText(payload.customer?.lastName, 120),
      phone: cleanText(payload.customer?.phone, 40),
      email: cleanText(payload.customer?.email, 320),
    },
    serviceAddress: {
      formatted: cleanText(payload.serviceAddress?.formatted, 500),
      streetAddress: cleanText(payload.serviceAddress?.streetAddress, 255),
      unit: cleanText(payload.serviceAddress?.unit, 120),
      city: cleanText(payload.serviceAddress?.city, 120),
      state: cleanText(payload.serviceAddress?.state, 80),
      postalCode: cleanText(payload.serviceAddress?.postalCode, 32),
      country: cleanText(payload.serviceAddress?.country, 80),
      placeId: cleanText(payload.serviceAddress?.placeId, 255),
      latitude: cleanNumber(payload.serviceAddress?.latitude),
      longitude: cleanNumber(payload.serviceAddress?.longitude),
    },
    requestedService: {
      serviceType: cleanText(payload.requestedService?.serviceType, 160),
      applianceType: cleanText(payload.requestedService?.applianceType, 160),
      brand: cleanText(payload.requestedService?.brand, 160),
      modelNumber: cleanText(payload.requestedService?.modelNumber, 160),
      serialNumber: cleanText(payload.requestedService?.serialNumber, 160),
      problemDescription,
    },
    requestedAppointment: {
      date: cleanText(payload.requestedAppointment?.date, 32),
      windowStartTime: cleanText(payload.requestedAppointment?.windowStartTime, 32),
      windowEndTime: cleanText(payload.requestedAppointment?.windowEndTime, 32),
      preferredWindow: cleanText(payload.requestedAppointment?.preferredWindow, 255),
      timezone: cleanText(payload.requestedAppointment?.timezone, 120),
    },
    message: {
      subject: cleanText(payload.message?.subject, 255),
      body: cleanText(payload.message?.body, 10_000) ?? problemDescription,
      summary: cleanText(payload.message?.summary, 2_000),
    },
    providerMetadata: {
      com06Endpoint: "public_website_inbound",
      formId: eventTypeResult.formId ?? null,
      submittedProviderMetadata: cleanJsonRecord(payload.providerMetadata) ?? {},
    },
  });

  const gatewayResult = await processUnifiedInboundEvent(event);
  if (!gatewayResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        message: "Inbound request could not be accepted.",
        code: gatewayResult.code,
      },
      { status: 422 },
    );
  }

  let persistenceResult;
  try {
    persistenceResult = await persistUnifiedInboundEvent(gatewayResult);
  } catch (error) {
    console.warn("Trusted website inbound persistence failed", {
      message: error instanceof Error ? error.message : "Unknown persistence error",
    });

    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        message: "Inbound request could not be persisted.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      persisted: true,
      duplicate: persistenceResult.duplicate,
      intakeRequestId: persistenceResult.intakeRequestId,
      conversationId: persistenceResult.conversationId,
      messageId: persistenceResult.messageId,
      timelineEventId: persistenceResult.timelineEventId,
      route: gatewayResult.route.route,
      shouldCreateJobDirectly: gatewayResult.route.shouldCreateJobDirectly,
      shouldCreateAppointmentDirectly:
        gatewayResult.route.shouldCreateAppointmentDirectly,
    },
    { status: persistenceResult.duplicate ? 200 : 201 },
  );
}
