import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type CustomerRepairRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type CustomerRepairUpdatePayload = {
  problemDescription?: unknown;
  customerNotes?: unknown;
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

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function formatRepairUpdateError(message: string): string {
  if (
    message.includes("update_customer_repair_details_rpc") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  ) {
    return "Customer repair updates are waiting for the Task 147 database patch.";
  }

  if (message.includes("cannot be edited")) {
    return "This repair can no longer be edited from the customer portal.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This customer account cannot update that repair.";
  }

  if (message.includes("required")) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "We could not update this repair yet."
    : `Customer repair update failed: ${message}`;
}

export async function PATCH(
  request: Request,
  { params }: CustomerRepairRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in customer session is required.", 401);
  }

  let payload: CustomerRepairUpdatePayload;

  try {
    payload = (await request.json()) as CustomerRepairUpdatePayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const problemDescription = cleanText(payload.problemDescription, 1200);
  const customerNotes = cleanText(payload.customerNotes, 800);

  if (!problemDescription) {
    return fail("Problem details are required.");
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for customer repairs.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid customer session is required.", 401);
  }

  const { data, error } = await supabase.rpc(
    "update_customer_repair_details_rpc",
    {
      p_service_request_id: id,
      p_problem_description: problemDescription,
      p_customer_notes: customerNotes || null,
    },
  );

  if (error) {
    return fail(formatRepairUpdateError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    request: data,
  });
}
