import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateSendRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type FailureDebug = {
  category: string;
  code?: string;
  details?: string;
  hint?: string;
  estimateId?: string;
};

function fail(message: string, status = 400, debug?: FailureDebug) {
  const body: {
    ok: false;
    message: string;
    debug?: FailureDebug;
  } = { ok: false, message };

  if (process.env.NODE_ENV !== "production" && debug) {
    body.debug = debug;
  }

  return NextResponse.json(body, { status });
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

function logSendError(context: string, debug: FailureDebug) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[Estimate Approval] Send API failed", {
    context,
    ...debug,
  });
}

function classifySendError(error: PostgrestError): {
  message: string;
  status: number;
  debug: FailureDebug;
} {
  const message = error.message;
  const details = error.details ?? undefined;
  const hint = error.hint ?? undefined;
  const code = error.code ?? undefined;
  const combined = `${message} ${details ?? ""} ${hint ?? ""}`.toLowerCase();

  if (
    message.includes("send_service_request_estimate_to_customer_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return {
      message:
        "RPC missing: send_service_request_estimate_to_customer_rpc is not available. Apply migration 0026 in Supabase, then try again.",
      status: 503,
      debug: {
        category: "rpc_missing",
        code,
        details,
        hint,
      },
    };
  }

  if (message.includes("draft")) {
    return {
      message: "Estimate validation failed: only draft estimates can be sent.",
      status: 409,
      debug: {
        category: "estimate_not_draft",
        code,
        details,
        hint,
      },
    };
  }

  if (message.includes("not found")) {
    return {
      message: "Estimate not found: choose an existing draft estimate.",
      status: 404,
      debug: {
        category: "estimate_not_found",
        code,
        details,
        hint,
      },
    };
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return {
      message:
        "RPC permission denied: this account is not allowed to send that estimate.",
      status: 403,
      debug: {
        category: "rpc_permission_denied",
        code,
        details,
        hint,
      },
    };
  }

  if (
    code === "23514" ||
    combined.includes("check constraint") ||
    combined.includes("violates check")
  ) {
    return {
      message:
        "Database validation failed while sending the estimate. In development, check the response debug payload and server console for the exact constraint.",
      status: 422,
      debug: {
        category: combined.includes("service_request_notes")
          ? "timeline_note_constraint"
          : "database_validation_failed",
        code,
        details,
        hint,
      },
    };
  }

  if (code?.startsWith("22") || code?.startsWith("23")) {
    return {
      message:
        "Database error while sending the estimate. In development, check the response debug payload and server console.",
      status: 422,
      debug: {
        category: "database_error",
        code,
        details,
        hint,
      },
    };
  }

  return {
    message:
      process.env.NODE_ENV === "production"
        ? "We could not send this estimate yet."
        : `Database error while sending estimate: ${message}`,
    status: 500,
    debug: {
      category: "database_error",
      code,
      details,
      hint,
    },
  };
}

export async function POST(
  request: Request,
  { params }: EstimateSendRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("Auth missing: a logged-in dashboard session is required.", 401, {
      category: "auth_missing",
    });
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for estimate approval links.", 503, {
      category: "supabase_unavailable",
    });
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    const debug = {
      category: "auth_invalid",
      code: userError?.name,
      details: userError?.message,
    };
    logSendError("getUser", debug);

    return fail("Auth invalid: a valid authenticated session is required.", 401, debug);
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Invalid estimate id: choose a valid estimate to send.", 400, {
      category: "invalid_estimate_id",
      estimateId: id,
    });
  }

  const { data, error } = await supabase.rpc(
    "send_service_request_estimate_to_customer_rpc",
    {
      p_estimate_id: id,
    },
  );

  if (error) {
    const classified = classifySendError(error);
    const debug = {
      ...classified.debug,
      estimateId: id,
    };

    logSendError("send_service_request_estimate_to_customer_rpc", debug);

    return fail(classified.message, classified.status, debug);
  }

  const token =
    data && typeof data === "object" && "approval_token" in data
      ? String(data.approval_token ?? "")
      : "";

  if (!/^[0-9a-f]{64}$/i.test(token)) {
    const debug = {
      category: "rpc_validation_failed",
      estimateId: id,
      details: "RPC returned without a valid 64-character approval token.",
    };

    logSendError("rpc_result", debug);

    return fail("RPC validation failed: approval token was not returned.", 500, debug);
  }

  const approvalUrl = new URL(`/estimates/${token}`, request.url).toString();

  try {
    await supabase.rpc("record_estimate_learning_event_rpc", {
      p_request_id: null,
      p_estimate_id: id,
      p_event_type: "draft_sent",
      p_decision_context: {
        eventSource: "estimate_send_api",
        sentAt: new Date().toISOString(),
      },
    });
  } catch {
    // Learning events are best-effort and must never block estimate sending.
  }

  return NextResponse.json({
    ok: true,
    estimate: data,
    approvalUrl,
  });
}
