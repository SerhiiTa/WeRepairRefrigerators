/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

type ReceiptPageProps = {
  params: Promise<{ token: string }>;
};

type ReceiptPayload = {
  receipt?: {
    amount?: number | string | null;
    card_brand?: string | null;
    card_last4?: string | null;
    estimate_number?: string | null;
    invoice_number?: string | null;
    job_number?: number | string | null;
    paid_at?: string | null;
    payment_method?: string | null;
    payment_status?: string | null;
    receipt_number?: string | null;
  };
};

const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

function money(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Chicago",
    timeZoneName: "short",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const dayPeriod = part("dayPeriod");

  return `${part("month")} ${part("day")}, ${part("year")} at ${part("hour")}:${part("minute")}${
    dayPeriod ? ` ${dayPeriod}` : ""
  } ${part("timeZoneName")}`.trim();
}

function paymentMethodLabel(receipt: NonNullable<ReceiptPayload["receipt"]>) {
  const brand = receipt.card_brand?.trim();
  const last4 = receipt.card_last4?.trim();

  if (brand && last4) {
    return `${brand.toUpperCase()} ending in ${last4}`;
  }

  if (last4) {
    return `Card ending in ${last4}`;
  }

  return receipt.payment_method === "card" ? "Card" : "Payment";
}

export default async function PaymentReceiptPage({ params }: ReceiptPageProps) {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) {
    notFound();
  }

  const serviceRole = getSupabaseServiceRoleClient();
  if (!serviceRole) {
    notFound();
  }

  const { data, error } = await (serviceRole as any).rpc(
    "get_public_payment_receipt_by_token_rpc",
    { p_token: token },
  );

  if (error || !data) {
    notFound();
  }

  const receipt = ((data ?? {}) as ReceiptPayload).receipt;
  if (!receipt?.receipt_number) {
    notFound();
  }

  const documentReference =
    receipt.invoice_number ?? receipt.estimate_number ?? "HomeFixOS payment";
  const paidAt = formatDate(receipt.paid_at);
  const statusLabel = receipt.payment_status === "succeeded" ? "PAID" : "CONFIRMED";
  const methodLabel = paymentMethodLabel(receipt);

  return (
    <main className="min-h-screen bg-[#F3F6FA] px-3 py-4 text-[#0F172A] print:bg-white print:px-0 print:py-0 sm:px-6 sm:py-8">
      <article className="mx-auto max-w-4xl bg-white px-4 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-[#E5E7EB] print:shadow-none print:ring-0 sm:px-8 sm:py-7">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#CBD5E1] pb-3">
          <div className="min-w-0">
            <p className="text-base font-black leading-5 text-[#0F6BFF] sm:text-2xl">
              HomeFix Appliance Repair
            </p>
            <p className="mt-1 text-[0.68rem] font-black uppercase text-[#64748B]">
              Reliable Appliances. Happier Homes.
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-black leading-5 sm:text-3xl">
              PAYMENT RECEIPT
            </h1>
            <p className="mt-1 text-[0.68rem] font-black text-[#475569] sm:text-xs">
              {receipt.receipt_number}
            </p>
            <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-black text-emerald-700">
              {statusLabel}
            </span>
          </div>
        </header>

        <section className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#E5E7EB] py-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase text-[#64748B]">
              Related document
            </p>
            <p className="mt-1 text-sm font-black leading-5 sm:text-base">
              {documentReference}
            </p>
            {receipt.job_number ? (
              <p className="mt-1 text-xs font-bold text-[#64748B]">
                Job #{receipt.job_number}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-[0.68rem] font-black uppercase text-[#64748B]">
              Payment date
            </p>
            <p className="mt-1 text-xs font-bold text-[#334155] sm:text-sm">
              {paidAt}
            </p>
            <p className="mt-2 text-xs font-bold text-[#64748B]">{methodLabel}</p>
          </div>
        </section>

        <section className="py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] border-b border-[#CBD5E1] pb-1 text-[0.64rem] font-black uppercase text-[#64748B] sm:grid-cols-[minmax(0,1fr)_10rem]">
            <span>Description</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="min-w-0 pr-2">
              <p className="font-black leading-5">Payment received</p>
              <p className="mt-1 text-xs font-semibold leading-4 text-[#64748B]">
                {methodLabel}
              </p>
            </div>
            <p className="text-right font-black">{money(receipt.amount)}</p>
          </div>
        </section>

        <section className="grid gap-2 border-y border-[#E5E7EB] py-3 text-sm">
          <div className="flex items-center justify-between gap-4 font-bold">
            <span className="text-[#475569]">Payment Status</span>
            <span className="text-emerald-700">{statusLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-4 font-bold">
            <span className="text-[#475569]">Payment Method</span>
            <span>{methodLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-[#CBD5E1] pt-3">
            <span className="font-black">Amount Received</span>
            <span className="text-2xl font-black text-[#0F172A]">
              {money(receipt.amount)}
            </span>
          </div>
        </section>

        <section className="grid grid-cols-3 divide-x divide-[#D7DEE8] py-4">
          <div className="min-w-0 pr-2">
            <p className="text-[0.7rem] font-bold text-[#64748B]">Receipt</p>
            <p className="mt-1 break-words text-sm font-black">
              {receipt.receipt_number}
            </p>
          </div>
          <div className="min-w-0 px-2">
            <p className="text-[0.7rem] font-bold text-[#64748B]">Job</p>
            <p className="mt-1 whitespace-nowrap text-lg font-black tabular-nums">
              {receipt.job_number ? `#${receipt.job_number}` : "N/A"}
            </p>
          </div>
          <div className="min-w-0 pl-2">
            <p className="text-[0.7rem] font-bold text-[#64748B]">Received</p>
            <p className="mt-1 whitespace-nowrap text-lg font-black text-emerald-700 tabular-nums">
              {money(receipt.amount)}
            </p>
          </div>
        </section>

        <p className="border-t border-[#E5E7EB] pt-3 text-xs font-semibold leading-5 text-[#64748B]">
          This receipt confirms the individual payment listed above. It does not
          include other payments or full job history.
        </p>
      </article>
    </main>
  );
}
