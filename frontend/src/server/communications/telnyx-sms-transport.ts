import { createPublicKey, randomUUID, verify } from "node:crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  DatabaseCommunicationDeliveryStatus,
  Json,
  PublicSchema,
} from "@/lib/supabase/types";

import { resolveCommunicationPhoneIdentity } from "./phone-identity";

type ConversationRow = PublicSchema["Tables"]["communication_conversations"]["Row"];
type CommunicationCallRow = PublicSchema["Tables"]["communication_calls"]["Row"];
type SourceAccountRow = PublicSchema["Tables"]["communication_source_accounts"]["Row"];
type SupportedMmsMimeType = "image/jpeg" | "image/png" | "image/webp";

const TELNYX_MESSAGES_URL = "https://api.telnyx.com/v2/messages";
const TELNYX_RECORDINGS_URL = "https://api.telnyx.com/v2/recordings";
const TELNYX_TRANSCRIPTIONS_URL = "https://api.telnyx.com/v2/ai/audio/transcriptions";
const TELNYX_RECORDED_AUDIO_TRANSCRIPTION_MODEL = "openai/whisper-large-v3-turbo";
const TELNYX_RECORDED_AUDIO_TRANSCRIPTION_ATTEMPTS = 3;
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const COMMUNICATIONS_MEDIA_BUCKET = "communications-media";
const MAX_MMS_ATTACHMENTS = 5;
const MAX_MMS_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const SUPPORTED_MMS_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TELNYX_MEDIA_HOSTS = new Set([
  "tlnx-mms-media.s3.us-east-1.amazonaws.com",
]);

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
  media_urls?: unknown;
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
    payload?: TelnyxMessagePayload & Record<string, unknown>;
  };
};

type SendSmsResult =
  | { ok: true; messageId: string; providerMessageId: string | null }
  | { ok: false; status: number; message: string; messageId?: string | null };

export type OutboundMmsAttachment = {
  bytes: Buffer;
  mimeType: string;
  filename: string | null;
  sizeBytes: number;
};

type TelnyxMediaAttachment = {
  url: string;
  mimeType: string | null;
  filename: string | null;
  sizeBytes: number | null;
  metadata: Record<string, Json>;
};

type TelnyxTranscriptSpeaker = "agent" | "customer";

type TelnyxTranscriptSegment = {
  channel: "A" | "B";
  end: number;
  speaker: TelnyxTranscriptSpeaker;
  start: number;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 2_000): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function cleanDiagnosticMessage(value: unknown): string | null {
  return cleanText(value, 300)?.replace(/https?:\/\/\S+/g, "[redacted-url]") ?? null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldUseStableFlatTranscription(): boolean {
  return true;
}

function getStringFromRecord(
  record: Record<string, unknown>,
  keys: string[],
  maxLength = 2_000,
): string | null {
  for (const key of keys) {
    const value = cleanText(record[key], maxLength);
    if (value) {
      return value;
    }
  }

  return null;
}

function getNumberFromRecord(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const numberValue =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;

    if (Number.isFinite(numberValue) && numberValue > 0) {
      return Math.floor(numberValue);
    }
  }

  return null;
}

function sanitizeFilename(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const sanitized = value
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return sanitized || null;
}

function getImageExtension(mimeType: string): string {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function isSupportedMmsImage(mimeType: string | null): mimeType is SupportedMmsMimeType {
  return Boolean(mimeType && SUPPORTED_MMS_IMAGE_TYPES.has(mimeType.toLowerCase()));
}

function getUrlFromMediaItem(item: unknown): string | null {
  if (typeof item === "string") {
    return cleanText(item, 4_000);
  }

  if (!isRecord(item)) {
    return null;
  }

  const directUrl = getStringFromRecord(
    item,
    ["url", "media_url", "mediaUrl", "href"],
    4_000,
  );
  if (directUrl) {
    return directUrl;
  }

  const nestedImageUrl = getStringFromRecord(item, ["img", "image"], 4_000);
  return nestedImageUrl;
}

function getTelnyxMediaAttachments(media: unknown): TelnyxMediaAttachment[] {
  const mediaItems = Array.isArray(media) ? media : media ? [media] : [];

  return mediaItems
    .map((item): TelnyxMediaAttachment | null => {
      const url = getUrlFromMediaItem(item);
      const record = isRecord(item) ? item : {};
      const mimeType =
        getStringFromRecord(record, ["content_type", "mime_type", "mimeType"], 120)
          ?.toLowerCase() ?? null;

      if (!url) {
        return null;
      }

      return {
        url,
        mimeType,
        filename: sanitizeFilename(
          getStringFromRecord(record, ["filename", "file_name", "name"], 180),
        ),
        sizeBytes: getNumberFromRecord(record, ["size", "size_bytes", "content_length"]),
        metadata: isRecord(item) ? (item as Record<string, Json>) : { url },
      };
    })
    .filter((item): item is TelnyxMediaAttachment => Boolean(item))
    .slice(0, MAX_MMS_ATTACHMENTS);
}

function getTelnyxPayloadMediaAttachments(
  payload: TelnyxMessagePayload | undefined,
): TelnyxMediaAttachment[] {
  const mediaAttachments = getTelnyxMediaAttachments(payload?.media);
  return mediaAttachments.length > 0
    ? mediaAttachments
    : getTelnyxMediaAttachments(payload?.media_urls);
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

function metadataRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeProviderMetadata(value: Record<string, unknown>): Record<string, Json> {
  return JSON.parse(JSON.stringify(value)) as Record<string, Json>;
}

function getPayloadString(payload: TelnyxWebhookPayload, keys: string[]): string | null {
  const record = payload.data?.payload;
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = cleanText(record[key], 1_000);
    if (value) {
      return value;
    }
  }

  return null;
}

function decodeTelnyxClientState(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const decoded = Buffer.from(value.trim(), "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getTelnyxRecordingUrls(payload: TelnyxWebhookPayload): {
  mp3: string | null;
  wav: string | null;
  raw: Record<string, Json>;
} {
  const record = payload.data?.payload;
  const recordingUrls = isRecord(record?.recording_urls) ? record.recording_urls : null;
  const publicRecordingUrls = isRecord(record?.public_recording_urls)
    ? record.public_recording_urls
    : null;
  const mp3 =
    cleanText(record?.recording_url, 2_000) ??
    cleanText(record?.mp3, 2_000) ??
    cleanText(recordingUrls?.mp3, 2_000) ??
    cleanText(publicRecordingUrls?.mp3, 2_000);
  const wav =
    cleanText(record?.wav, 2_000) ??
    cleanText(recordingUrls?.wav, 2_000) ??
    cleanText(publicRecordingUrls?.wav, 2_000);

  return {
    mp3,
    wav,
    raw: sanitizeProviderMetadata({
      recording_urls: recordingUrls ?? null,
      public_recording_urls: publicRecordingUrls ?? null,
    }),
  };
}

function getTelnyxRecordingReference(payload: TelnyxWebhookPayload): string | null {
  return getPayloadString(payload, [
    "recording_id",
    "recordingId",
    "call_leg_id",
    "callLegId",
    "call_session_id",
    "callSessionId",
    "id",
    "recording_url",
  ]);
}

async function fetchTelnyxRecordingResource(recordingReference: string): Promise<{
  endedAt: string | null;
  mp3Url: string | null;
  startedAt: string | null;
  wavUrl: string | null;
} | null> {
  const apiKey = getTelnyxApiKey();
  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `${TELNYX_RECORDINGS_URL}/${encodeURIComponent(recordingReference)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error("[telnyx-call-recording-resource-error]", {
      status: response.status,
    });
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        data?: {
          download_urls?: Record<string, unknown>;
          recording_ended_at?: unknown;
          recording_started_at?: unknown;
        };
      }
    | null;
  const downloadUrls = isRecord(payload?.data?.download_urls)
    ? payload.data.download_urls
    : null;

  return {
    endedAt: cleanText(payload?.data?.recording_ended_at, 120),
    mp3Url: cleanText(downloadUrls?.mp3, 4_000),
    startedAt: cleanText(payload?.data?.recording_started_at, 120),
    wavUrl: cleanText(downloadUrls?.wav, 4_000),
  };
}

async function fetchRecordingAudio(url: string): Promise<{
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
} | null> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    console.error("[telnyx-call-recording-audio-fetch-error]", {
      status: response.status,
    });
    return null;
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
    filename: url.toLowerCase().includes(".wav") ? "call-recording.wav" : "call-recording.mp3",
  };
}

function readTranscriptionText(value: unknown): string | null {
  if (typeof value === "string") {
    return cleanText(value, 100_000);
  }

  if (!isRecord(value)) {
    return null;
  }

  return cleanText(value.text, 100_000) ?? cleanText(value.transcript, 100_000);
}

async function transcribeTelnyxAudioBytes({
  bytes,
  contentType,
  filename,
}: {
  bytes: ArrayBuffer | Buffer;
  contentType: string;
  filename: string;
}): Promise<
  | { ok: true; raw: Record<string, Json>; text: string }
  | { ok: false; reason: string; status: number }
> {
  const apiKey = getTelnyxApiKey();
  if (!apiKey) {
    return { ok: false, reason: "Telnyx API key is not configured.", status: 503 };
  }

  let lastFailure: { errors: unknown[] | null; message: string | null; status: number } | null =
    null;

  for (let attempt = 1; attempt <= TELNYX_RECORDED_AUDIO_TRANSCRIPTION_ATTEMPTS; attempt += 1) {
    try {
      const form = new FormData();
      form.set("model", TELNYX_RECORDED_AUDIO_TRANSCRIPTION_MODEL);
      form.set("file", new Blob([new Uint8Array(bytes)], { type: contentType }), filename);

      const response = await fetch(TELNYX_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      const transcriptText = readTranscriptionText(payload);

      if (response.ok && transcriptText) {
        return {
          ok: true,
          raw: sanitizeProviderMetadata({
            attempts: attempt,
            model: TELNYX_RECORDED_AUDIO_TRANSCRIPTION_MODEL,
            provider_response: isRecord(payload) ? payload : { text: transcriptText },
          }),
          text: transcriptText,
        };
      }

      const errors = isRecord(payload) && Array.isArray(payload.errors) ? payload.errors : null;
      lastFailure = {
        errors,
        message: response.ok
          ? "Telnyx recorded-audio transcription returned no text."
          : "Telnyx recorded-audio transcription failed.",
        status: response.status || 502,
      };

      if (
        (!response.ok && response.status < 500) ||
        attempt === TELNYX_RECORDED_AUDIO_TRANSCRIPTION_ATTEMPTS
      ) {
        break;
      }
    } catch (error) {
      lastFailure = {
        errors: null,
        message: cleanDiagnosticMessage(
          error instanceof Error ? error.message : "Telnyx recorded-audio transcription failed.",
        ),
        status: 502,
      };
      if (attempt === TELNYX_RECORDED_AUDIO_TRANSCRIPTION_ATTEMPTS) {
        break;
      }
    }

    await wait(250 * attempt);
  }

  console.error("[telnyx-call-recording-transcription-error]", {
    errors: lastFailure?.errors ?? null,
    message: lastFailure?.message,
    status: lastFailure?.status ?? 502,
  });
  return {
    ok: false,
    reason: lastFailure?.message ?? "Telnyx recorded-audio transcription failed.",
    status: lastFailure?.status ?? 502,
  };
}

async function getExistingTranscriptForRecording({
  call,
  recordingReference,
}: {
  call: CommunicationCallRow;
  recordingReference: string;
}): Promise<{ id: string; speakerSegments: Json | null; text: string | null } | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from("communication_transcripts")
    .select("id,transcript_text,speaker_segments")
    .eq("conversation_id", call.conversation_id);

  if (call.transcript_id) {
    query = query.eq("id", call.transcript_id);
  } else {
    query = query.eq("recording_reference", recordingReference);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    console.error("[telnyx-call-existing-transcript-lookup-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    speakerSegments: data.speaker_segments,
    text: cleanText(data.transcript_text, 100_000),
  };
}

function getCanonicalTranscriptFromMetadata(metadata: Record<string, unknown>): string | null {
  const recording = metadataRecord(metadata.recording as Json | null | undefined);
  const transcription = metadataRecord(recording.transcription as Json | null | undefined);
  return cleanText(transcription.canonical_transcript_text, 100_000);
}

async function resolveAuthoritativeFullTranscript({
  audio,
  call,
  preferredTranscriptText,
  recordingReference,
}: {
  audio: { bytes: ArrayBuffer; contentType: string; filename: string };
  call: CommunicationCallRow;
  preferredTranscriptText?: string | null;
  recordingReference: string;
}): Promise<
  | {
      ok: true;
      raw: Record<string, Json>;
      source: "existing_transcript" | "provider_event" | "telnyx_full_recording_stt";
      text: string;
    }
  | { ok: false; reason: string; status: number }
> {
  const preferredText = cleanText(preferredTranscriptText, 100_000);
  if (preferredText) {
    return {
      ok: true,
      raw: sanitizeProviderMetadata({ source: "provider_event" }),
      source: "provider_event",
      text: preferredText,
    };
  }

  const existing = await getExistingTranscriptForRecording({ call, recordingReference });
  if (existing?.text) {
    return {
      ok: true,
      raw: sanitizeProviderMetadata({ source: "existing_transcript" }),
      source: "existing_transcript",
      text: existing.text,
    };
  }

  const transcription = await transcribeTelnyxAudioBytes({
    bytes: audio.bytes,
    contentType: audio.contentType,
    filename: `${recordingReference}-${audio.filename}`,
  });

  if (!transcription.ok) {
    return transcription;
  }

  return {
    ok: true,
    raw: transcription.raw,
    source: "telnyx_full_recording_stt",
    text: transcription.text,
  };
}

async function transcribeTelnyxRecordingAudio({
  audioUrl,
  call,
  preferredTranscriptText = null,
  recordingReference,
}: {
  audioUrl: string;
  call: CommunicationCallRow;
  preferredTranscriptText?: string | null;
  recordingReference: string;
}): Promise<
  | {
      ok: true;
      raw: Record<string, Json>;
      segments: TelnyxTranscriptSegment[];
      text: string;
    }
  | { ok: false; reason: string; status: number }
> {
  const audio = await fetchRecordingAudio(audioUrl);
  if (!audio) {
    return { ok: false, reason: "Unable to fetch Telnyx recording audio.", status: 502 };
  }

  if (shouldUseStableFlatTranscription()) {
    const stableFullTranscript = await resolveAuthoritativeFullTranscript({
      audio,
      call,
      preferredTranscriptText,
      recordingReference,
    });

    if (!stableFullTranscript.ok) {
      return stableFullTranscript;
    }

    return {
      ok: true,
      raw: sanitizeProviderMetadata({
        channel_strategy: "flat_full_recording",
        full_transcript_source: stableFullTranscript.source,
        model: TELNYX_RECORDED_AUDIO_TRANSCRIPTION_MODEL,
        provider_response: stableFullTranscript.raw,
      }),
      segments: [],
      text: stableFullTranscript.text,
    };
  }

  return {
    ok: false,
    reason: "Stable full-recording transcription is disabled.",
    status: 503,
  };
}

async function createOrReuseTelnyxCallTranscript({
  call,
  recordingReference,
  recordingResource,
  speakerSegments,
  transcriptText,
}: {
  call: CommunicationCallRow;
  recordingReference: string;
  recordingResource: Awaited<ReturnType<typeof fetchTelnyxRecordingResource>>;
  speakerSegments: TelnyxTranscriptSegment[];
  transcriptText: string;
}): Promise<{ id: string } | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  let existingTranscript: { id: string } | null = call.transcript_id
    ? { id: call.transcript_id }
    : null;

  if (!existingTranscript) {
    const { data: transcriptLookup, error: lookupError } = await supabase
      .from("communication_transcripts")
      .select("id")
      .eq("conversation_id", call.conversation_id)
      .eq("recording_reference", recordingReference)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("[telnyx-call-transcript-lookup-error]", {
        message: lookupError.message,
        code: lookupError.code,
      });
      return null;
    }

    existingTranscript = transcriptLookup as { id: string } | null;
  }

  const transcriptPatch = {
    conversation_id: call.conversation_id,
    source_type: "phone" as const,
    transcript_text: transcriptText,
    speaker_segments: JSON.parse(
      JSON.stringify(
        speakerSegments.map((segment, index) => ({
          id: index,
          provider: "telnyx",
          recording_id: recordingReference,
          ...segment,
        })),
      ),
    ) as Json,
    recording_reference: recordingReference,
    started_at: recordingResource?.startedAt ?? call.started_at,
    ended_at: recordingResource?.endedAt ?? call.ended_at,
  };

  const result = existingTranscript
    ? await supabase
        .from("communication_transcripts")
        .update(transcriptPatch)
        .eq("id", (existingTranscript as { id: string }).id)
        .select("id")
        .single()
    : await supabase
        .from("communication_transcripts")
        .insert(transcriptPatch)
        .select("id")
        .single();

  if (result.error || !result.data) {
    console.error("[telnyx-call-transcript-save-error]", {
      message: result.error?.message ?? null,
      code: result.error?.code ?? null,
    });
    return null;
  }

  return result.data as { id: string };
}

async function processTelnyxCallRecordingTranscription({
  call,
  forceRefresh = false,
  lastTriggerEvent = "manual_force_refresh",
  occurredAt,
  preferredTranscriptText = null,
  recordingReference,
  recordingUrls,
}: {
  call: CommunicationCallRow;
  forceRefresh?: boolean;
  lastTriggerEvent?: string;
  occurredAt: string;
  preferredTranscriptText?: string | null;
  recordingReference: string;
  recordingUrls: ReturnType<typeof getTelnyxRecordingUrls>;
}): Promise<
  | { ok: true; transcriptId: string; status: "created" | "existing" }
  | { ok: false; reason: string; status: number }
> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, reason: "Supabase service role is not configured.", status: 503 };
  }

  if (!forceRefresh) {
    const existingTranscript = await getExistingTranscriptForRecording({ call, recordingReference });
    if (existingTranscript?.text) {
      return { ok: true, transcriptId: existingTranscript.id, status: "existing" };
    }
  }

  const recordingResource = await fetchTelnyxRecordingResource(recordingReference);
  const audioUrl =
    recordingResource?.mp3Url ??
    recordingResource?.wavUrl ??
    recordingUrls.mp3 ??
    recordingUrls.wav;
  if (!audioUrl) {
    return { ok: false, reason: "Telnyx recording audio is not available yet.", status: 404 };
  }

  const transcription = await transcribeTelnyxRecordingAudio({
    audioUrl,
    call,
    preferredTranscriptText,
    recordingReference,
  });

  if (!transcription.ok) {
    return transcription;
  }

  const structuredDiagnostics = metadataRecord(
    transcription.raw.structured_diagnostics as Json | null | undefined,
  );

  const transcript = await createOrReuseTelnyxCallTranscript({
    call,
    recordingReference,
    recordingResource,
    speakerSegments: transcription.segments,
    transcriptText: transcription.text,
  });

  if (!transcript) {
    return { ok: false, reason: "Unable to persist Telnyx transcript.", status: 503 };
  }

  const currentMetadata = metadataRecord(call.provider_metadata);
  const previousRecording = metadataRecord(currentMetadata.recording as Json | null | undefined);
  const refreshedMetadata = sanitizeProviderMetadata({
    ...currentMetadata,
    recording: {
      ...previousRecording,
      provider: "telnyx",
      recording_id: recordingReference,
      saved_at: previousRecording.saved_at ?? occurredAt,
      status: "transcribed",
      transcription: {
        canonical_transcript_ready: true,
        completed_at: occurredAt,
        diagnostics: transcription.raw.structured_diagnostics ?? null,
        failed_stage:
          transcription.raw.failed_stage ?? structuredDiagnostics.failedStage ?? null,
        fallback_reason:
          transcription.raw.fallback_reason ?? structuredDiagnostics.fallbackReason ?? null,
        split_status: transcription.raw.split_status ?? structuredDiagnostics.splitStatus ?? null,
        input_channels:
          transcription.raw.input_channels ?? structuredDiagnostics.inputChannels ?? null,
        agent_raw_interval_count:
          transcription.raw.agent_raw_interval_count ??
          structuredDiagnostics.agentRawIntervalCount ??
          null,
        agent_merged_interval_count:
          transcription.raw.agent_merged_interval_count ??
          structuredDiagnostics.agentMergedIntervalCount ??
          null,
        customer_raw_interval_count:
          transcription.raw.customer_raw_interval_count ??
          structuredDiagnostics.customerRawIntervalCount ??
          null,
        customer_merged_interval_count:
          transcription.raw.customer_merged_interval_count ??
          structuredDiagnostics.customerMergedIntervalCount ??
          null,
        error_message:
          transcription.raw.error_message ?? structuredDiagnostics.errorMessage ?? null,
        full_transcript_source:
          transcription.raw.full_transcript_source ??
          structuredDiagnostics.fullTranscriptSource ??
          null,
        last_processing_at: occurredAt,
        last_trigger_event: lastTriggerEvent,
        timestamp_metadata_available:
          transcription.raw.timestamp_metadata_available ??
          structuredDiagnostics.timestampMetadataAvailable ??
          null,
        alignment_strategy:
          transcription.raw.alignment_strategy ?? structuredDiagnostics.alignmentStrategy ?? null,
        model: TELNYX_RECORDED_AUDIO_TRANSCRIPTION_MODEL,
        recording_ready: true,
        state: "transcript_complete",
        transcript_id: transcript.id,
        strategy: transcription.raw.channel_strategy ?? null,
        structured_segment_count: transcription.segments.length,
      },
      urls: {
        mp3: recordingUrls.mp3,
        wav: recordingUrls.wav,
      },
      raw_urls: recordingUrls.raw,
    },
  });

  const { error: transcriptLinkError } = await supabase
    .from("communication_calls")
    .update({
      transcript_id: transcript.id,
      provider_metadata: refreshedMetadata,
    })
    .eq("id", call.id);

  if (transcriptLinkError) {
    console.error("[telnyx-call-transcript-link-error]", {
      message: transcriptLinkError.message,
      code: transcriptLinkError.code,
    });
    return { ok: false, reason: "Unable to link Telnyx transcript to call.", status: 503 };
  }

  return { ok: true, transcriptId: transcript.id, status: "created" };
}

async function persistTelnyxCallTranscriptionLifecycle({
  call,
  canonicalTranscriptText,
  lastTriggerEvent,
  occurredAt,
  recordingReference,
  recordingUrls,
  state,
  transcriptionPatch,
}: {
  call: CommunicationCallRow;
  canonicalTranscriptText?: string | null;
  lastTriggerEvent: string;
  occurredAt: string;
  recordingReference?: string | null;
  recordingUrls?: ReturnType<typeof getTelnyxRecordingUrls> | null;
  state:
    | "waiting_for_recording"
    | "processing"
    | "transcript_complete"
    | "transcription_failed";
  transcriptionPatch?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return;
  }

  const currentMetadata = metadataRecord(call.provider_metadata);
  const previousRecording = metadataRecord(currentMetadata.recording as Json | null | undefined);
  const previousTranscription = metadataRecord(
    previousRecording.transcription as Json | null | undefined,
  );
  const effectiveRecordingReference =
    recordingReference ?? call.recording_reference ?? cleanText(previousRecording.recording_id, 200);
  const canonicalText =
    cleanText(canonicalTranscriptText, 100_000) ??
    cleanText(previousTranscription.canonical_transcript_text, 100_000);

  const { error } = await supabase
    .from("communication_calls")
    .update({
      provider_metadata: sanitizeProviderMetadata({
        ...currentMetadata,
        recording: {
          ...previousRecording,
          provider: "telnyx",
          recording_id: effectiveRecordingReference ?? previousRecording.recording_id ?? null,
          status: effectiveRecordingReference ? previousRecording.status ?? "saved" : previousRecording.status ?? null,
          transcription: {
            ...previousTranscription,
            ...(canonicalText ? { canonical_transcript_text: canonicalText } : {}),
            canonical_transcript_ready: Boolean(canonicalText),
            last_processing_at: occurredAt,
            last_trigger_event: lastTriggerEvent,
            recording_ready: Boolean(effectiveRecordingReference),
            state,
            ...transcriptionPatch,
          },
          urls: recordingUrls
            ? {
                mp3: recordingUrls.mp3,
                wav: recordingUrls.wav,
              }
            : previousRecording.urls ?? null,
          raw_urls: recordingUrls?.raw ?? previousRecording.raw_urls ?? null,
        },
      }),
    })
    .eq("id", call.id);

  if (error) {
    console.error("[telnyx-call-transcription-lifecycle-error]", {
      code: error.code,
      message: error.message,
      state,
    });
  }
}

async function finalizeTelnyxCallTranscript({
  callId,
  lastTriggerEvent,
  occurredAt,
  preferredTranscriptText = null,
  recordingReference = null,
  recordingUrls,
}: {
  callId: string;
  lastTriggerEvent: string;
  occurredAt: string;
  preferredTranscriptText?: string | null;
  recordingReference?: string | null;
  recordingUrls: ReturnType<typeof getTelnyxRecordingUrls>;
}): Promise<
  | {
      ok: true;
      state:
        | "waiting_for_recording"
        | "transcript_complete";
      transcriptId?: string;
    }
  | { ok: false; reason: string; status: number; state: "transcription_failed" }
> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return {
      ok: false,
      reason: "Supabase service role is not configured.",
      state: "transcription_failed",
      status: 503,
    };
  }

  const { data: callData, error: callError } = await supabase
    .from("communication_calls")
    .select("*")
    .eq("id", callId)
    .eq("provider_name", "telnyx")
    .maybeSingle();

  if (callError) {
    console.error("[telnyx-call-transcription-finalizer-call-error]", {
      code: callError.code,
      message: callError.message,
    });
    return {
      ok: false,
      reason: "Unable to load Telnyx call for transcription finalization.",
      state: "transcription_failed",
      status: 503,
    };
  }

  if (!callData) {
    return {
      ok: false,
      reason: "Telnyx call not found for transcription finalization.",
      state: "transcription_failed",
      status: 404,
    };
  }

  const call = callData as CommunicationCallRow;
  const currentMetadata = metadataRecord(call.provider_metadata);
  const effectiveRecordingReference =
    recordingReference ??
    call.recording_reference ??
    cleanText(metadataRecord(currentMetadata.recording as Json | null | undefined).recording_id, 200);
  const canonicalTranscriptText =
    cleanText(preferredTranscriptText, 100_000) ??
    getCanonicalTranscriptFromMetadata(currentMetadata) ??
    (effectiveRecordingReference
      ? (
          await getExistingTranscriptForRecording({
            call,
            recordingReference: effectiveRecordingReference,
          })
        )?.text
      : null);

  if (!effectiveRecordingReference) {
    await persistTelnyxCallTranscriptionLifecycle({
      call,
      canonicalTranscriptText,
      lastTriggerEvent,
      occurredAt,
      recordingReference: null,
      recordingUrls,
      state: "waiting_for_recording",
    });
    return { ok: true, state: "waiting_for_recording" };
  }

  const existingTranscript = await getExistingTranscriptForRecording({
    call,
    recordingReference: effectiveRecordingReference,
  });
  if (existingTranscript?.text) {
    await persistTelnyxCallTranscriptionLifecycle({
      call,
      canonicalTranscriptText,
      lastTriggerEvent,
      occurredAt,
      recordingReference: effectiveRecordingReference,
      recordingUrls,
      state: "transcript_complete",
      transcriptionPatch: {
        structured_segment_count: Array.isArray(existingTranscript.speakerSegments)
          ? existingTranscript.speakerSegments.length
          : 0,
        transcript_id: existingTranscript.id,
      },
    });
    return {
      ok: true,
      state: "transcript_complete",
      transcriptId: existingTranscript.id,
    };
  }

  await persistTelnyxCallTranscriptionLifecycle({
    call,
    canonicalTranscriptText,
    lastTriggerEvent,
    occurredAt,
    recordingReference: effectiveRecordingReference,
    recordingUrls,
    state: "processing",
  });

  const transcriptionResult = await processTelnyxCallRecordingTranscription({
    call,
    lastTriggerEvent,
    occurredAt,
    preferredTranscriptText: canonicalTranscriptText,
    recordingReference: effectiveRecordingReference,
    recordingUrls,
  });

  if (!transcriptionResult.ok) {
    await persistTelnyxCallTranscriptionLifecycle({
      call,
      canonicalTranscriptText,
      lastTriggerEvent,
      occurredAt,
      recordingReference: effectiveRecordingReference,
      recordingUrls,
      state: "transcription_failed",
      transcriptionPatch: {
        failed_at: occurredAt,
        failure_reason: transcriptionResult.reason,
      },
    });
    return { ...transcriptionResult, state: "transcription_failed" };
  }

  return {
    ok: true,
    state: "transcript_complete",
    transcriptId: transcriptionResult.transcriptId,
  };
}

export async function reprocessTelnyxCallRecordingTranscript(
  callId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<
  | { ok: true; transcriptId: string; status: "created" | "existing" }
  | { ok: false; reason: string; status: number }
> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, reason: "Supabase service role is not configured.", status: 503 };
  }

  const { data: call, error } = await supabase
    .from("communication_calls")
    .select("*")
    .eq("id", callId)
    .eq("provider_name", "telnyx")
    .maybeSingle();

  if (error) {
    console.error("[telnyx-call-transcript-retry-call-lookup-error]", {
      message: error.message,
      code: error.code,
    });
    return { ok: false, reason: "Unable to load the selected Telnyx call.", status: 503 };
  }

  if (!call) {
    return { ok: false, reason: "Telnyx call not found.", status: 404 };
  }

  const callRow = call as CommunicationCallRow;
  if (!callRow.recording_reference) {
    return { ok: false, reason: "This Telnyx call does not have a recording yet.", status: 400 };
  }

  return processTelnyxCallRecordingTranscription({
    call: callRow,
    forceRefresh: options.forceRefresh === true,
    occurredAt: new Date().toISOString(),
    recordingReference: callRow.recording_reference,
    recordingUrls: {
      mp3: null,
      wav: null,
      raw: sanitizeProviderMetadata({ retry: true }),
    },
  });
}

function formatTelnyxRecordingError(payload: TelnyxWebhookPayload): string | null {
  const record = payload.data?.payload;
  const errors = record?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (isRecord(first)) {
      return [
        cleanText(first.code, 80),
        cleanText(first.title, 160),
        cleanText(first.detail, 300),
      ]
        .filter(Boolean)
        .join(" — ");
    }
  }

  return (
    cleanText(record?.error, 300) ??
    cleanText(record?.failure_reason, 300) ??
    cleanText(record?.reason, 300)
  );
}

async function findCommunicationCallForTelnyxRecording(
  payload: TelnyxWebhookPayload,
): Promise<CommunicationCallRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const clientState = decodeTelnyxClientState(payload.data?.payload?.client_state);
  const clientStateCallId = cleanText(clientState?.communication_call_id, 120);
  if (clientStateCallId) {
    const { data, error } = await supabase
      .from("communication_calls")
      .select("*")
      .eq("id", clientStateCallId)
      .maybeSingle();

    if (error) {
      console.error("[telnyx-call-recording-call-lookup-error]", {
        message: error.message,
        code: error.code,
      });
      return null;
    }

    if (data) {
      return data as CommunicationCallRow;
    }
  }

  const identifiers = Array.from(
    new Set(
      [
        getPayloadString(payload, ["call_control_id", "callControlId"]),
        getPayloadString(payload, ["call_leg_id", "callLegId"]),
        getPayloadString(payload, ["call_session_id", "callSessionId"]),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  if (identifiers.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("communication_calls")
    .select("*")
    .eq("provider_name", "telnyx")
    .in("provider_call_id", identifiers)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[telnyx-call-recording-call-lookup-error]", {
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return (data ?? null) as CommunicationCallRow | null;
}

async function handleTelnyxCallRecordingWebhook(
  payload: TelnyxWebhookPayload,
  eventType: string,
) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Supabase service role is not configured." };
  }

  const call = await findCommunicationCallForTelnyxRecording(payload);
  if (!call) {
    return { ok: true, status: 202, message: "Telnyx call recording event did not match a WRA call." };
  }

  const occurredAt = getOccurredAt(payload);
  const currentMetadata = metadataRecord(call.provider_metadata);
  const previousRecording = metadataRecord(currentMetadata.recording as Json | null | undefined);
  const recordingReference = getTelnyxRecordingReference(payload);
  const recordingUrls = getTelnyxRecordingUrls(payload);

  if (eventType === "call.recording.saved") {
    const effectiveRecordingReference = recordingReference ?? call.recording_reference;
    const { error } = await supabase
      .from("communication_calls")
      .update({
        recording_reference: effectiveRecordingReference,
        provider_metadata: sanitizeProviderMetadata({
          ...currentMetadata,
          recording: {
            ...previousRecording,
            provider: "telnyx",
            recording_id: effectiveRecordingReference ?? previousRecording.recording_id ?? null,
            saved_at: occurredAt,
            status: "saved",
            urls: {
              mp3: recordingUrls.mp3,
              wav: recordingUrls.wav,
            },
            raw_urls: recordingUrls.raw,
          },
        }),
      })
      .eq("id", call.id);

    if (error) {
      console.error("[telnyx-call-recording-save-error]", {
        message: error.message,
        code: error.code,
      });
      return { ok: false, status: 503, message: "Unable to persist Telnyx recording metadata." };
    }

    if (effectiveRecordingReference) {
      const transcriptionResult = await finalizeTelnyxCallTranscript({
        callId: call.id,
        lastTriggerEvent: eventType,
        occurredAt,
        recordingReference: effectiveRecordingReference,
        recordingUrls,
      });

      if (!transcriptionResult.ok) {
        return {
          ok: false,
          status: transcriptionResult.status,
          message: transcriptionResult.reason,
        };
      }
    }

    return { ok: true, status: 200, message: "Telnyx call recording accepted." };
  }

  if (eventType === "call.recording.transcription.saved") {
    const transcriptText =
      cleanText(payload.data?.payload?.transcription_text, 100_000) ??
      cleanText(payload.data?.payload?.transcript, 100_000);
    const transcriptionResult = await finalizeTelnyxCallTranscript({
      callId: call.id,
      lastTriggerEvent: eventType,
      occurredAt,
      preferredTranscriptText: transcriptText,
      recordingReference: recordingReference ?? call.recording_reference,
      recordingUrls,
    });

    if (!transcriptionResult.ok) {
      return {
        ok: false,
        status: transcriptionResult.status,
        message: transcriptionResult.reason,
      };
    }

    return { ok: true, status: 200, message: "Telnyx call transcription accepted." };
  }

  if (eventType === "call.recording.error") {
    const reason = formatTelnyxRecordingError(payload) ?? "Telnyx recording failed.";
    const { error } = await supabase
      .from("communication_calls")
      .update({
        provider_metadata: sanitizeProviderMetadata({
          ...currentMetadata,
          recording: {
            ...previousRecording,
            failure_reason: reason,
            failed_at: occurredAt,
            provider: "telnyx",
            status: "failed",
          },
        }),
      })
      .eq("id", call.id);

    if (error) {
      console.error("[telnyx-call-recording-error-save-error]", {
        message: error.message,
        code: error.code,
      });
      return { ok: false, status: 503, message: "Unable to persist Telnyx recording failure." };
    }

    return { ok: true, status: 200, message: "Telnyx call recording failure accepted." };
  }

  return { ok: true, status: 202, message: "Telnyx call recording event ignored." };
}

function hasMedia(payload: TelnyxMessagePayload | undefined): boolean {
  const media = payload?.media;
  const mediaUrls = payload?.media_urls;
  return (
    (Array.isArray(media) ? media.length > 0 : Boolean(media)) ||
    (Array.isArray(mediaUrls) ? mediaUrls.length > 0 : Boolean(mediaUrls))
  );
}

function isAllowedTelnyxMediaUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  return (
    hostname === "telnyx.com" ||
    hostname.endsWith(".telnyx.com") ||
    TELNYX_MEDIA_HOSTS.has(hostname)
  );
}

async function readLimitedResponseBytes(response: Response): Promise<Buffer | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_MMS_ATTACHMENT_BYTES) {
    return null;
  }

  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= MAX_MMS_ATTACHMENT_BYTES ? bytes : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_MMS_ATTACHMENT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

async function insertMessageAttachment({
  companyId,
  messageId,
  bytes,
  mimeType,
  filename,
  originalProviderUrl,
  providerMetadata,
}: {
  companyId: string;
  messageId: string;
  bytes: Buffer;
  mimeType: string;
  filename: string | null;
  originalProviderUrl: string | null;
  providerMetadata: Record<string, Json>;
}): Promise<{ ok: true; storagePath: string } | { ok: false; message: string }> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, message: "Supabase service role is not configured." };
  }

  if (!isSupportedMmsImage(mimeType)) {
    return { ok: false, message: "Unsupported MMS image type." };
  }

  if (bytes.length === 0 || bytes.length > MAX_MMS_ATTACHMENT_BYTES) {
    return { ok: false, message: "MMS image size is not supported." };
  }

  const storagePath = `${companyId}/messages/${messageId}/${randomUUID()}.${getImageExtension(
    mimeType,
  )}`;
  const { error: uploadError } = await supabase.storage
    .from(COMMUNICATIONS_MEDIA_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[telnyx-mms-storage-upload-error]", {
      message: uploadError.message,
    });
    return { ok: false, message: "Unable to store MMS media." };
  }

  const { error: insertError } = await supabase
    .from("communication_message_attachments")
    .insert({
      company_id: companyId,
      communication_message_id: messageId,
      attachment_type: "image",
      media_type: "mms",
      mime_type: mimeType,
      storage_bucket: COMMUNICATIONS_MEDIA_BUCKET,
      storage_path: storagePath,
      original_provider_url: originalProviderUrl,
      original_filename: filename,
      size_bytes: bytes.length,
      provider_metadata: providerMetadata,
    });

  if (insertError) {
    console.error("[telnyx-mms-attachment-insert-error]", {
      message: insertError.message,
      code: insertError.code,
    });
    await supabase.storage.from(COMMUNICATIONS_MEDIA_BUCKET).remove([storagePath]);
    return { ok: false, message: "Unable to persist MMS attachment metadata." };
  }

  return { ok: true, storagePath };
}

async function persistInboundMmsAttachments({
  companyId,
  messageId,
  attachments,
}: {
  companyId: string;
  messageId: string;
  attachments: TelnyxMediaAttachment[];
}) {
  for (const attachment of attachments) {
    if (!isAllowedTelnyxMediaUrl(attachment.url)) {
      console.error("[telnyx-mms-media-url-rejected]");
      continue;
    }

    const response = await fetch(attachment.url, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error("[telnyx-mms-media-fetch-error]", {
        status: response.status,
      });
      continue;
    }

    const responseMimeType =
      response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? null;
    const mimeType = isSupportedMmsImage(responseMimeType)
      ? responseMimeType
      : attachment.mimeType;
    if (!isSupportedMmsImage(mimeType)) {
      continue;
    }

    const bytes = await readLimitedResponseBytes(response);
    if (!bytes) {
      console.error("[telnyx-mms-media-size-error]");
      continue;
    }

    await insertMessageAttachment({
      companyId,
      messageId,
      bytes,
      mimeType,
      filename: attachment.filename,
      originalProviderUrl: attachment.url,
      providerMetadata: attachment.metadata,
    });
  }
}

async function persistOutboundMmsAttachments({
  companyId,
  messageId,
  attachments,
}: {
  companyId: string;
  messageId: string;
  attachments: OutboundMmsAttachment[];
}) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return [] as string[];
  }

  const mediaUrls: string[] = [];
  for (const attachment of attachments.slice(0, MAX_MMS_ATTACHMENTS)) {
    const result = await insertMessageAttachment({
      companyId,
      messageId,
      bytes: attachment.bytes,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      originalProviderUrl: null,
      providerMetadata: {},
    });

    if (!result.ok) {
      continue;
    }

    const { data, error } = await supabase.storage
      .from(COMMUNICATIONS_MEDIA_BUCKET)
      .createSignedUrl(result.storagePath, 60 * 60);
    if (!error && data?.signedUrl) {
      mediaUrls.push(data.signedUrl);
    }
  }

  return mediaUrls;
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

  if (!eventType) {
    return { ok: false, status: 400, message: "Unsupported Telnyx messaging event." };
  }

  if (eventType.startsWith("call.recording.")) {
    return handleTelnyxCallRecordingWebhook(telnyxPayload, eventType);
  }

  const providerMessageId = getProviderMessageId(telnyxPayload);

  if (!providerMessageId) {
    return { ok: false, status: 400, message: "Unsupported Telnyx messaging event." };
  }

  if (eventType === "message.received") {
    const messagePayload = telnyxPayload.data?.payload;
    const fromPhone = getPhone(messagePayload?.from);
    const toPhone = getToPhone(messagePayload?.to);
    const body = cleanText(messagePayload?.text, 4_000);
    const mediaAttachments = getTelnyxPayloadMediaAttachments(messagePayload);
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
      const hasUnsupportedMedia = hasMedia(messagePayload) && mediaAttachments.length === 0;
      const messageBody = hasUnsupportedMedia
        ? [body, "[Unsupported MMS media received.]"].filter(Boolean).join("\n")
        : body;

      const { data: insertedMessage, error: insertError } = await supabase
        .from("communication_messages")
        .insert({
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
        })
        .select("id")
        .single();

      if (insertError && insertError.code !== "23505") {
        console.error("[telnyx-sms-message-insert-error]", {
          message: insertError.message,
          code: insertError.code,
        });
        return { ok: false, status: 503, message: "Unable to persist inbound SMS." };
      }

      if (insertedMessage && mediaAttachments.length > 0 && conversation.company_id) {
        await persistInboundMmsAttachments({
          companyId: conversation.company_id,
          messageId: insertedMessage.id,
          attachments: mediaAttachments,
        });
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
  attachments = [],
}: {
  conversationId: string;
  body: string;
  attachments?: OutboundMmsAttachment[];
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
  if (!conversation.company_id) {
    return { ok: false, status: 400, message: "Conversation is missing company context." };
  }

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
  const normalizedBody = body.trim();
  const { data: messageData, error: messageError } = await supabase
    .from("communication_messages")
    .insert({
      conversation_id: conversation.id,
      source_type: "sms",
      direction: "outbound",
      sender_role: "dispatcher",
      body: normalizedBody || null,
      delivery_status: "pending",
      occurred_at: now,
    })
    .select("id")
    .single();

  if (messageError || !messageData) {
    return { ok: false, status: 503, message: "Unable to create outbound SMS message." };
  }

  const messageId = messageData.id;
  const mediaUrls = attachments.length > 0
    ? await persistOutboundMmsAttachments({
        companyId: conversation.company_id,
        messageId,
        attachments,
      })
    : [];

  if (attachments.length > 0 && mediaUrls.length === 0) {
    const failureReason = "Unable to prepare MMS media.";
    await supabase
      .from("communication_messages")
      .update({
        delivery_status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: failureReason,
      })
      .eq("id", messageId);

    return { ok: false, status: 503, message: failureReason, messageId };
  }

  const response = await fetch(TELNYX_MESSAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromPhone,
      to: toPhone,
      ...(normalizedBody ? { text: normalizedBody } : {}),
      ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {}),
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
