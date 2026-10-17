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

import { isSandboxTestContextAllowed } from "./sandbox-test-policy";

type CheckoutTargetType = "estimate" | "invoice";
type CheckoutKind = "deposit" | "custom_deposit" | "pay_in_full" | "balance_due";

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
  remaining_balance?: number | string;
  actions?: PaymentAction[];
  reasons?: string[];
};

type CheckoutAttempt = {
  id: string;
  amount: number | string;
  checkout_kind: CheckoutKind;
  checkout_metadata?: Record<string, unknown> | null;
  checkout_status?: string | null;
  company_id: string;
  currency: string;
  estimate_id: string | null;
  invoice_id: string | null;
  provider_checkout_session_id?: string | null;
  provider_payment_intent_id?: string | null;
  reserved_until?: string | null;
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
  requestedAmountCents?: number | null;
  revisionId?: string | null;
  origin: string;
  returnPath?: string | null;
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

export type PublicActiveStripeCheckout = {
  amount: number;
  checkoutUrl: string | null;
  expiresAt: string | null;
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

function getMaxCollectibleCents(
  eligibility: EligibilityPayload,
  targetType: CheckoutTargetType,
) {
  const fullBalanceAction = getEligibleAction(
    eligibility,
    targetType === "invoice" ? "balance_due" : "pay_in_full",
  );

  return parseMoneyToCents(
    fullBalanceAction?.max_amount ??
      fullBalanceAction?.amount ??
      eligibility.remaining_balance,
  );
}

function getDashboardCheckoutAmountCents(input: {
  checkoutKind: CheckoutKind;
  eligibility: EligibilityPayload;
  requestedAmountCents?: number | null;
  targetType: CheckoutTargetType;
}) {
  if (input.checkoutKind === "custom_deposit") {
    const requestedAmountCents = input.requestedAmountCents;
    const maxCollectibleCents = getMaxCollectibleCents(
      input.eligibility,
      input.targetType,
    );

    if (
      !Number.isInteger(requestedAmountCents) ||
      requestedAmountCents === undefined ||
      requestedAmountCents === null ||
      requestedAmountCents <= 0
    ) {
      throw new Error("Enter a valid custom deposit amount.");
    }

    if (maxCollectibleCents <= 0) {
      throw new Error("This Job is already paid in full.");
    }

    if (requestedAmountCents > maxCollectibleCents) {
      throw new Error("Custom deposit exceeds the current collectible balance.");
    }

    return requestedAmountCents;
  }

  const selectedAction = getEligibleAction(input.eligibility, input.checkoutKind);
  const amountCents = parseMoneyToCents(
    selectedAction?.max_amount ?? selectedAction?.amount,
  );

  if (!selectedAction || amountCents <= 0) {
    throw new Error("That payment action is not available for this target.");
  }

  return amountCents;
}

function getEligibilityReasons(eligibility: EligibilityPayload) {
  return Array.isArray(eligibility.reasons)
    ? eligibility.reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
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

function getSessionMetadataValue(
  metadata: Record<string, string> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value : "";
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

  return {
    hasSecretKey: Boolean(secretKey),
    secretKeyLooksLive: secretKey.startsWith("sk_live_"),
    secretKeyLooksTest: secretKey.startsWith("sk_test_"),
    hasPublishableKey: Boolean(publishableKey),
    publishableKeyLooksLive: publishableKey.startsWith("pk_live_"),
    publishableKeyLooksTest: publishableKey.startsWith("pk_test_"),
    hasWebhookSecret: Boolean(webhookSecret),
    webhookSecretLooksValid: webhookSecret.startsWith("whsec_"),
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
  if (config.mode === "mock") return;
  if (context.customerCompanyId !== context.companyId || !isSandboxTestContextAllowed(context)) {
    throw new Error("Stripe Sandbox is not available for this customer. The customer must belong to the configured company.");
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

async function reconcileUnpostedAttempt(attemptId: string, values: Record<string, unknown>) {
  const serviceRole = getSupabaseServiceRoleClient();
  if (!serviceRole) return false;
  const { data, error } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .update(values)
    .eq("id", attemptId)
    .in("checkout_status", ["initiated", "processing"])
    .is("succeeded_payment_id", null)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function loadPublicInvoiceActiveStripeCheckout(input: {
  token: string;
}): Promise<PublicActiveStripeCheckout | null> {
  const unavailable: PublicActiveStripeCheckout = { amount: 0, checkoutUrl: null, expiresAt: null };
  if (!PUBLIC_TOKEN_PATTERN.test(input.token)) {
    return unavailable;
  }

  let config: StripeRuntimeConfig;

  try {
    config = getStripeRuntimeConfig();
  } catch {
    return unavailable;
  }

  if (config.mode !== "test" && config.mode !== "production_sandbox_pilot") {
    return unavailable;
  }

  const serviceRole = getSupabaseServiceRoleClient();
  const stripe = getStripeClient();

  if (!serviceRole || !stripe) {
    return unavailable;
  }

  try {
    const tokenHash = await hashPublicToken(input.token);
    const nowIso = new Date().toISOString();

    const { data: tokenData, error: tokenError } = await (serviceRole as any)
      .from("service_request_invoice_delivery_tokens")
      .select("company_id,invoice_id,service_request_id")
      .eq("token_hash", tokenHash)
      .is("token_revoked_at", null)
      .gt("token_expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData?.invoice_id || !tokenData.service_request_id) {
      return unavailable;
    }

    const { data: invoiceData, error: invoiceError } = await (serviceRole as any)
      .from("service_request_invoices")
      .select("id,invoice_status,invoice_lifecycle_status,service_request_id")
      .eq("id", tokenData.invoice_id)
      .eq("service_request_id", tokenData.service_request_id)
      .maybeSingle();

    if (invoiceError || !invoiceData?.id) {
      return unavailable;
    }

    if (
      invoiceData.invoice_status === "void" ||
      (invoiceData.invoice_lifecycle_status ?? "current") !== "current"
    ) {
      return unavailable;
    }

    const targetContext = await resolveServiceRequestContext(tokenData.service_request_id);
    if (targetContext.companyId !== tokenData.company_id || targetContext.customerCompanyId !== tokenData.company_id) return unavailable;
    assertPilotCustomerAllowed(config, targetContext);

    const { data: attemptData, error: attemptError } = await (serviceRole as any)
      .from("service_request_payment_checkout_attempts")
      .select(
        "id,amount,checkout_kind,checkout_metadata,checkout_status,company_id,currency,estimate_id,invoice_id,provider_checkout_session_id,provider_payment_intent_id,reserved_until,service_request_id,target_type,succeeded_payment_id",
      )
      .eq("company_id", tokenData.company_id)
      .eq("provider", "stripe")
      .eq("target_type", "invoice")
      .eq("invoice_id", tokenData.invoice_id)
      .eq("service_request_id", tokenData.service_request_id)
      .in("checkout_status", ["initiated", "processing"])
      .is("succeeded_payment_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attemptError) return unavailable;
    if (!attemptData) return null;
    if (!attemptData.provider_checkout_session_id) return unavailable;

    const attempt = attemptData as CheckoutAttempt;
    const checkoutSessionId = attempt.provider_checkout_session_id;

    if (!checkoutSessionId) {
      return unavailable;
    }

    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    const sessionMetadata = session.metadata ?? {};
    const sessionAmountCents =
      typeof session.amount_total === "number" ? session.amount_total : null;
    const attemptAmountCents = parseMoneyToCents(attempt.amount);

    const sessionMatchesAttempt =
      !session.livemode &&
      session.id === checkoutSessionId && session.currency === "usd" &&
      getSessionMetadataValue(sessionMetadata, "homefixos_checkout_attempt_id") ===
        attempt.id &&
      getSessionMetadataValue(sessionMetadata, "service_request_id") ===
        attempt.service_request_id &&
      getSessionMetadataValue(sessionMetadata, "target_type") === "invoice" &&
      getSessionMetadataValue(sessionMetadata, "target_id") === attempt.invoice_id &&
      sessionAmountCents === attemptAmountCents;

    if (!sessionMatchesAttempt) {
      return unavailable;
    }

    if (session.status === "open" && session.payment_status === "unpaid" && session.url) {
      const expiresAt = session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null;

      const shouldRefreshAttempt =
        attempt.checkout_status !== "processing" ||
        (expiresAt && attempt.reserved_until !== expiresAt) ||
        extractStoredCheckoutUrl(attempt) !== session.url;

      if (shouldRefreshAttempt) {
        const refreshed = await reconcileUnpostedAttempt(attempt.id, {
          checkout_status: "processing",
          reserved_until: expiresAt ?? attempt.reserved_until,
          checkout_metadata: {
            ...(attempt.checkout_metadata ?? {}),
            stripe_checkout_url: session.url,
            stripe_livemode: false,
            stripe_mode: config.mode,
            stripe_resume_verified: true,
            stripe_sandbox_pilot: config.mode === "production_sandbox_pilot",
          },
        });
        if (!refreshed) return unavailable;
      }

      return {
        amount: attemptAmountCents / 100,
        checkoutUrl: session.url,
        expiresAt,
      };
    }

    if (session.status === "expired" && session.payment_status === "unpaid") {
      const released = await reconcileUnpostedAttempt(attempt.id, {
        checkout_status: "expired",
        failure_reason: "stripe_session_expired",
        checkout_metadata: {
          ...(attempt.checkout_metadata ?? {}),
          stripe_session_status: session.status,
          stripe_session_reconciled: true,
        },
      });
      return released ? null : unavailable;
    }
  } catch {
    return unavailable;
  }

  return unavailable;
}

function categorizeProviderCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("not configured")) {
    return "configuration_missing";
  }

  if (message.includes("api_key") || message.includes("Invalid API Key")) {
    return "stripe_api_key_rejected";
  }

  if (message.includes("Invalid URL") || message.includes("success_url")) {
    return "stripe_return_url_invalid";
  }

  if (message.includes("rate limit")) {
    return "stripe_rate_limited";
  }

  return "stripe_session_create_failed";
}

function logStripeCheckoutSessionDiagnostic(input: {
  attemptId: string;
  error: unknown;
  stage: "configuration" | "stripe_session_create" | "session_persist";
}) {
  console.warn("[stripe-checkout-session-diagnostic]", {
    attemptId: input.attemptId,
    errorCategory: categorizeProviderCheckoutError(input.error),
    stage: input.stage,
  });
}

async function markCheckoutAttemptFailedBeforeProviderSession(input: {
  attempt: CheckoutAttempt;
  error: unknown;
  stage: "configuration" | "stripe_session_create";
}) {
  const errorCategory = categorizeProviderCheckoutError(input.error);

  logStripeCheckoutSessionDiagnostic({
    attemptId: input.attempt.id,
    error: input.error,
    stage: input.stage,
  });

  try {
    await updateCheckoutAttemptAfterSession(input.attempt.id, {
      checkout_status: "failed",
      failure_reason: errorCategory,
      checkout_metadata: {
        ...(input.attempt.checkout_metadata ?? {}),
        stripe_session_failure_category: errorCategory,
        stripe_session_failure_stage: input.stage,
      },
    });
  } catch (updateError) {
    logStripeCheckoutSessionDiagnostic({
      attemptId: input.attempt.id,
      error: updateError,
      stage: "session_persist",
    });
  }
}

async function createProviderCheckoutSession(params: {
  amountCents: number;
  attempt: CheckoutAttempt;
  idempotent: boolean;
  origin: string;
  returnPath?: string | null;
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
  if (params.returnPath?.startsWith("/dashboard")) {
    returnQuery.set("returnPath", params.returnPath);
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
    const error = new Error("Stripe Sandbox Checkout is not configured.");
    await markCheckoutAttemptFailedBeforeProviderSession({
      attempt: params.attempt,
      error,
      stage: "configuration",
    });
    throw error;
  }

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;

  try {
    session = await stripe.checkout.sessions.create(
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
  } catch (error) {
    await markCheckoutAttemptFailedBeforeProviderSession({
      attempt: params.attempt,
      error,
      stage: "stripe_session_create",
    });
    throw error;
  }

  try {
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
        dashboard_return_path: params.returnPath ?? null,
        pilot_customer_id:
          config.mode === "production_sandbox_pilot"
            ? config.pilotCustomerId
            : null,
        stripe_checkout_url: session.url,
      },
    });
  } catch (error) {
    logStripeCheckoutSessionDiagnostic({
      attemptId: params.attempt.id,
      error,
      stage: "session_persist",
    });
    throw error;
  }

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

async function reconcileDashboardActiveStripeCheckout(input: {
  checkoutKind: CheckoutKind;
  origin: string;
  returnPath?: string | null;
  targetId: string;
  targetType: CheckoutTargetType;
}): Promise<StripeCheckoutResult | null> {
  const config = getStripeRuntimeConfig();

  if (config.mode !== "test" && config.mode !== "production_sandbox_pilot") {
    return null;
  }

  const serviceRole = getSupabaseServiceRoleClient();
  const stripe = getStripeClient();

  if (!serviceRole || !stripe) {
    return null;
  }

  const targetColumn = input.targetType === "estimate" ? "estimate_id" : "invoice_id";
  const { data, error } = await (serviceRole as any)
    .from("service_request_payment_checkout_attempts")
    .select(
      "id,amount,checkout_kind,checkout_metadata,checkout_status,company_id,currency,estimate_id,invoice_id,provider_checkout_session_id,provider_payment_intent_id,reserved_until,service_request_id,target_type,succeeded_payment_id",
    )
    .eq("provider", "stripe")
    .eq("target_type", input.targetType)
    .eq(targetColumn, input.targetId)
    .eq("checkout_kind", input.checkoutKind)
    .in("checkout_status", ["initiated", "processing"])
    .is("succeeded_payment_id", null)
    .not("provider_checkout_session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.provider_checkout_session_id) {
    return null;
  }

  const checkoutSessionId = data.provider_checkout_session_id;
  const attempt = data as CheckoutAttempt;
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  const sessionMetadata = session.metadata ?? {};
  const sessionAmountCents =
    typeof session.amount_total === "number" ? session.amount_total : null;
  const attemptAmountCents = parseMoneyToCents(attempt.amount);
  const sessionMatchesAttempt =
    !session.livemode &&
    getSessionMetadataValue(sessionMetadata, "homefixos_checkout_attempt_id") ===
      attempt.id &&
    getSessionMetadataValue(sessionMetadata, "service_request_id") ===
      attempt.service_request_id &&
    getSessionMetadataValue(sessionMetadata, "target_type") === input.targetType &&
    getSessionMetadataValue(sessionMetadata, "target_id") === input.targetId &&
    sessionAmountCents === attemptAmountCents;

  if (!sessionMatchesAttempt) {
    return null;
  }

  if (session.status === "open" && session.payment_status === "unpaid" && session.url) {
    const expiresAt = session.expires_at
      ? new Date(session.expires_at * 1000).toISOString()
      : null;

    await updateCheckoutAttemptAfterSession(attempt.id, {
      checkout_status: "processing",
      reserved_until: expiresAt ?? attempt.reserved_until,
      checkout_metadata: {
        ...(attempt.checkout_metadata ?? {}),
        dashboard_return_path: input.returnPath ?? null,
        stripe_checkout_url: session.url,
        stripe_livemode: false,
        stripe_mode: config.mode,
        stripe_resume_verified: true,
        stripe_sandbox_pilot: config.mode === "production_sandbox_pilot",
      },
    });

    return {
      ok: true,
      mode:
        config.mode === "production_sandbox_pilot"
          ? "production_sandbox_pilot"
      : "test",
      checkoutAttemptId: attempt.id,
      checkoutSessionId,
      checkoutUrl: session.url,
      amount: centsToDollars(attemptAmountCents),
      currency: "usd",
      idempotent: true,
    };
  }

  if (
    (session.status === "expired" || session.status === "complete") &&
    session.payment_status !== "paid"
  ) {
    await updateCheckoutAttemptAfterSession(attempt.id, {
      checkout_status: session.status === "expired" ? "expired" : "canceled",
      failure_reason:
        session.status === "expired"
          ? "stripe_session_expired"
          : "stripe_session_canceled",
      checkout_metadata: {
        ...(attempt.checkout_metadata ?? {}),
        stripe_session_reconciled: true,
        stripe_session_status: session.status,
      },
    });
  }

  return null;
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

  let { data: eligibilityData, error: eligibilityError } = await supabase.rpc(
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

  let eligibility = (eligibilityData ?? {}) as EligibilityPayload;

  if (eligibility.status !== "eligible") {
    if (getEligibilityReasons(eligibility).includes("checkout_in_progress")) {
      const activeCheckout = await reconcileDashboardActiveStripeCheckout({
        checkoutKind: input.checkoutKind,
        origin,
        returnPath: input.returnPath ?? null,
        targetId: input.targetId,
        targetType: input.targetType,
      });

      if (activeCheckout) {
        return activeCheckout;
      }

      const retryResult = await supabase.rpc(
        "get_service_request_payment_eligibility_rpc" as never,
        {
          p_target_type: input.targetType,
          p_target_id: input.targetId,
          p_revision_id: input.revisionId ?? null,
        } as never,
      );

      eligibilityData = retryResult.data;
      eligibilityError = retryResult.error;

      if (eligibilityError) {
        throw new Error(eligibilityError.message);
      }

      eligibility = (eligibilityData ?? {}) as EligibilityPayload;
    }

    if (eligibility.status === "direct_to_invoice") {
      throw new Error("This Estimate has an Invoice. Collect payment against the Invoice.");
    }

    if (eligibility.status !== "eligible") {
      throw new Error("This payment target is not eligible for Stripe Checkout.");
    }
  }


  const amountCents = getDashboardCheckoutAmountCents({
    checkoutKind: input.checkoutKind,
    eligibility,
    requestedAmountCents: input.requestedAmountCents,
    targetType: input.targetType,
  });

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
    returnPath: input.returnPath ?? null,
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
