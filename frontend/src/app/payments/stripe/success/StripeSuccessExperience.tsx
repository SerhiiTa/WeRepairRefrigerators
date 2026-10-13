"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Chicago",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
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
  const requestSequenceRef = useRef(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.attempt) params.set("attempt", query.attempt);
    if (query.token) params.set("token", query.token);
    if (query.returnPath) params.set("returnPath", query.returnPath);
    return params.toString();
  }, [query.attempt, query.returnPath, query.token]);

  const shouldPoll =
    Boolean(queryString) &&
    Boolean(query.attempt) &&
    ((status.authorized && status.paymentStatus === "processing") ||
      (!status.authorized && Boolean(dashboardReturnPath) && Boolean(query.attempt))) &&
    polls < 12;

  useEffect(() => {
    if (!shouldPoll || !queryString) {
      return;
    }

    let canceled = false;
    const timeout = window.setTimeout(async () => {
      const headers: HeadersInit = {};
      const requestSequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestSequence;

      try {
        if (dashboardReturnPath && !query.token) {
          const supabase = getSupabaseBrowserClient();
          const session = supabase
            ? await supabase.auth.getSession().catch(() => null)
            : null;
          const accessToken = session?.data.session?.access_token;

          if (!accessToken) {
            return;
          }

          headers.Authorization = `Bearer ${accessToken}`;
        }

        const response = await fetch(`/api/payments/stripe-return-status?${queryString}`, {
          cache: "no-store",
          headers,
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          status?: StripeReturnStatus;
        } | null;
        if (
          payload?.ok === true &&
          payload.status &&
          !canceled &&
          requestSequence === requestSequenceRef.current
        ) {
          setStatus(payload.status);
        }
      } finally {
        if (!canceled && requestSequence === requestSequenceRef.current) {
          setPolls((current) => current + 1);
        }
      }
    }, 2000);

    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [
    dashboardReturnPath,
    polls,
    query.attempt,
    query.token,
    queryString,
    shouldPoll,
    status,
  ]);

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
  const receiptUnavailable = status.paymentStatus === "receipt_unavailable";
  const unavailable = status.paymentStatus === "processing" && polls >= 12;
  const pending = !received && !failed && !receiptUnavailable && !unavailable;
  const iconState = received
    ? "success"
    : failed || unavailable || receiptUnavailable
      ? "alert"
      : "pending";

  return (
    <main className="relative min-h-screen overflow-hidden bg-white px-5 py-6 text-slate-950 sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 overflow-hidden text-blue-50">
        <div className="absolute -bottom-28 left-1/2 h-64 w-[140%] -translate-x-1/2 rounded-[50%] bg-blue-50" />
        <div className="absolute -bottom-36 left-[52%] h-64 w-[150%] -translate-x-1/2 rounded-[50%] bg-cyan-50/70" />
      </div>

      <section className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col">
        <header className="flex items-start justify-between gap-4 text-sm">
          <div className="font-black tracking-tight">
            <span className="text-slate-950">HomeFix</span>
            <span className="bg-gradient-to-r from-blue-700 to-emerald-500 bg-clip-text text-transparent">
              OS
            </span>
          </div>
          <p className="max-w-[11rem] text-right text-xs font-bold leading-5 text-slate-500 sm:max-w-none sm:text-sm">
            Reliable Appliances. Happier Homes.
          </p>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="relative">
            {received ? (
              <>
                <span className="absolute -left-8 top-2 h-2 w-2 rounded-full bg-blue-500" />
                <span className="absolute -right-9 top-6 h-3 w-3 rounded-full bg-emerald-400" />
                <span className="absolute -right-4 -top-5 h-2 w-2 rounded-full bg-cyan-400" />
              </>
            ) : null}
            <div
              className={[
                "grid h-24 w-24 place-items-center rounded-full text-5xl font-black shadow-xl sm:h-28 sm:w-28",
                iconState === "success"
                  ? "bg-emerald-500 text-white shadow-emerald-500/25"
                  : iconState === "alert"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-blue-100 text-blue-700",
              ].join(" ")}
            >
              {iconState === "success" ? "✓" : iconState === "alert" ? "!" : "..."}
            </div>
          </div>

          <h1 className="mt-8 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            {received
              ? "Payment Successful!"
              : failed
                ? "Payment was not completed"
                : receiptUnavailable
                  ? "Receipt temporarily unavailable"
                : unavailable
                  ? "Payment verification unavailable"
                  : "Verifying payment..."}
          </h1>
          <p className="mt-4 max-w-md text-base font-semibold leading-7 text-slate-600 sm:text-lg">
            {received
              ? "Thank you for your payment! Your payment receipt is ready to view."
              : failed
                ? "No payment is recorded until Stripe confirms it."
                : receiptUnavailable
                  ? "Your payment was confirmed, but HomeFixOS could not prepare the receipt link yet. Please return to Job Finance and try View Receipt again."
                : unavailable
                  ? "We could not confirm the receipt yet. Please check again from your document link."
                  : "Please wait while HomeFixOS confirms the verified payment ledger entry."}
          </p>

          {received && receipt ? (
            <section className="mt-8 w-full rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-2xl shadow-blue-950/10 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Payment Details
              </p>
              <p className="mt-3 text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">
                ${receipt.amount}
              </p>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="font-bold text-slate-500">Payment Method</dt>
                  <dd className="mt-1 font-black text-slate-950">
                    {paymentMethod(status)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="font-bold text-slate-500">Job Number</dt>
                  <dd className="mt-1 font-black text-slate-950">
                    {receipt.jobNumber ? `#${receipt.jobNumber}` : "Unavailable"}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="font-bold text-slate-500">Date & Time</dt>
                  <dd className="mt-1 font-black text-slate-950">
                    {formatDate(receipt.paidAt)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <dt className="font-bold text-slate-500">Receipt Number</dt>
                  <dd className="mt-1 font-black text-slate-950">
                    {receipt.receiptNumber}
                  </dd>
                </div>
              </dl>
            </section>
          ) : pending ? (
            <div className="mt-8 w-full rounded-3xl border border-blue-100 bg-blue-50 p-5 text-center text-sm font-bold text-blue-800">
              Confirming the verified payment ledger entry and receipt...
            </div>
          ) : null}

          {receiptUnavailable ? (
            <div className="mt-8 w-full rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center text-sm font-bold leading-6 text-amber-800">
              The payment is confirmed, but the receipt link is temporarily unavailable.
              No receipt was sent automatically.
            </div>
          ) : null}

          {unavailable ? (
            <div className="mt-8 w-full rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center text-sm font-bold leading-6 text-amber-800">
              Verification timed out before receipt data became available.
            </div>
          ) : null}

          {received ? (
            <Link
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-700 px-5 text-center text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 sm:w-auto sm:min-w-56"
              href={receipt?.href ?? status.documentHref}
            >
              View Receipt
            </Link>
          ) : null}

          <Link
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-center text-sm font-black text-slate-700 transition hover:bg-slate-50 sm:w-auto sm:min-w-56"
            href={dashboardReturnPath ?? status.documentHref}
          >
            {dashboardReturnPath
              ? "Back to Job Finance"
              : `Return to ${status.targetType === "invoice" ? "Invoice" : "Estimate"}`}
          </Link>
        </div>

        <footer className="relative z-10 pb-4 text-center text-xs font-bold text-slate-400">
          HomeFix Appliance Repair
        </footer>
      </section>
    </main>
  );
}
