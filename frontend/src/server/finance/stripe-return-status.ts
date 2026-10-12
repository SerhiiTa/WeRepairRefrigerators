/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  service_request_id: string;
  succeeded_payment_id: string | null;
  target_type: "estimate" | "invoice";
};

type PaymentReceiptRow = {
  amount: number | string;
  card_brand: string | null;
  card_last4: string | null;
  paid_at: string;
  payment_method: string;
  payment_status: string;
  job_number: string | null;
  receipt_number: string;
  receipt_token: string;
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
      receipt: {
        amount: string;
        cardBrand: string | null;
        cardLast4: string | null;
        href: string;
        jobNumber: string | null;
        paidAt: string;
        paymentMethod: string;
        receiptNumber: string;
      } | null;
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
  if (attempt.checkout_status === "succeeded" && attempt.succeeded_payment_id) {
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

async function loadPaymentReceipt(
  paymentId: string | null,
  serviceRequestId: string,
): Promise<PaymentReceiptRow | null> {
  if (!paymentId || !UUID_PATTERN.test(paymentId)) {
    return null;
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data: existingReceipt, error: existingReceiptError } = await (serviceRole as any)
    .from("service_request_payment_receipts")
    .select("id")
    .eq("payment_id", paymentId)
    .maybeSingle();

  if (existingReceiptError || !existingReceipt?.id) {
    return null;
  }

  const { data: receiptTokenData, error: receiptTokenError } = await (serviceRole as any).rpc(
    "ensure_service_request_payment_receipt_rpc",
    {
      p_payment_id: paymentId,
    },
  );

  if (receiptTokenError || !receiptTokenData?.receipt_token) {
    return null;
  }

  const { data, error } = await (serviceRole as any)
    .from("service_request_payment_receipts")
    .select("amount,card_brand,card_last4,paid_at,payment_method,payment_status,receipt_number")
    .eq("payment_id", paymentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const { data: requestData } = await (serviceRole as any)
    .from("service_requests")
    .select("job_number")
    .eq("id", serviceRequestId)
    .maybeSingle();

  return {
    ...(data as Omit<PaymentReceiptRow, "receipt_token">),
    job_number: requestData?.job_number ? String(requestData.job_number) : null,
    receipt_token: receiptTokenData.receipt_token,
  };
}

async function getCheckoutAttemptById(
  attemptId: string | null,
): Promise<CheckoutAttemptRow | null> {
  if (!attemptId || !UUID_PATTERN.test(attemptId)) {
    return null;
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data, error } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .select(
      "id,amount,checkout_kind,checkout_metadata,checkout_status,estimate_id,invoice_id,provider_checkout_session_id,provider_payment_intent_id,service_request_id,succeeded_payment_id,target_type",
    )
    .eq("id", attemptId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CheckoutAttemptRow;
}

async function canViewDashboardPaymentAttempt(
  supabase: SupabaseClient<Database>,
  serviceRequestId: string,
) {
  const { data, error } = await supabase.rpc("can_view_service_request" as never, {
    p_service_request_id: serviceRequestId,
  } as never);

  return !error && data === true;
}

export async function loadDashboardStripeReturnStatus(params: {
  attemptId: string | null;
  dashboardReturnPath?: string | null;
  supabase: SupabaseClient<Database>;
}): Promise<StripeReturnStatus> {
  const hasSafeDashboardReturn =
    typeof params.dashboardReturnPath === "string" &&
    params.dashboardReturnPath.startsWith("/dashboard") &&
    !params.dashboardReturnPath.startsWith("//") &&
    !params.dashboardReturnPath.includes("\\") &&
    !params.dashboardReturnPath.includes("\n");

  if (!hasSafeDashboardReturn) {
    return { authorized: false, state: "unauthorized" };
  }

  const attempt = await getCheckoutAttemptById(params.attemptId);

  if (!attempt) {
    return { authorized: false, state: "not_found" };
  }

  if (!(await canViewDashboardPaymentAttempt(params.supabase, attempt.service_request_id))) {
    return { authorized: false, state: "unauthorized" };
  }

  const receipt =
    attempt.checkout_status === "succeeded"
      ? await loadPaymentReceipt(attempt.succeeded_payment_id, attempt.service_request_id)
      : null;

  return {
    amount: asMoney(attempt.amount) ?? "0.00",
    authorized: true,
    balanceDue: null,
    documentHref: params.dashboardReturnPath ?? "/dashboard",
    documentNumber: null,
    paid: null,
    paymentStatus: receipt
      ? paymentState(attempt)
      : attempt.checkout_status === "succeeded"
        ? "processing"
        : paymentState(attempt),
    receipt: receipt
      ? {
          amount: asMoney(receipt.amount) ?? "0.00",
          cardBrand: receipt.card_brand,
          cardLast4: receipt.card_last4,
          href: `/receipts/${receipt.receipt_token}`,
          jobNumber: receipt.job_number,
          paidAt: receipt.paid_at,
          paymentMethod: receipt.payment_method,
          receiptNumber: receipt.receipt_number,
        }
      : null,
    targetType: attempt.target_type,
    total: null,
  };
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
        "id,amount,checkout_kind,checkout_metadata,checkout_status,estimate_id,invoice_id,provider_checkout_session_id,provider_payment_intent_id,service_request_id,succeeded_payment_id,target_type",
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
  dashboardReturnPath?: string | null;
  releaseOnCancelReturn?: boolean;
  token: string | null;
}): Promise<StripeReturnStatus> {
  const hasSafeDashboardReturn =
    typeof params.dashboardReturnPath === "string" &&
    params.dashboardReturnPath.startsWith("/dashboard") &&
    !params.dashboardReturnPath.startsWith("//") &&
    !params.dashboardReturnPath.includes("\\") &&
    !params.dashboardReturnPath.includes("\n");

  if (
    !params.attemptId ||
    !UUID_PATTERN.test(params.attemptId)
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
      "id,amount,checkout_kind,checkout_metadata,checkout_status,estimate_id,invoice_id,provider_checkout_session_id,provider_payment_intent_id,service_request_id,succeeded_payment_id,target_type",
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

  if (
    params.releaseOnCancelReturn &&
    hasSafeDashboardReturn &&
    (!params.token || !TOKEN_PATTERN.test(params.token))
  ) {
    await releaseSandboxReservationAfterCancelReturn(attempt);
    return { authorized: false, state: "unauthorized" };
  }

  if (!params.token || !TOKEN_PATTERN.test(params.token)) {
    return { authorized: false, state: "unauthorized" };
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
  const receipt =
    finalAttempt.checkout_status === "succeeded"
      ? await loadPaymentReceipt(
          finalAttempt.succeeded_payment_id,
          finalAttempt.service_request_id,
        )
      : null;

  return {
    amount: asMoney(finalAttempt.amount) ?? "0.00",
    authorized: true,
    balanceDue: asMoney(paymentOptions?.balance_due),
    documentHref,
    documentNumber,
    paid: asMoney(paymentOptions?.paid),
    paymentStatus: receipt
      ? paymentState(finalAttempt)
      : finalAttempt.checkout_status === "succeeded"
        ? "processing"
        : paymentState(finalAttempt),
    receipt: receipt
      ? {
          amount: asMoney(receipt.amount) ?? "0.00",
          cardBrand: receipt.card_brand,
          cardLast4: receipt.card_last4,
          href: `/receipts/${receipt.receipt_token}`,
          jobNumber: receipt.job_number,
          paidAt: receipt.paid_at,
          paymentMethod: receipt.payment_method,
          receiptNumber: receipt.receipt_number,
        }
      : null,
    targetType: finalAttempt.target_type,
    total: asMoney(paymentOptions?.total),
  };
}
