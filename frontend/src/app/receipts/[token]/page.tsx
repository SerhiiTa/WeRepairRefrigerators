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
  const details = [
    ["●", "Job Number", receipt.job_number ? `#${receipt.job_number}` : "Unavailable"],
    ["◷", "Payment Date", formatDate(receipt.paid_at)],
    ["▣", "Payment Method", paymentMethodLabel(receipt)],
    ["✓", "Status", receipt.payment_status === "succeeded" ? "Succeeded" : "Confirmed"],
    ["◆", "Related Document", documentReference],
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-blue-50 px-4 py-8 text-slate-950 print:bg-white">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl shadow-blue-950/10 print:border-none print:shadow-none">
        <div className="relative overflow-hidden border-b border-blue-100 bg-slate-950 px-6 py-7 text-white">
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-500/20" />
          <div className="absolute -bottom-20 right-16 h-40 w-56 rounded-[50%] bg-emerald-400/10" />
          <div className="relative">
            <p className="text-2xl font-black tracking-tight">
              <span>HomeFix</span>
              <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                OS
              </span>
            </p>
            <p className="mt-1 text-xs font-bold text-cyan-100">
              Reliable Appliances. Happier Homes.
            </p>
            <h1 className="mt-6 text-3xl font-black tracking-tight">
              Payment Confirmed
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              Receipt {receipt.receipt_number}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-center">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
              Payment Amount
            </p>
            <p className="mt-2 text-5xl font-black tracking-tight text-emerald-800">
              {money(receipt.amount)}
            </p>
            <p className="mt-3 text-sm font-bold text-emerald-700">
              This receipt confirms one completed payment.
            </p>
          </div>

          <dl className="mt-7 grid gap-3 text-sm">
            {details.map(([icon, label, value]) => (
              <div
                className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"
                key={label}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-700">
                  {icon}
                </span>
                <dt className="font-bold text-slate-500">{label}</dt>
                <dd className="ml-auto text-right font-black text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-7 rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-slate-600">
            This receipt confirms the individual payment listed above. It does
            not include other payments or full job history.
          </p>
        </div>
      </section>
    </main>
  );
}
