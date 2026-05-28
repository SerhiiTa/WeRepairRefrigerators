import { NextResponse } from "next/server";

import { isServiceRequestCrmStatus } from "@/lib/service-request-records";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type ServiceRequestStatusRouteProps = {
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

function formatStatusUpdateError(message: string): string {
  if (
    message.includes("schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("update_service_request_status_rpc")
  ) {
    return "Status updates are not ready yet. Apply migration 0019 in Supabase, then try again.";
  }

  if (message.includes("Invalid service request status")) {
    return "Choose a valid service request status.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to update that service request.";
  }

  return "We could not update the service request status yet.";
}

export async function PATCH(
  request: Request,
  { params }: ServiceRequestStatusRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: { status?: unknown };

  try {
    payload = (await request.json()) as { status?: unknown };
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const nextStatus =
    typeof payload.status === "string" ? payload.status.trim() : "";

  if (!isServiceRequestCrmStatus(nextStatus)) {
    return fail("Choose a valid service request status.");
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for status updates.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data, error } = await supabase.rpc(
    "update_service_request_status_rpc",
    {
      p_request_id: id,
      p_next_status: nextStatus,
    },
  );

  if (error) {
    return fail(formatStatusUpdateError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    request: data,
  });
}
