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

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 print:bg-white">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 print:border-none print:shadow-none">
        <div className="border-b border-slate-100 bg-slate-950 px-6 py-7 text-white">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
            HomeFix Appliance Repair
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Payment Receipt
          </h1>
          <p className="mt-2 text-sm text-slate-300">{receipt.receipt_number}</p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="rounded-2xl bg-emerald-50 p-5 text-center">
            <p className="text-sm font-bold text-emerald-700">
              Payment Confirmed
            </p>
            <p className="mt-2 text-4xl font-black text-emerald-800">
              {money(receipt.amount)}
            </p>
          </div>

          <dl className="mt-7 grid gap-4 text-sm">
            {[
              ["Job Number", receipt.job_number ? `#${receipt.job_number}` : "Unavailable"],
              ["Date & Time", formatDate(receipt.paid_at)],
              ["Payment Method", paymentMethodLabel(receipt)],
              ["Status", receipt.payment_status === "succeeded" ? "Succeeded" : "Confirmed"],
              ["Related Document", documentReference],
            ].map(([label, value]) => (
              <div
                className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3"
                key={label}
              >
                <dt className="font-bold text-slate-500">{label}</dt>
                <dd className="text-right font-black text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-7 text-sm leading-6 text-slate-500">
            This receipt confirms the individual payment listed above. It does
            not include other payments or full job history.
          </p>
        </div>
      </section>
    </main>
  );
}
