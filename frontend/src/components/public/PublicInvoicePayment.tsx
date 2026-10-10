"use client";

import { useMemo, useState } from "react";

import {
  formatServiceRequestDate,
  formatServiceRequestMoney,
  formatServiceRequestSource,
} from "@/lib/service-request-records";

export type PublicInvoiceItem = {
  id: string;
  line_total: number;
  notes: string | null;
  quantity: number;
  title: string;
  unit_price: number;
};

export type PublicInvoicePayload = {
  company: {
    name: string;
  };
  customer: {
    name: string;
    service_address: string | null;
  };
  invoice: {
    balance_due: number;
    created_at: string;
    discount_amount: number;
    invoice_number: string;
    invoice_status: string;
    items: PublicInvoiceItem[];
    paid: number;
    reserved: number;
    sent_at: string | null;
    subtotal: number;
    tax: number;
    total: number;
  };
  job: {
    job_number: number | null;
  };
  link_state: string;
  payment: {
    amount: number;
    checkout_kind: "balance_due";
    status: "eligible" | "paid" | "blocked";
    target_type: "invoice";
  };
};

type PublicInvoicePaymentProps = {
  data: PublicInvoicePayload;
  stripePaymentsEnabled?: boolean;
  token: string;
};

function createIdempotencyKey(invoiceNumber: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `invoice-${invoiceNumber}-${random}`;
}

export function PublicInvoicePayment({
  data,
  stripePaymentsEnabled = true,
  token,
}: PublicInvoicePaymentProps) {
  const [checkoutState, setCheckoutState] = useState<
    | { status: "idle"; message: null }
    | { status: "starting"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle", message: null });

  const paymentIsAvailable =
    stripePaymentsEnabled &&
    data.link_state === "active" &&
    data.payment.status === "eligible" &&
    data.invoice.balance_due > 0 &&
    data.invoice.invoice_status !== "void";

  const paymentStateLabel = useMemo(() => {
    if (data.link_state === "expired") {
      return "This invoice link has expired.";
    }
    if (data.link_state === "revoked") {
      return "This invoice link is no longer active.";
    }
    if (data.invoice.invoice_status === "void") {
      return "This invoice is void.";
    }
    if (data.payment.status === "paid" || data.invoice.balance_due <= 0) {
      return "Paid";
    }
    return "Balance due";
  }, [data.invoice.balance_due, data.invoice.invoice_status, data.link_state, data.payment.status]);

  async function startCheckout() {
    if (!paymentIsAvailable) {
      return;
    }

    setCheckoutState({
      status: "starting",
      message: "Opening secure Stripe Checkout...",
    });

    const response = await fetch("/api/public/payments/stripe-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: "invoice",
        token,
        targetType: "invoice",
        checkoutKind: "balance_due",
        idempotencyKey: createIdempotencyKey(data.invoice.invoice_number),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      checkoutUrl?: string | null;
      message?: string;
      ok?: boolean;
    } | null;

    if (!response.ok || !payload?.ok || !payload.checkoutUrl) {
      setCheckoutState({
        status: "error",
        message: payload?.message ?? "Stripe Checkout could not be started.",
      });
      return;
    }

    window.location.assign(payload.checkoutUrl);
  }

  return (
    <main className="min-h-screen bg-[#F3F6FA] px-3 py-4 text-[#0F172A] sm:px-6 sm:py-8">
      <article className="mx-auto max-w-4xl bg-white px-4 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-[#E5E7EB] sm:px-8 sm:py-7">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#CBD5E1] pb-3">
          <div className="min-w-0">
            <p className="text-base font-black leading-5 text-[#0F6BFF] sm:text-2xl">
              {data.company.name}
            </p>
            <p className="mt-1 text-[0.68rem] font-black uppercase text-[#64748B]">
              Secure invoice payment
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-black leading-5 sm:text-3xl">INVOICE</h1>
            <p className="mt-1 text-[0.68rem] font-black text-[#475569] sm:text-xs">
              {data.invoice.invoice_number}
            </p>
            <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-black text-emerald-700">
              {formatServiceRequestSource(data.invoice.invoice_status)}
            </span>
          </div>
        </header>

        <section className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#E5E7EB] py-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase text-[#64748B]">
              Bill to
            </p>
            <p className="mt-1 text-sm font-black leading-5 sm:text-base">
              {data.customer.name}
            </p>
            {data.customer.service_address ? (
              <p className="mt-1 text-xs font-semibold leading-4 text-[#475569] sm:text-sm sm:leading-5">
                {data.customer.service_address}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-[0.68rem] font-black uppercase text-[#64748B]">
              Date
            </p>
            <p className="mt-1 text-xs font-bold text-[#334155] sm:text-sm">
              {formatServiceRequestDate(data.invoice.sent_at ?? data.invoice.created_at)}
            </p>
            {data.job.job_number ? (
              <p className="mt-2 text-xs font-bold text-[#64748B]">
                Job #{data.job.job_number}
              </p>
            ) : null}
          </div>
        </section>

        <section className="py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_4.25rem_4.5rem] border-b border-[#CBD5E1] pb-1 text-[0.64rem] font-black uppercase text-[#64748B] sm:grid-cols-[minmax(0,1fr)_3rem_5rem_5rem]">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {data.invoice.items.map((item) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_2.5rem_4.25rem_4.5rem] gap-1 py-2 text-[0.72rem] sm:grid-cols-[minmax(0,1fr)_3rem_5rem_5rem] sm:text-sm"
                key={item.id}
              >
                <div className="min-w-0 pr-2">
                  <p className="font-black leading-4 sm:leading-5">{item.title}</p>
                  {item.notes ? (
                    <p className="mt-0.5 text-[0.68rem] font-semibold leading-4 text-[#64748B] sm:text-xs">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
                <p className="text-right font-bold">{item.quantity}</p>
                <p className="text-right font-bold">
                  {formatServiceRequestMoney(item.unit_price)}
                </p>
                <p className="text-right font-black">
                  {formatServiceRequestMoney(item.line_total)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-2 border-y border-[#E5E7EB] py-3 text-sm">
          <div className="flex items-center justify-between gap-4 font-bold">
            <span className="text-[#475569]">Subtotal</span>
            <span>{formatServiceRequestMoney(data.invoice.subtotal)}</span>
          </div>
          {data.invoice.discount_amount > 0 ? (
            <div className="flex items-center justify-between gap-4 font-bold">
              <span className="text-[#475569]">Discount</span>
              <span>-{formatServiceRequestMoney(data.invoice.discount_amount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 font-bold">
            <span className="text-[#475569]">Tax</span>
            <span>{formatServiceRequestMoney(data.invoice.tax)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-[#CBD5E1] pt-3">
            <span className="font-black">Invoice Total</span>
            <span className="text-2xl font-black text-[#0F172A]">
              {formatServiceRequestMoney(data.invoice.total)}
            </span>
          </div>
        </section>

        <section className="grid grid-cols-3 divide-x divide-[#D7DEE8] py-4">
          <div className="min-w-0 pr-2">
            <p className="text-[0.7rem] font-bold text-[#64748B]">Total</p>
            <p className="mt-1 whitespace-nowrap text-lg font-black tabular-nums">
              {formatServiceRequestMoney(data.invoice.total)}
            </p>
          </div>
          <div className="min-w-0 px-2">
            <p className="text-[0.7rem] font-bold text-[#64748B]">Paid</p>
            <p className="mt-1 whitespace-nowrap text-lg font-black text-emerald-700 tabular-nums">
              {formatServiceRequestMoney(data.invoice.paid)}
            </p>
          </div>
          <div className="min-w-0 pl-2">
            <p className="text-[0.7rem] font-bold text-[#64748B]">Balance Due</p>
            <p className="mt-1 whitespace-nowrap text-xl font-black text-[#0F6BFF] tabular-nums">
              {formatServiceRequestMoney(data.invoice.balance_due)}
            </p>
          </div>
        </section>
      </article>

      <section className="mx-auto mt-3 max-w-4xl bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] ring-1 ring-[#E5E7EB]">
        <p className="text-sm font-black text-[#0F172A]">{paymentStateLabel}</p>
        {paymentIsAvailable ? (
          <button
            className="mt-3 min-h-12 w-full rounded-xl bg-[#0F6BFF] px-4 text-base font-black text-white transition hover:bg-[#0959D9] disabled:cursor-wait disabled:opacity-70"
            disabled={checkoutState.status === "starting"}
            onClick={() => void startCheckout()}
            type="button"
          >
            {checkoutState.status === "starting"
              ? "Opening Checkout..."
              : `Pay Balance Due ${formatServiceRequestMoney(data.invoice.balance_due)}`}
          </button>
        ) : null}
        {checkoutState.message ? (
          <p
            className={`mt-3 text-sm font-bold ${
              checkoutState.status === "error" ? "text-amber-800" : "text-[#64748B]"
            }`}
          >
            {checkoutState.message}
          </p>
        ) : null}
        <p className="mt-3 text-xs font-semibold leading-5 text-[#64748B]">
          Card details are entered in Stripe secure checkout. HomeFixOS never stores card numbers or CVV.
        </p>
      </section>
    </main>
  );
}
