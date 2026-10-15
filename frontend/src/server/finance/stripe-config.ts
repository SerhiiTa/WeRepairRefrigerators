import Stripe from "stripe";

export type StripeRuntimeMode =
  | "mock"
  | "test"
  | "production_sandbox_pilot"
  | "disabled";

export type StripeRuntimeConfig = {
  mode: StripeRuntimeMode;
  pilotCustomerId: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
};

let cachedStripeClient: Stripe | null = null;
let cachedStripeSecret: string | null = null;

function isLocalQaStripeEnabled() {
  return process.env.NODE_ENV !== "production"
    && process.env.WRA_QA_ENVIRONMENT === "local"
    && process.env.WRA_QA_ENABLE_STRIPE_TEST_MODE === "1";
}

export function getStripeRuntimeConfig(): StripeRuntimeConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

  if (process.env.STRIPE_MOCK_MODE === "1") {
    if (!isLocalQaStripeEnabled()) {
      throw new Error("Stripe mock mode is only allowed in local QA.");
    }

    return {
      mode: "mock",
      pilotCustomerId: null,
      publishableKey: publishableKey || null,
      webhookSecret: webhookSecret || null,
    };
  }

  if (!secretKey) {
    return {
      mode: "disabled",
      pilotCustomerId: null,
      publishableKey: publishableKey || null,
      webhookSecret: webhookSecret || null,
    };
  }

  if (secretKey.startsWith("sk_live_") || publishableKey.startsWith("pk_live_")) {
    throw new Error("Live Stripe keys are not allowed in this Stripe Sandbox workflow.");
  }

  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Stripe Sandbox requires a sk_test_ secret key.");
  }

  if (publishableKey && !publishableKey.startsWith("pk_test_")) {
    throw new Error("Stripe Sandbox publishable key must start with pk_test_.");
  }

  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    throw new Error("Stripe webhook secret must start with whsec_.");
  }

  // As in Production, credentials select the Stripe account. There is no independent account pin.
  return {
    mode: "test",
    pilotCustomerId: null,
    publishableKey: publishableKey || null,
    webhookSecret: webhookSecret || null,
  };
}

export function getStripeClient(): Stripe | null {
  const config = getStripeRuntimeConfig();

  if (config.mode !== "test" && config.mode !== "production_sandbox_pilot") {
    return null;
  }

  if (!cachedStripeClient || cachedStripeSecret !== process.env.STRIPE_SECRET_KEY?.trim()) {
    cachedStripeClient = new Stripe(process.env.STRIPE_SECRET_KEY?.trim() ?? "");
    cachedStripeSecret = process.env.STRIPE_SECRET_KEY?.trim() ?? null;
  }

  return cachedStripeClient;
}
