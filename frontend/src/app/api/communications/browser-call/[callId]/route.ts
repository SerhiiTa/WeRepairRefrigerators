import { NextResponse } from "next/server";

import { updateBrowserCallLifecycle } from "@/server/communications/telnyx-browser-voice";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type BrowserCallRouteProps = {
  params: Promise<{
    callId: string;
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

function cleanStatus(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80);
}

function cleanIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export async function PATCH(request: Request, { params }: BrowserCallRouteProps) {
  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);
  if (!supabase) {
    return fail("Browser calling is not configured for this dashboard session.", 503);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { callId } = await params;
  const { data: call, error: callError } = await supabase
    .from("communication_calls")
    .select("id,conversation_id")
    .eq("id", callId)
    .maybeSingle();

  if (callError || !call) {
    return fail("Call is not accessible.", 404);
  }

  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_communication_conversation",
    { target_conversation_id: call.conversation_id },
  );

  if (accessError || canAccess !== true) {
    return fail("Call is not accessible.", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    answeredAt?: unknown;
    endedAt?: unknown;
    endReason?: unknown;
    providerCallId?: unknown;
    startedAt?: unknown;
    status?: unknown;
    telnyxCallControlId?: unknown;
    telnyxCallLegId?: unknown;
    telnyxSessionId?: unknown;
  } | null;
  const status = cleanStatus(body?.status);

  if (!status) {
    return fail("Call status is required.");
  }

  const result = await updateBrowserCallLifecycle({
    callId,
    status,
    providerCallId:
      typeof body?.providerCallId === "string" ? body.providerCallId.slice(0, 180) : null,
    telnyxCallControlId:
      typeof body?.telnyxCallControlId === "string"
        ? body.telnyxCallControlId.slice(0, 220)
        : null,
    telnyxCallLegId:
      typeof body?.telnyxCallLegId === "string" ? body.telnyxCallLegId.slice(0, 220) : null,
    telnyxSessionId:
      typeof body?.telnyxSessionId === "string" ? body.telnyxSessionId.slice(0, 220) : null,
    startedAt: cleanIso(body?.startedAt),
    answeredAt: cleanIso(body?.answeredAt),
    endedAt: cleanIso(body?.endedAt),
    endReason:
      typeof body?.endReason === "string" ? body.endReason.trim().slice(0, 180) : null,
  });

  if (!result.ok) {
    return fail(
      result.message ?? "Unable to update outbound call record.",
      result.status ?? 503,
    );
  }

  return NextResponse.json({ ok: true });
}
