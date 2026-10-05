import { createHash, randomUUID } from "node:crypto";

import {
  registerRetellBridgeProofPhoneCall,
  resolveRetellBridgeProofTransferContext,
} from "./retell-phone-call";

const TELNYX_CALLS_URL = "https://api.telnyx.com/v2/calls";
const ALLOWED_BUSINESS_NUMBERS = new Set(["+13464138813", "+13466461949"]);

type TelnyxBridgeProofResult = {
  ok: boolean;
  message: string;
  status: number;
  telnyx?: Record<string, unknown> | null;
};

export type TelnyxHumanHandoffResult = {
  ok: boolean;
  message: string;
  status: number;
  telnyx?: Record<string, unknown> | null;
};

type TelnyxCallControlPayload = {
  call_control_id?: unknown;
  call_leg_id?: unknown;
  call_session_id?: unknown;
  client_state?: unknown;
  connection_id?: unknown;
  direction?: unknown;
  from?: unknown;
  state?: unknown;
  to?: unknown;
};

type TelnyxWebhookPayload = {
  data?: {
    event_type?: unknown;
    id?: unknown;
    occurred_at?: unknown;
    payload?: TelnyxCallControlPayload & Record<string, unknown>;
  };
};

const dialedInboundCalls = new Set<string>();
const retellDialedInboundCalls = new Set<string>();
const transferRequestedSessions = new Set<string>();
const retellLegByRetellCallId = new Map<string, string>();
const retellLegByTransferSessionNonce = new Map<string, string>();
const retellCallByInboundCallControlId = new Map<string, string>();
const retellCallByOwnerCallControlId = new Map<string, string>();

function cleanString(value: unknown, maxLength = 500): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function deterministicCommandId(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function normalizePhone(value: unknown): string | null {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { phone_number?: unknown; phoneNumber?: unknown }).phone_number ??
        (value as { phone_number?: unknown; phoneNumber?: unknown }).phoneNumber
      : value;
  const raw = cleanString(candidate, 40);
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return raw.startsWith("+") && digits.length >= 8 ? `+${digits}` : null;
}

function decodeClientState(value: unknown): Record<string, unknown> | null {
  const raw = cleanString(value, 1_000);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getTelnyxApiKey(): string | null {
  return process.env.TELNYX_API_KEY?.trim().replace(/^Bearer\s+/i, "") || null;
}

function getTelnyxCallControlConnectionId(): string | null {
  return process.env.TELNYX_BRIDGE_PROOF_CONNECTION_ID?.trim() || null;
}

function getOwnerMobileNumber(): string | null {
  return normalizePhone(process.env.WRA_BRIDGE_PROOF_OWNER_PHONE);
}

function isAllowedBusinessNumber(value: string | null): value is string {
  return Boolean(value && ALLOWED_BUSINESS_NUMBERS.has(value));
}

function getBridgeProofTarget(): "retell_ai" | "owner_mobile" {
  return process.env.WRA_BRIDGE_PROOF_TARGET?.trim() === "owner_mobile"
    ? "owner_mobile"
    : "retell_ai";
}

function getPayload(payload: unknown): TelnyxCallControlPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as TelnyxWebhookPayload;
  const eventPayload = record.data?.payload;
  return eventPayload && typeof eventPayload === "object" && !Array.isArray(eventPayload)
    ? eventPayload
    : null;
}

function getEventType(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as TelnyxWebhookPayload;
  return cleanString(record.data?.event_type, 120);
}

async function sendTelnyxCommand({
  body,
  path,
}: {
  body: Record<string, unknown>;
  path: string;
}): Promise<TelnyxBridgeProofResult> {
  const apiKey = getTelnyxApiKey();
  if (!apiKey) {
    return { ok: false, status: 503, message: "TELNYX_API_KEY is not configured." };
  }

  const response = await fetch(`${TELNYX_CALLS_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    let errors: unknown = null;
    errors = payload?.errors ?? text.slice(0, 300);

    console.error("[telnyx-bridge-proof-command-error]", {
      path,
      status: response.status,
      errors,
    });

    return {
      ok: false,
      status: 502,
      message: "Telnyx bridge proof command failed.",
      telnyx: payload,
    };
  }

  return { ok: true, status: 200, message: "ok", telnyx: payload };
}

async function hangUpCall(callControlId: string): Promise<TelnyxBridgeProofResult> {
  return sendTelnyxCommand({
    path: `/${encodeURIComponent(callControlId)}/actions/hangup`,
    body: {
      command_id: deterministicCommandId(`comm-09c4-hangup:${callControlId}`),
    },
  });
}

async function answerInboundCall(callControlId: string): Promise<TelnyxBridgeProofResult> {
  return sendTelnyxCommand({
    path: `/${encodeURIComponent(callControlId)}/actions/answer`,
    body: {
      command_id: randomUUID(),
      client_state: Buffer.from(
        JSON.stringify({ proof: "comm-09c3", leg: "inbound" }),
      ).toString("base64"),
    },
  });
}

async function dialOwnerAndBridge({
  businessNumber,
  inboundCallControlId,
}: {
  businessNumber: string;
  inboundCallControlId: string;
}): Promise<TelnyxBridgeProofResult> {
  const connectionId = getTelnyxCallControlConnectionId();
  const ownerMobile = getOwnerMobileNumber();
  if (!connectionId || !ownerMobile) {
    return {
      ok: false,
      status: 503,
      message:
        "TELNYX_BRIDGE_PROOF_CONNECTION_ID and WRA_BRIDGE_PROOF_OWNER_PHONE must be configured.",
    };
  }

  return sendTelnyxCommand({
    path: "",
    body: {
      connection_id: connectionId,
      from: businessNumber,
      to: ownerMobile,
      link_to: inboundCallControlId,
      bridge_intent: true,
      bridge_on_answer: true,
      timeout_secs: 30,
      command_id: deterministicCommandId(`comm-09c3-owner-dial:${inboundCallControlId}`),
      client_state: Buffer.from(
        JSON.stringify({ proof: "comm-09c3", leg: "owner-mobile" }),
      ).toString("base64"),
    },
  });
}

async function dialOwnerAndBridgeForRetellHandoff({
  businessNumber,
  inboundCallControlId,
  transferSessionNonce,
}: {
  businessNumber: string;
  inboundCallControlId: string;
  transferSessionNonce: string;
}): Promise<TelnyxBridgeProofResult> {
  const connectionId = getTelnyxCallControlConnectionId();
  const ownerMobile = getOwnerMobileNumber();
  if (!connectionId || !ownerMobile) {
    return {
      ok: false,
      status: 503,
      message:
        "TELNYX_BRIDGE_PROOF_CONNECTION_ID and WRA_BRIDGE_PROOF_OWNER_PHONE must be configured.",
    };
  }

  return sendTelnyxCommand({
    path: "",
    body: {
      connection_id: connectionId,
      from: businessNumber,
      to: ownerMobile,
      link_to: inboundCallControlId,
      bridge_intent: true,
      bridge_on_answer: true,
      timeout_secs: 30,
      command_id: deterministicCommandId(`comm-09c4-owner-handoff:${inboundCallControlId}`),
      client_state: Buffer.from(
        JSON.stringify({
          proof: "comm-09c4",
          leg: "owner-mobile",
          transfer_session_nonce: transferSessionNonce,
        }),
      ).toString("base64"),
    },
  });
}

async function dialRetellAiAndBridge({
  businessNumber,
  from,
  inboundCallControlId,
}: {
  businessNumber: string;
  from: string | null;
  inboundCallControlId: string;
}): Promise<TelnyxBridgeProofResult> {
  const connectionId = getTelnyxCallControlConnectionId();
  if (!connectionId) {
    return {
      ok: false,
      status: 503,
      message: "TELNYX_BRIDGE_PROOF_CONNECTION_ID must be configured.",
    };
  }

  const retellCall = await registerRetellBridgeProofPhoneCall({
    businessNumber,
    fromNumber: from,
    inboundCallControlId,
  });

  if (!retellCall.ok) {
    console.error("[telnyx-bridge-proof-retell-register-error]", {
      status: retellCall.status,
      message: retellCall.message,
      retellErrors: retellCall.retell?.errors ?? null,
    });
    return {
      ok: false,
      status: retellCall.status,
      message: retellCall.message,
      telnyx: null,
    };
  }

  console.info("[telnyx-bridge-proof-retell-registered]", {
    inboundCallControlIdPresent: true,
    retellCallId: retellCall.callId,
  });

  retellCallByInboundCallControlId.set(inboundCallControlId, retellCall.callId);

  return sendTelnyxCommand({
    path: "",
    body: {
      connection_id: connectionId,
      from: businessNumber,
      to: retellCall.sipUri,
      link_to: inboundCallControlId,
      bridge_intent: true,
      bridge_on_answer: true,
      timeout_secs: 30,
      command_id: deterministicCommandId(`comm-09c4-retell-dial:${inboundCallControlId}`),
      client_state: Buffer.from(
        JSON.stringify({
          proof: "comm-09c4",
          leg: "retell-ai",
          retell_call_id: retellCall.callId,
          transfer_session_nonce: retellCall.transferSessionNonce,
        }),
      ).toString("base64"),
    },
  });
}

export async function requestRetellHumanHandoff({
  transferSessionId,
}: {
  transferSessionId: string;
}): Promise<TelnyxHumanHandoffResult> {
  const context = resolveRetellBridgeProofTransferContext(transferSessionId);
  if (!context.ok) {
    console.warn("[telnyx-bridge-proof-handoff-rejected]", {
      status: context.status,
      message: context.message,
    });
    return {
      ok: false,
      status: context.status,
      message: context.message,
      telnyx: null,
    };
  }

  if (!isAllowedBusinessNumber(context.businessNumber)) {
    return {
      ok: false,
      status: 403,
      message: "Human handoff is limited to approved HomeFixOS business numbers.",
    };
  }

  if (transferRequestedSessions.has(context.nonce)) {
    console.info("[telnyx-bridge-proof-handoff-duplicate-skipped]", {
      transferSessionNonce: context.nonce,
      inboundCallControlIdPresent: true,
    });
    return {
      ok: true,
      status: 200,
      message: "Human handoff already requested.",
    };
  }

  transferRequestedSessions.add(context.nonce);

  console.info("[telnyx-bridge-proof-handoff-requested]", {
    transferSessionNonce: context.nonce,
    inboundCallControlIdPresent: true,
    ownerDialAttempted: true,
  });

  const result = await dialOwnerAndBridgeForRetellHandoff({
    businessNumber: context.businessNumber,
    inboundCallControlId: context.inboundCallControlId,
    transferSessionNonce: context.nonce,
  });
  const responseData =
    result.telnyx && typeof result.telnyx.data === "object" && result.telnyx.data !== null
      ? (result.telnyx.data as Record<string, unknown>)
      : null;
  const ownerCallControlId = cleanString(responseData?.call_control_id, 300);
  if (ownerCallControlId) {
    retellCallByOwnerCallControlId.set(ownerCallControlId, context.nonce);
  }

  console.info("[telnyx-bridge-proof-handoff-result]", {
    ok: result.ok,
    status: result.status,
    transferSessionNonce: context.nonce,
    ownerCallControlIdPresent: Boolean(ownerCallControlId),
    ownerCallLegIdPresent: Boolean(responseData?.call_leg_id),
    ownerCallSessionIdPresent: Boolean(responseData?.call_session_id),
  });

  return result;
}

export async function handleTelnyxBridgeProofWebhook(
  payload: unknown,
): Promise<TelnyxBridgeProofResult> {
  const eventType = getEventType(payload);
  const eventPayload = getPayload(payload);
  const callControlId = cleanString(eventPayload?.call_control_id, 300);
  const direction = cleanString(eventPayload?.direction, 40);
  const to = normalizePhone(eventPayload?.to);
  const from = normalizePhone(eventPayload?.from);
  const clientState = decodeClientState(eventPayload?.client_state);

  if (!eventType || !eventPayload || !callControlId) {
    return { ok: true, status: 200, message: "Ignored non-call-control webhook." };
  }

  console.info("[telnyx-bridge-proof-event]", {
    eventType,
    direction,
    from,
    to,
    callControlIdPresent: true,
    clientStateProof:
      typeof clientState?.proof === "string" ? clientState.proof.slice(0, 40) : null,
    clientStateLeg: typeof clientState?.leg === "string" ? clientState.leg.slice(0, 40) : null,
  });

  if (clientState?.proof === "comm-09c4" && clientState?.leg === "retell-ai") {
    const retellCallId = cleanString(clientState.retell_call_id, 300);
    const transferSessionNonce = cleanString(clientState.transfer_session_nonce, 120);
    if (retellCallId) {
      retellLegByRetellCallId.set(retellCallId, callControlId);
    }
    if (transferSessionNonce) {
      retellLegByTransferSessionNonce.set(transferSessionNonce, callControlId);
    }
    if (retellCallId || transferSessionNonce) {
      console.info("[telnyx-bridge-proof-retell-leg-tracked]", {
        eventType,
        retellCallId: retellCallId ?? null,
        transferSessionNonce: transferSessionNonce ?? null,
        retellSipLegCallControlIdPresent: true,
      });
    }
  }

  if (clientState?.proof === "comm-09c4" && clientState?.leg === "owner-mobile") {
    const transferSessionNonce = cleanString(clientState.transfer_session_nonce, 120);
    if (transferSessionNonce) {
      retellCallByOwnerCallControlId.set(callControlId, transferSessionNonce);
    }

    if (eventType === "call.answered" && transferSessionNonce) {
      const retellLegCallControlId = retellLegByTransferSessionNonce.get(
        transferSessionNonce,
      );
      console.info("[telnyx-bridge-proof-owner-answered]", {
        transferSessionNonce,
        ownerCallControlIdPresent: true,
        retellSipLegKnown: Boolean(retellLegCallControlId),
      });

      if (retellLegCallControlId) {
        const hangupResult = await hangUpCall(retellLegCallControlId);
        console.info("[telnyx-bridge-proof-retell-leg-hangup-result]", {
          ok: hangupResult.ok,
          status: hangupResult.status,
          transferSessionNonce,
        });
      }
    }
  }

  const isInboundDirection = direction === "incoming" || direction === "inbound";
  const isAllowedInboundCall =
    isAllowedBusinessNumber(to) ||
    (clientState?.proof === "comm-09c3" && clientState?.leg === "inbound");

  if (eventType === "call.initiated" && isInboundDirection) {
    if (!isAllowedBusinessNumber(to)) {
      console.warn("[telnyx-bridge-proof-unexpected-number]", { to, from });
      return { ok: true, status: 200, message: "Ignored unsupported business number call." };
    }

    console.info("[telnyx-bridge-proof-inbound]", {
      from,
      to,
      callControlIdPresent: true,
    });
    return answerInboundCall(callControlId);
  }

  if (
    eventType === "call.answered" &&
    isAllowedInboundCall &&
    (isInboundDirection || isAllowedBusinessNumber(to))
  ) {
    if (!isAllowedBusinessNumber(to)) {
      console.warn("[telnyx-bridge-proof-answered-missing-business-number]", {
        eventType,
        to,
        from,
      });
      return { ok: true, status: 200, message: "Ignored answered call without business number." };
    }

    const target = getBridgeProofTarget();

    if (target === "retell_ai") {
      if (retellDialedInboundCalls.has(callControlId)) {
        console.info("[telnyx-bridge-proof-dial-retell-duplicate-skipped]", {
          eventType,
          inboundCallControlIdPresent: true,
        });
        return { ok: true, status: 200, message: "Retell AI dial already requested." };
      }

      retellDialedInboundCalls.add(callControlId);
      console.info("[telnyx-bridge-proof-dial-retell]", {
        eventType,
        acceptedAsProofInboundLeg:
          clientState?.proof === "comm-09c3" && clientState?.leg === "inbound",
        inboundCallControlIdPresent: true,
        dialRetellAttempted: true,
      });
      const result = await dialRetellAiAndBridge({
        businessNumber: to,
        from,
        inboundCallControlId: callControlId,
      });
      const responseData =
        result.telnyx && typeof result.telnyx.data === "object" && result.telnyx.data !== null
          ? (result.telnyx.data as Record<string, unknown>)
          : null;
      console.info("[telnyx-bridge-proof-dial-retell-result]", {
        ok: result.ok,
        status: result.status,
        retellSipLegCallControlIdPresent: Boolean(responseData?.call_control_id),
        retellSipLegCallLegIdPresent: Boolean(responseData?.call_leg_id),
        retellSipLegCallSessionIdPresent: Boolean(responseData?.call_session_id),
      });
      return result;
    }

    if (dialedInboundCalls.has(callControlId)) {
      console.info("[telnyx-bridge-proof-dial-owner-duplicate-skipped]", {
        eventType,
        inboundCallControlIdPresent: true,
      });
      return { ok: true, status: 200, message: "Owner dial already requested." };
    }

    dialedInboundCalls.add(callControlId);
    console.info("[telnyx-bridge-proof-dial-owner]", {
      eventType,
      acceptedAsProofInboundLeg: clientState?.proof === "comm-09c3" && clientState?.leg === "inbound",
      inboundCallControlIdPresent: true,
      dialOwnerAttempted: true,
    });
    const result = await dialOwnerAndBridge({
      businessNumber: to,
      inboundCallControlId: callControlId,
    });
    const responseData =
      result.telnyx && typeof result.telnyx.data === "object" && result.telnyx.data !== null
        ? (result.telnyx.data as Record<string, unknown>)
        : null;
    console.info("[telnyx-bridge-proof-dial-owner-result]", {
      ok: result.ok,
      status: result.status,
      outboundCallControlIdPresent: Boolean(responseData?.call_control_id),
      outboundCallLegIdPresent: Boolean(responseData?.call_leg_id),
      outboundCallSessionIdPresent: Boolean(responseData?.call_session_id),
    });
    return result;
  }

  return { ok: true, status: 200, message: "Webhook accepted." };
}
