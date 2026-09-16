import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateRouteProps = {
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatDeleteEstimateError(message: string): string {
  if (
    message.includes("delete_draft_service_request_estimate_rpc") ||
    message.includes("schema cache") ||
    message.includes("Could not find the function")
  ) {
    return "Draft estimate deletion is not ready yet. Apply the latest safe-delete migration in Supabase, then try again.";
  }

  if (message.includes("Only draft estimates")) {
    return "Only draft estimates can be deleted.";
  }

  if (
    message.includes("customer") ||
    message.includes("financial") ||
    message.includes("invoice") ||
    message.includes("history")
  ) {
    return "This estimate can't be deleted because it already contains financial or customer history.";
  }

  if (message.includes("not found")) {
    return "Estimate not found.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to delete that estimate.";
  }

  return "Estimate could not be deleted.";
}

export async function DELETE(request: Request, { params }: EstimateRouteProps) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for estimates.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid draft estimate to delete.");
  }

  const { data, error } = await supabase.rpc(
    "delete_draft_service_request_estimate_rpc",
    {
      p_estimate_id: id,
    },
  );

  if (error) {
    return fail(formatDeleteEstimateError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}
