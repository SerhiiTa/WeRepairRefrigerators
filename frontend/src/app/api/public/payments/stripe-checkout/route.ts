import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createPublicStripeCheckoutSession } from "@/server/finance/stripe-checkout";

type CheckoutTargetType = "estimate" | "invoice";
type CheckoutKind = "deposit" | "pay_in_full" | "balance_due";
type CheckoutDocumentType = "estimate" | "invoice";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const TRUSTED_PRODUCTION_RETURN_ORIGINS = new Set([
  "https://werepairrefrigerators.vercel.app",
]);
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getClientKey(request: Request, token: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${ip}:${token.slice(0, 8)}`;
}

function isRateLimited(request: Request, token: string) {
  const now = Date.now();
  const key = getClientKey(request, token);
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_ATTEMPTS_PER_WINDOW;
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function normalizeAllowedHttpOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function isLocalQaOrigin(origin: string) {
  try {
    const url = new URL(origin);

    return (
      process.env.WRA_QA_ENVIRONMENT === "local" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1" ||
        isPrivateIpv4(url.hostname))
    );
  } catch {
    return false;
  }
}

function getTrustedCheckoutReturnOrigin(request: Request) {
  if (process.env.WRA_QA_ENVIRONMENT !== "local") {
    const configuredOrigin = normalizeAllowedHttpOrigin(
      process.env.HOMEFIXOS_PUBLIC_ORIGIN ?? null,
    );

    if (configuredOrigin && TRUSTED_PRODUCTION_RETURN_ORIGINS.has(configuredOrigin)) {
      return configuredOrigin;
    }

    return "https://werepairrefrigerators.vercel.app";
  }

  const candidates = [
    request.headers.get("origin"),
    request.headers.get("referer"),
    (() => {
      const host = request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") ?? "http";

      return host ? `${proto}://${host}` : null;
    })(),
    new URL(request.url).origin,
  ];

  for (const candidate of candidates) {
    const origin = normalizeAllowedHttpOrigin(candidate);

    if (origin && isLocalQaOrigin(origin)) {
      return origin;
    }
  }

  return "http://localhost:3000";
}

function formatCheckoutError(message: string) {
  if (
    message.includes("expired") ||
    message.includes("revoked") ||
    message.includes("not eligible") ||
    message.includes("already paid") ||
    message.includes("Invoice") ||
    message.includes("deposit") ||
    message.includes("idempotency")
  ) {
    return message;
  }

  if (
    message.includes("not found") ||
    message.includes("permission denied") ||
    message.includes("row-level security") ||
    message.includes("invalid")
  ) {
    return "This payment link is not available.";
  }

  return process.env.NODE_ENV === "production"
    ? "Stripe Checkout could not be started."
    : `Stripe Checkout failed: ${message}`;
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const token = getString(payload.token);
  const documentType =
    (getString(payload.documentType) as CheckoutDocumentType | null) ?? "estimate";
  const targetType = getString(payload.targetType) as CheckoutTargetType | null;
  const checkoutKind = getString(payload.checkoutKind) as CheckoutKind | null;
  const idempotencyKey = getString(payload.idempotencyKey);

  if (documentType !== "estimate" && documentType !== "invoice") {
    return fail("Choose a supported payment document.");
  }

  if (!token || !TOKEN_PATTERN.test(token)) {
    return fail("This payment link is not available.", 404);
  }

  if (isRateLimited(request, token)) {
    return fail("Too many checkout attempts. Please wait a moment and try again.", 429);
  }

  if (targetType !== "estimate" && targetType !== "invoice") {
    return fail("Choose an Estimate or Invoice payment target.");
  }

  if (
    checkoutKind !== "deposit" &&
    checkoutKind !== "pay_in_full" &&
    checkoutKind !== "balance_due"
  ) {
    return fail("Choose a supported checkout action.");
  }

  if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
    return fail("A valid checkout idempotency key is required.");
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return fail("Checkout is not configured.", 503);
  }

  try {
    const result = await createPublicStripeCheckoutSession(supabase, {
      documentType,
      token,
      targetType,
      checkoutKind,
      idempotencyKey,
      origin: getTrustedCheckoutReturnOrigin(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe Checkout could not be started.";
    return fail(formatCheckoutError(message), 403);
  }
}
