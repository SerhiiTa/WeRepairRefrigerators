import { NextResponse } from "next/server";

import { createStripePaymentRefund } from "@/server/finance/stripe-refunds";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

type ServiceRequestPaymentRefundRouteProps = {
  params: Promise<{
    id: string;
    paymentId: string;
  }>;
};

function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function parseMoneyToCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return Math.round(value * 100);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/[$,\s]/g, "");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [dollars, cents = ""] = normalized.split(".");
  return Number.parseInt(dollars, 10) * 100 + Number.parseInt(cents.padEnd(2, "0"), 10);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function POST(
  request: Request,
  { params }: ServiceRequestPaymentRefundRouteProps,
) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }

  const { id: serviceRequestId, paymentId } = await params;

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const amountCents = parseMoneyToCents(payload.amount);
  const reason = getString(payload.reason);
  const idempotencyKey = getString(payload.idempotencyKey);

  if (amountCents === null || amountCents <= 0) {
    return fail("Enter a valid refund amount.");
  }

  if (!reason || reason.length < 3) {
    return fail("Refund reason is required.");
  }

  if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
    return fail("A valid refund idempotency key is required.");
  }

  const result = await createStripePaymentRefund(privateAccess.context, {
    amountCents,
    idempotencyKey,
    paymentId,
    reason,
    serviceRequestId,
  });

  if (!result.ok) {
    return fail(result.message, result.recoverable ? 202 : 403, {
      pendingRefundId: result.pendingRefundId,
      recoverable: result.recoverable ?? false,
    });
  }

  return NextResponse.json({
    ok: true,
    refund: {
      id: result.refundId,
      providerRefundId: result.providerRefundId,
      status: result.status,
    },
  });
}
