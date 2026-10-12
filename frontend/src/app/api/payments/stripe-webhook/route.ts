import { NextResponse } from "next/server";

import { getStripeClient, getStripeRuntimeConfig } from "@/server/finance/stripe-config";
import { processStripeWebhookEvent } from "@/server/finance/stripe-webhook-accounting";

export async function POST(request: Request) {
  const config = getStripeRuntimeConfig();
  const stripe = getStripeClient();

  if (
    (config.mode !== "test" && config.mode !== "production_sandbox_pilot") ||
    !stripe ||
    !config.webhookSecret
  ) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook handling is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook signature is required." },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.webhookSecret,
    );
  } catch {
    console.error("[stripe-webhook-diagnostic]", {
      errorCategory: "signature_verification_failed",
      stage: "signature",
    });
    return NextResponse.json(
      { ok: false, message: "Stripe webhook could not be verified or processed." },
      { status: 400 },
    );
  }

  try {
    const result = await processStripeWebhookEvent(event, rawBody);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[stripe-webhook-diagnostic]", {
      errorCategory: "processing_failed",
      eventId: event.id,
      eventType: event.type,
      message:
        error instanceof Error && process.env.NODE_ENV !== "production"
          ? error.message
          : undefined,
      stage: "processing",
    });
    return NextResponse.json(
      { ok: false, message: "Stripe webhook could not be verified or processed." },
      { status: 400 },
    );
  }
}
