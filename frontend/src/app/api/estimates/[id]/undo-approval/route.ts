import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateUndoApprovalRouteProps = {
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

function formatUndoApprovalError(message: string): string {
  if (
    message.includes("undo_service_request_estimate_approval_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Undo Approval is not ready yet. Apply the latest lifecycle migration in Supabase, then try again.";
  }

  if (message.includes("payment history")) {
    return "Cannot undo approval: payment history is already recorded.";
  }

  if (message.includes("invoice")) {
    return "Cannot undo approval: this estimate is linked to an invoice.";
  }

  if (message.includes("Only approved estimates")) {
    return "Only approved estimates can have approval undone.";
  }

  if (message.includes("not allowed") || message.includes("permission denied")) {
    return "Cannot undo approval: this account does not have permission.";
  }

  if (message.includes("not found")) {
    return "Estimate not found.";
  }

  return "Approval could not be undone.";
}

export async function POST(
  request: Request,
  { params }: EstimateUndoApprovalRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("Log in again before undoing approval.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Undo Approval is not available for this workspace.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("Log in again before undoing approval.", 401);
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid estimate to undo approval.", 400);
  }

  const { data, error } = await supabase.rpc(
    "undo_service_request_estimate_approval_rpc",
    {
      p_estimate_id: id,
    },
  );

  if (error) {
    return fail(formatUndoApprovalError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}
