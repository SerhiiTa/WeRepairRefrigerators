import Link from "next/link";

import { loadStripeReturnStatus } from "@/server/finance/stripe-return-status";

export const dynamic = "force-dynamic";

type StripeCancelPageProps = {
  searchParams: Promise<{
    attempt?: string;
    token?: string;
  }>;
};

export default async function StripeCancelPage({ searchParams }: StripeCancelPageProps) {
  const params = await searchParams;
  const status = await loadStripeReturnStatus({
    attemptId: params.attempt ?? null,
    token: params.token ?? null,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
          Stripe checkout
        </p>
        <h1 className="mt-3 text-3xl font-black">Checkout canceled</h1>
        <p className="mt-4 leading-7 text-slate-600">
          You left Stripe Checkout before HomeFixOS received a confirmed payment. This does not
          mean a payment failed or was refunded.
        </p>

        {status.authorized ? (
          <Link
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 text-center text-sm font-black text-white shadow-lg shadow-blue-700/20"
            href={status.documentHref}
          >
            Return to {status.targetType === "invoice" ? "Invoice" : "Estimate"}
          </Link>
        ) : (
          <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
            For privacy, return to the original customer document link to review payment options.
          </p>
        )}
      </section>
    </main>
  );
}
