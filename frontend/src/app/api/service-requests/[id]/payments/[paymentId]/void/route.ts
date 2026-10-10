import { NextResponse } from "next/server";

import {
  requireHomeFixPrivateAccess,
  type HomeFixPrivateAccessContext,
} from "@/server/security/homefix-private-access";

type ServiceRequestPaymentVoidRouteProps = {
  params: Promise<{
    id: string;
    paymentId: string;
  }>;
};

const VOID_REASONS = new Set([
  "payment_not_received",
  "entered_by_mistake",
  "check_returned",
  "incorrect_amount",
  "other",
]);

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

async function resolveServiceRequestIdForPayment(
  supabase: HomeFixPrivateAccessContext["supabase"],
  paymentId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("service_request_payments")
    .select("service_request_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !data?.service_request_id) {
    return null;
  }

  return data.service_request_id;
}

function formatVoidPaymentError(message: string): string {
  if (
    message.includes("void_manual_service_request_payment_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Payment voids are not ready yet. Apply the PAYMENT-06 migration in Supabase, then try again.";
  }

  if (
    message.includes("not allowed") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to void payments for that job.";
  }

  if (
    message.includes("already been voided") ||
    message.includes("Only manually recorded payments") ||
    message.includes("refund workflow") ||
    message.includes("valid void reason") ||
    message.includes("Other") ||
    message.includes("same company") ||
    message.includes("selected job")
  ) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "Payment could not be voided."
    : `Payment void failed: ${message}`;
}

export async function POST(
  request: Request,
  { params }: ServiceRequestPaymentVoidRouteProps,
) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }

  const { id: routeServiceRequestId, paymentId } = await params;

  if (!isUuid(paymentId)) {
    return fail("Choose a valid payment to void.");
  }

  const serviceRequestId = isUuid(routeServiceRequestId)
    ? routeServiceRequestId
    : await resolveServiceRequestIdForPayment(
        privateAccess.context.supabase,
        paymentId,
      );

  if (!serviceRequestId) {
    return fail("Choose a valid job before voiding payment.");
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const reason = getString(payload.reason);
  const reasonNote = getString(payload.reasonNote);

  if (!reason || !VOID_REASONS.has(reason)) {
    return fail("Choose a valid void reason.");
  }

  if (reason === "other" && (!reasonNote || reasonNote.length < 3)) {
    return fail("Add an explanation when using Other as the void reason.");
  }

  const { data, error } = await privateAccess.context.supabase.rpc(
    "void_manual_service_request_payment_rpc" as never,
    {
      p_service_request_id: serviceRequestId,
      p_payment_id: paymentId,
      p_reason: reason,
      p_reason_note: reasonNote,
    } as never,
  );

  if (error) {
    return fail(formatVoidPaymentError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    result: data,
  });
}
