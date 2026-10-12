"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { StripeReturnStatus } from "@/server/finance/stripe-return-status";

type StripeSuccessExperienceProps = {
  dashboardReturnPath: string | null;
  initialStatus: StripeReturnStatus;
  query: {
    attempt: string | null;
    returnPath: string | null;
    token: string | null;
  };
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function paymentMethod(status: Extract<StripeReturnStatus, { authorized: true }>) {
  const receipt = status.receipt;
  if (!receipt) {
    return "Card";
  }

  if (receipt.cardBrand && receipt.cardLast4) {
    return `${receipt.cardBrand.toUpperCase()} ending in ${receipt.cardLast4}`;
  }

  if (receipt.cardLast4) {
    return `Card ending in ${receipt.cardLast4}`;
  }

  return receipt.paymentMethod === "card" ? "Card" : "Payment";
}

export function StripeSuccessExperience({
  dashboardReturnPath,
  initialStatus,
  query,
}: StripeSuccessExperienceProps) {
  const [status, setStatus] = useState(initialStatus);
  const [polls, setPolls] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.attempt) params.set("attempt", query.attempt);
    if (query.token) params.set("token", query.token);
    if (query.returnPath) params.set("returnPath", query.returnPath);
    return params.toString();
  }, [query.attempt, query.returnPath, query.token]);

  const shouldPoll =
    status.authorized && status.paymentStatus === "processing" && polls < 8;

  useEffect(() => {
    if (!shouldPoll || !queryString) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setPolls((current) => current + 1);
      const response = await fetch(`/api/payments/stripe-return-status?${queryString}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        status?: StripeReturnStatus;
      } | null;
      if (payload?.status) {
        setStatus(payload.status);
      }
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [queryString, shouldPoll]);

  if (!status.authorized) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
        <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Payment status
          </p>
          <h1 className="mt-3 text-3xl font-black">Payment is being verified</h1>
          <p className="mt-4 leading-7 text-slate-600">
            Stripe redirected you back to HomeFixOS. For privacy, payment details
            are only shown from a valid customer document link.
          </p>
          {dashboardReturnPath ? (
            <Link
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 text-center text-sm font-black text-white shadow-lg shadow-blue-700/20"
              href={dashboardReturnPath}
            >
              Return to Job Finance
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  const receipt = status.receipt;
  const received = status.paymentStatus === "received" && Boolean(receipt);
  const failed = status.paymentStatus === "failed" || status.paymentStatus === "canceled";
  const unavailable = status.paymentStatus === "processing" && polls >= 8;
  const iconState = received ? "success" : failed || unavailable ? "alert" : "pending";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <section className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/10">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            HomeFix Appliance Repair
          </p>
          <div
            className={[
              "mx-auto mt-5 grid h-20 w-20 place-items-center rounded-full text-4xl font-black",
              iconState === "success"
                ? "bg-emerald-100 text-emerald-700"
                : iconState === "alert"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-100 text-blue-700",
            ].join(" ")}
          >
            {iconState === "success" ? "✓" : iconState === "alert" ? "!" : "..."}
          </div>
          <h1 className="mt-5 text-3xl font-black">
            {received
              ? "Payment Successful!"
              : failed
                ? "Payment was not completed"
                : unavailable
                  ? "Payment verification unavailable"
                  : "Verifying payment..."}
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            {received
              ? "Your payment has been confirmed and your receipt is ready."
              : failed
                ? "No payment is recorded until Stripe confirms it."
                : unavailable
                  ? "We could not confirm the receipt yet. Please check again from your document link."
                  : "Please wait while HomeFixOS confirms the verified payment ledger entry."}
          </p>
        </div>

        <dl className="mt-7 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Payment Amount</dt>
            <dd className="font-black text-slate-950">
              {receipt && received ? `$${receipt.amount}` : `$${status.amount}`}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Payment Method</dt>
            <dd className="font-black text-slate-950">{paymentMethod(status)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Job Number</dt>
            <dd className="font-black text-slate-950">
              {receipt?.jobNumber ? `#${receipt.jobNumber}` : "Pending"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Date & Time</dt>
            <dd className="font-black text-slate-950">
              {formatDate(receipt?.paidAt)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-bold text-slate-500">Receipt Number</dt>
            <dd className="font-black text-slate-950">
              {receipt?.receiptNumber ?? "Pending"}
            </dd>
          </div>
        </dl>

        {received ? (
          <Link
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 text-center text-sm font-black text-white shadow-lg shadow-blue-700/20"
            href={receipt?.href ?? status.documentHref}
          >
            View Receipt
          </Link>
        ) : null}

        <Link
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 px-5 text-center text-sm font-black text-slate-700"
          href={dashboardReturnPath ?? status.documentHref}
        >
          {dashboardReturnPath
            ? "Return to Job Finance"
            : `Return to ${status.targetType === "invoice" ? "Invoice" : "Estimate"}`}
        </Link>
      </section>
    </main>
  );
}
