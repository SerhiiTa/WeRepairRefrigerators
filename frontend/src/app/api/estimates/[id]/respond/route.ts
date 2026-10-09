import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
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

  if (message.includes("has been updated") || message.includes("newest estimate")) {
    return "This estimate has been updated. Please ask the technician for the newest approval link.";
  }

  if (message.includes("expired")) {
    return "This estimate link has expired. Please ask the technician to resend the estimate.";
  }

  if (message.includes("current sent estimate revision")) {
    return "This estimate is no longer open for approval.";
  }

  if (message.includes("not found")) {
    return "This estimate link is invalid or expired.";
  }

  return "We could not record this estimate response yet.";
}

async function refreshCommunicationSummaryAfterResponse(input: {
  estimateId: string;
  response: "approved" | "declined";
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return;
  }

  const { data: estimate } = await serviceRole
    .from("service_request_estimates")
    .select("id,service_request_id,estimate_number")
    .eq("id", input.estimateId)
    .maybeSingle();

  if (!estimate?.service_request_id) {
    return;
  }

  const { data: serviceRequest } = await serviceRole
    .from("service_requests")
    .select("id,company_id")
    .eq("id", estimate.service_request_id)
    .maybeSingle();

  if (!serviceRequest?.company_id) {
    return;
  }

  const approved = input.response === "approved";

  await serviceRole
    .from("communication_conversations")
    .update({
      summary: `Estimate ${estimate.estimate_number ?? "Estimate"} ${
        approved ? "approved" : "declined"
      } by customer.`,
      next_action: approved
        ? "Estimate approved. Review scheduling, invoice, or deposit next steps."
        : "Estimate declined. Follow up with the customer if a revision is needed.",
      status: "needs_action",
      last_event_at: new Date().toISOString(),
    })
    .eq("company_id", serviceRequest.company_id)
    .eq("service_request_id", estimate.service_request_id);
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

  const { data: refreshedEstimate } = await supabase.rpc(
    "get_public_estimate_by_token_rpc",
    {
      p_token: token,
    },
  );

  const estimateId =
    data && typeof data === "object" && "id" in data && typeof data.id === "string"
      ? data.id
      : null;

  if (estimateId) {
    await refreshCommunicationSummaryAfterResponse({ estimateId, response });
  }

  return NextResponse.json({
    ok: true,
    result: data,
    estimate: refreshedEstimate ?? null,
  });
}
