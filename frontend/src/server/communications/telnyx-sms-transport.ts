import { createPublicKey, verify } from "node:crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  DatabaseCommunicationDeliveryStatus,
  Json,
  PublicSchema,
} from "@/lib/supabase/types";

import { resolveCommunicationPhoneIdentity } from "./phone-identity";

type ConversationRow = PublicSchema["Tables"]["communication_conversations"]["Row"];
type SourceAccountRow = PublicSchema["Tables"]["communication_source_accounts"]["Row"];

const TELNYX_MESSAGES_URL = "https://api.telnyx.com/v2/messages";
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

type TelnyxMessagePayload = {
  id?: unknown;
  direction?: unknown;
  from?: { phone_number?: unknown } | string | null;
  to?:
    | Array<({ phone_number?: unknown; status?: unknown } & Record<string, unknown>) | string>
    | ({ phone_number?: unknown; status?: unknown } & Record<string, unknown>)
    | string
    | null;
  text?: unknown;
  media?: unknown;
  received_at?: unknown;
  sent_at?: unknown;
  completed_at?: unknown;
  errors?: unknown;
};

type TelnyxWebhookPayload = {
  data?: {
    id?: unknown;
    event_type?: unknown;
    occurred_at?: unknown;
    payload?: TelnyxMessagePayload;
  };
};

type SendSmsResult =
  | { ok: true; messageId: string; providerMessageId: string | null }
  | { ok: false; status: number; message: string; messageId?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 2_000): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function getPhone(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeSmsPhone(value);
  }

  if (isRecord(value)) {
    return normalizeSmsPhone(value.phone_number);
  }

  return null;
}

function getToPhone(value: unknown): string | null {
  if (Array.isArray(value)) {
    return getPhone(value[0]);
  }

  return getPhone(value);
}

export function normalizeSmsPhone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return value.trim().startsWith("+") ? `+${digits}` : digits;
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
      national.length === 10 ? `1${national}` : null,
    ].filter((item): item is string => Boolean(item))),
  );
}

function getTelnyxApiKey(): string | null {
  return process.env.TELNYX_API_KEY?.trim() || null;
}

function getTelnyxWebhookPublicKey(): string | null {
  return process.env.TELNYX_WEBHOOK_PUBLIC_KEY?.trim() || null;
}

function rawEd25519PublicKeyFromString(value: string) {
  const clean = value.trim();
  const keyBytes = /^[0-9a-f]{64}$/i.test(clean)
    ? Buffer.from(clean, "hex")
    : Buffer.from(clean, "base64");

  if (keyBytes.length !== 32) {
    return null;
  }

  return createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      keyBytes,
    ]),
    format: "der",
    type: "spki",
  });
}

export function verifyTelnyxWebhookSignature({
  rawBody,
  signature,
  timestamp,
}: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): boolean {
  const publicKey = getTelnyxWebhookPublicKey();
  if (!publicKey || !signature || !timestamp) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_MAX_AGE_SECONDS) {
    return false;
  }

  const key = rawEd25519PublicKeyFromString(publicKey);
  if (!key) {
    return false;
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  if (signatureBytes.length === 0) {
    return false;
  }

  const signedPayload = Buffer.from(`${timestamp}|${rawBody}`, "utf8");
  return verify(null, signedPayload, key, signatureBytes);
}

async function findInboundSmsSourceAccount(toPhone: string): Promise<SourceAccountRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const identifiers = phoneVariants(toPhone);
  if (identifiers.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("communication_source_accounts")
    .select("*")
    .eq("provider_name", "telnyx")
    .eq("is_active", true)
    .eq("supports_inbound_sms", true)
    .in("source_identifier", identifiers)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[telnyx-sms-source-account-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return (data ?? null) as SourceAccountRow | null;
}

async function findOutboundSmsSourceAccount(
  conversation: ConversationRow,
): Promise<SourceAccountRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase || !conversation.company_id) {
    return null;
  }

  if (conversation.source_account_id) {
    const { data, error } = await supabase
      .from("communication_source_accounts")
      .select("*")
      .eq("id", conversation.source_account_id)
      .eq("company_id", conversation.company_id)
      .eq("provider_name", "telnyx")
      .eq("is_active", true)
      .eq("supports_outbound_sms", true)
      .maybeSingle();

    if (error) {
      console.error("[telnyx-sms-source-account-error]", {
        message: error.message,
        code: error.code,
      });
    }

    if (data) {
      return data as SourceAccountRow;
    }
  }

  const { data, error } = await supabase
    .from("communication_source_accounts")
    .select("*")
    .eq("company_id", conversation.company_id)
    .eq("provider_name", "telnyx")
    .eq("is_active", true)
    .eq("supports_outbound_sms", true)
    .eq("is_default_outbound_sms", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[telnyx-sms-source-account-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return (data ?? null) as SourceAccountRow | null;
}

async function findSmsConversation({
  account,
  externalPhone,
  customerId,
}: {
  account: SourceAccountRow;
  externalPhone: string;
  customerId: string | null;
}): Promise<ConversationRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from("communication_conversations")
    .select("*")
    .eq("company_id", account.company_id)
    .eq("source_account_id", account.id)
    .eq("primary_source_type", "sms")
    .eq("customer_phone", externalPhone)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1);

  query = customerId ? query.eq("customer_id", customerId) : query.is("customer_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[telnyx-sms-conversation-lookup-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return (data ?? null) as ConversationRow | null;
}

async function createSmsConversation({
  account,
  externalPhone,
  body,
  occurredAt,
}: {
  account: SourceAccountRow;
  externalPhone: string;
  body: string | null;
  occurredAt: string;
}): Promise<ConversationRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const identity = await resolveCommunicationPhoneIdentity({
    companyId: account.company_id,
    phone: externalPhone,
  });

  const customerId = identity.identityType === "customer" ? identity.customerId : null;
  const existing = await findSmsConversation({ account, externalPhone, customerId });
  if (existing) {
    return existing;
  }

  const providerMetadata = {
    phone_identity: {
      type: identity.identityType,
      customer_id: identity.customerId,
      lead_id: identity.leadId,
      canonical_phone: identity.canonicalPhone,
    },
  } satisfies Record<string, Json>;

  const { data, error } = await supabase
    .from("communication_conversations")
    .insert({
      company_id: account.company_id,
      source_account_id: account.id,
      provider_name: "telnyx",
      primary_source_type: "sms",
      status: "needs_action",
      customer_id: customerId,
      customer_display_name: identity.displayName ?? externalPhone,
      customer_phone: externalPhone,
      customer_email: identity.email,
      summary: body,
      next_action: "Review and respond to the SMS.",
      last_event_at: occurredAt,
      provider_metadata: providerMetadata,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[telnyx-sms-conversation-create-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return data as ConversationRow;
}

function getEventType(payload: TelnyxWebhookPayload): string | null {
  return cleanText(payload.data?.event_type, 120);
}

function getProviderMessageId(payload: TelnyxWebhookPayload): string | null {
  return cleanText(payload.data?.payload?.id, 160) ?? cleanText(payload.data?.id, 160);
}

function getOccurredAt(payload: TelnyxWebhookPayload): string {
  const text =
    cleanText(payload.data?.occurred_at, 64) ??
    cleanText(payload.data?.payload?.received_at, 64) ??
    cleanText(payload.data?.payload?.sent_at, 64) ??
    cleanText(payload.data?.payload?.completed_at, 64);
  const date = text ? new Date(text) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hasMedia(payload: TelnyxMessagePayload | undefined): boolean {
  const media = payload?.media;
  return Array.isArray(media) ? media.length > 0 : Boolean(media);
}

function formatTelnyxFailure(payload: TelnyxWebhookPayload): string | null {
  const errors = payload.data?.payload?.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }

  const first = errors[0];
  if (!isRecord(first)) {
    return "Telnyx reported message delivery failure.";
  }

  const code = cleanText(first.code, 80);
  const title = cleanText(first.title, 160);
  const detail = cleanText(first.detail, 300);

  return [code, title, detail].filter(Boolean).join(" — ") ||
    "Telnyx reported message delivery failure.";
}

function getFinalRecipientStatus(payload: TelnyxWebhookPayload): string | null {
  const recipients = payload.data?.payload?.to;
  const firstRecipient = Array.isArray(recipients) ? recipients[0] : recipients;

  if (isRecord(firstRecipient)) {
    return cleanText(firstRecipient.status, 120)?.toLowerCase() ?? null;
  }

  return null;
}

function hasTelnyxErrors(payload: TelnyxWebhookPayload): boolean {
  const errors = payload.data?.payload?.errors;
  return Array.isArray(errors) && errors.length > 0;
}

function resolveTelnyxDeliveryStatus(
  eventType: string,
  payload: TelnyxWebhookPayload,
): DatabaseCommunicationDeliveryStatus {
  if (eventType === "message.sent") {
    return "sent";
  }

  if (eventType === "message.failed") {
    return "failed";
  }

  if (eventType === "message.delivered") {
    return "delivered";
  }

  const recipientStatus = getFinalRecipientStatus(payload);
  if (
    hasTelnyxErrors(payload) ||
    recipientStatus === "delivery_failed" ||
    recipientStatus === "failed"
  ) {
    return "failed";
  }

  if (
    recipientStatus === "delivered" ||
    recipientStatus === "delivery_delivered"
  ) {
    return "delivered";
  }

  return "sent";
}

export async function handleTelnyxMessagingWebhook(payload: unknown) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Supabase service role is not configured." };
  }

  const telnyxPayload = payload as TelnyxWebhookPayload;
  const eventType = getEventType(telnyxPayload);
  const providerMessageId = getProviderMessageId(telnyxPayload);

  if (!eventType || !providerMessageId) {
    return { ok: false, status: 400, message: "Unsupported Telnyx messaging event." };
  }

  if (eventType === "message.received") {
    const messagePayload = telnyxPayload.data?.payload;
    const fromPhone = getPhone(messagePayload?.from);
    const toPhone = getToPhone(messagePayload?.to);
    const body = cleanText(messagePayload?.text, 4_000);
    const occurredAt = getOccurredAt(telnyxPayload);

    if (!fromPhone || !toPhone) {
      return { ok: false, status: 400, message: "Telnyx SMS payload is missing phone numbers." };
    }

    const account = await findInboundSmsSourceAccount(toPhone);
    if (!account) {
      return { ok: true, status: 202, message: "No active WRA SMS source account matched this number." };
    }

    const conversation = await createSmsConversation({
      account,
      externalPhone: fromPhone,
      body,
      occurredAt,
    });
    if (!conversation) {
      return { ok: false, status: 503, message: "Unable to create or reuse SMS conversation." };
    }

    const externalMessageId = `telnyx:${providerMessageId}`;
    const { data: existingMessage, error: existingError } = await supabase
      .from("communication_messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("external_message_id", externalMessageId)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("[telnyx-sms-message-lookup-error]", {
        message: existingError.message,
        code: existingError.code,
      });
      return { ok: false, status: 503, message: "Unable to check SMS idempotency." };
    }

    if (!existingMessage) {
      const messageBody = hasMedia(messagePayload)
        ? [body, "[Unsupported MMS media received. Media storage is not enabled yet.]"]
            .filter(Boolean)
            .join("\n")
        : body;

      const { error: insertError } = await supabase.from("communication_messages").insert({
        conversation_id: conversation.id,
        source_type: "sms",
        direction: "inbound",
        sender_role: "customer",
        sender_display_name: conversation.customer_display_name ?? fromPhone,
        body: messageBody,
        external_message_id: externalMessageId,
        provider_message_id: providerMessageId,
        delivery_status: "delivered",
        occurred_at: occurredAt,
      });

      if (insertError && insertError.code !== "23505") {
        console.error("[telnyx-sms-message-insert-error]", {
          message: insertError.message,
          code: insertError.code,
        });
        return { ok: false, status: 503, message: "Unable to persist inbound SMS." };
      }

      await supabase.rpc("apply_communication_inbound_state_rpc", {
        p_conversation_id: conversation.id,
        p_occurred_at: occurredAt,
      });
    }

    return { ok: true, status: 200, message: "Telnyx inbound SMS accepted." };
  }

  if (
    eventType === "message.sent" ||
    eventType === "message.delivered" ||
    eventType === "message.finalized" ||
    eventType === "message.failed"
  ) {
    const status = resolveTelnyxDeliveryStatus(eventType, telnyxPayload);
    const occurredAt = getOccurredAt(telnyxPayload);
    const failureReason = status === "failed" ? formatTelnyxFailure(telnyxPayload) : null;

    const update =
      status === "delivered"
        ? { delivery_status: status, delivered_at: occurredAt, failure_reason: null }
        : status === "failed"
          ? { delivery_status: status, failed_at: occurredAt, failure_reason: failureReason }
          : { delivery_status: status, sent_at: occurredAt };

    const { error } = await supabase
      .from("communication_messages")
      .update(update)
      .eq("provider_message_id", providerMessageId)
      .neq("delivery_status", "delivered");

    if (error) {
      console.error("[telnyx-sms-delivery-update-error]", {
        message: error.message,
        code: error.code,
      });
      return { ok: false, status: 503, message: "Unable to update SMS delivery state." };
    }

    return { ok: true, status: 200, message: "Telnyx SMS delivery event accepted." };
  }

  return { ok: true, status: 202, message: "Telnyx messaging event ignored." };
}

export async function sendConversationSms({
  conversationId,
  body,
}: {
  conversationId: string;
  body: string;
}): Promise<SendSmsResult> {
  const supabase = getSupabaseServiceRoleClient();
  const apiKey = getTelnyxApiKey();
  if (!supabase) {
    return { ok: false, status: 503, message: "Supabase service role is not configured." };
  }
  if (!apiKey) {
    return { ok: false, status: 503, message: "Telnyx SMS API credentials are not configured." };
  }

  const { data: conversationData, error: conversationError } = await supabase
    .from("communication_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversationData) {
    return { ok: false, status: 404, message: "Conversation is not available for SMS." };
  }

  const conversation = conversationData as ConversationRow;
  const toPhone = normalizeSmsPhone(conversation.customer_phone);
  if (!toPhone) {
    return { ok: false, status: 400, message: "Conversation does not have a valid recipient phone." };
  }

  const sourceAccount = await findOutboundSmsSourceAccount(conversation);
  const fromPhone = normalizeSmsPhone(sourceAccount?.source_identifier ?? null);
  if (!sourceAccount || !fromPhone) {
    return { ok: false, status: 400, message: "No active outbound SMS source is configured for this company." };
  }

  const now = new Date().toISOString();
  const { data: messageData, error: messageError } = await supabase
    .from("communication_messages")
    .insert({
      conversation_id: conversation.id,
      source_type: "sms",
      direction: "outbound",
      sender_role: "dispatcher",
      body,
      delivery_status: "pending",
      occurred_at: now,
    })
    .select("id")
    .single();

  if (messageError || !messageData) {
    return { ok: false, status: 503, message: "Unable to create outbound SMS message." };
  }

  const messageId = messageData.id;

  const response = await fetch(TELNYX_MESSAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromPhone,
      to: toPhone,
      text: body,
    }),
  });

  const responseBody = (await response.json().catch(() => null)) as
    | { data?: { id?: unknown } }
    | null;
  const providerMessageId = cleanText(responseBody?.data?.id, 160);

  if (!response.ok || !providerMessageId) {
    const failureReason = `Telnyx rejected SMS send with HTTP ${response.status}.`;
    await supabase
      .from("communication_messages")
      .update({
        delivery_status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: failureReason,
      })
      .eq("id", messageId);

    return { ok: false, status: 502, message: "Telnyx rejected the SMS.", messageId };
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("communication_messages")
    .update({
      delivery_status: "sent",
      provider_message_id: providerMessageId,
      sent_at: sentAt,
    })
    .eq("id", messageId);

  await supabase.rpc("apply_communication_outbound_state_rpc", {
    p_conversation_id: conversation.id,
    p_occurred_at: sentAt,
  });

  return { ok: true, messageId, providerMessageId };
}
