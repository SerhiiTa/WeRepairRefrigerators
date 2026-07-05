import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import {
  fetchRetellCallRecording,
  getBestRetellRecordingAudioUrl,
} from "@/server/communications/retell-recording";
import { extractBearerToken } from "@/server/intake/intake-service";

type RecordingConversationRow = {
  id: string;
  provider_name: string | null;
  external_conversation_id: string | null;
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
    .eq("provider_name", "retell")
    .limit(1);

  query = conversationId
    ? query.eq("id", conversationId)
    : query.eq("external_conversation_id", callId ?? "");

  const { data: conversation, error } = await query.maybeSingle();

  if (error) {
    return fail("Could not load the selected conversation.", 503);
  }

  const row = conversation as RecordingConversationRow | null;

  if (!row) {
    return fail("Conversation not found.", 404);
  }

  if (!row.external_conversation_id) {
    return fail("This conversation does not have a Retell call id.", 404);
  }

  const recordingResult = await fetchRetellCallRecording(
    row.external_conversation_id,
  );

  if (!recordingResult.ok) {
    return fail(recordingResult.reason, 502);
  }

  const audioUrl = getBestRetellRecordingAudioUrl(recordingResult.recording);

  if (!audioUrl) {
    return fail("Retell did not return a playable recording URL for this call.", 404);
  }

  const range = request.headers.get("range");
  const audioResponse = await fetch(audioUrl, {
    headers: range ? { Range: range } : undefined,
  });

  if (!audioResponse.ok && audioResponse.status !== 206) {
    return fail("Retell recording audio is unavailable right now.", 502);
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
