import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import {
  fetchRetellCallRecording,
  getBestRetellRecordingAudioUrl,
} from "@/server/communications/retell-recording";
import { extractBearerToken } from "@/server/intake/intake-service";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
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

  if (!conversationId) {
    return fail("Conversation is required.", 400);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid dashboard session is required.", 401);
  }

  const { data: conversation, error } = await supabase
    .from("communication_conversations")
    .select("id,provider_name,external_conversation_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    return fail("Could not load the selected conversation.", 503);
  }

  if (!conversation) {
    return fail("Conversation not found.", 404);
  }

  if (conversation.provider_name !== "retell") {
    return NextResponse.json({
      ok: true,
      recording: null,
      message: "Recording lookup is available for Retell calls only.",
    });
  }

  if (!conversation.external_conversation_id) {
    return NextResponse.json({
      ok: true,
      recording: null,
      message: "This conversation does not have a Retell call id.",
    });
  }

  const result = await fetchRetellCallRecording(conversation.external_conversation_id);

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
