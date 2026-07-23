import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateManualApproveRouteProps = {
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatManualApprovalError(message: string): string {
  if (
    message.includes("approve_service_request_estimate_for_customer_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Manual approval is not ready yet. Apply the latest estimate approval migration in Supabase, then try again.";
  }

  if (message.includes("not accessible") || message.includes("permission denied")) {
    return "This account is not allowed to approve that estimate.";
  }

  if (message.includes("not found")) {
    return "Choose an existing estimate to approve.";
  }

  if (message.includes("Declined estimates") || message.includes("Voided estimates")) {
    return "This estimate can no longer be manually approved.";
  }

  return "Estimate could not be approved for the customer. Please try again.";
}

export async function POST(
  request: Request,
  { params }: EstimateManualApproveRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("Log in again before approving this estimate.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Manual approval is not available for this workspace.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("Log in again before approving this estimate.", 401);
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid estimate to approve.", 400);
  }

  const { data, error } = await supabase.rpc(
    "approve_service_request_estimate_for_customer_rpc",
    {
      p_estimate_id: id,
    },
  );

  if (error) {
    console.error("Manual estimate approval failed", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      operation: "approve_service_request_estimate_for_customer",
    });

    return fail(formatManualApprovalError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}
