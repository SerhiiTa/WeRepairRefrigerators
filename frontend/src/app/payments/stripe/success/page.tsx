import Link from "next/link";

import { loadStripeReturnStatus } from "@/server/finance/stripe-return-status";

export const dynamic = "force-dynamic";

type StripeSuccessPageProps = {
  searchParams: Promise<{
    attempt?: string;
    token?: string;
  }>;
};

function money(value: string | null) {
  return value ? `$${value}` : "Pending";
}

export default async function StripeSuccessPage({
  searchParams,
}: StripeSuccessPageProps) {
  const params = await searchParams;
  const status = await loadStripeReturnStatus({
    attemptId: params.attempt ?? null,
    token: params.token ?? null,
  });

  if (!status.authorized) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
        <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Payment status
          </p>
          <h1 className="mt-3 text-3xl font-black">Payment is being verified</h1>
          <p className="mt-4 leading-7 text-slate-600">
            Stripe redirected you back to HomeFixOS. For privacy, payment details are only shown
            from a valid customer document link.
          </p>
        </section>
      </main>
    );
  }

  const received = status.paymentStatus === "received";
  const failed = status.paymentStatus === "failed";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
          Stripe checkout
        </p>
        <h1 className="mt-3 text-3xl font-black">
          {received ? "Payment received" : failed ? "Payment needs attention" : "Payment processing"}
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          {received
            ? "Your payment has been confirmed in HomeFixOS."
            : failed
              ? "Stripe reported that this payment did not complete. No payment is recorded until Stripe confirms it."
              : "Stripe accepted the checkout return. HomeFixOS will show the payment as received after the verified webhook posts it."}
        </p>

        <dl className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Document</dt>
            <dd className="font-black text-slate-950">{status.documentNumber ?? "Estimate"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Checkout amount</dt>
            <dd className="font-black text-slate-950">${status.amount}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Paid</dt>
            <dd className="font-black text-emerald-700">{money(status.paid)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Balance due</dt>
            <dd className="font-black text-blue-700">{money(status.balanceDue)}</dd>
          </div>
        </dl>

        <Link
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 text-center text-sm font-black text-white shadow-lg shadow-blue-700/20"
          href={status.documentHref}
        >
          Return to {status.targetType === "invoice" ? "Invoice" : "Estimate"}
        </Link>
      </section>
    </main>
  );
}
