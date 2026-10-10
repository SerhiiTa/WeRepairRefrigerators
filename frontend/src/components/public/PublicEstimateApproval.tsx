"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  CustomerEstimatePreview,
  type CustomerEstimatePreviewData,
} from "@/components/public/CustomerEstimatePreview";
import {
  formatServiceRequestDate,
  formatServiceRequestSource,
} from "@/lib/service-request-records";

export type PublicEstimateItem = {
  item_title: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
  warranty_text: string | null;
};

type PublicPaymentAction = {
  kind: "deposit" | "pay_in_full" | "balance_due";
  label: string;
  amount: number | string;
  max_amount?: number | string;
};

type PublicPaymentOptions = {
  status: "eligible" | "paid" | "blocked" | "direct_to_invoice";
  target_type: "estimate" | "invoice" | null;
  estimate_number?: string | null;
  invoice_number?: string | null;
  total?: number | string | null;
  paid?: number | string | null;
  reserved?: number | string | null;
  balance_due?: number | string | null;
  actions?: PublicPaymentAction[];
  reasons?: string[];
};

export type PublicEstimatePayload = {
  estimate: {
    estimate_number: string;
    estimate_status: string;
    revision_id?: string | null;
    revision_number?: number | null;
    link_state?: string | null;
    subtotal: number;
    discount_type?: "flat" | "percent" | null;
    discount_value?: number | null;
    discount_amount?: number | null;
    tax_rate?: number | null;
    taxable_amount?: number | null;
    non_taxable_amount?: number | null;
    tax: number | null;
    total: number;
    warranty_text: string | null;
    disclaimer_text: string | null;
    sent_at: string | null;
    customer_responded_at: string | null;
    token_expires_at?: string | null;
    items: PublicEstimateItem[];
    deliveries?: Array<{
      delivery_channel: string;
      delivery_status: string;
      provider?: string | null;
      provider_message_id?: string | null;
      provider_status?: string | null;
      provider_error?: string | null;
      sent_at?: string | null;
      delivered_at?: string | null;
      failed_at?: string | null;
    }>;
  };
  service_request: {
    customer_name: string;
    appliance_type: string;
    appliance_brand: string | null;
    appliance_model: string | null;
    issue_description: string;
    city: string | null;
    state: string;
    zip_code: string;
    selected_technician_business_name: string | null;
  };
  payment?: PublicPaymentOptions | null;
};

type ResponseState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type CheckoutState =
  | { status: "idle"; message: null }
  | { status: "starting"; message: string }
  | { status: "processing"; message: string }
  | { status: "error"; message: string };

type PublicEstimateApprovalProps = {
  token: string;
  initialEstimate: PublicEstimatePayload;
  stripePaymentsEnabled?: boolean;
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function buildServiceLocation(estimate: PublicEstimatePayload) {
  return [
    estimate.service_request.city,
    [
      estimate.service_request.state,
      estimate.service_request.zip_code,
    ]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

function buildCustomerPreviewData(
  estimate: PublicEstimatePayload,
): CustomerEstimatePreviewData {
  const proposalDescription =
    estimate.estimate.items
      .map((item) => item.notes)
      .filter((note): note is string => Boolean(note?.trim()))
      .slice(0, 2)
      .join(" ") ||
    estimate.service_request.issue_description ||
    "Recommended repair details are listed below.";

  return {
    companyName:
      estimate.service_request.selected_technician_business_name ??
      "WeRepairRefrigerators",
    estimateNumber: estimate.estimate.estimate_number,
    estimateStatus: estimate.estimate.estimate_status,
    customerName: estimate.service_request.customer_name,
    serviceAddress: buildServiceLocation(estimate),
    estimateDate:
      estimate.estimate.sent_at ??
      estimate.estimate.customer_responded_at ??
      estimate.estimate.token_expires_at ??
      "1970-01-01T00:00:00.000Z",
    whatWeFound: estimate.service_request.issue_description,
    repairSolution: proposalDescription,
    items: estimate.estimate.items.map((item, index) => ({
      id: `${item.item_title}-${index}`,
      title: item.item_title,
      description: item.notes,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
    subtotal: Number(estimate.estimate.subtotal),
    discountAmount: Number(estimate.estimate.discount_amount ?? 0),
    tax: Number(estimate.estimate.tax ?? 0),
    taxRate: Number(estimate.estimate.tax_rate ?? 0),
    total: Number(estimate.estimate.total),
    warrantyText: estimate.estimate.warranty_text,
    estimatedCompletion: null,
    customerNotes: estimate.estimate.disclaimer_text,
  };
}

function getLinkStateMessage(linkState: string | null | undefined) {
  if (linkState === "updated" || linkState === "revoked") {
    return {
      title: "Updated estimate available",
      body:
        "This estimate link points to an older revision. Please ask the technician for the newest approval link.",
    };
  }

  if (linkState === "expired") {
    return {
      title: "Estimate link expired",
      body:
        "This approval link has expired. Please ask the technician to resend the estimate.",
    };
  }

  if (linkState === "unavailable") {
    return {
      title: "Estimate unavailable",
      body:
        "This estimate is no longer open for customer approval. Please contact the technician for the current status.",
    };
  }

  return {
    title: "Response recorded",
    body: null,
  };
}

function formatMoney(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "$0.00";
  }

  return moneyFormatter.format(amount);
}

function makeCheckoutIdempotencyKey(kind: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `public-${kind}-${random}`;
}

export function PublicEstimateApproval({
  token,
  initialEstimate,
  stripePaymentsEnabled = true,
}: PublicEstimateApprovalProps) {
  const router = useRouter();
  const [estimate, setEstimate] =
    useState<PublicEstimatePayload>(initialEstimate);
  const [responseState, setResponseState] = useState<ResponseState>({
    status: "idle",
    message: null,
  });
  const [pendingResponse, setPendingResponse] = useState<
    "approved" | "declined" | null
  >(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    status: "idle",
    message: null,
  });
  const [pendingCheckoutKind, setPendingCheckoutKind] = useState<string | null>(
    null,
  );

  const linkState = estimate.estimate.link_state ?? "active";
  const isOpenForResponse =
    linkState === "active" && estimate.estimate.estimate_status === "sent";
  const payment = estimate.payment ?? null;
  const paymentActions =
    payment?.status === "eligible" && Array.isArray(payment.actions)
      ? payment.actions
      : [];
  const showPaymentActions =
    !isOpenForResponse &&
    stripePaymentsEnabled &&
    payment?.status === "eligible" &&
    paymentActions.length > 0 &&
    (payment.target_type === "estimate" || payment.target_type === "invoice");
  const customerPreviewData = buildCustomerPreviewData(estimate);
  const unavailableMessage = getLinkStateMessage(linkState);

  async function submitResponse(response: "approved" | "declined") {
    setResponseState({ status: "saving", message: null });
    setPendingResponse(response);

    let result: Response;

    try {
      result = await fetch(`/api/estimates/${token}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ response }),
      });
    } catch {
      setResponseState({
        status: "error",
        message: "We could not reach the estimate approval service.",
      });
      setPendingResponse(null);
      return;
    }

    const payload = (await result.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      estimate?: PublicEstimatePayload | null;
      result?: {
        estimate_status?: string;
        customer_responded_at?: string | null;
      };
    } | null;

    if (!result.ok || !payload?.ok) {
      setResponseState({
        status: "error",
        message: payload?.message ?? "We could not save your response.",
      });
      setPendingResponse(null);
      return;
    }

    const respondedAt =
      payload.result?.customer_responded_at ??
      estimate.estimate.customer_responded_at ??
      estimate.estimate.sent_at ??
      "1970-01-01T00:00:00.000Z";
    setEstimate((current) => ({
      ...current,
      estimate: {
        ...current.estimate,
        estimate_status:
          payload.result?.estimate_status ?? response,
        customer_responded_at: respondedAt,
      },
    }));

    if (payload.estimate) {
      setEstimate(payload.estimate);
    }

    router.refresh();
    setResponseState({
      status: "success",
      message:
        response === "approved"
          ? "Proposal approved. The technician can now schedule the next step."
          : "Proposal declined. The technician will see your response.",
    });
    setPendingResponse(null);
  }

  async function startCheckout(action: PublicPaymentAction) {
    if (payment?.target_type !== "estimate" && payment?.target_type !== "invoice") {
      return;
    }

    setCheckoutState({
      status: "starting",
      message: "Starting secure checkout...",
    });
    setPendingCheckoutKind(action.kind);

    let result: Response;

    try {
      result = await fetch("/api/public/payments/stripe-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          targetType: payment.target_type,
          checkoutKind: action.kind,
          idempotencyKey: makeCheckoutIdempotencyKey(action.kind),
        }),
      });
    } catch {
      setCheckoutState({
        status: "error",
        message: "We could not reach secure checkout.",
      });
      setPendingCheckoutKind(null);
      return;
    }

    const payload = (await result.json().catch(() => null)) as {
      ok?: boolean;
      checkoutUrl?: string | null;
      message?: string;
    } | null;

    if (!result.ok || !payload?.ok || !payload.checkoutUrl) {
      setCheckoutState({
        status: "error",
        message: payload?.message ?? "Secure checkout could not be started.",
      });
      setPendingCheckoutKind(null);
      return;
    }

    setCheckoutState({
      status: "processing",
      message:
        "Opening secure checkout. Your balance will update after Stripe confirms the payment.",
    });
    window.location.assign(payload.checkoutUrl);
  }

  return (
    <main className="min-h-screen bg-[#F3F6FA] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <CustomerEstimatePreview data={customerPreviewData} fillViewport={false} />

      <section className="mx-auto mt-2 max-w-4xl px-3 sm:mt-4 sm:px-6">
        <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-5">
          {isOpenForResponse ? (
            <>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                <button
                  className="min-h-12 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={responseState.status === "saving"}
                  onClick={() => void submitResponse("approved")}
                  type="button"
                >
                  {pendingResponse === "approved"
                    ? "Approving..."
                    : "Approve Estimate"}
                </button>
                <button
                  className="min-h-12 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={responseState.status === "saving"}
                  onClick={() => void submitResponse("declined")}
                  type="button"
                >
                  {pendingResponse === "declined"
                    ? "Declining..."
                    : "Decline Estimate"}
                </button>
              </div>
              <p className="mt-3 text-sm font-black text-[#0F172A]">
                Ready for your response
              </p>
              <p className="mt-1 text-sm leading-5 text-[#475569] sm:leading-6">
                Review the repair estimate above, then approve to move forward or decline this proposal for now.
              </p>
            </>
          ) : showPaymentActions ? (
            <>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                  Secure Payment
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs font-bold text-[#64748B]">Total</p>
                    <p className="font-black text-[#0F172A] tabular-nums">
                      {formatMoney(payment.total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#64748B]">Paid</p>
                    <p className="font-black text-emerald-700 tabular-nums">
                      {formatMoney(payment.paid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#64748B]">Balance</p>
                    <p className="font-black text-blue-700 tabular-nums">
                      {formatMoney(payment.balance_due)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                {paymentActions.map((action) => (
                  <button
                    className="min-h-12 flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={checkoutState.status === "starting"}
                    key={action.kind}
                    onClick={() => void startCheckout(action)}
                    type="button"
                  >
                    {pendingCheckoutKind === action.kind
                      ? "Opening..."
                      : `${action.label} ${formatMoney(action.amount)}`}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm leading-5 text-[#475569] sm:leading-6">
                Card details are entered in Stripe secure checkout. This page will show paid after payment confirmation is posted.
              </p>
            </>
          ) : payment?.status === "paid" ? (
            <>
              <p className="text-sm font-black text-emerald-700">
                Paid
              </p>
              <p className="mt-1 text-sm leading-6 text-[#475569]">
                This {payment.target_type === "invoice" ? "Invoice" : "Estimate"} has no balance due.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-black text-[#0F172A]">
                {unavailableMessage.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-[#475569]">
                {unavailableMessage.body ??
                  `This proposal is marked ${formatServiceRequestSource(
                    estimate.estimate.estimate_status,
                  )}${
                    estimate.estimate.customer_responded_at
                      ? ` as of ${formatServiceRequestDate(
                          estimate.estimate.customer_responded_at,
                        )}`
                      : ""
                  }.`}
              </p>
            </>
          )}
          {checkoutState.message ? (
            <p
              className={`mt-3 text-sm font-bold ${
                checkoutState.status === "error"
                  ? "text-amber-700"
                  : "text-blue-700"
              }`}
            >
              {checkoutState.message}
            </p>
          ) : null}
          {responseState.message ? (
            <p
              className={`mt-3 text-sm font-bold ${
                responseState.status === "error"
                  ? "text-amber-700"
                  : "text-emerald-700"
              }`}
            >
              {responseState.message}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
