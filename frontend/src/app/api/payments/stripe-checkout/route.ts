import { NextResponse } from "next/server";

import { createStripeCheckoutSession } from "@/server/finance/stripe-checkout";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

type CheckoutTargetType = "estimate" | "invoice";
type CheckoutKind = "deposit" | "custom_deposit" | "pay_in_full" | "balance_due";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getSafeDashboardReturnPath(value: unknown): string | null {
  const path = getString(value);

  if (!path || !path.startsWith("/dashboard")) {
    return null;
  }

  if (path.startsWith("//") || path.includes("\\") || path.includes("\n")) {
    return null;
  }

  return path.slice(0, 300);
}

function getRequestedAmountCents(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : null;

  return Number.isInteger(numeric) && numeric !== null && numeric > 0
    ? numeric
    : null;
}

function formatCheckoutError(message: string) {
  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security") ||
    message.includes("Authentication is required")
  ) {
    return "This account is not allowed to start checkout for that payment target.";
  }

  if (
    message.includes("Invoice") ||
    message.includes("eligible") ||
    message.includes("idempotency") ||
    message.includes("balance") ||
    message.includes("target")
  ) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "Stripe Checkout could not be started."
    : `Stripe Checkout failed: ${message}`;
}

export async function POST(request: Request) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const targetType = getString(payload.targetType) as CheckoutTargetType | null;
  const targetId = getString(payload.targetId);
  const checkoutKind = getString(payload.checkoutKind) as CheckoutKind | null;
  const idempotencyKey = getString(payload.idempotencyKey);
  const revisionId = getString(payload.revisionId);
  const requestedAmountCents = getRequestedAmountCents(payload.requestedAmountCents);
  const returnPath = getSafeDashboardReturnPath(payload.returnPath);

  if (targetType !== "estimate" && targetType !== "invoice") {
    return fail("Choose an Estimate or Invoice payment target.");
  }

  if (
    checkoutKind !== "deposit" &&
    checkoutKind !== "custom_deposit" &&
    checkoutKind !== "pay_in_full" &&
    checkoutKind !== "balance_due"
  ) {
    return fail("Choose a supported checkout action.");
  }

  if (checkoutKind === "custom_deposit" && requestedAmountCents === null) {
    return fail("Enter a valid custom deposit amount.");
  }

  if (!targetId) {
    return fail("Choose a payment target.");
  }

  if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
    return fail("A valid checkout idempotency key is required.");
  }

  try {
    const result = await createStripeCheckoutSession(privateAccess.context.supabase, {
      targetType,
      targetId,
      checkoutKind,
      idempotencyKey,
      requestedAmountCents:
        checkoutKind === "custom_deposit" ? requestedAmountCents : null,
      revisionId,
      origin: new URL(request.url).origin,
      returnPath,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe Checkout could not be started.";
    return fail(formatCheckoutError(message), 403);
  }
}
