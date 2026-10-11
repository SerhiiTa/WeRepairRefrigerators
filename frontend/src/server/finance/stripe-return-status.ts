/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

import { getStripeClient, getStripeRuntimeConfig } from "./stripe-config";

type CheckoutAttemptRow = {
  id: string;
  amount: number | string;
  checkout_kind: string;
  checkout_metadata?: Record<string, unknown> | null;
  checkout_status: string;
  estimate_id: string | null;
  invoice_id: string | null;
  provider_checkout_session_id: string | null;
  provider_payment_intent_id: string | null;
  succeeded_payment_id: string | null;
  target_type: "estimate" | "invoice";
};

type PublicEstimatePayload = {
  estimate?: {
    id?: string;
    estimate_number?: string;
  };
};

type PublicInvoicePayload = {
  invoice?: {
    balance_due?: number | string | null;
    id?: string;
    invoice_number?: string | null;
    paid?: number | string | null;
    total?: number | string | null;
  };
};

type PublicPaymentOptions = {
  balance_due?: number | string | null;
  estimate_number?: string | null;
  invoice_number?: string | null;
  paid?: number | string | null;
  status?: string | null;
  target_type?: "estimate" | "invoice" | null;
  total?: number | string | null;
};

type StripePaymentReturnState = "received" | "processing" | "canceled" | "failed";

export type StripeReturnStatus =
  | {
      authorized: false;
      state: "not_found" | "unauthorized" | "unconfigured";
    }
  | {
      amount: string;
      authorized: true;
      balanceDue: string | null;
      documentHref: string;
      documentNumber: string | null;
      paid: string | null;
      paymentStatus: StripePaymentReturnState;
      targetType: "estimate" | "invoice";
      total: string | null;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

function asMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return amount.toFixed(2);
}

function isRecord(value: Json | undefined): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseEstimatePayload(data: Json): PublicEstimatePayload | null {
  if (!isRecord(data) || !isRecord(data.estimate)) {
    return null;
  }

  return data as unknown as PublicEstimatePayload;
}

function parseInvoicePayload(data: Json): PublicInvoicePayload | null {
  if (!isRecord(data) || !isRecord(data.invoice)) {
    return null;
  }

  return data as unknown as PublicInvoicePayload;
}

function parsePaymentOptions(data: Json | null): PublicPaymentOptions | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  return data as unknown as PublicPaymentOptions;
}

function paymentState(attempt: CheckoutAttemptRow): StripePaymentReturnState {
  if (attempt.checkout_status === "succeeded" || attempt.succeeded_payment_id) {
    return "received";
  }

  if (attempt.checkout_status === "failed") {
    return "failed";
  }

  if (attempt.checkout_status === "expired" || attempt.checkout_status === "canceled") {
    return "canceled";
  }

  return "processing";
}

async function releaseSandboxReservationAfterCancelReturn(
  attempt: CheckoutAttemptRow,
): Promise<CheckoutAttemptRow> {
  if (
    attempt.checkout_status === "succeeded" ||
    attempt.succeeded_payment_id ||
    attempt.checkout_status === "failed" ||
    attempt.checkout_status === "expired" ||
    attempt.checkout_status === "canceled" ||
    !attempt.provider_checkout_session_id
  ) {
    return attempt;
  }

  let config;

  try {
    config = getStripeRuntimeConfig();
  } catch {
    return attempt;
  }

  if (config.mode !== "test" && config.mode !== "production_sandbox_pilot") {
    return attempt;
  }

  const stripe = getStripeClient();

  if (!stripe) {
    return attempt;
  }

  try {
    let session = await stripe.checkout.sessions.retrieve(
      attempt.provider_checkout_session_id,
    );

    if (session.livemode || session.payment_status === "paid") {
      return attempt;
    }

    if (session.status === "open") {
      session = await stripe.checkout.sessions.expire(session.id);
    }

    if (session.status !== "expired" || session.payment_status === "paid") {
      return attempt;
    }

    const serviceRole = getSupabaseServiceRoleClient();

    if (!serviceRole) {
      return attempt;
    }

    const nextStatus = session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)
      ? "expired"
      : "canceled";

    const { data, error } = await (serviceRole as any)
      .from("service_request_payment_checkout_attempts")
      .update({
        checkout_status: nextStatus,
        failure_reason: "checkout_cancel_return",
        checkout_metadata: {
          ...(attempt.checkout_metadata ?? {}),
          stripe_cancel_return_reconciled: true,
          stripe_session_status: session.status,
        },
      })
      .eq("id", attempt.id)
      .in("checkout_status", ["initiated", "processing"])
      .is("succeeded_payment_id", null)
      .select(
        "id,amount,checkout_kind,checkout_metadata,checkout_status,estimate_id,invoice_id,provider_checkout_session_id,provider_payment_intent_id,succeeded_payment_id,target_type",
      )
      .maybeSingle();

    if (error || !data) {
      return attempt;
    }

    return data as CheckoutAttemptRow;
  } catch {
    return attempt;
  }
}

export async function loadStripeReturnStatus(params: {
  attemptId: string | null;
  releaseOnCancelReturn?: boolean;
  token: string | null;
}): Promise<StripeReturnStatus> {
  if (
    !params.attemptId ||
    !UUID_PATTERN.test(params.attemptId) ||
    !params.token ||
    !TOKEN_PATTERN.test(params.token)
  ) {
    return { authorized: false, state: "unauthorized" };
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return { authorized: false, state: "unconfigured" };
  }

  const { data: attemptData, error: attemptError } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .select(
      "id,amount,checkout_kind,checkout_metadata,checkout_status,estimate_id,invoice_id,provider_checkout_session_id,provider_payment_intent_id,succeeded_payment_id,target_type",
    )
    .eq("id", params.attemptId)
    .maybeSingle();

  if (attemptError) {
    return { authorized: false, state: "unauthorized" };
  }

  const attempt = (attemptData ?? null) as CheckoutAttemptRow | null;

  if (!attempt) {
    return { authorized: false, state: "not_found" };
  }

  let documentHref = `/estimates/${params.token}`;
  let documentNumber: string | null = null;
  let paymentOptions: PublicPaymentOptions | null = null;

  if (
    attempt.target_type === "invoice" &&
    attempt.checkout_metadata?.public_invoice_token === true
  ) {
    const { data: invoiceData, error: invoiceError } = await (serviceRole as any).rpc(
      "get_public_invoice_by_token_rpc",
      {
        p_token: params.token,
      },
    );

    if (invoiceError || !invoiceData) {
      return { authorized: false, state: "unauthorized" };
    }

    const invoicePayload = parseInvoicePayload(invoiceData as Json);
    const tokenInvoiceId = invoicePayload?.invoice?.id;

    if (!tokenInvoiceId || tokenInvoiceId !== attempt.invoice_id) {
      return { authorized: false, state: "unauthorized" };
    }

    documentHref = `/invoices/${params.token}`;
    documentNumber = invoicePayload.invoice?.invoice_number ?? null;
    paymentOptions = {
      balance_due: invoicePayload.invoice?.balance_due,
      invoice_number: invoicePayload.invoice?.invoice_number,
      paid: invoicePayload.invoice?.paid,
      target_type: "invoice",
      total: invoicePayload.invoice?.total,
    };
  } else {
    const { data: estimateData, error: estimateError } = await (serviceRole as any).rpc(
      "get_public_estimate_by_token_rpc",
      {
        p_token: params.token,
      },
    );

    if (estimateError || !estimateData) {
      return { authorized: false, state: "unauthorized" };
    }

    const estimatePayload = parseEstimatePayload(estimateData as Json);
    const tokenEstimateId = estimatePayload?.estimate?.id;

    if (!tokenEstimateId || tokenEstimateId !== attempt.estimate_id) {
      return { authorized: false, state: "unauthorized" };
    }

    const { data: paymentData } = await (serviceRole as any).rpc(
      "get_public_estimate_payment_options_rpc",
      {
        p_token: params.token,
      },
    );
    paymentOptions = parsePaymentOptions((paymentData ?? null) as Json | null);
    documentNumber =
      paymentOptions?.invoice_number ??
      paymentOptions?.estimate_number ??
      estimatePayload.estimate?.estimate_number ??
      null;
  }

  const finalAttempt = params.releaseOnCancelReturn
    ? await releaseSandboxReservationAfterCancelReturn(attempt)
    : attempt;

  return {
    amount: asMoney(finalAttempt.amount) ?? "0.00",
    authorized: true,
    balanceDue: asMoney(paymentOptions?.balance_due),
    documentHref,
    documentNumber,
    paid: asMoney(paymentOptions?.paid),
    paymentStatus: paymentState(finalAttempt),
    targetType: finalAttempt.target_type,
    total: asMoney(paymentOptions?.total),
  };
}
