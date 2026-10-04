import { NextResponse } from "next/server";

import { reprocessTelnyxCallRecordingTranscript } from "@/server/communications/telnyx-sms-transport";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ callId: string }> },
) {
  const body = (await request.json().catch(() => null)) as { forceRefresh?: unknown } | null;
  const forceRefresh = body?.forceRefresh === true;
  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);
  if (!supabase) {
    return fail("Supabase is not configured for transcript retry.", 503);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { callId } = await context.params;
  const { data: call, error: callError } = await supabase
    .from("communication_calls")
    .select("id,conversation_id,provider_name,recording_reference,transcript_id")
    .eq("id", callId)
    .maybeSingle();

  if (callError) {
    return fail("Could not load the selected call.", 503);
  }

  if (!call || call.provider_name !== "telnyx") {
    return fail("Telnyx call not found.", 404);
  }

  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_communication_conversation",
    { target_conversation_id: call.conversation_id },
  );

  if (accessError || canAccess !== true) {
    return fail("This Communications conversation is not accessible.", 403);
  }

  if (!call.recording_reference) {
    return fail("This call does not have a recording yet.", 400);
  }

  if (call.transcript_id && !forceRefresh) {
    return NextResponse.json({
      ok: true,
      status: "existing",
      transcriptId: call.transcript_id,
    });
  }

  const result = await reprocessTelnyxCallRecordingTranscript(call.id, { forceRefresh });
  if (!result.ok) {
    return fail(result.reason, result.status);
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    transcriptId: result.transcriptId,
  });
}
