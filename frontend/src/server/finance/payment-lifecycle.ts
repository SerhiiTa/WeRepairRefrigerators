export type PaymentTargetType = "estimate" | "invoice";

export type PaymentCheckoutKind = "deposit" | "pay_in_full" | "balance_due";

export type PaymentLifecycleStatus =
  | "eligible"
  | "blocked"
  | "paid"
  | "direct_to_invoice";

export type EstimateDepositConfig =
  | { type: "none" }
  | { type: "fixed"; amountCents: number }
  | { type: "percent"; percent: number };

export type EstimatePaymentLifecycleInput = {
  targetType: "estimate";
  estimateId: string;
  serviceRequestId: string;
  companyId: string;
  status: string;
  totalCents: number;
  paidCents: number;
  pendingReservationCents?: number;
  depositConfig: EstimateDepositConfig;
  hasActiveInvoice: boolean;
  activeInvoiceId?: string | null;
  revisionState?: "active" | "updated" | "revoked" | "expired" | "unavailable";
};

export type InvoicePaymentLifecycleInput = {
  targetType: "invoice";
  invoiceId: string;
  serviceRequestId: string;
  companyId: string;
  status: string;
  totalCents: number;
  allocatedPaidCents: number;
  pendingReservationCents?: number;
};

export type PaymentLifecycleInput =
  | EstimatePaymentLifecycleInput
  | InvoicePaymentLifecycleInput;

export type PaymentActionEligibility = {
  kind: PaymentCheckoutKind;
  label: string;
  amountCents: number;
  maxAmountCents: number;
};

export type PaymentLifecycleEligibility = {
  targetType: PaymentTargetType;
  targetId: string;
  serviceRequestId: string;
  companyId: string;
  status: PaymentLifecycleStatus;
  remainingBalanceCents: number;
  paidCents: number;
  reservedCents: number;
  actions: PaymentActionEligibility[];
  invoiceRedirectId: string | null;
  reasons: string[];
};

export type StripeAccountingEventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed"
  | "checkout.session.expired"
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed"
  | "charge.refunded"
  | "refund.created"
  | "refund.updated"
  | "charge.dispute.created"
  | "charge.dispute.closed";

export type StripeAccountingEffect =
  | "mark_attempt_processing"
  | "post_canonical_payment_once"
  | "mark_attempt_failed"
  | "expire_attempt"
  | "record_refund_adjustment"
  | "record_dispute_hold"
  | "record_dispute_resolution";

export type StripeAccountingContract = {
  eventType: StripeAccountingEventType;
  effect: StripeAccountingEffect;
  createsCanonicalPayment: boolean;
  requiresProviderEventDeduplication: boolean;
  requiresSignatureVerification: boolean;
};

function clampCents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function depositTargetCents(
  config: EstimateDepositConfig,
  totalCents: number,
): number {
  if (config.type === "none") {
    return 0;
  }

  if (config.type === "fixed") {
    return Math.min(clampCents(config.amountCents), clampCents(totalCents));
  }

  return Math.min(
    Math.round((clampCents(totalCents) * Math.max(0, config.percent)) / 100),
    clampCents(totalCents),
  );
}

function buildBaseEligibility(
  input: PaymentLifecycleInput,
  paidCents: number,
): Omit<PaymentLifecycleEligibility, "status" | "actions" | "invoiceRedirectId" | "reasons"> {
  const totalCents = clampCents(input.totalCents);
  const reservedCents = clampCents(input.pendingReservationCents ?? 0);

  return {
    targetType: input.targetType,
    targetId:
      input.targetType === "estimate" ? input.estimateId : input.invoiceId,
    serviceRequestId: input.serviceRequestId,
    companyId: input.companyId,
    remainingBalanceCents: Math.max(totalCents - clampCents(paidCents) - reservedCents, 0),
    paidCents: clampCents(paidCents),
    reservedCents,
  };
}

export function calculatePaymentLifecycleEligibility(
  input: PaymentLifecycleInput,
): PaymentLifecycleEligibility {
  if (input.targetType === "invoice") {
    const base = buildBaseEligibility(input, input.allocatedPaidCents);

    if (input.status === "void") {
      return {
        ...base,
        status: "blocked",
        actions: [],
        invoiceRedirectId: null,
        reasons: ["void_invoice"],
      };
    }

    if (base.remainingBalanceCents <= 0) {
      return {
        ...base,
        status: "paid",
        actions: [],
        invoiceRedirectId: null,
        reasons: ["fully_paid"],
      };
    }

    return {
      ...base,
      status: "eligible",
      invoiceRedirectId: null,
      reasons: [],
      actions: [
        {
          kind: "balance_due",
          label: "Pay Balance Due",
          amountCents: base.remainingBalanceCents,
          maxAmountCents: base.remainingBalanceCents,
        },
      ],
    };
  }

  const base = buildBaseEligibility(input, input.paidCents);

  if (input.hasActiveInvoice) {
    return {
      ...base,
      status: "direct_to_invoice",
      actions: [],
      invoiceRedirectId: input.activeInvoiceId ?? null,
      reasons: ["estimate_has_active_invoice"],
    };
  }

  if (input.revisionState && input.revisionState !== "active") {
    return {
      ...base,
      status: "blocked",
      actions: [],
      invoiceRedirectId: null,
      reasons: [`revision_${input.revisionState}`],
    };
  }

  if (input.status !== "approved") {
    return {
      ...base,
      status: "blocked",
      actions: [],
      invoiceRedirectId: null,
      reasons: [`estimate_${input.status}`],
    };
  }

  if (base.remainingBalanceCents <= 0) {
    return {
      ...base,
      status: "paid",
      actions: [],
      invoiceRedirectId: null,
      reasons: ["fully_paid"],
    };
  }

  const actions: PaymentActionEligibility[] = [];
  const requiredDepositCents = depositTargetCents(
    input.depositConfig,
    input.totalCents,
  );
  const depositDueCents = Math.max(requiredDepositCents - base.paidCents - base.reservedCents, 0);

  if (depositDueCents > 0) {
    actions.push({
      kind: "deposit",
      label: "Pay Deposit",
      amountCents: Math.min(depositDueCents, base.remainingBalanceCents),
      maxAmountCents: Math.min(depositDueCents, base.remainingBalanceCents),
    });
  }

  actions.push({
    kind: "pay_in_full",
    label: "Pay in Full",
    amountCents: base.remainingBalanceCents,
    maxAmountCents: base.remainingBalanceCents,
  });

  return {
    ...base,
    status: "eligible",
    actions,
    invoiceRedirectId: null,
    reasons: [],
  };
}

export const STRIPE_WEBHOOK_ACCOUNTING_CONTRACTS: readonly StripeAccountingContract[] = [
  {
    eventType: "checkout.session.completed",
    effect: "mark_attempt_processing",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "checkout.session.async_payment_succeeded",
    effect: "post_canonical_payment_once",
    createsCanonicalPayment: true,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "checkout.session.async_payment_failed",
    effect: "mark_attempt_failed",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "checkout.session.expired",
    effect: "expire_attempt",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "payment_intent.succeeded",
    effect: "post_canonical_payment_once",
    createsCanonicalPayment: true,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "payment_intent.payment_failed",
    effect: "mark_attempt_failed",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "charge.refunded",
    effect: "record_refund_adjustment",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "refund.created",
    effect: "record_refund_adjustment",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "refund.updated",
    effect: "record_refund_adjustment",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "charge.dispute.created",
    effect: "record_dispute_hold",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
  {
    eventType: "charge.dispute.closed",
    effect: "record_dispute_resolution",
    createsCanonicalPayment: false,
    requiresProviderEventDeduplication: true,
    requiresSignatureVerification: true,
  },
];
