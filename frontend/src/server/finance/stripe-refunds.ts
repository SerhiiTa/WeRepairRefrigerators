/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";

import type Stripe from "stripe";

import { HOMEFIX_PRIVATE_COMPANY_ID } from "@/lib/auth/homefix-private-access";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { HomeFixPrivateAccessContext } from "@/server/security/homefix-private-access";

import { getStripeClient, getStripeRuntimeConfig } from "./stripe-config";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PaymentRow = {
  amount: number | string;
  company_id: string | null;
  id: string;
  payment_metadata: Record<string, unknown> | null;
  payment_status: string;
  provider: string | null;
  provider_payment_id: string | null;
  service_request_id: string;
  tip_amount: number | string | null;
  voided_at: string | null;
};

type RefundRow = {
  id: string;
  refund_amount: number | string;
  refund_status: string;
};

type ReserveRefundResult = {
  idempotent?: boolean;
  refund_id?: string;
  refund_status?: string;
  refundable_remaining?: number | string;
};

export type CreateStripeRefundInput = {
  amountCents: number;
  idempotencyKey: string;
  paymentId: string;
  reason: string;
  serviceRequestId: string;
};

export type StripeRefundResult =
  | {
      ok: true;
      providerRefundId: string | null;
      refundId: string;
      status: "pending" | "succeeded" | "failed" | "canceled";
    }
  | {
      ok: false;
      message: string;
      pendingRefundId?: string;
      recoverable?: boolean;
    };

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function normalizeStripeRefundStatus(status: string | null | undefined) {
  if (status === "succeeded" || status === "failed" || status === "canceled") {
    return status;
  }

  return "pending";
}

function mapStripeRefundError(error: unknown) {
  if (error instanceof Error && process.env.NODE_ENV !== "production") {
    return error.message;
  }

  return "Stripe refund could not be started.";
}

function getPaymentIntentId(payment: PaymentRow) {
  const metadataIntent =
    typeof payment.payment_metadata?.stripe_payment_intent_id === "string"
      ? payment.payment_metadata.stripe_payment_intent_id
      : null;

  return metadataIntent ?? payment.provider_payment_id;
}

function getServiceRoleClient() {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Supabase service role is not configured.");
  }

  return serviceRole as any;
}

export function buildRefundIdempotencyKey(params: {
  amountCents: number;
  inputKey: string;
  paymentId: string;
  serviceRequestId: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        purpose: "stripe_refund",
        serviceRequestId: params.serviceRequestId,
        paymentId: params.paymentId,
        amountCents: params.amountCents,
        inputKey: params.inputKey,
      }),
    )
    .digest("hex");
}

export async function createStripePaymentRefund(
  privateAccess: HomeFixPrivateAccessContext,
  input: CreateStripeRefundInput,
): Promise<StripeRefundResult> {
  if (!UUID_PATTERN.test(input.serviceRequestId) || !UUID_PATTERN.test(input.paymentId)) {
    return { ok: false, message: "Choose a valid payment to refund." };
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, message: "Enter a valid refund amount." };
  }

  if (input.reason.trim().length < 3) {
    return { ok: false, message: "Refund reason is required." };
  }

  if (input.idempotencyKey.trim().length < 12) {
    return { ok: false, message: "A valid refund idempotency key is required." };
  }

  const config = getStripeRuntimeConfig();
  const stripe = getStripeClient();

  if (
    (config.mode !== "test" && config.mode !== "production_sandbox_pilot") ||
    !stripe
  ) {
    return { ok: false, message: "Stripe refunds are not configured." };
  }

  const { data: paymentData, error: paymentError } = await privateAccess.supabase
    .from("service_request_payments")
    .select(
      "id,company_id,service_request_id,payment_status,provider,provider_payment_id,payment_metadata,amount,tip_amount,voided_at",
    )
    .eq("id", input.paymentId)
    .maybeSingle();

  if (paymentError) {
    return { ok: false, message: "Payment could not be loaded." };
  }

  const payment = (paymentData ?? null) as PaymentRow | null;

  if (!payment || payment.service_request_id !== input.serviceRequestId) {
    return { ok: false, message: "Payment was not found for this Job." };
  }

  if (payment.company_id !== HOMEFIX_PRIVATE_COMPANY_ID) {
    return { ok: false, message: "Payment does not belong to this company." };
  }

  if (payment.provider !== "stripe" || !getPaymentIntentId(payment)) {
    return { ok: false, message: "Only Stripe payments can be refunded here." };
  }

  if (payment.voided_at || payment.payment_status === "void") {
    return { ok: false, message: "Voided payments cannot be refunded." };
  }

  const stableIdempotencyKey = buildRefundIdempotencyKey({
    amountCents: input.amountCents,
    inputKey: input.idempotencyKey.trim(),
    paymentId: input.paymentId,
    serviceRequestId: input.serviceRequestId,
  });

  const reserveResult = await privateAccess.supabase.rpc(
    "reserve_service_request_payment_refund_rpc" as never,
    {
      p_service_request_id: input.serviceRequestId,
      p_payment_id: input.paymentId,
      p_refund_type: "stripe",
      p_refund_amount: centsToDollars(input.amountCents),
      p_refund_reason: input.reason.trim(),
      p_idempotency_key: stableIdempotencyKey,
      p_allocation_adjustments: null,
      p_provider_refund_id: null,
    } as never,
  );

  if (reserveResult.error) {
    return { ok: false, message: reserveResult.error.message };
  }

  const reserved = (reserveResult.data ?? {}) as ReserveRefundResult;
  const refundId = reserved.refund_id;

  if (!refundId) {
    return { ok: false, message: "Refund reservation did not return a refund ID." };
  }

  const existing = await privateAccess.supabase
    .from("service_request_payment_refunds" as never)
    .select("id,refund_status,refund_amount,provider_refund_id")
    .eq("id", refundId)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, message: "Refund reservation could not be verified." };
  }

  const existingRefund = existing.data as
    | (RefundRow & { provider_refund_id?: string | null })
    | null;

  if (reserved.idempotent && existingRefund?.provider_refund_id) {
    return {
      ok: true,
      providerRefundId: existingRefund.provider_refund_id,
      refundId,
      status: normalizeStripeRefundStatus(existingRefund.refund_status),
    };
  }

  let stripeRefund: Stripe.Refund;

  try {
    stripeRefund = await stripe.refunds.create(
      {
        amount: input.amountCents,
        metadata: {
          homefixos_refund_id: refundId,
          homefixos_payment_id: input.paymentId,
          homefixos_service_request_id: input.serviceRequestId,
        },
        payment_intent: getPaymentIntentId(payment) ?? undefined,
      },
      {
        idempotencyKey: stableIdempotencyKey,
      },
    );
  } catch (error) {
    return {
      ok: false,
      message: mapStripeRefundError(error),
      pendingRefundId: refundId,
      recoverable: true,
    };
  }

  const status = normalizeStripeRefundStatus(stripeRefund.status);
  const serviceRole = getServiceRoleClient();

  const { error: updateError } = await serviceRole
    .from("service_request_payment_refunds" as never)
    .update({
      provider_refund_id: stripeRefund.id,
      metadata: {
        stripe_refund_id: stripeRefund.id,
        stripe_refund_status: stripeRefund.status,
      },
    } as never)
    .eq("id", refundId);

  if (updateError) {
    return {
      ok: false,
      message: "Stripe refund was created, but local refund state could not be updated.",
      pendingRefundId: refundId,
      recoverable: true,
    };
  }

  if (status === "succeeded") {
    const confirmed = await serviceRole.rpc(
      "confirm_stripe_service_request_payment_refund_rpc" as never,
      {
        p_refund_id: refundId,
        p_provider_refund_id: stripeRefund.id,
        p_provider_event_id: `stripe-api:${stripeRefund.id}`,
        p_metadata: {
          stripe_refund_status: stripeRefund.status,
          stripe_refund_api_confirmed: true,
        },
      } as never,
    );

    if (confirmed.error) {
      return {
        ok: false,
        message:
          "Stripe refund succeeded, but local confirmation is pending provider reconciliation.",
        pendingRefundId: refundId,
        recoverable: true,
      };
    }
  }

  if (status === "failed" || status === "canceled") {
    const failed = await privateAccess.supabase.rpc(
      "record_failed_service_request_payment_refund_rpc" as never,
      {
        p_refund_id: refundId,
        p_refund_status: status,
        p_failure_reason: `Stripe refund API returned ${status}.`,
        p_provider_event_id: `stripe-api:${stripeRefund.id}`,
        p_metadata: {
          stripe_refund_status: stripeRefund.status,
          stripe_refund_api_terminal: true,
        },
      } as never,
    );

    if (failed.error) {
      return {
        ok: false,
        message:
          "Stripe refund returned a terminal status, but local refund state could not be released.",
        pendingRefundId: refundId,
        recoverable: true,
      };
    }
  }

  return {
    ok: true,
    providerRefundId: stripeRefund.id,
    refundId,
    status,
  };
}
