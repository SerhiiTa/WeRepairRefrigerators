import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import {
  fetchRetellCallRecording,
  getBestRetellRecordingAudioUrl,
} from "@/server/communications/retell-recording";
import { extractBearerToken } from "@/server/intake/intake-service";
import type { Json } from "@/lib/supabase/types";

type RecordingConversationRow = {
  id: string;
  provider_name: string | null;
  external_conversation_id: string | null;
};

type RecordingCallRow = {
  id: string;
  duration_seconds: number | null;
  ended_at: string | null;
  provider_metadata: Json | null;
  provider_name: string | null;
  provider_call_id: string;
  recording_reference: string | null;
  started_at: string | null;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function audioHeader(
  headers: Headers,
  name: "content-type" | "content-length" | "content-range" | "accept-ranges",
): string | null {
  return headers.get(name) ?? headers.get(name.toUpperCase());
}

function metadataRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanUrl(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function getTelnyxRecordingAudioUrl(metadata: Json | null | undefined): string | null {
  const recording = metadataRecord(metadataRecord(metadata).recording as Json | null | undefined);
  const urls = metadataRecord(recording.urls as Json | null | undefined);
  return cleanUrl(urls.mp3) ?? cleanUrl(urls.wav);
}

async function fetchTelnyxRecordingAudioUrl(recordingReference: string | null): Promise<string | null> {
  const apiKey = process.env.TELNYX_API_KEY?.trim().replace(/^Bearer\s+/i, "");
  if (!apiKey || !recordingReference) {
    return null;
  }

  const response = await fetch(
    `https://api.telnyx.com/v2/recordings/${encodeURIComponent(recordingReference)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: { download_urls?: Record<string, unknown> } }
    | null;
  const downloadUrls = metadataRecord(payload?.data?.download_urls as Json | null | undefined);

  return cleanUrl(downloadUrls.mp3) ?? cleanUrl(downloadUrls.wav);
}

async function streamAudioUrl(request: Request, audioUrl: string) {
  const range = request.headers.get("range");
  const audioResponse = await fetch(audioUrl, {
    headers: range ? { Range: range } : undefined,
  });

  if (!audioResponse.ok && audioResponse.status !== 206) {
    return fail("Recording audio is unavailable right now.", 502);
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    audioHeader(audioResponse.headers, "content-type") ?? "audio/mpeg",
  );
  headers.set("Cache-Control", "private, no-store");

  const contentLength = audioHeader(audioResponse.headers, "content-length");
  const contentRange = audioHeader(audioResponse.headers, "content-range");
  const acceptRanges = audioHeader(audioResponse.headers, "accept-ranges");

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }
  headers.set("Accept-Ranges", acceptRanges ?? "bytes");

  return new Response(audioResponse.body, {
    status: audioResponse.status === 206 ? 206 : 200,
    headers,
  });
}

export async function GET(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);
  if (!supabase) {
    return fail("Supabase is not configured for recording playback.", 503);
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId")?.trim();
  const callId = url.searchParams.get("callId")?.trim();

  if (!conversationId && !callId) {
    return fail("Conversation or Retell call id is required.", 400);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid dashboard session is required.", 401);
  }

  let query = supabase
    .from("communication_conversations")
    .select("id,provider_name,external_conversation_id")
    .limit(1);

  query = conversationId
    ? query.eq("id", conversationId)
    : query.eq("external_conversation_id", callId ?? "");

  const { data: conversation, error } = await query.maybeSingle();

  if (error) {
    return fail("Could not load the selected conversation.", 503);
  }

  const row = conversation as RecordingConversationRow | null;

  let retellCallId = row?.provider_name === "retell" ? row.external_conversation_id : null;

  let callQuery = supabase
    .from("communication_calls")
    .select(
      "id,provider_name,provider_call_id,recording_reference,provider_metadata,duration_seconds,started_at,ended_at",
    )
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  callQuery = callId
    ? callQuery.or(`provider_call_id.eq.${callId},id.eq.${callId}`)
    : callQuery.eq("conversation_id", conversationId ?? "");

  const { data: call, error: callError } = await callQuery.maybeSingle();

  if (callError) {
    return fail("Could not load the selected call.", 503);
  }

  const callRow = call as RecordingCallRow | null;

  if (callRow?.provider_name === "telnyx") {
    const audioUrl =
      (await fetchTelnyxRecordingAudioUrl(callRow.recording_reference)) ??
      getTelnyxRecordingAudioUrl(callRow.provider_metadata);
    if (!audioUrl) {
      return fail("Telnyx recording audio is not available yet.", 404);
    }

    return streamAudioUrl(request, audioUrl);
  }

  if (!retellCallId) {
    retellCallId = callRow?.provider_name === "retell" ? callRow.provider_call_id : null;
  }

  if (!row && !retellCallId) {
    return fail("Conversation not found.", 404);
  }

  if (!retellCallId) {
    return fail("This conversation does not have a Retell call id.", 404);
  }

  const recordingResult = await fetchRetellCallRecording(retellCallId);

  if (!recordingResult.ok) {
    return fail(recordingResult.reason, 502);
  }

  const audioUrl = getBestRetellRecordingAudioUrl(recordingResult.recording);

  if (!audioUrl) {
    return fail("Retell did not return a playable recording URL for this call.", 404);
  }

  return streamAudioUrl(request, audioUrl);
}
