/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";

import {
  getStripeClient,
  getStripeRuntimeConfig,
  type StripeRuntimeConfig,
} from "./stripe-config";

type CheckoutTargetType = "estimate" | "invoice";
type CheckoutKind = "deposit" | "pay_in_full" | "balance_due";

type PaymentAction = {
  kind: CheckoutKind;
  amount?: number | string;
  max_amount?: number | string;
};

type EligibilityPayload = {
  target_type?: CheckoutTargetType;
  target_id?: string;
  service_request_id?: string;
  company_id?: string;
  status?: string;
  invoice_redirect_id?: string | null;
  actions?: PaymentAction[];
  reasons?: string[];
};

type CheckoutAttempt = {
  id: string;
  amount: number | string;
  checkout_kind: CheckoutKind;
  checkout_metadata?: Record<string, unknown> | null;
  company_id: string;
  currency: string;
  estimate_id: string | null;
  invoice_id: string | null;
  provider_checkout_session_id?: string | null;
  provider_payment_intent_id?: string | null;
  service_request_id: string;
  target_type: CheckoutTargetType;
};

type ReservePayload = {
  checkout_attempt?: CheckoutAttempt;
  idempotent?: boolean;
  eligibility?: EligibilityPayload;
};

type PaymentTargetContext = {
  companyId: string;
  customerCompanyId: string | null;
  customerId: string | null;
  serviceRequestId: string;
};

export type CreateStripeCheckoutInput = {
  targetType: CheckoutTargetType;
  targetId: string;
  checkoutKind: CheckoutKind;
  idempotencyKey: string;
  revisionId?: string | null;
  origin: string;
};

export type CreatePublicStripeCheckoutInput = {
  documentType?: "estimate" | "invoice";
  token: string;
  targetType: CheckoutTargetType;
  checkoutKind: CheckoutKind;
  idempotencyKey: string;
  origin: string;
};

export type StripeCheckoutResult = {
  ok: true;
  mode: "mock" | "test" | "production_sandbox_pilot";
  checkoutAttemptId: string;
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  amount: string;
  currency: "usd";
  idempotent: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Choose a valid ${label}.`);
  }
}

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseMoneyToCents(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100);
}

function normalizeOrigin(origin: string) {
  const url = new URL(origin);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Checkout origin must use HTTP or HTTPS.");
  }

  return `${url.protocol}//${url.host}`;
}

function buildRequestFingerprint(input: {
  amountCents: number;
  checkoutKind: CheckoutKind;
  revisionId: string | null;
  targetId: string;
  targetType: CheckoutTargetType;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        targetType: input.targetType,
        targetId: input.targetId,
        checkoutKind: input.checkoutKind,
        amountCents: input.amountCents,
        currency: "usd",
        revisionId: input.revisionId,
      }),
    )
    .digest("hex");
}

function buildPublicRequestFingerprint(input: {
  checkoutKind: CheckoutKind;
  targetType: CheckoutTargetType;
  token: string;
}) {
  const tokenDigest = crypto
    .createHash("sha256")
    .update(input.token.toLowerCase())
    .digest("hex");

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tokenDigest,
        targetType: input.targetType,
        checkoutKind: input.checkoutKind,
        currency: "usd",
      }),
    )
    .digest("hex");
}

function getEligibleAction(eligibility: EligibilityPayload, kind: CheckoutKind) {
  return Array.isArray(eligibility.actions)
    ? eligibility.actions.find((action) => action.kind === kind)
    : undefined;
}

function extractAttempt(payload: unknown): CheckoutAttempt {
  const attempt = (payload as ReservePayload | null)?.checkout_attempt;

  if (!attempt?.id) {
    throw new Error("Checkout reservation response was missing an attempt.");
  }

  return attempt;
}

function extractStoredCheckoutUrl(attempt: CheckoutAttempt): string | null {
  const metadata = attempt.checkout_metadata;
  const value =
    metadata && typeof metadata.stripe_checkout_url === "string"
      ? metadata.stripe_checkout_url
      : null;

  return value;
}

function isStripePaymentEnabled(config = getStripeRuntimeConfig()) {
  return (
    config.mode === "mock" ||
    config.mode === "test" ||
    config.mode === "production_sandbox_pilot"
  );
}

function getStripePublicEligibilityDiagnosticEnv() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const pilotCustomerId =
    process.env.WRA_STRIPE_SANDBOX_PILOT_CUSTOMER_ID?.trim() ?? "";

  return {
    hasSecretKey: Boolean(secretKey),
    secretKeyLooksLive: secretKey.startsWith("sk_live_"),
    secretKeyLooksTest: secretKey.startsWith("sk_test_"),
    hasPublishableKey: Boolean(publishableKey),
    publishableKeyLooksLive: publishableKey.startsWith("pk_live_"),
    publishableKeyLooksTest: publishableKey.startsWith("pk_test_"),
    hasWebhookSecret: Boolean(webhookSecret),
    webhookSecretLooksValid: webhookSecret.startsWith("whsec_"),
    hasPilotCustomerId: Boolean(pilotCustomerId),
    pilotCustomerIdLooksUuid: UUID_PATTERN.test(pilotCustomerId),
    mockModeEnabled: process.env.STRIPE_MOCK_MODE === "1",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  };
}

function categorizeStripePublicEligibilityError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("not configured")) {
    return "configuration_missing";
  }

  if (message.includes("valid UUID")) {
    return "invalid_pilot_customer_id";
  }

  if (message.includes("mock mode")) {
    return "invalid_mock_mode";
  }

  if (message.includes("Live Stripe keys")) {
    return "live_key_rejected";
  }

  if (message.includes("sk_test")) {
    return "secret_key_not_test_mode";
  }

  if (message.includes("pk_test")) {
    return "publishable_key_not_test_mode";
  }

  if (message.includes("webhook secret")) {
    return "webhook_secret_invalid";
  }

  if (message.includes("could not be verified")) {
    return "document_context_unverified";
  }

  if (message.includes("not available for this customer")) {
    return "pilot_customer_rejected";
  }

  return "unknown";
}

function logStripePublicEligibilityDiagnostic(input: {
  config?: StripeRuntimeConfig | null;
  contextLookupPassed: boolean;
  documentType: "estimate" | "invoice";
  error?: unknown;
  paymentsEnabled: boolean;
  pilotCustomerPassed: boolean;
  tokenFormatValid: boolean;
}) {
  console.warn("[stripe-public-eligibility-diagnostic]", {
    ...getStripePublicEligibilityDiagnosticEnv(),
    documentType: input.documentType,
    mode: input.config?.mode ?? "config_error",
    paymentsEnabled: input.paymentsEnabled,
    contextLookupPassed: input.contextLookupPassed,
    pilotCustomerPassed: input.pilotCustomerPassed,
    tokenFormatValid: input.tokenFormatValid,
    caughtErrorCategory: input.error
      ? categorizeStripePublicEligibilityError(input.error)
      : null,
  });
}

function assertPilotCustomerAllowed(
  config: StripeRuntimeConfig,
  context: PaymentTargetContext,
) {
  if (config.mode !== "production_sandbox_pilot") {
    return;
  }

  if (!config.pilotCustomerId) {
    throw new Error("Stripe Sandbox Pilot customer is not configured.");
  }

  if (
    !context.customerId ||
    context.customerId.toLowerCase() !== config.pilotCustomerId ||
    context.customerCompanyId !== context.companyId
  ) {
    throw new Error("Stripe Sandbox Pilot is not available for this customer.");
  }
}

async function resolveServiceRequestContext(
  serviceRequestId: string,
): Promise<PaymentTargetContext> {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe payment context could not be verified.");
  }

  const { data, error } = await (serviceRole as any)
    .from("service_requests")
    .select("id,company_id,customer_id")
    .eq("id", serviceRequestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id || !data.company_id) {
    throw new Error("Stripe payment target could not be verified.");
  }

  let customerCompanyId: string | null = null;

  if (data.customer_id) {
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

  return {
    companyId: data.company_id,
    customerCompanyId,
    customerId: data.customer_id ?? null,
    serviceRequestId: data.id,
  };
}

async function resolveDashboardTargetContext(
  targetType: CheckoutTargetType,
  targetId: string,
): Promise<PaymentTargetContext> {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe payment context could not be verified.");
  }

  const tableName =
    targetType === "estimate"
      ? "service_request_estimates"
      : "service_request_invoices";

  const { data, error } = await (serviceRole as any)
    .from(tableName)
    .select("id,service_request_id")
    .eq("id", targetId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.service_request_id) {
    throw new Error("Stripe payment target could not be verified.");
  }

  return resolveServiceRequestContext(data.service_request_id);
}

async function hashPublicToken(token: string): Promise<string> {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe payment link could not be verified.");
  }

  const { data, error } = await (serviceRole as any).rpc(
    "estimate_approval_token_hash",
    { p_token: token },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (typeof data !== "string" || !data) {
    throw new Error("Stripe payment link could not be verified.");
  }

  return data;
}

async function resolvePublicTargetContext(input: {
  documentType?: "estimate" | "invoice";
  token: string;
}): Promise<PaymentTargetContext> {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe payment link could not be verified.");
  }

  const tokenHash = await hashPublicToken(input.token);

  if (input.documentType === "invoice") {
    const { data, error } = await (serviceRole as any)
      .from("service_request_invoice_delivery_tokens")
      .select("service_request_id")
      .eq("token_hash", tokenHash)
      .is("token_revoked_at", null)
      .gt("token_expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.service_request_id) {
      throw new Error("Stripe payment link could not be verified.");
    }

    return resolveServiceRequestContext(data.service_request_id);
  }

  const { data, error } = await (serviceRole as any)
    .from("service_request_estimate_revisions")
    .select("service_request_id")
    .eq("public_approval_token_hash", tokenHash)
    .is("token_revoked_at", null)
    .gt("token_expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.service_request_id) {
    throw new Error("Stripe payment link could not be verified.");
  }

  return resolveServiceRequestContext(data.service_request_id);
}

async function updateCheckoutAttemptAfterSession(
  attemptId: string,
  values: Record<string, unknown>,
) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Stripe checkout reservation could not be updated.");
  }

  const { error } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .update(values)
    .eq("id", attemptId);

  if (error) {
    throw new Error(error.message);
  }
}

async function createProviderCheckoutSession(params: {
  amountCents: number;
  attempt: CheckoutAttempt;
  idempotent: boolean;
  origin: string;
  returnToken?: string | null;
}): Promise<StripeCheckoutResult> {
  const amount = centsToDollars(params.amountCents);
  const storedCheckoutUrl = extractStoredCheckoutUrl(params.attempt);

  if (params.attempt.provider_checkout_session_id && storedCheckoutUrl) {
    return {
      ok: true,
      mode: getStripeRuntimeConfig().mode === "production_sandbox_pilot"
        ? "production_sandbox_pilot"
        : "test",
      checkoutAttemptId: params.attempt.id,
      checkoutSessionId: params.attempt.provider_checkout_session_id,
      checkoutUrl: storedCheckoutUrl,
      amount,
      currency: "usd",
      idempotent: params.idempotent,
    };
  }

  const config = getStripeRuntimeConfig();
  const returnQuery = new URLSearchParams({ attempt: params.attempt.id });

  if (params.returnToken) {
    returnQuery.set("token", params.returnToken);
  }

  if (config.mode === "mock") {
    const mockSessionId = `mock_cs_${params.attempt.id.replaceAll("-", "")}`;
    const mockUrl = `${params.origin}/payments/mock-checkout/${params.attempt.id}`;

    await updateCheckoutAttemptAfterSession(params.attempt.id, {
      provider_checkout_session_id: mockSessionId,
      checkout_metadata: {
        ...(params.attempt.checkout_metadata ?? {}),
        stripe_mock: true,
        stripe_livemode: false,
        stripe_checkout_url: mockUrl,
      },
    });

    return {
      ok: true,
      mode: "mock",
      checkoutAttemptId: params.attempt.id,
      checkoutSessionId: mockSessionId,
      checkoutUrl: mockUrl,
      amount,
      currency: "usd",
      idempotent: params.idempotent,
    };
  }

  const stripe = getStripeClient();

  if (!stripe) {
    throw new Error("Stripe Sandbox Checkout is not configured.");
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: params.amountCents,
            product_data: {
              name:
                params.attempt.target_type === "estimate"
                  ? "HomeFixOS Estimate payment"
                  : "HomeFixOS Invoice payment",
            },
          },
        },
      ],
      metadata: {
        homefixos_checkout_attempt_id: params.attempt.id,
        service_request_id: params.attempt.service_request_id,
        target_type: params.attempt.target_type,
        target_id:
          params.attempt.target_type === "estimate"
            ? params.attempt.estimate_id ?? ""
            : params.attempt.invoice_id ?? "",
        checkout_kind: params.attempt.checkout_kind,
        stripe_mode: config.mode,
        stripe_livemode: "false",
        stripe_sandbox_pilot:
          config.mode === "production_sandbox_pilot" ? "true" : "false",
      },
      payment_intent_data: {
        metadata: {
          homefixos_checkout_attempt_id: params.attempt.id,
        },
      },
      success_url: `${params.origin}/payments/stripe/success?${returnQuery.toString()}`,
      cancel_url: `${params.origin}/payments/stripe/cancel?${returnQuery.toString()}`,
    },
    {
      idempotencyKey: `checkout:${params.attempt.id}`,
    },
  );

  await updateCheckoutAttemptAfterSession(params.attempt.id, {
    provider_checkout_session_id: session.id,
    provider_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    checkout_status: "processing",
    checkout_metadata: {
      ...(params.attempt.checkout_metadata ?? {}),
      stripe_mode: config.mode,
      stripe_livemode: false,
      stripe_sandbox_pilot: config.mode === "production_sandbox_pilot",
      pilot_customer_id:
        config.mode === "production_sandbox_pilot"
          ? config.pilotCustomerId
          : null,
      stripe_checkout_url: session.url,
    },
  });

  return {
    ok: true,
    mode: config.mode === "production_sandbox_pilot"
      ? "production_sandbox_pilot"
      : "test",
    checkoutAttemptId: params.attempt.id,
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    amount,
    currency: "usd",
    idempotent: params.idempotent,
  };
}

export async function createStripeCheckoutSession(
  supabase: SupabaseClient<Database>,
  input: CreateStripeCheckoutInput,
): Promise<StripeCheckoutResult> {
  assertUuid(input.targetId, "payment target");
  if (input.revisionId) {
    assertUuid(input.revisionId, "estimate revision");
  }

  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 12) {
    throw new Error("A valid checkout idempotency key is required.");
  }

  const origin = normalizeOrigin(input.origin);
  const config = getStripeRuntimeConfig();

  if (!isStripePaymentEnabled(config)) {
    throw new Error("Stripe Checkout is not configured.");
  }

  const targetContext = await resolveDashboardTargetContext(
    input.targetType,
    input.targetId,
  );
  assertPilotCustomerAllowed(config, targetContext);

  const { data: eligibilityData, error: eligibilityError } = await supabase.rpc(
    "get_service_request_payment_eligibility_rpc" as never,
    {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_revision_id: input.revisionId ?? null,
    } as never,
  );

  if (eligibilityError) {
    throw new Error(eligibilityError.message);
  }

  const eligibility = (eligibilityData ?? {}) as EligibilityPayload;

  if (eligibility.status !== "eligible") {
    if (eligibility.status === "direct_to_invoice") {
      throw new Error("This Estimate has an Invoice. Collect payment against the Invoice.");
    }

    throw new Error("This payment target is not eligible for Stripe Checkout.");
  }

  const selectedAction = getEligibleAction(eligibility, input.checkoutKind);
  const amountCents = parseMoneyToCents(
    selectedAction?.max_amount ?? selectedAction?.amount,
  );

  if (!selectedAction || amountCents <= 0) {
    throw new Error("That payment action is not available for this target.");
  }

  const amount = centsToDollars(amountCents);
  const fingerprint = buildRequestFingerprint({
    targetType: input.targetType,
    targetId: input.targetId,
    checkoutKind: input.checkoutKind,
    amountCents,
    revisionId: input.revisionId ?? null,
  });

  const { data: reserveData, error: reserveError } = await supabase.rpc(
    "reserve_service_request_payment_checkout_rpc" as never,
    {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_checkout_kind: input.checkoutKind,
      p_amount: amount,
      p_currency: "usd",
      p_idempotency_key: input.idempotencyKey.trim(),
      p_request_fingerprint: fingerprint,
      p_revision_id: input.revisionId ?? null,
    } as never,
  );

  if (reserveError) {
    throw new Error(reserveError.message);
  }

  const reservePayload = (reserveData ?? {}) as ReservePayload;
  const attempt = extractAttempt(reservePayload);

  return createProviderCheckoutSession({
    amountCents,
    attempt,
    idempotent: Boolean(reservePayload.idempotent),
    origin,
    returnToken: null,
  });
}

export async function createPublicStripeCheckoutSession(
  supabase: SupabaseClient<Database>,
  input: CreatePublicStripeCheckoutInput,
): Promise<StripeCheckoutResult> {
  if (!PUBLIC_TOKEN_PATTERN.test(input.token)) {
    throw new Error("Payment link is invalid.");
  }

  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 12) {
    throw new Error("A valid checkout idempotency key is required.");
  }

  const origin = normalizeOrigin(input.origin);
  const config = getStripeRuntimeConfig();

  if (!isStripePaymentEnabled(config)) {
    throw new Error("Stripe Checkout is not configured.");
  }

  const targetContext = await resolvePublicTargetContext({
    documentType: input.documentType,
    token: input.token,
  });
  assertPilotCustomerAllowed(config, targetContext);

  const fingerprint = buildPublicRequestFingerprint({
    token: input.token,
    targetType: input.targetType,
    checkoutKind: input.checkoutKind,
  });

  const reserveRpcName =
    input.documentType === "invoice"
      ? "reserve_public_invoice_payment_checkout_rpc"
      : "reserve_public_estimate_payment_checkout_rpc";

  const { data: reserveData, error: reserveError } = await supabase.rpc(
    reserveRpcName as never,
    {
      p_token: input.token,
      p_target_type: input.targetType,
      p_checkout_kind: input.checkoutKind,
      p_idempotency_key: input.idempotencyKey.trim(),
      p_request_fingerprint: fingerprint,
    } as never,
  );

  if (reserveError) {
    throw new Error(reserveError.message);
  }

  const reservePayload = (reserveData ?? {}) as ReservePayload;
  const attempt = extractAttempt(reservePayload);
  const amountCents = parseMoneyToCents(attempt.amount);

  if (amountCents <= 0) {
    throw new Error("Checkout reservation did not include a payable amount.");
  }

  return createProviderCheckoutSession({
    amountCents,
    attempt,
    idempotent: Boolean(reservePayload.idempotent),
    origin,
    returnToken: input.token,
  });
}

export async function isPublicStripeCheckoutEnabledForToken(input: {
  documentType?: "estimate" | "invoice";
  token: string;
}): Promise<boolean> {
  const documentType = input.documentType ?? "estimate";

  if (!PUBLIC_TOKEN_PATTERN.test(input.token)) {
    logStripePublicEligibilityDiagnostic({
      contextLookupPassed: false,
      documentType,
      paymentsEnabled: false,
      pilotCustomerPassed: false,
      tokenFormatValid: false,
    });
    return false;
  }

  let config: StripeRuntimeConfig;

  try {
    config = getStripeRuntimeConfig();
  } catch (error) {
    logStripePublicEligibilityDiagnostic({
      contextLookupPassed: false,
      documentType,
      error,
      paymentsEnabled: false,
      pilotCustomerPassed: false,
      tokenFormatValid: true,
    });
    return false;
  }

  if (!isStripePaymentEnabled(config)) {
    logStripePublicEligibilityDiagnostic({
      config,
      contextLookupPassed: false,
      documentType,
      paymentsEnabled: false,
      pilotCustomerPassed: false,
      tokenFormatValid: true,
    });
    return false;
  }

  try {
    const context = await resolvePublicTargetContext(input);
    assertPilotCustomerAllowed(config, context);
    logStripePublicEligibilityDiagnostic({
      config,
      contextLookupPassed: true,
      documentType,
      paymentsEnabled: true,
      pilotCustomerPassed: true,
      tokenFormatValid: true,
    });
    return true;
  } catch (error) {
    logStripePublicEligibilityDiagnostic({
      config,
      contextLookupPassed: false,
      documentType,
      error,
      paymentsEnabled: true,
      pilotCustomerPassed: false,
      tokenFormatValid: true,
    });
    return false;
  }
}
