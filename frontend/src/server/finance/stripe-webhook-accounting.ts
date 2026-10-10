/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";

import type Stripe from "stripe";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { getStripeRuntimeConfig } from "./stripe-config";

type CheckoutAttempt = {
  id: string;
  amount: number | string;
  checkout_status: string;
  company_id: string;
  service_request_id: string;
  estimate_id: string | null;
  invoice_id: string | null;
  target_type: "estimate" | "invoice";
  checkout_kind: string;
  succeeded_payment_id: string | null;
};

type PaymentRow = {
  id: string;
  payment_metadata: Record<string, unknown> | null;
};

type ProviderEventRow = {
  id: string;
  payment_id: string | null;
  provider_event_id: string;
  processing_status: string;
};

function digestPayload(payload: string) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function isDuplicateError(error: { code?: string; message?: string }) {
  return error.code === "23505" || error.message?.includes("duplicate key");
}

function getAttemptIdFromEvent(event: Stripe.Event): string | null {
  const dataObject = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
  const metadata = dataObject.metadata ?? {};

  return typeof metadata.homefixos_checkout_attempt_id === "string"
    ? metadata.homefixos_checkout_attempt_id
    : null;
}

async function insertProviderEvent(params: {
  attempt: CheckoutAttempt | null;
  event: Stripe.Event;
  rawBody: string;
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  const { data, error } = await (serviceRole as any)
    .from("service_request_payment_provider_events")
    .insert({
      company_id: params.attempt?.company_id ?? null,
      service_request_id: params.attempt?.service_request_id ?? null,
      checkout_attempt_id: params.attempt?.id ?? null,
      provider: "stripe",
      provider_event_id: params.event.id,
      provider_event_type: params.event.type,
      processing_status: "received",
      payload_digest: digestPayload(params.rawBody),
      event_metadata: {
        livemode: params.event.livemode,
        created: params.event.created,
      },
    })
    .select("id,payment_id,provider_event_id,processing_status")
    .single();

  if (error) {
    if (isDuplicateError(error)) {
      return { duplicate: true, row: null as ProviderEventRow | null };
    }

    throw new Error(error.message);
  }

  return { duplicate: false, row: data as ProviderEventRow };
}

async function getAttemptById(attemptId: string | null) {
  if (!attemptId) {
    return null;
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  const { data, error } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as CheckoutAttempt | null;
}

async function markProviderEvent(
  eventId: string,
  values: Record<string, unknown>,
) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  const { error } = await (serviceRole as any)
    .from("service_request_payment_provider_events")
    .update({
      ...values,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markProviderEventBlocked(params: {
  attempt: CheckoutAttempt | null;
  event: Stripe.Event;
  rawBody: string;
  reason: string;
}) {
  const eventInsert = await insertProviderEvent({
    attempt: params.attempt,
    event: params.event,
    rawBody: params.rawBody,
  });

  if (eventInsert.duplicate || !eventInsert.row) {
    return;
  }

  await markProviderEvent(eventInsert.row.id, {
    processing_status: "failed",
    failure_reason: params.reason,
  });
}

async function updateAttempt(attemptId: string, values: Record<string, unknown>) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  const { error } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .update(values)
    .eq("id", attemptId);

  if (error) {
    throw new Error(error.message);
  }
}

async function isAttemptAllowedForRuntime(attempt: CheckoutAttempt) {
  const config = getStripeRuntimeConfig();

  if (config.mode !== "production_sandbox_pilot") {
    return true;
  }

  if (!config.pilotCustomerId) {
    return false;
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  const { data, error } = await (serviceRole as any)
    .from("service_requests")
    .select("id,company_id,customer_id")
    .eq("id", attempt.service_request_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  let customerCompanyId: string | null = null;

  if (data?.customer_id) {
    const { data: customer, error: customerError } = await (serviceRole as any)
      .from("customers")
      .select("id,company_id")
      .eq("id", data.customer_id)
      .maybeSingle();

    if (customerError) {
      throw new Error(customerError.message);
    }

    customerCompanyId = customer?.company_id ?? null;
  }

  return Boolean(
    data?.company_id === attempt.company_id &&
      customerCompanyId === data.company_id &&
      data?.customer_id &&
      data.customer_id.toLowerCase() === config.pilotCustomerId,
  );
}

async function markAttemptProcessingFromCheckoutSession(params: {
  attempt: CheckoutAttempt;
  session: Stripe.Checkout.Session;
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  if (
    params.attempt.checkout_status === "succeeded" ||
    params.attempt.succeeded_payment_id
  ) {
    return false;
  }

  const { error } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .update({
      checkout_status: "processing",
      provider_checkout_session_id: params.session.id,
      provider_payment_intent_id:
        typeof params.session.payment_intent === "string"
          ? params.session.payment_intent
          : params.attempt.id,
    })
    .eq("id", params.attempt.id)
    .neq("checkout_status", "succeeded")
    .is("succeeded_payment_id", null);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

async function postCanonicalPaymentAtomically(params: {
  attemptId: string;
  event: Stripe.Event;
  paymentIntent: Stripe.PaymentIntent;
  rawBody: string;
}) {
  if (params.paymentIntent.status !== "succeeded") {
    throw new Error("PaymentIntent was not succeeded.");
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  const { data, error } = await (serviceRole as any).rpc(
    "record_stripe_checkout_payment_rpc",
    {
      p_checkout_attempt_id: params.attemptId,
      p_provider_event_id: params.event.id,
      p_provider_event_type: params.event.type,
      p_provider_payment_intent_id: params.paymentIntent.id,
      p_amount_cents: params.paymentIntent.amount_received,
      p_currency: params.paymentIntent.currency,
      p_payment_status: params.paymentIntent.status,
      p_payload_digest: digestPayload(params.rawBody),
      p_event_metadata: {
        livemode: params.event.livemode,
        created: params.event.created,
      },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function extractPaymentId(result: unknown) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const paymentId = (result as { payment_id?: unknown }).payment_id;
  return typeof paymentId === "string" ? paymentId : null;
}

async function annotateStripeSandboxPayment(paymentId: string) {
  const config = getStripeRuntimeConfig();
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe webhook accounting is not configured.");
  }

  const { data, error } = await (serviceRole as any)
    .from("service_request_payments")
    .select("id,payment_metadata")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    return;
  }

  const payment = data as PaymentRow;
  const { error: updateError } = await (serviceRole as any)
    .from("service_request_payments")
    .update({
      payment_metadata: {
        ...(payment.payment_metadata ?? {}),
        stripe_livemode: false,
        stripe_mode: config.mode,
        stripe_sandbox_pilot: config.mode === "production_sandbox_pilot",
        pilot_customer_id:
          config.mode === "production_sandbox_pilot"
            ? config.pilotCustomerId
            : null,
      },
    })
    .eq("id", paymentId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
  rawBody: string,
) {
  const config = getStripeRuntimeConfig();

  if (
    (config.mode === "test" || config.mode === "production_sandbox_pilot") &&
    event.livemode
  ) {
    return { ok: false, duplicate: false, action: "rejected_live_event" };
  }

  const attemptId = getAttemptIdFromEvent(event);

  if (event.type === "payment_intent.succeeded") {
    if (!attemptId) {
      return { ok: false, duplicate: false, action: "missing_attempt" };
    }

    const attempt = await getAttemptById(attemptId);

    if (!attempt) {
      return { ok: false, duplicate: false, action: "missing_attempt" };
    }

    if (!(await isAttemptAllowedForRuntime(attempt))) {
      await markProviderEventBlocked({
        attempt,
        event,
        rawBody,
        reason: "Stripe Sandbox Pilot rejected a non-allowlisted checkout attempt.",
      });
      return { ok: false, duplicate: false, action: "rejected_non_pilot_attempt" };
    }

    const result = await postCanonicalPaymentAtomically({
      attemptId,
      event,
      paymentIntent: event.data.object as Stripe.PaymentIntent,
      rawBody,
    });
    const paymentId = extractPaymentId(result);

    if (paymentId) {
      await annotateStripeSandboxPayment(paymentId);
    }

    return { ok: true, duplicate: false, action: "posted_payment", result };
  }

  const attempt = await getAttemptById(attemptId);
  const eventInsert = await insertProviderEvent({ attempt, event, rawBody });

  if (eventInsert.duplicate) {
    return { ok: true, duplicate: true, action: "ignored_duplicate" };
  }

  const eventRow = eventInsert.row;

  if (!eventRow) {
    return { ok: true, duplicate: true, action: "ignored_duplicate" };
  }

  if (!attempt) {
    await markProviderEvent(eventRow.id, {
      processing_status: "failed",
      failure_reason: "Checkout attempt was not found.",
    });
    return { ok: false, duplicate: false, action: "missing_attempt" };
  }

  if (!(await isAttemptAllowedForRuntime(attempt))) {
    await markProviderEvent(eventRow.id, {
      processing_status: "failed",
      failure_reason: "Stripe Sandbox Pilot rejected a non-allowlisted checkout attempt.",
    });
    return { ok: false, duplicate: false, action: "rejected_non_pilot_attempt" };
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const updated = await markAttemptProcessingFromCheckoutSession({
      attempt,
      session,
    });
    await markProviderEvent(eventRow.id, { processing_status: "processed" });
    return {
      ok: true,
      duplicate: false,
      action: updated ? "marked_processing" : "preserved_succeeded",
    };
  }

  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired" ||
    event.type === "payment_intent.payment_failed"
  ) {
    await updateAttempt(attempt.id, {
      checkout_status:
        event.type === "checkout.session.expired" ? "expired" : "failed",
      failure_reason: event.type,
    });
    await markProviderEvent(eventRow.id, { processing_status: "processed" });
    return { ok: true, duplicate: false, action: "marked_failed" };
  }

  if (
    event.type.startsWith("charge.refund") ||
    event.type.startsWith("refund.") ||
    event.type.startsWith("charge.dispute.")
  ) {
    await markProviderEvent(eventRow.id, {
      processing_status: "processed",
      failure_reason:
        "Refund and dispute events are recorded for audit only until ledger adjustment support is implemented.",
    });
    return { ok: true, duplicate: false, action: "recorded_audit_only" };
  }

  await markProviderEvent(eventRow.id, {
    processing_status: "processed",
    failure_reason: "Unsupported Stripe event type.",
  });
  return { ok: true, duplicate: false, action: "ignored_unsupported" };
}
