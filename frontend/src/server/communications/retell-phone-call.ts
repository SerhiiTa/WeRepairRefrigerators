import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const RETELL_REGISTER_PHONE_CALL_URL = "https://api.retellai.com/v2/register-phone-call";
const RETELL_SIP_HOST = "5t4n6j0wnrl.sip.livekit.cloud";
const TRANSFER_SESSION_VERSION = 1;

type RegisterRetellPhoneCallResult =
  | {
      ok: true;
      callId: string;
      sipUri: string;
      transferSessionId: string;
      transferSessionNonce: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
      retell?: Record<string, unknown> | null;
    };

type RetellBridgeProofTransferContextResult =
  | {
      ok: true;
      inboundCallControlId: string;
      businessNumber: string;
      callerNumber: string | null;
      nonce: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

function cleanString(value: unknown, maxLength = 500): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function getRetellApiKey(): string | null {
  return process.env.RETELL_API_KEY?.trim().replace(/^Bearer\s+/i, "") || null;
}

function getRetellHomeFixAgentId(): string | null {
  return process.env.RETELL_HOMEFIX_AGENT_ID?.trim() || null;
}

function getTransferSigningSecret(): string | null {
  return process.env.WRA_BRIDGE_PROOF_TRANSFER_TOKEN?.trim() || null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function signTransferPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createTransferSession({
  businessNumber,
  callerNumber,
  inboundCallControlId,
}: {
  businessNumber: string;
  callerNumber: string | null;
  inboundCallControlId: string;
}): { transferSessionId: string; nonce: string } | null {
  const secret = getTransferSigningSecret();
  if (!secret) {
    return null;
  }

  const nonce = randomUUID();
  const payload = base64UrlEncode(
    JSON.stringify({
      v: TRANSFER_SESSION_VERSION,
      proof: "comm-09c4-retell-handoff",
      business_number: businessNumber,
      caller_number: callerNumber,
      inbound_call_control_id: inboundCallControlId,
      nonce,
    }),
  );
  const signature = signTransferPayload(payload, secret);

  return {
    transferSessionId: `${payload}.${signature}`,
    nonce,
  };
}

export async function registerRetellBridgeProofPhoneCall({
  fromNumber,
  businessNumber,
  inboundCallControlId,
}: {
  fromNumber: string | null;
  businessNumber: string;
  inboundCallControlId: string;
}): Promise<RegisterRetellPhoneCallResult> {
  const apiKey = getRetellApiKey();
  const agentId = getRetellHomeFixAgentId();
  const transferSession = createTransferSession({
    businessNumber,
    callerNumber: fromNumber,
    inboundCallControlId,
  });

  if (!apiKey || !agentId || !transferSession) {
    return {
      ok: false,
      status: 503,
      message:
        "RETELL_API_KEY, RETELL_HOMEFIX_AGENT_ID, and WRA_BRIDGE_PROOF_TRANSFER_TOKEN must be configured.",
    };
  }

  const response = await fetch(RETELL_REGISTER_PHONE_CALL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      from_number: fromNumber ?? "unknown",
      to_number: businessNumber,
      direction: "inbound",
      metadata: {
        proof: "comm-09c4-retell-leg",
        telnyx_business_number: businessNumber,
        telnyx_inbound_call_control_id: inboundCallControlId,
        wra_transfer_session_id: transferSession.transferSessionId,
        wra_transfer_session_nonce: transferSession.nonce,
      },
      retell_llm_dynamic_variables: {
        wra_transfer_session_id: transferSession.transferSessionId,
      },
    }),
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
    return {
      ok: false,
      status: 502,
      message: "Retell phone call registration failed.",
      retell: payload,
    };
  }

  const callId = cleanString(payload?.call_id, 300);
  if (!callId) {
    return {
      ok: false,
      status: 502,
      message: "Retell phone call registration did not return a call_id.",
      retell: payload,
    };
  }

  return {
    ok: true,
    callId,
    sipUri: `sip:${callId}@${RETELL_SIP_HOST}`,
    transferSessionId: transferSession.transferSessionId,
    transferSessionNonce: transferSession.nonce,
  };
}

export function resolveRetellBridgeProofTransferContext(
  transferSessionId: string,
): RetellBridgeProofTransferContextResult {
  const secret = getTransferSigningSecret();
  const cleanedSessionId = cleanString(transferSessionId, 2_500);
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: "WRA_BRIDGE_PROOF_TRANSFER_TOKEN must be configured.",
    };
  }

  if (!cleanedSessionId) {
    return {
      ok: false,
      status: 400,
      message: "Transfer session id is required.",
    };
  }

  const [payload, suppliedSignature] = cleanedSessionId.split(".");
  if (!payload || !suppliedSignature) {
    return {
      ok: false,
      status: 403,
      message: "Transfer session id is malformed.",
    };
  }

  const expectedSignature = signTransferPayload(payload, secret);
  if (!safeEqualText(suppliedSignature, expectedSignature)) {
    return {
      ok: false,
      status: 403,
      message: "Transfer session id is invalid.",
    };
  }

  const decoded = base64UrlDecode(payload);
  if (!decoded) {
    return {
      ok: false,
      status: 403,
      message: "Transfer session payload is invalid.",
    };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  const proof = cleanString(parsed?.proof, 80);
  const version = typeof parsed?.v === "number" ? parsed.v : null;
  const businessNumber = cleanString(parsed?.business_number, 40);
  const callerNumber = cleanString(parsed?.caller_number, 40);
  const inboundCallControlId = cleanString(parsed?.inbound_call_control_id, 300);
  const nonce = cleanString(parsed?.nonce, 120);

  if (
    version !== TRANSFER_SESSION_VERSION ||
    proof !== "comm-09c4-retell-handoff" ||
    !businessNumber ||
    !inboundCallControlId ||
    !nonce
  ) {
    return {
      ok: false,
      status: 403,
      message: "Transfer session payload is not a verified COMM-09C.4 handoff.",
    };
  }

  return {
    ok: true,
    businessNumber,
    callerNumber,
    inboundCallControlId,
    nonce,
  };
}
