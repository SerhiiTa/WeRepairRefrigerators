import { NextResponse } from "next/server";

import { sendConversationSms } from "@/server/communications/telnyx-sms-transport";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type ConversationMessagesRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

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
  { params }: ConversationMessagesRouteProps,
) {
  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);
  if (!supabase) {
    return fail("Supabase is not configured for messaging.", 503);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { id } = await params;
  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_communication_conversation",
    { target_conversation_id: id },
  );

  if (accessError || canAccess !== true) {
    return fail("This conversation is not accessible.", 403);
  }

  const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!body) {
    return fail("Type a message before sending.");
  }

  if (body.length > 1_600) {
    return fail("SMS message is too long.");
  }

  const result = await sendConversationSms({ conversationId: id, body });

  if (!result.ok) {
    return fail(result.message, result.status);
  }

  return NextResponse.json({
    ok: true,
    message: "SMS sent.",
    messageId: result.messageId,
    providerMessageId: result.providerMessageId,
  });
}
