const RETELL_REGISTER_PHONE_CALL_URL = "https://api.retellai.com/v2/register-phone-call";
const RETELL_SIP_HOST = "5t4n6j0wnrl.sip.livekit.cloud";

type RegisterRetellPhoneCallResult =
  | {
      ok: true;
      callId: string;
      sipUri: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
      retell?: Record<string, unknown> | null;
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

export async function registerRetellBridgeProofPhoneCall({
  fromNumber,
  inboundCallControlId,
  toNumber,
}: {
  fromNumber: string | null;
  inboundCallControlId: string;
  toNumber: string;
}): Promise<RegisterRetellPhoneCallResult> {
  const apiKey = getRetellApiKey();
  const agentId = getRetellHomeFixAgentId();

  if (!apiKey || !agentId) {
    return {
      ok: false,
      status: 503,
      message: "RETELL_API_KEY and RETELL_HOMEFIX_AGENT_ID must be configured.",
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
      to_number: toNumber,
      direction: "inbound",
      metadata: {
        proof: "comm-09c4-retell-leg",
        telnyx_inbound_call_control_id: inboundCallControlId,
        telnyx_test_number: toNumber,
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
  };
}
