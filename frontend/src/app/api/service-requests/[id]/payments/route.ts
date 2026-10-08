import { NextResponse } from "next/server";

import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

type ServiceRequestPaymentsRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type ManualPaymentTargetType = "estimate" | "invoice";
type ManualPaymentMethod = "cash" | "check" | "zelle" | "venmo" | "cash_app";

const MANUAL_PAYMENT_METHODS = new Set<ManualPaymentMethod>([
  "cash",
  "check",
  "zelle",
  "venmo",
  "cash_app",
]);

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
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

function formatPaymentError(message: string): string {
  if (
    message.includes("record_manual_service_request_payment_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Manual payments are not ready yet. Apply the PAYMENTS-03 migration in Supabase, then try again.";
  }

  if (
    message.includes("not allowed") ||
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to record payments for that job.";
  }

  if (
    message.includes("exceeds") ||
    message.includes("same service request") ||
    message.includes("company") ||
    message.includes("approved estimates") ||
    message.includes("void invoice") ||
    message.includes("converted to an Invoice") ||
    message.includes("Record payment against the Invoice") ||
    message.includes("idempotency")
  ) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "Payment could not be recorded."
    : `Payment failed: ${message}`;
}

export async function POST(
  request: Request,
  { params }: ServiceRequestPaymentsRouteProps,
) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }

  const { id: serviceRequestId } = await params;

  if (!isUuid(serviceRequestId)) {
    return fail("Choose a valid job before collecting payment.");
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const targetType = getString(payload.targetType) as ManualPaymentTargetType | null;
  const targetId = getString(payload.targetId);
  const paymentMethod = getString(payload.paymentMethod) as ManualPaymentMethod | null;
  const idempotencyKey = getString(payload.idempotencyKey);
  const amountCents = parseMoneyToCents(payload.amount);
  const referenceCode = getString(payload.referenceCode);
  const note = getString(payload.note);

  if (targetType !== "estimate" && targetType !== "invoice") {
    return fail("Choose an estimate deposit or invoice payment target.");
  }

  if (!targetId || !isUuid(targetId)) {
    return fail("Choose a valid payment target.");
  }

  if (!paymentMethod || !MANUAL_PAYMENT_METHODS.has(paymentMethod)) {
    return fail("Choose a supported manual payment method.");
  }

  if (amountCents === null || amountCents <= 0) {
    return fail("Enter a valid payment amount.");
  }

  if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 120) {
    return fail("A valid payment idempotency key is required.");
  }

  const amount = (amountCents / 100).toFixed(2);

  const { data, error } = await privateAccess.context.supabase.rpc(
    "record_manual_service_request_payment_rpc" as never,
    {
      p_service_request_id: serviceRequestId,
      p_target_type: targetType,
      p_target_id: targetId,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_reference_code: referenceCode,
      p_note: note,
      p_idempotency_key: idempotencyKey,
    } as never,
  );

  if (error) {
    return fail(formatPaymentError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    result: data,
  });
}
