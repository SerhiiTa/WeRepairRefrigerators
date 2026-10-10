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

  try {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.webhookSecret,
    );
    const result = await processStripeWebhookEvent(event, rawBody);

    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook could not be verified or processed." },
      { status: 400 },
    );
  }
}
