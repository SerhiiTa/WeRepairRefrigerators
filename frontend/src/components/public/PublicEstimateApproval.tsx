"use client";

import { useState } from "react";

import {
  formatServiceRequestDate,
  formatServiceRequestMoney,
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

export type PublicEstimatePayload = {
  estimate: {
    estimate_number: string;
    estimate_status: string;
    subtotal: number;
    tax: number | null;
    total: number;
    warranty_text: string | null;
    disclaimer_text: string | null;
    sent_at: string | null;
    customer_responded_at: string | null;
    items: PublicEstimateItem[];
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
};

type ResponseState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type PublicEstimateApprovalProps = {
  token: string;
  initialEstimate: PublicEstimatePayload;
};

export function PublicEstimateApproval({
  token,
  initialEstimate,
}: PublicEstimateApprovalProps) {
  const [estimate, setEstimate] =
    useState<PublicEstimatePayload>(initialEstimate);
  const [responseState, setResponseState] = useState<ResponseState>({
    status: "idle",
    message: null,
  });

  const isOpenForResponse = estimate.estimate.estimate_status === "sent";
  const businessName =
    estimate.service_request.selected_technician_business_name ??
    "WeRepairRefrigerators";
  const applianceLabel = [
    estimate.service_request.appliance_brand,
    estimate.service_request.appliance_model,
    estimate.service_request.appliance_type,
  ]
    .filter(Boolean)
    .join(" ");

  async function submitResponse(response: "approved" | "declined") {
    setResponseState({ status: "saving", message: null });

    const result = await fetch(`/api/estimates/${token}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ response }),
    });

    const payload = (await result.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
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
      return;
    }

    setEstimate((current) => ({
      ...current,
      estimate: {
        ...current.estimate,
        estimate_status:
          payload.result?.estimate_status ?? current.estimate.estimate_status,
        customer_responded_at:
          payload.result?.customer_responded_at ??
          current.estimate.customer_responded_at,
      },
    }));
    setResponseState({
      status: "success",
      message:
        response === "approved"
          ? "Estimate approved. The technician can now schedule the next step."
          : "Estimate declined. The technician will see your response.",
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-2xl shadow-slate-950">
        <div className="border-b border-white/10 bg-white px-5 py-6 text-slate-950 sm:px-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            Estimate Review
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-black">
                {estimate.estimate.estimate_number}
              </h1>
              <p className="mt-2 text-sm font-bold text-slate-600">
                {businessName}
              </p>
            </div>
            <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
              {formatServiceRequestSource(estimate.estimate.estimate_status)}
            </span>
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:p-8">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">
              Service summary
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Customer
                </dt>
                <dd className="mt-1 text-sm font-bold text-white">
                  {estimate.service_request.customer_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Appliance
                </dt>
                <dd className="mt-1 text-sm font-bold text-white">
                  {applianceLabel}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Area
                </dt>
                <dd className="mt-1 text-sm font-bold text-white">
                  {estimate.service_request.city
                    ? `${estimate.service_request.city}, `
                    : ""}
                  {estimate.service_request.state}{" "}
                  {estimate.service_request.zip_code}
                </dd>
              </div>
              {estimate.estimate.sent_at ? (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Sent
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-white">
                    {formatServiceRequestDate(estimate.estimate.sent_at)}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {estimate.service_request.issue_description}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10">
            <div className="border-b border-white/10 bg-slate-950 px-4 py-3">
              <p className="text-sm font-black text-white">Estimate lines</p>
            </div>
            <div className="divide-y divide-white/10">
              {estimate.estimate.items.map((item) => (
                <div
                  className="flex flex-col gap-2 bg-slate-900 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                  key={`${item.item_title}-${item.line_total}`}
                >
                  <div>
                    <p className="font-bold text-white">
                      {item.quantity}x {item.item_title}
                    </p>
                    {item.notes ? (
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-black text-cyan-100">
                    {formatServiceRequestMoney(Number(item.line_total))}
                  </p>
                </div>
              ))}
            </div>
            <div className="bg-white px-4 py-4 text-slate-950">
              <div className="flex items-center justify-between text-sm font-bold">
                <span>Subtotal</span>
                <span>
                  {formatServiceRequestMoney(Number(estimate.estimate.subtotal))}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm font-bold">
                <span>Tax</span>
                <span>
                  {estimate.estimate.tax === null
                    ? "Not calculated"
                    : formatServiceRequestMoney(Number(estimate.estimate.tax))}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <span className="text-lg font-black">Total</span>
                <span className="text-3xl font-black">
                  {formatServiceRequestMoney(Number(estimate.estimate.total))}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 text-sm leading-6 text-slate-300 md:grid-cols-2">
            {estimate.estimate.warranty_text ? (
              <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
                <p className="font-black text-white">Warranty</p>
                <p className="mt-2">{estimate.estimate.warranty_text}</p>
              </div>
            ) : null}
            {estimate.estimate.disclaimer_text ? (
              <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
                <p className="font-black text-white">Disclaimer</p>
                <p className="mt-2">{estimate.estimate.disclaimer_text}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
            {isOpenForResponse ? (
              <>
                <p className="text-sm font-black text-cyan-50">
                  Ready for your response
                </p>
                <p className="mt-1 text-sm leading-6 text-cyan-50/80">
                  Approving lets the technician know you want to move forward.
                  Declining closes this estimate for now.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    className="rounded-md bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={responseState.status === "saving"}
                    onClick={() => void submitResponse("approved")}
                    type="button"
                  >
                    Approve Estimate
                  </button>
                  <button
                    className="rounded-md border border-amber-200/40 px-4 py-3 text-sm font-black text-amber-50 transition hover:bg-amber-200/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={responseState.status === "saving"}
                    onClick={() => void submitResponse("declined")}
                    type="button"
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-cyan-50">
                  Response recorded
                </p>
                <p className="mt-1 text-sm leading-6 text-cyan-50/80">
                  This estimate is marked{" "}
                  {formatServiceRequestSource(estimate.estimate.estimate_status)}
                  {estimate.estimate.customer_responded_at
                    ? ` as of ${formatServiceRequestDate(
                        estimate.estimate.customer_responded_at,
                      )}`
                    : ""}
                  .
                </p>
              </>
            )}
            {responseState.message ? (
              <p
                className={`mt-3 text-sm font-bold ${
                  responseState.status === "error"
                    ? "text-amber-100"
                    : "text-emerald-100"
                }`}
              >
                {responseState.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
