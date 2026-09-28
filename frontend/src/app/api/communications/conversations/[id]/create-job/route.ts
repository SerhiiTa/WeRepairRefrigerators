import { NextResponse } from "next/server";

import {
  convertIntakeRequest,
  extractBearerToken,
  formatIntakeError,
} from "@/server/intake/intake-service";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type ConversationCreateJobRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...(extra ?? {}) }, { status });
}

function formatConversationJobError(message: string) {
  const formatted = formatIntakeError(message);

  if (
    formatted.includes("Intake Inbox") ||
    formatted.includes("intake_requests") ||
    formatted.includes("schema cache") ||
    formatted.includes("Could not find")
  ) {
    return "Communications job creation is waiting for the database update.";
  }

  return formatted
    .replaceAll("Intake request", "Request")
    .replaceAll("intake request", "request")
    .replaceAll("Intake", "Request")
    .replaceAll("intake", "request");
}

function getMissingJobFields(message: string) {
  const fields: string[] = [];
  const lower = message.toLowerCase();

  if (lower.includes("customer name")) {
    fields.push("customer_name");
  }
  if (lower.includes("customer phone") || lower.includes("phone number")) {
    fields.push("customer_phone");
  }
  if (lower.includes("service address")) {
    fields.push("service_address");
  }
  if (lower.includes("zip")) {
    fields.push("zip_code");
  }
  if (lower.includes("appliance type")) {
    fields.push("appliance_type");
  }
  if (lower.includes("problem description")) {
    fields.push("problem_description");
  }

  return fields;
}

export async function POST(
  request: Request,
  { params }: ConversationCreateJobRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Communications is not configured for job creation.", 503);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      allowPossibleDuplicate?: unknown;
    };

    const { data, error } = await supabase.rpc("ensure_communication_job_intake_rpc", {
      p_conversation_id: id,
    });

    if (error) {
      throw new Error(error.message);
    }

    const result =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const intakeRequestId =
      typeof result.intake_request_id === "string" ? result.intake_request_id : null;

    if (!intakeRequestId) {
      throw new Error("Request details could not be prepared for Job creation.");
    }

    const conversion = await convertIntakeRequest(accessToken, intakeRequestId, {
      allowPossibleDuplicate: body.allowPossibleDuplicate === true,
    });

    return NextResponse.json({ ok: true, conversion });
  } catch (error) {
    const message = formatConversationJobError(
      error instanceof Error ? error.message : "Conversation job creation failed.",
    );
    const missingFields = getMissingJobFields(message);

    return fail(
      message,
      503,
      missingFields.length > 0 ? { missingFields } : undefined,
    );
  }
}
