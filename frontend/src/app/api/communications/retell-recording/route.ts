import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import {
  fetchRetellCallRecording,
  getBestRetellRecordingAudioUrl,
} from "@/server/communications/retell-recording";
import { extractBearerToken } from "@/server/intake/intake-service";
import type { Json } from "@/lib/supabase/types";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function metadataRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanUrl(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function getTelnyxRecordingUrl(metadata: Json | null | undefined): string | null {
  const recording = metadataRecord(metadataRecord(metadata).recording as Json | null | undefined);
  const urls = metadataRecord(recording.urls as Json | null | undefined);
  return cleanUrl(urls.mp3) ?? cleanUrl(urls.wav);
}

async function fetchTelnyxRecordingSummary(recordingReference: string | null): Promise<{
  hasAudio: boolean;
  durationMs: number | null;
  startTimestamp: string | null;
  endTimestamp: string | null;
} | null> {
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
    | {
        data?: {
          download_urls?: Record<string, unknown>;
          duration_millis?: unknown;
          recording_ended_at?: unknown;
          recording_started_at?: unknown;
        };
      }
    | null;
  const downloadUrls = metadataRecord(payload?.data?.download_urls as Json | null | undefined);
  const durationMs =
    typeof payload?.data?.duration_millis === "number" &&
    Number.isFinite(payload.data.duration_millis)
      ? payload.data.duration_millis
      : null;

  return {
    hasAudio: Boolean(cleanUrl(downloadUrls.mp3) ?? cleanUrl(downloadUrls.wav)),
    durationMs,
    startTimestamp:
      typeof payload?.data?.recording_started_at === "string"
        ? payload.data.recording_started_at
        : null,
    endTimestamp:
      typeof payload?.data?.recording_ended_at === "string"
        ? payload.data.recording_ended_at
        : null,
  };
}

async function buildTelnyxRecording(call: {
  duration_seconds: number | null;
  ended_at: string | null;
  provider_metadata: Json | null;
  recording_reference: string | null;
  started_at: string | null;
}) {
  const fetchedRecording = await fetchTelnyxRecordingSummary(call.recording_reference);
  const legacyStoredUrl = getTelnyxRecordingUrl(call.provider_metadata);
  return {
    recordingUrl: fetchedRecording?.hasAudio
      ? "server-proxied"
      : legacyStoredUrl
        ? "server-proxied"
        : null,
    recordingMultiChannelUrl: null,
    scrubbedRecordingUrl: null,
    durationMs:
      fetchedRecording?.durationMs ??
      (typeof call.duration_seconds === "number" && call.duration_seconds >= 0
        ? call.duration_seconds * 1000
        : null),
    startTimestamp: fetchedRecording?.startTimestamp ?? call.started_at,
    endTimestamp: fetchedRecording?.endTimestamp ?? call.ended_at,
    recordingReference: call.recording_reference,
  };
}

export async function GET(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);
  if (!supabase) {
    return fail("Supabase is not configured for recording lookup.", 503);
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId")?.trim();
  const callId = url.searchParams.get("callId")?.trim();

  if (!conversationId && !callId) {
    return fail("Conversation or call is required.", 400);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid dashboard session is required.", 401);
  }

  const { data: conversation, error } = conversationId
    ? await supabase
        .from("communication_conversations")
        .select("id,provider_name,external_conversation_id")
        .eq("id", conversationId)
        .maybeSingle()
    : { data: null, error: null };

  if (error) {
    return fail("Could not load the selected conversation.", 503);
  }

  if (conversationId && !conversation) {
    return fail("Conversation not found.", 404);
  }

  let retellCallId =
    conversation?.provider_name === "retell"
      ? conversation.external_conversation_id
      : null;

  const { data: latestCall, error: latestCallError } = await supabase
    .from("communication_calls")
    .select(
      "id,provider_name,provider_call_id,recording_reference,provider_metadata,duration_seconds,started_at,ended_at",
    )
    .eq(callId ? "id" : "conversation_id", callId ?? conversationId ?? "")
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCallError) {
    return fail("Could not load the selected call.", 503);
  }

  if (latestCall?.provider_name === "telnyx") {
    const recording = await buildTelnyxRecording(latestCall);
    return NextResponse.json({
      ok: true,
      recording: {
        ...recording,
        recordingUrl: null,
      },
      message: recording.recordingUrl
        ? null
        : latestCall.recording_reference
          ? "Telnyx recording metadata loaded, but playback is not available yet."
          : "Telnyx has not provided a recording for this call yet.",
    });
  }

  if (!retellCallId) {
    let query = supabase
      .from("communication_calls")
      .select("provider_call_id")
      .eq("provider_name", "retell")
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    query = callId
      ? query.or(`provider_call_id.eq.${callId},id.eq.${callId}`)
      : query.eq("conversation_id", conversationId ?? "");

    const { data: call, error: callError } = await query.maybeSingle();

    if (callError) {
      return fail("Could not load the selected call.", 503);
    }

    retellCallId = call?.provider_call_id ?? null;
  }

  if (!retellCallId) {
    return NextResponse.json({
      ok: true,
      recording: null,
      message: "Recording lookup is available for Retell calls only.",
    });
  }

  const result = await fetchRetellCallRecording(retellCallId);

  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      recording: null,
      message: result.reason,
    });
  }

  const hasPlayableAudio = Boolean(
    getBestRetellRecordingAudioUrl(result.recording),
  );

  return NextResponse.json({
    ok: true,
    recording: {
      ...result.recording,
      recordingUrl: null,
      recordingMultiChannelUrl: null,
      scrubbedRecordingUrl: null,
    },
    message: hasPlayableAudio
      ? null
      : "Retell did not return a playable recording URL for this call.",
  });
}
