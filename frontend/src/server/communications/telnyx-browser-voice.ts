import { randomUUID } from "node:crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json, PublicSchema } from "@/lib/supabase/types";

import { resolveCommunicationPhoneIdentity } from "./phone-identity";
import { normalizeSmsPhone } from "./telnyx-sms-transport";

type SourceAccountRow = PublicSchema["Tables"]["communication_source_accounts"]["Row"];
type ConversationRow = PublicSchema["Tables"]["communication_conversations"]["Row"];
type CallRow = PublicSchema["Tables"]["communication_calls"]["Row"];
type CallUpdate = PublicSchema["Tables"]["communication_calls"]["Update"];

type BrowserCallSessionResult =
  | {
      ok: true;
      callId: string;
      conversationId: string;
      telnyxToken: string;
      callerNumber: string;
      destinationNumber: string;
      customerDisplayName: string | null;
      sourceAccountId: string;
    }
  | { ok: false; status: number; message: string };

function getTelnyxApiKey(): string | null {
  return process.env.TELNYX_API_KEY?.trim().replace(/^Bearer\s+/i, "") || null;
}

function getTelnyxWebrtcCredentialId(): string | null {
  return process.env.TELNYX_WEBRTC_CREDENTIAL_ID?.trim() || null;
}

function sanitizeProviderMetadata(value: Record<string, unknown>): Record<string, Json> {
  return JSON.parse(JSON.stringify(value)) as Record<string, Json>;
}

function metadataRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasSavedRecording(metadata: Record<string, unknown>): boolean {
  const recording = metadataRecord(metadata.recording as Json | null | undefined);
  return Boolean(recording.recording_id || recording.saved_at || recording.status === "saved");
}

function phoneVariants(phone: string | null): string[] {
  if (!phone) {
    return [];
  }

  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  return Array.from(
    new Set([
      phone,
      digits,
      national,
      `+${digits}`,
      national.length === 10 ? `+1${national}` : null,
      national.length === 10
        ? `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
        : null,
    ].filter((value): value is string => Boolean(value))),
  );
}

async function mintTelnyxWebrtcToken(): Promise<
  | { ok: true; token: string }
  | { ok: false; status: number; message: string }
> {
  const apiKey = getTelnyxApiKey();
  const credentialId = getTelnyxWebrtcCredentialId();

  if (!apiKey || !credentialId) {
    return {
      ok: false,
      status: 503,
      message:
        "Telnyx browser calling is not configured. Set TELNYX_API_KEY and TELNYX_WEBRTC_CREDENTIAL_ID.",
    };
  }

  const response = await fetch(
    `https://api.telnyx.com/v2/telephony_credentials/${encodeURIComponent(
      credentialId,
    )}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/plain",
      },
      cache: "no-store",
    },
  );

  const responseBody = await response.text();
  let payload: { data?: { token?: unknown; expires_at?: unknown }; errors?: unknown } | null =
    null;
  try {
    payload = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    payload = null;
  }
  const jsonToken = typeof payload?.data?.token === "string" ? payload.data.token : null;
  const textToken = responseBody.trim().includes(".") ? responseBody.trim() : null;
  const token = jsonToken ?? textToken;

  if (!response.ok || !token) {
    const errors = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => {
          if (!error || typeof error !== "object") {
            return { detail: String(error) };
          }

          const record = error as {
            code?: unknown;
            detail?: unknown;
            title?: unknown;
          };

          return {
            code: typeof record.code === "string" ? record.code : null,
            title: typeof record.title === "string" ? record.title : null,
            detail: typeof record.detail === "string" ? record.detail : null,
          };
        })
      : null;
    console.error("[telnyx-browser-voice-token-error]", {
      status: response.status,
      contentType: response.headers.get("content-type"),
      errors,
    });

    return {
      ok: false,
      status: 502,
      message: "Telnyx did not issue a browser calling token.",
    };
  }

  return { ok: true, token };
}

async function findOutboundVoiceSourceAccount(companyId: string): Promise<SourceAccountRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("communication_source_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("provider_name", "telnyx")
    .eq("source_type", "phone")
    .eq("is_active", true)
    .eq("supports_outbound_voice", true)
    .order("is_default_outbound_voice", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[telnyx-browser-voice-source-account-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return (data ?? null) as SourceAccountRow | null;
}

async function findOrCreatePhoneConversation({
  account,
  customerId,
  customerDisplayName,
  destinationNumber,
}: {
  account: SourceAccountRow;
  customerId: string | null;
  customerDisplayName: string | null;
  destinationNumber: string;
}): Promise<ConversationRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const variants = phoneVariants(destinationNumber);
  let query = supabase
    .from("communication_conversations")
    .select("*")
    .eq("company_id", account.company_id)
    .eq("primary_source_type", "phone")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1);

  query = customerId ? query.eq("customer_id", customerId) : query.in("customer_phone", variants);

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) {
    console.error("[telnyx-browser-voice-conversation-lookup-error]", {
      message: existingError.message,
      code: existingError.code,
    });
    return null;
  }

  if (existing) {
    return existing as ConversationRow;
  }

  const identity = await resolveCommunicationPhoneIdentity({
    companyId: account.company_id,
    phone: destinationNumber,
  });
  const resolvedCustomerId = customerId ?? (identity.identityType === "customer" ? identity.customerId : null);
  const displayName = customerDisplayName ?? identity.displayName ?? destinationNumber;

  const { data, error } = await supabase
    .from("communication_conversations")
    .insert({
      company_id: account.company_id,
      source_account_id: account.id,
      provider_name: "telnyx",
      primary_source_type: "phone",
      status: "open",
      customer_id: resolvedCustomerId,
      customer_display_name: displayName,
      customer_phone: destinationNumber,
      customer_email: identity.email,
      summary: "Outbound browser call started from WRA.",
      next_action: "Review outbound call outcome.",
      last_event_at: new Date().toISOString(),
      provider_metadata: sanitizeProviderMetadata({
        phone_identity: {
          type: identity.identityType,
          customer_id: identity.customerId,
          lead_id: identity.leadId,
          canonical_phone: identity.canonicalPhone,
        },
        browser_voice: true,
      }),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[telnyx-browser-voice-conversation-create-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return data as ConversationRow;
}

export async function createBrowserCallSession({
  companyId,
  conversationId,
  customerId,
  customerDisplayName,
  destinationPhone,
}: {
  companyId: string;
  conversationId?: string | null;
  customerId: string | null;
  customerDisplayName: string | null;
  destinationPhone: string;
}): Promise<BrowserCallSessionResult> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Server Supabase is not configured." };
  }

  const destinationNumber = normalizeSmsPhone(destinationPhone);
  if (!destinationNumber) {
    return { ok: false, status: 400, message: "Customer phone number is not callable." };
  }

  const account = await findOutboundVoiceSourceAccount(companyId);
  if (!account) {
    return {
      ok: false,
      status: 503,
      message:
        "No active Telnyx outbound Voice source account is configured for this company.",
    };
  }

  const callerNumber = normalizeSmsPhone(account.source_identifier);
  if (!callerNumber) {
    return {
      ok: false,
      status: 503,
      message: "The configured outbound Voice source account has an invalid caller ID.",
    };
  }

  const tokenResult = await mintTelnyxWebrtcToken();
  if (!tokenResult.ok) {
    return tokenResult;
  }

  let conversation: ConversationRow | null = null;
  if (conversationId) {
    const { data: existingConversation, error: conversationError } = await supabase
      .from("communication_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("company_id", account.company_id)
      .maybeSingle();

    if (conversationError) {
      console.error("[telnyx-browser-voice-conversation-lookup-error]", {
        message: conversationError.message,
        code: conversationError.code,
      });
      return {
        ok: false,
        status: 503,
        message: "Unable to reuse the selected Communications conversation for this call.",
      };
    }

    conversation = (existingConversation ?? null) as ConversationRow | null;
  }

  conversation ??= await findOrCreatePhoneConversation({
    account,
    customerId,
    customerDisplayName,
    destinationNumber,
  });
  if (!conversation) {
    return {
      ok: false,
      status: 503,
      message: "Unable to create or reuse a Communications conversation for this call.",
    };
  }

  const providerCallId = `browser-pending-${randomUUID()}`;
  const now = new Date().toISOString();
  const { data: call, error: callError } = await supabase
    .from("communication_calls")
    .insert({
      company_id: account.company_id,
      conversation_id: conversation.id,
      source_account_id: account.id,
      provider_name: "telnyx",
      provider_call_id: providerCallId,
      direction: "outbound",
      from_phone: callerNumber,
      to_phone: destinationNumber,
      status: "initiating",
      started_at: now,
      provider_metadata: sanitizeProviderMetadata({
        browser_voice: true,
        provider_call_id_pending: true,
      }),
    })
    .select("*")
    .single();

  if (callError || !call) {
    console.error("[telnyx-browser-voice-call-create-error]", {
      message: callError?.message ?? null,
      code: callError?.code ?? null,
    });
    return { ok: false, status: 503, message: "Unable to create outbound call record." };
  }

  await supabase
    .from("communication_conversations")
    .update({
      status: "open",
      last_event_at: now,
      last_outbound_at: now,
      summary: "Outbound browser call started from WRA.",
      next_action: "Review outbound call outcome.",
    })
    .eq("id", conversation.id);

  return {
    ok: true,
    callId: (call as CallRow).id,
    conversationId: conversation.id,
    telnyxToken: tokenResult.token,
    callerNumber,
    destinationNumber,
    customerDisplayName: conversation.customer_display_name,
    sourceAccountId: account.id,
  };
}

export async function updateBrowserCallLifecycle({
  callId,
  status,
  providerCallId,
  telnyxCallControlId,
  telnyxCallLegId,
  telnyxSessionId,
  startedAt,
  answeredAt,
  endedAt,
  endReason,
}: {
  callId: string;
  status: string;
  providerCallId?: string | null;
  telnyxCallControlId?: string | null;
  telnyxCallLegId?: string | null;
  telnyxSessionId?: string | null;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  endReason?: string | null;
}) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Server Supabase is not configured." };
  }

  const { data: current } = await supabase
    .from("communication_calls")
    .select("provider_call_id,status,started_at,answered_at,ended_at,provider_metadata")
    .eq("id", callId)
    .maybeSingle();

  const currentMetadata = metadataRecord(current?.provider_metadata as Json | null | undefined);
  const currentStatus = typeof current?.status === "string" ? current.status : null;
  const terminalStatuses = new Set(["canceled", "ended", "failed"]);
  if (currentStatus && terminalStatuses.has(currentStatus) && !terminalStatuses.has(status)) {
    return { ok: true };
  }
  if ((currentStatus === "ended" || currentStatus === "canceled") && status === "failed") {
    return { ok: true };
  }

  const currentProviderCallId = cleanString(current?.provider_call_id);
  const currentAnsweredAt = cleanString(current?.answered_at);
  const currentEndedAt = cleanString(current?.ended_at);
  const currentHasSavedRecording = hasSavedRecording(currentMetadata);
  const isLateFailureForEstablishedCall =
    status === "failed" && (currentAnsweredAt || currentHasSavedRecording);
  if (isLateFailureForEstablishedCall) {
    return { ok: true };
  }

  const previousRecording = metadataRecord(currentMetadata.recording as Json | null | undefined);
  const previousTelnyx = metadataRecord(currentMetadata.telnyx as Json | null | undefined);
  const callControlId = telnyxCallControlId ?? null;
  const candidateProviderIdentity = callControlId ?? providerCallId ?? null;
  const providerIdentity =
    callControlId ??
    (candidateProviderIdentity?.startsWith("v3:") ? candidateProviderIdentity : null) ??
    (currentProviderCallId?.startsWith("v3:") ? currentProviderCallId : null);

  const patch: CallUpdate = {
    status,
    provider_metadata: sanitizeProviderMetadata({
      ...currentMetadata,
      browser_voice: true,
      latest_browser_status: status,
      recording: previousRecording,
      telnyx: {
        ...previousTelnyx,
        call_control_id: callControlId ?? previousTelnyx.call_control_id ?? null,
        call_leg_id: telnyxCallLegId ?? previousTelnyx.call_leg_id ?? null,
        call_session_id: telnyxSessionId ?? previousTelnyx.call_session_id ?? null,
      },
    }),
  };

  if (providerIdentity) {
    patch.provider_call_id = providerIdentity;
  }
  if (startedAt) {
    patch.started_at = startedAt;
  }
  if (answeredAt) {
    patch.answered_at = answeredAt;
  }
  if (endedAt && !currentEndedAt) {
    patch.ended_at = endedAt;
  }
  if (endReason && !currentEndedAt) {
    patch.end_reason = endReason;
  }

  const started = startedAt ?? current?.started_at ?? null;
  const ended = (!currentEndedAt ? endedAt : null) ?? current?.ended_at ?? null;
  if (started && ended) {
    const startedMs = Date.parse(started);
    const endedMs = Date.parse(ended);
    if (!Number.isNaN(startedMs) && !Number.isNaN(endedMs) && endedMs >= startedMs) {
      patch.duration_seconds = Math.round((endedMs - startedMs) / 1000);
    }
  }

  const { error } = await supabase
    .from("communication_calls")
    .update(patch)
    .eq("id", callId);

  if (error) {
    console.error("[telnyx-browser-voice-call-update-error]", {
      message: error.message,
      code: error.code,
    });
    return { ok: false, status: 503, message: "Unable to update outbound call record." };
  }

  return { ok: true };
}
