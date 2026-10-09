import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateReviseRouteProps = {
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

function formatReviseError(message: string): string {
  if (
    message.includes("revise_service_request_estimate_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Estimate revision support is not ready yet. Apply the customer revision migration, then try again.";
  }

  if (message.includes("payments")) {
    return "This estimate already has payments, so it cannot be revised in place. Create a supplemental estimate instead.";
  }

  if (message.includes("invoice")) {
    return "This estimate is linked to an invoice, so it cannot be revised in place.";
  }

  if (message.includes("sent or declined")) {
    return "Only sent or declined estimates can be reopened as a draft revision.";
  }

  if (message.includes("not accessible") || message.includes("permission denied")) {
    return "This account is not allowed to revise that estimate.";
  }

  if (message.includes("not found")) {
    return "Estimate not found.";
  }

  return "Estimate could not be reopened for revision.";
}

export async function POST(
  request: Request,
  { params }: EstimateReviseRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("Auth missing: a logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for estimate revisions.", 503);
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Invalid estimate id: choose a valid estimate to revise.", 400);
  }

  const { data, error } = await supabase.rpc(
    "revise_service_request_estimate_rpc",
    {
      p_estimate_id: id,
    },
  );

  if (error) {
    return fail(formatReviseError(error.message), 409);
  }

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}
