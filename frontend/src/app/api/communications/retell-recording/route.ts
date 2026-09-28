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
