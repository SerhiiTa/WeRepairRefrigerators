import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

type EstimateRespondRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isPublicToken(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function normalizeResponse(value: unknown): "approved" | "declined" | null {
  return value === "approved" || value === "declined" ? value : null;
}

function formatRespondError(message: string): string {
  if (
    message.includes("respond_to_public_estimate_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Estimate approvals are not ready yet. Apply migration 0026 in Supabase, then try again.";
  }

  if (message.includes("sent estimates")) {
    return "This estimate has already received a response or is no longer available for approval.";
  }

  if (message.includes("not found")) {
    return "This estimate link is invalid or expired.";
  }

  return "We could not record this estimate response yet.";
}

export async function POST(
  request: Request,
  { params }: EstimateRespondRouteProps,
) {
  const { id: token } = await params;

  if (!isPublicToken(token)) {
    return fail("This estimate link is invalid.", 404);
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const response = normalizeResponse(payload.response);

  if (!response) {
    return fail("Choose Approve or Decline.");
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return fail("Supabase is not configured for estimate approvals.", 503);
  }

  const { data, error } = await supabase.rpc(
    "respond_to_public_estimate_rpc",
    {
      p_token: token,
      p_response: response,
    },
  );

  if (error) {
    return fail(formatRespondError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    result: data,
  });
}
