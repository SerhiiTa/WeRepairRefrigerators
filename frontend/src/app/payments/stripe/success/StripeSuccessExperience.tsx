"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { StripeReturnStatus } from "@/server/finance/stripe-return-status";

type StripeSuccessExperienceProps = {
  dashboardReturnPath: string | null;
  devOpenReceiptDelivery?: boolean;
  initialStatus: StripeReturnStatus;
  query: {
    attempt: string | null;
    returnPath: string | null;
    token: string | null;
  };
};

type ReceiptDeliveryOptions = {
  email: {
    available: boolean;
    recipient?: string | null;
    reason?: string | null;
  };
  sms: {
    available: boolean;
    recipient: string | null;
  };
};

type ReceiptDeliveryHistoryItem = {
  created_at?: string | null;
  delivery_channel?: string | null;
  delivery_status?: string | null;
  id?: string | null;
  provider_status?: string | null;
  recipient?: string | null;
};

type ReceiptDeliveryModalState = {
  deliveries: ReceiptDeliveryHistoryItem[];
  emailSelected: boolean;
  emailRecipient: string;
  idempotencyKey: string;
  options: ReceiptDeliveryOptions;
  smsSelected: boolean;
};

type ReceiptDeliverySendState =
  | { message: null; status: "idle" }
  | { message: string; status: "loading" | "sending" | "success" | "error" };

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Pending";
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

function CreditCardIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="14" rx="2" width="20" x="2" y="5" />
      <path d="M2 10h20" />
    </svg>
  );
}

function ClipboardListIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="4" rx="1" width="8" x="8" y="2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

function CalendarDaysIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect height="18" rx="2" width="18" x="3" y="4" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" />
    </svg>
  );
}

function ReceiptTextIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M14 8H8" />
      <path d="M16 12H8" />
      <path d="M13 16H8" />
    </svg>
  );
}

function buildIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `receipt-${crypto.randomUUID()}`;
  }

  return `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildPreviewReceiptDeliveryModal(): ReceiptDeliveryModalState {
  return {
    deliveries: [],
    emailSelected: false,
    emailRecipient: "",
    idempotencyKey: buildIdempotencyKey(),
    options: {
      email: {
        available: false,
        reason: "Receipt email delivery is not configured yet.",
      },
      sms: {
        available: true,
        recipient: "(preview recipient)",
      },
    },
    smsSelected: true,
  };
}

function PaymentMotionStyles() {
  return (
    <style>{`
      @keyframes homefix-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes homefix-pulse-glow {
        0%, 100% { opacity: .52; transform: scale(.96); }
        50% { opacity: .9; transform: scale(1.04); }
      }

      @keyframes homefix-success-enter {
        from { opacity: 0; transform: translateY(10px) scale(.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes homefix-success-ring {
        0% { opacity: .55; transform: scale(.72); }
        72% { opacity: .18; transform: scale(1.32); }
        100% { opacity: 0; transform: scale(1.44); }
      }

      .homefix-verify-ring {
        animation: homefix-spin 1.45s linear infinite;
        transform-origin: center;
      }

      .homefix-verify-glow {
        animation: homefix-pulse-glow 2.4s ease-in-out infinite;
      }

      .homefix-success-enter {
        animation: homefix-success-enter .56s cubic-bezier(.16, 1, .3, 1) both;
      }

      .homefix-success-ring {
        animation: homefix-success-ring .92s cubic-bezier(.16, 1, .3, 1) both;
      }

      @media (prefers-reduced-motion: reduce) {
        .homefix-verify-ring,
        .homefix-verify-glow,
        .homefix-success-enter,
        .homefix-success-ring {
          animation: none;
        }
      }
    `}</style>
  );
}

export function StripeSuccessExperience({
  dashboardReturnPath,
  devOpenReceiptDelivery = false,
  initialStatus,
  query,
}: StripeSuccessExperienceProps) {
  const [status, setStatus] = useState(initialStatus);
  const [polls, setPolls] = useState(0);
  const [receiptDeliveryModal, setReceiptDeliveryModal] =
    useState<ReceiptDeliveryModalState | null>(() =>
      devOpenReceiptDelivery &&
      initialStatus.authorized &&
      initialStatus.receipt &&
      initialStatus.staffReceiptDelivery?.previewOnly
        ? buildPreviewReceiptDeliveryModal()
        : null,
    );
  const [receiptDeliveryState, setReceiptDeliveryState] =
    useState<ReceiptDeliverySendState>({ message: null, status: "idle" });
  const requestSequenceRef = useRef(0);
  const receiptSendLock = useRef(false);
  const attemptedReceiptSends = useRef(new Set<string>());

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
  const detailRows =
    received && receipt
      ? [
          {
            Icon: CreditCardIcon,
            label: "Payment Method",
            value: paymentMethod(status),
          },
          {
            Icon: ClipboardListIcon,
            label: "Job Number",
            value: receipt.jobNumber ? `#${receipt.jobNumber}` : "Unavailable",
          },
          {
            Icon: CalendarDaysIcon,
            label: "Date & Time",
            value: formatDate(receipt.paidAt),
          },
          {
            Icon: ReceiptTextIcon,
            label: "Receipt Number",
            value: receipt.receiptNumber,
          },
        ]
      : [];
  const iconState = received
    ? "success"
    : failed || unavailable || receiptUnavailable
      ? "alert"
      : "pending";

  async function getDashboardAccessToken() {
    const supabase = getSupabaseBrowserClient();
    const session = supabase ? await supabase.auth.getSession().catch(() => null) : null;
    return session?.data.session?.access_token ?? null;
  }

  async function openReceiptDeliveryModal() {
    if (
      !status.authorized ||
      !status.staffReceiptDelivery ||
      !receipt ||
      !dashboardReturnPath
    ) {
      return;
    }

    if (status.staffReceiptDelivery.previewOnly) {
      setReceiptDeliveryModal(buildPreviewReceiptDeliveryModal());
      setReceiptDeliveryState({ message: null, status: "idle" });
      return;
    }

    setReceiptDeliveryState({
      message: "Preparing receipt delivery...",
      status: "loading",
    });

    const accessToken = await getDashboardAccessToken();

    if (!accessToken) {
      setReceiptDeliveryState({
        message: "Log in again before sending this receipt.",
        status: "error",
      });
      return;
    }

    const { paymentId, serviceRequestId } = status.staffReceiptDelivery;
    const response = await fetch(
      `/api/service-requests/${serviceRequestId}/payments/${paymentId}/receipt`,
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | {
          deliveryOptions?: ReceiptDeliveryOptions;
          deliveries?: ReceiptDeliveryHistoryItem[];
          message?: string;
          ok?: boolean;
        }
      | null;

    if (!response.ok || !payload?.ok || !payload.deliveryOptions) {
      setReceiptDeliveryState({
        message: payload?.message ?? "Receipt delivery is not available.",
        status: "error",
      });
      return;
    }

    setReceiptDeliveryModal({
      deliveries: payload.deliveries ?? [],
      emailSelected: false,
      emailRecipient: payload.deliveryOptions.email.recipient ?? "",
      idempotencyKey: buildIdempotencyKey(),
      options: payload.deliveryOptions,
      smsSelected: payload.deliveryOptions.sms.available,
    });
    setReceiptDeliveryState({ message: null, status: "idle" });
  }

  async function sendReceiptDelivery() {
    if (
      !status.authorized ||
      !status.staffReceiptDelivery ||
      !receiptDeliveryModal ||
      !dashboardReturnPath
    ) {
      return;
    }

    if (receiptDeliveryModal.emailSelected && !receiptDeliveryModal.options.email.available) {
      setReceiptDeliveryState({
        message: "Receipt email delivery is not configured yet.",
        status: "error",
      });
      return;
    }

    if (!receiptDeliveryModal.smsSelected && !receiptDeliveryModal.emailSelected) {
      setReceiptDeliveryState({
        message: "Choose SMS or Email before sending.",
        status: "error",
      });
      return;
    }

    if (status.staffReceiptDelivery.previewOnly) {
      setReceiptDeliveryState({
        message: "Preview only. No receipt was sent.",
        status: "success",
      });
      return;
    }

    const emailRecipient = receiptDeliveryModal.emailRecipient.trim();
    if (receiptDeliveryModal.emailSelected &&
        (emailRecipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRecipient))) {
      setReceiptDeliveryState({ message: "Enter a valid email address.", status: "error" });
      return;
    }
    if (receiptDeliveryModal.smsSelected &&
        (!receiptDeliveryModal.options.sms.available || !receiptDeliveryModal.options.sms.recipient)) {
      setReceiptDeliveryState({ message: "No authorized SMS recipient is available.", status: "error" });
      return;
    }
    if (receiptSendLock.current) return;
    receiptSendLock.current = true;
    setReceiptDeliveryState({ message: "Sending receipt...", status: "sending" });
    try {
      const accessToken = await getDashboardAccessToken();
      if (!accessToken) {
        setReceiptDeliveryState({ message: "Log in again before sending this receipt.", status: "error" });
        return;
      }
      const { paymentId, serviceRequestId } = status.staffReceiptDelivery;
      const url = `/api/service-requests/${serviceRequestId}/payments/${paymentId}/receipt`;
      const channels = [
        ...(receiptDeliveryModal.smsSelected ? [{ channel: "sms", recipient: receiptDeliveryModal.options.sms.recipient }] : []),
        ...(receiptDeliveryModal.emailSelected ? [{ channel: "email", recipient: emailRecipient }] : []),
      ];
      if (channels.some(({ channel }) => attemptedReceiptSends.current.has(`${receiptDeliveryModal.idempotencyKey}-${channel}`))) {
        setReceiptDeliveryState({ message: "This send was already attempted. Review delivery history before sending again.", status: "error" });
        return;
      }
      const results = await Promise.all(channels.map(async ({ channel, recipient }) => {
        const idempotencyKey = `${receiptDeliveryModal.idempotencyKey}-${channel}`;
        attemptedReceiptSends.current.add(idempotencyKey);
        try {
          const response = await fetch(url, {
            body: JSON.stringify({ channel, recipient, idempotencyKey }),
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            method: "POST",
          });
          const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
          return {
            ok: response.ok && payload?.ok === true,
            message: `${channel.toUpperCase()}: ${response.ok && payload?.ok === true
              ? "Accepted for sending. Delivery is not yet confirmed."
              : payload?.message ?? "Delivery outcome is not confirmed. Review history before retrying."}`,
          };
        } catch {
          return { ok: false, message: `${channel.toUpperCase()}: Delivery outcome is not confirmed. Do not resend until reviewed.` };
        }
      }));
      let historyUnavailable = false;
      try {
        const response = await fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } });
        const payload = await response.json() as { ok?: boolean; deliveries?: ReceiptDeliveryHistoryItem[] };
        if (!response.ok || !payload.ok || !Array.isArray(payload.deliveries)) throw new Error("history unavailable");
        setReceiptDeliveryModal(current => current ? { ...current, deliveries: payload.deliveries! } : current);
      } catch { historyUnavailable = true; }
      setReceiptDeliveryState({
        message: results.map(result => result.message).join(" ") + (historyUnavailable ? " Delivery history could not be refreshed; reopen to check." : ""),
        status: results.every(result => result.ok) ? "success" : "error",
      });
    } catch {
      setReceiptDeliveryState({ message: "Delivery outcome is not confirmed. Do not resend until reviewed.", status: "error" });
    } finally {
      receiptSendLock.current = false;
    }
  }

  if (pending) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#061225] px-4 py-6 text-white sm:px-8 sm:py-8">
        <PaymentMotionStyles />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/12 blur-3xl homefix-verify-glow" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0B2A52]/80 to-transparent" />
          <div className="absolute -left-24 top-10 h-56 w-56 rounded-full border border-cyan-300/10" />
          <div className="absolute -right-20 bottom-16 h-64 w-64 rounded-full border border-blue-300/10" />
        </div>

        <section className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col">
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-black tracking-tight">
                HomeFix<span className="text-[#31A8FF]">OS</span>
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100/70">
                Secure payment
              </p>
            </div>
            <p className="max-w-[9.5rem] text-right text-xs font-semibold leading-5 text-slate-300">
              Reliable Appliances. Happier Homes.
            </p>
          </header>

          <div className="flex flex-1 flex-col items-center justify-center py-9 text-center">
            <div className="relative grid h-36 w-36 place-items-center sm:h-40 sm:w-40">
              <svg
                aria-hidden="true"
                className="absolute inset-0 h-full w-full homefix-verify-ring"
                viewBox="0 0 176 176"
              >
                <defs>
                  <linearGradient id="homefixVerifyGradient" x1="20" x2="156" y1="20" y2="156">
                    <stop stopColor="#22D3EE" />
                    <stop offset="0.55" stopColor="#1D7BFF" />
                    <stop offset="1" stopColor="#16A34A" />
                  </linearGradient>
                </defs>
                <circle
                  cx="88"
                  cy="88"
                  fill="none"
                  r="70"
                  stroke="rgba(148, 163, 184, 0.18)"
                  strokeWidth="10"
                />
                <circle
                  cx="88"
                  cy="88"
                  fill="none"
                  r="70"
                  stroke="url(#homefixVerifyGradient)"
                  strokeDasharray="152 290"
                  strokeLinecap="round"
                  strokeWidth="10"
                />
              </svg>
              <div className="relative grid h-24 w-24 place-items-center rounded-[1.6rem] border border-cyan-200/20 bg-white/8 shadow-[0_0_42px_rgba(34,211,238,0.24)] backdrop-blur">
                <svg aria-hidden="true" className="h-12 w-12 text-cyan-100" viewBox="0 0 64 64">
                  <path
                    d="M32 7 50 14v14c0 12.2-7.5 22.4-18 27-10.5-4.6-18-14.8-18-27V14l18-7Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                  <path
                    d="M23 31.5 29 37l12-14"
                    fill="none"
                    stroke="#22D3EE"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                  />
                </svg>
              </div>
            </div>

            <h1 className="mt-8 text-3xl font-black tracking-tight sm:text-4xl">
              Verifying your payment
            </h1>
            <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-slate-300 sm:text-base">
              Securely confirming your transaction with Stripe.
            </p>
            <p className="mt-5 rounded-full border border-cyan-200/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/80">
              Receipt details appear after verification
            </p>

            <Link
              className="mt-7 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-xl border border-white/15 bg-white/8 px-5 text-sm font-black text-white transition hover:bg-white/12"
              href={dashboardReturnPath ?? status.documentHref}
            >
              {dashboardReturnPath
                ? "Back to Job Finance"
                : `Return to ${status.targetType === "invoice" ? "Invoice" : "Estimate"}`}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F8FBFF] px-4 py-5 text-[#0B1B46] sm:px-8 sm:py-8">
      <PaymentMotionStyles />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 overflow-hidden text-blue-50">
        <div className="absolute -bottom-36 left-[-10%] h-64 w-[72%] rounded-[50%] bg-[#DDF0FF]" />
        <div className="absolute -bottom-32 right-[-12%] h-60 w-[70%] rounded-[50%] bg-[#D9ECFF]" />
        <div className="absolute -bottom-44 left-1/2 h-72 w-[118%] -translate-x-1/2 rounded-[50%] bg-[#EDF8FF]" />
      </div>

      <section className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-4xl flex-col">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <span className="text-xl font-black leading-none">⌂</span>
            </div>
            <div className="min-w-0">
              <p className="text-xl font-black leading-5 tracking-tight sm:text-2xl">
                HomeFix
              </p>
              <p className="text-xs font-black tracking-wide text-[#5E6E8C] sm:text-sm">
                Appliance Repair
              </p>
            </div>
          </div>
          <p className="max-w-[10.5rem] text-right text-xs font-semibold leading-5 text-[#53617D] sm:max-w-[13rem] sm:text-sm">
            Reliable Appliances. Happier Homes.
          </p>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center py-6 text-center sm:py-8 homefix-success-enter">
          <div className="relative">
            {received ? (
              <>
                <span className="absolute -left-11 top-6 h-3 w-1 rotate-[-32deg] rounded-full bg-[#1C86EE]" />
                <span className="absolute -left-7 top-12 h-3 w-1 rotate-[70deg] rounded-full bg-[#96D5C8]" />
                <span className="absolute -right-11 top-5 h-3 w-1 rotate-[35deg] rounded-full bg-[#1C86EE]" />
                <span className="absolute -right-8 top-14 h-3 w-1 rotate-[70deg] rounded-full bg-[#24C875]" />
                <span className="absolute -right-3 -top-6 h-4 w-1 rotate-[38deg] rounded-full bg-[#1C86EE]" />
                <span className="absolute inset-0 rounded-full border-2 border-emerald-300/70 homefix-success-ring" />
              </>
            ) : null}
            <div
              className={[
                "grid h-20 w-20 place-items-center rounded-full text-4xl font-black shadow-2xl sm:h-24 sm:w-24 sm:text-5xl",
                iconState === "success"
                  ? "bg-[#25C76F] text-white shadow-emerald-500/25 ring-[14px] ring-emerald-100/80"
                  : iconState === "alert"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-blue-100 text-blue-700",
              ].join(" ")}
            >
              {iconState === "success" ? "✓" : iconState === "alert" ? "!" : "..."}
            </div>
          </div>

          <h1 className="mt-7 text-3xl font-black tracking-tight text-[#071A4A] sm:text-4xl">
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
          <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-[#53617D] sm:text-base">
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
            <section className="mt-7 grid w-full overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white text-left shadow-[0_18px_45px_rgba(15,50,110,0.1)] sm:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="p-4 sm:p-6">
                <p className="text-sm font-black text-[#5B6B89]">Payment Amount</p>
                <p className="mt-1 text-4xl font-black tracking-[0.02em] text-[#071A4A] sm:text-5xl">
                  ${receipt.amount}
                </p>
                <dl className="mt-5 divide-y divide-[#E2E8F0]">
                  {detailRows.map(({ Icon, label, value }) => (
                    <div className="flex items-center gap-3 py-2.5" key={label}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-50 text-[#0F6BFF] ring-1 ring-blue-100">
                        <Icon />
                      </span>
                      <dt className="text-sm font-bold text-[#60708D]">{label}</dt>
                      <dd className="ml-auto max-w-[55%] text-right text-sm font-black text-[#071A4A]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <aside className="hidden border-l border-[#E2E8F0] p-5 text-center sm:block">
                <div className="mx-auto grid h-24 w-20 place-items-center rounded-2xl border-4 border-[#62748C] bg-white text-[#0F6BFF] shadow-inner">
                  <div className="rounded-xl bg-[#1888FF] px-2.5 py-2.5 text-center text-xs font-black leading-4 text-white shadow-lg shadow-blue-500/25">
                    Receipt
                    <br />
                    Ready
                  </div>
                </div>
                <p className="mt-4 text-base font-black leading-5 text-[#071A4A]">
                  Your payment receipt is ready to view.
                </p>
                <p className="mt-2 text-xs font-semibold leading-5 text-[#6A7892]">
                  HomeFixOS never stores card numbers or CVV.
                </p>
              </aside>
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
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#0F7CF8] px-5 text-center text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-[#0966D8]"
              href={receipt?.href ?? status.documentHref}
            >
              View Receipt →
            </Link>
          ) : null}

          {received && status.authorized && status.staffReceiptDelivery ? (
            <button
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#B9D4FF] bg-white px-5 text-center text-sm font-black text-[#0F6BFF] transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"
              disabled={
                receiptDeliveryState.status === "loading" ||
                receiptDeliveryState.status === "sending"
              }
              onClick={() => void openReceiptDeliveryModal()}
              type="button"
            >
              {receiptDeliveryState.status === "loading"
                ? "Preparing Receipt..."
                : "Send Receipt"}
            </button>
          ) : null}

          <Link
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#CFDAEA] bg-white px-5 text-center text-sm font-black text-[#0F6BFF] transition hover:bg-blue-50"
            href={dashboardReturnPath ?? status.documentHref}
          >
            {dashboardReturnPath
              ? "Back to Job Finance"
              : `Return to ${status.targetType === "invoice" ? "Invoice" : "Estimate"}`}
          </Link>

          {received ? (
            <section className="mt-6 grid w-full gap-3 text-left sm:grid-cols-3">
              {[
                ["Secure checkout", "Processed by Stripe"],
                ["Receipt ready", "Manual delivery available"],
                ["Payment verified", "Recorded in HomeFixOS"],
              ].map(([title, subtitle]) => (
                <div className="flex items-center gap-3 sm:justify-center" key={title}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-[#0F6BFF]">
                    ✓
                  </span>
                  <span>
                    <span className="block text-sm font-black text-[#071A4A]">{title}</span>
                    <span className="block text-xs font-semibold text-[#6A7892]">
                      {subtitle}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        <footer className="relative z-10 flex flex-col gap-4 pb-3 text-xs font-semibold text-[#53617D] sm:flex-row sm:items-end sm:justify-between">
          <p>
            <span className="block font-black text-[#071A4A]">
              HomeFix Appliance Repair
            </span>
            Payment receipt ready
          </p>
          <p className="text-left sm:text-right">
            Appliances Working.
            <br />
            Life Moving.
          </p>
        </footer>
      </section>

      {received && receipt && receiptDeliveryModal ? (
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-[#061225]/70 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-md rounded-2xl bg-white p-4 text-left shadow-2xl">
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                  Send Receipt
                </p>
                <h2 className="mt-1 text-xl font-black text-[#071A4A]">
                  {receipt.receiptNumber}
                </h2>
                <p className="mt-1 text-sm font-bold text-[#64748B]">
                  ${receipt.amount} confirmed payment
                </p>
              </div>
              <button
                aria-label="Close Send Receipt"
                className="grid h-10 w-10 place-items-center rounded-full border border-[#D7DEE8] text-xl font-black text-[#64748B]"
                disabled={receiptDeliveryState.status === "sending"}
                onClick={() => {
                  setReceiptDeliveryModal(null);
                  setReceiptDeliveryState({ message: null, status: "idle" });
                }}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="mt-4 grid gap-2">
              <label className="flex items-start gap-3 rounded-xl border border-[#D7E4FF] bg-blue-50/60 p-3">
                <input
                  checked={receiptDeliveryModal.smsSelected}
                  className="mt-1 h-4 w-4 accent-[#0F6BFF]"
                  disabled={
                    receiptDeliveryState.status === "sending" ||
                    !receiptDeliveryModal.options.sms.available
                  }
                  onChange={(event) => {
                    const smsSelected = event.currentTarget.checked;

                    setReceiptDeliveryModal((current) =>
                      current ? { ...current, smsSelected } : current,
                    );
                  }}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-[#071A4A]">
                    SMS
                  </span>
                  <span className="mt-1 block break-words text-xs font-semibold text-[#64748B]">
                    {receiptDeliveryModal.options.sms.available
                      ? `To ${receiptDeliveryModal.options.sms.recipient}`
                      : "No authorized SMS recipient is available."}
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 opacity-80">
                <input
                  checked={receiptDeliveryModal.emailSelected}
                  className="mt-1 h-4 w-4 accent-[#0F6BFF]"
                  disabled={receiptDeliveryState.status === "sending" || !receiptDeliveryModal.options.email.available}
                  onChange={(event) => {
                    const emailSelected = event.currentTarget.checked;
                    setReceiptDeliveryModal(current => current ? { ...current, emailSelected } : current);
                  }}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-[#64748B]">
                    Email
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-[#94A3B8]">
                    {receiptDeliveryModal.options.email.available
                      ? "Send a secure receipt link by email."
                      : receiptDeliveryModal.options.email.reason ?? "Receipt email delivery is not configured."}
                  </span>
                </span>
              </label>
              {receiptDeliveryModal.emailSelected && receiptDeliveryModal.options.email.available ? (
                <label className="text-sm font-bold text-[#64748B]">
                  Recipient email
                  <input
                    aria-label="Receipt recipient email"
                    className="mt-1 min-h-11 w-full rounded-xl border border-[#D7DEE8] px-3 text-[#071A4A]"
                    disabled={receiptDeliveryState.status === "sending"}
                    type="email"
                    autoComplete="email"
                    value={receiptDeliveryModal.emailRecipient}
                    onChange={(event) => {
                      const emailRecipient = event.currentTarget.value;
                      setReceiptDeliveryModal(current => current ? { ...current, emailRecipient } : current);
                    }}
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                Message Preview
              </p>
              <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#334155]">
                {[
                  `HomeFix Appliance Repair: We received your payment of $${receipt.amount} for Job #${receipt.jobNumber ?? ""}. Thank you!`,
                  "",
                  "View receipt:",
                  "[secure receipt link]",
                ].join("\n")}
              </p>
            </div>

            {receiptDeliveryModal.deliveries.length > 0 ? (
              <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-white p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                  Delivery History
                </p>
                <ul className="mt-2 space-y-1.5">
                  {receiptDeliveryModal.deliveries.slice(0, 3).map((delivery, index) => (
                    <li
                      className="flex items-center justify-between gap-3 text-xs font-semibold text-[#475569]"
                      key={delivery.id ?? `${delivery.delivery_channel}-${index}`}
                    >
                      <span className="uppercase">
                        {delivery.delivery_channel ?? "receipt"}
                      </span>
                      <span>
                        {delivery.delivery_status ?? delivery.provider_status ?? "recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {receiptDeliveryState.message ? (
              <p
                className={`mt-4 rounded-xl border px-3 py-2 text-sm font-bold ${
                  receiptDeliveryState.status === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : receiptDeliveryState.status === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-blue-200 bg-blue-50 text-[#0F6BFF]"
                }`}
              >
                {receiptDeliveryState.message}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="min-h-11 rounded-xl border border-[#D7DEE8] px-4 py-2.5 text-sm font-black text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={receiptDeliveryState.status === "sending"}
                onClick={() => {
                  setReceiptDeliveryModal(null);
                  setReceiptDeliveryState({ message: null, status: "idle" });
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="min-h-11 rounded-xl bg-[#0F6BFF] px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  receiptDeliveryState.status === "sending" ||
                  (!receiptDeliveryModal.smsSelected &&
                    !receiptDeliveryModal.emailSelected) ||
                  (receiptDeliveryModal.smsSelected &&
                    !receiptDeliveryModal.options.sms.available)
                }
                onClick={() => void sendReceiptDelivery()}
                type="button"
              >
                {receiptDeliveryState.status === "sending"
                  ? "Sending..."
                  : "Confirm Send"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
