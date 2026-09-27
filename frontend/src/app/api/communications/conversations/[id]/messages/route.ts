import { NextResponse } from "next/server";

import {
  sendConversationSms,
  type OutboundMmsAttachment,
} from "@/server/communications/telnyx-sms-transport";
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

const MAX_OUTBOUND_MMS_ATTACHMENTS = 5;
const MAX_OUTBOUND_MMS_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const SUPPORTED_OUTBOUND_MMS_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function parseSendPayload(request: Request): Promise<
  | { ok: true; body: string; attachments: OutboundMmsAttachment[] }
  | { ok: false; response: NextResponse }
> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return { ok: false, response: fail("Message upload payload is invalid.") };
    }

    const body = String(formData.get("body") ?? "").trim();
    const files = formData
      .getAll("attachments")
      .filter((item): item is File => item instanceof File && item.size > 0);

    if (files.length > MAX_OUTBOUND_MMS_ATTACHMENTS) {
      return { ok: false, response: fail("Attach up to 5 images.") };
    }

    const attachments: OutboundMmsAttachment[] = [];
    for (const file of files) {
      if (!SUPPORTED_OUTBOUND_MMS_TYPES.has(file.type)) {
        return { ok: false, response: fail("Only JPEG, PNG, and WebP images are supported.") };
      }

      if (file.size > MAX_OUTBOUND_MMS_ATTACHMENT_BYTES) {
        return { ok: false, response: fail("Each image must be 5 MB or smaller.") };
      }

      attachments.push({
        bytes: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        filename: file.name || null,
        sizeBytes: file.size,
      });
    }

    return { ok: true, body, attachments };
  }

  const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  return { ok: true, body, attachments: [] };
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

  const parsedPayload = await parseSendPayload(request);
  if (!parsedPayload.ok) {
    return parsedPayload.response;
  }

  const { body, attachments } = parsedPayload;

  if (!body && attachments.length === 0) {
    return fail("Type a message or attach a photo before sending.");
  }

  if (body.length > 1_600) {
    return fail("SMS message is too long.");
  }

  const result = await sendConversationSms({ conversationId: id, body, attachments });

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
