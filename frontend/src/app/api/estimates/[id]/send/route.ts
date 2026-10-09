import { NextResponse } from "next/server";

import { sendEstimateRevisionSms } from "@/server/finance/estimate-communications-delivery";
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

type SendEstimatePayload = {
  channel?: unknown;
  recipient?: unknown;
  messagePreview?: unknown;
  idempotencyKey?: unknown;
  allowCustomerEmailReplacement?: unknown;
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidSmsRecipient(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function normalizeChannel(value: unknown): "sms" | "email" | null {
  return value === "sms" || value === "email" ? value : null;
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

function formatEstimateSendFailure(message: string): string {
  if (
    message.includes("send_service_request_estimate_to_customer_rpc") ||
    message.includes("service_request_estimate_revisions") ||
    message.includes("service_request_estimate_revision_deliveries") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Estimate revision delivery is not ready yet. Apply migration 0119 before sending.";
  }

  if (message.includes("not accessible") || message.includes("permission denied")) {
    return "This account is not allowed to send that estimate.";
  }

  if (message.includes("line item") || message.includes("greater than zero")) {
    return message;
  }

  return "Estimate could not be sent. Please try again.";
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

  let payload: SendEstimatePayload;

  try {
    payload = (await request.json()) as SendEstimatePayload;
  } catch {
    return fail("Send Estimate requires a valid JSON body.", 400, {
      category: "invalid_json",
      estimateId: id,
    });
  }

  const channel = normalizeChannel(payload.channel);
  const recipient =
    typeof payload.recipient === "string" ? payload.recipient.trim() : "";
  const idempotencyKey =
    typeof payload.idempotencyKey === "string"
      ? payload.idempotencyKey.trim().slice(0, 220)
      : "";

  if (!channel) {
    return fail("Choose SMS or Email before sending this estimate.", 400, {
      category: "invalid_delivery_channel",
      estimateId: id,
    });
  }

  if (
    (channel === "sms" && !isValidSmsRecipient(recipient)) ||
    (channel === "email" && !isValidEmail(recipient))
  ) {
    return fail(
      channel === "sms"
        ? "Enter a valid customer phone number before sending."
        : "Enter a valid customer email before sending.",
      400,
      {
        category: "invalid_recipient",
        estimateId: id,
      },
    );
  }

  if (!idempotencyKey) {
    return fail("Send Estimate requires an idempotency key.", 400, {
      category: "missing_idempotency_key",
      estimateId: id,
    });
  }

  if (channel === "email") {
    return fail("Email estimate delivery is not configured yet. Choose SMS for this send.", 503, {
      category: "provider_unavailable",
      estimateId: id,
      details: "Outbound estimate email has no configured provider.",
    });
  }

  const deliveryResult = await sendEstimateRevisionSms({
    estimateId: id,
    idempotencyKey,
    messagePreview:
      typeof payload.messagePreview === "string" && payload.messagePreview.trim()
        ? payload.messagePreview.trim()
        : "Please review your estimate:",
    recipient,
    request,
    sendRevision: async () => {
      const { data, error } = await supabase.rpc(
        "send_service_request_estimate_to_customer_rpc",
        { p_estimate_id: id },
      );

      if (error) {
        throw error;
      }

      return (data ?? {}) as {
        approval_token?: string;
        estimate_number?: string | null;
        estimate_status?: string;
        id?: string;
        revision_id?: string;
        revision_number?: number;
        service_request_status?: string;
      };
    },
  }).catch((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : "Estimate could not be sent.";
    const message = formatEstimateSendFailure(rawMessage);
    logSendError("sendEstimateRevisionSms", {
      category: "send_failed",
      estimateId: id,
      details: rawMessage,
    });
    return { ok: false as const, status: 503, message };
  });

  if (!deliveryResult.ok) {
    return fail(deliveryResult.message, deliveryResult.status, {
      category:
        deliveryResult.status === 409
          ? "idempotency_conflict"
          : deliveryResult.status === 503
            ? "provider_unavailable"
            : "send_failed",
      estimateId: id,
      details: deliveryResult.message,
    });
  }

  return NextResponse.json({
    ok: true,
    message: deliveryResult.approvalUrl
      ? "Estimate sent by SMS."
      : "Estimate send request already completed.",
    approvalUrl: deliveryResult.approvalUrl,
    delivery: {
      channel,
      conversationId: deliveryResult.conversationId,
      communicationMessageId: deliveryResult.messageId,
      providerMessageId: deliveryResult.providerMessageId,
      revisionId: deliveryResult.revisionId,
      revisionNumber: deliveryResult.revisionNumber,
    },
    estimate: {
      id,
      estimate_status: "sent",
    },
  });
}
