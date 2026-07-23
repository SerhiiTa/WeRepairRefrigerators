"use client";

import { useRouter } from "next/navigation";
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
    discount_type?: "flat" | "percent" | null;
    discount_value?: number | null;
    discount_amount?: number | null;
    tax_rate?: number | null;
    taxable_amount?: number | null;
    non_taxable_amount?: number | null;
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
  const router = useRouter();
  const [estimate, setEstimate] =
    useState<PublicEstimatePayload>(initialEstimate);
  const [responseState, setResponseState] = useState<ResponseState>({
    status: "idle",
    message: null,
  });
  const [pendingResponse, setPendingResponse] = useState<
    "approved" | "declined" | null
  >(null);
  const [itemizedOpen, setItemizedOpen] = useState(false);

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
  const primaryRepairTitle =
    estimate.estimate.items[0]?.item_title || "Recommended repair";
  const proposalDescription =
    estimate.estimate.items
      .map((item) => item.notes)
      .filter((note): note is string => Boolean(note?.trim()))
      .slice(0, 2)
      .join(" ") ||
    estimate.service_request.issue_description ||
    "The technician prepared this repair proposal for your review.";

  async function submitResponse(response: "approved" | "declined") {
    setResponseState({ status: "saving", message: null });
    setPendingResponse(response);

    let result: Response;

    try {
      result = await fetch(`/api/estimates/${token}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ response }),
      });
    } catch {
      setResponseState({
        status: "error",
        message: "We could not reach the estimate approval service.",
      });
      setPendingResponse(null);
      return;
    }

    const payload = (await result.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      estimate?: PublicEstimatePayload | null;
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
      setPendingResponse(null);
      return;
    }

    const respondedAt =
      payload.result?.customer_responded_at ?? new Date().toISOString();
    setEstimate((current) => ({
      ...current,
      estimate: {
        ...current.estimate,
        estimate_status:
          payload.result?.estimate_status ?? response,
        customer_responded_at: respondedAt,
      },
    }));

    if (payload.estimate) {
      setEstimate(payload.estimate);
    }

    router.refresh();
    setResponseState({
      status: "success",
      message:
        response === "approved"
          ? "Proposal approved. The technician can now schedule the next step."
          : "Proposal declined. The technician will see your response.",
    });
    setPendingResponse(null);
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#0F172A]">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl shadow-slate-200/70">
        <div className="border-b border-[#E5E7EB] px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                Repair Proposal
              </p>
              <h1 className="mt-2 text-3xl font-black">{primaryRepairTitle}</h1>
              <p className="mt-2 text-sm font-bold text-[#64748B]">
                {businessName} · {estimate.estimate.estimate_number}
              </p>
            </div>
            <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-[#0F6BFF]">
              {formatServiceRequestSource(estimate.estimate.estimate_status)}
            </span>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:p-8">
          <div className="rounded-3xl bg-[#F8FAFC] p-5">
            <p className="text-sm font-black text-[#0F172A]">
              What happened
            </p>
            <p className="mt-2 text-sm leading-6 text-[#475569]">
              {estimate.service_request.issue_description}
            </p>
            <p className="mt-5 text-sm font-black text-[#0F172A]">
              What will be done
            </p>
            <p className="mt-2 text-sm leading-6 text-[#475569]">
              {proposalDescription}
            </p>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
              Proposal Total
            </p>
            <p className="mt-2 text-5xl font-black text-[#0F6BFF]">
              {formatServiceRequestMoney(Number(estimate.estimate.total))}
            </p>
            <p className="mt-2 text-sm font-semibold text-[#475569]">
              Includes the repair proposal listed below and applicable tax.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-[#E5E7EB] p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                Customer
              </p>
              <p className="mt-1 font-black">
                {estimate.service_request.customer_name}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                Appliance
              </p>
              <p className="mt-1 font-black">{applianceLabel}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                Area
              </p>
              <p className="mt-1 font-black">
                {estimate.service_request.city
                  ? `${estimate.service_request.city}, `
                  : ""}
                {estimate.service_request.state}{" "}
                {estimate.service_request.zip_code}
              </p>
            </div>
            {estimate.estimate.sent_at ? (
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                  Sent
                </p>
                <p className="mt-1 font-black">
                  {formatServiceRequestDate(estimate.estimate.sent_at)}
                </p>
              </div>
            ) : null}
          </div>

          <button
            className="w-fit text-sm font-black text-[#0F6BFF] underline decoration-[#0F6BFF]/40 underline-offset-4"
            onClick={() => setItemizedOpen((current) => !current)}
            type="button"
          >
            {itemizedOpen ? "Hide Itemized Estimate" : "View Itemized Estimate"}
          </button>

          {itemizedOpen ? (
            <div className="overflow-hidden rounded-3xl border border-[#E5E7EB]">
              <div className="divide-y divide-[#E5E7EB]">
                {estimate.estimate.items.map((item) => (
                  <div
                    className="flex flex-col gap-2 bg-white px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                    key={`${item.item_title}-${item.line_total}`}
                  >
                    <div>
                      <p className="font-bold text-[#0F172A]">
                        {item.quantity}x {item.item_title}
                      </p>
                      {item.notes ? (
                        <p className="mt-1 text-xs leading-5 text-[#64748B]">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>
                    <p className="font-black text-[#0F6BFF]">
                      {formatServiceRequestMoney(Number(item.line_total))}
                    </p>
                  </div>
                ))}
              </div>
              <div className="bg-[#F8FAFC] px-4 py-4">
                <div className="flex items-center justify-between text-sm font-bold">
                  <span>Subtotal</span>
                  <span>
                    {formatServiceRequestMoney(Number(estimate.estimate.subtotal))}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm font-bold">
                  <span>Discount</span>
                  <span>
                    -
                    {formatServiceRequestMoney(
                      Number(estimate.estimate.discount_amount ?? 0),
                    )}
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
                {Number(estimate.estimate.tax_rate ?? 0) > 0 ? (
                  <div className="mt-1 flex items-center justify-between text-xs font-semibold text-[#64748B]">
                    <span>Tax rate</span>
                    <span>{Number(estimate.estimate.tax_rate ?? 0).toFixed(2)}%</span>
                  </div>
                ) : null}
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                  <span className="text-lg font-black">Total</span>
                  <span className="text-3xl font-black">
                    {formatServiceRequestMoney(Number(estimate.estimate.total))}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 text-sm leading-6 text-[#475569] md:grid-cols-2">
            {estimate.estimate.warranty_text ? (
              <div className="rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                <p className="font-black text-[#0F172A]">Warranty</p>
                <p className="mt-2">{estimate.estimate.warranty_text}</p>
              </div>
            ) : null}
            {estimate.estimate.disclaimer_text ? (
              <div className="rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                <p className="font-black text-[#0F172A]">Notes</p>
                <p className="mt-2">{estimate.estimate.disclaimer_text}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
            {isOpenForResponse ? (
              <>
                <p className="text-sm font-black text-[#0F172A]">
                  Ready for your response
                </p>
                <p className="mt-1 text-sm leading-6 text-[#475569]">
                  Approving lets the technician know you want to move forward.
                  Declining closes this proposal for now.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={responseState.status === "saving"}
                    onClick={() => void submitResponse("approved")}
                    type="button"
                  >
                    {pendingResponse === "approved"
                      ? "Approving..."
                      : "Approve Proposal"}
                  </button>
                  <button
                    className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={responseState.status === "saving"}
                    onClick={() => void submitResponse("declined")}
                    type="button"
                  >
                    {pendingResponse === "declined" ? "Declining..." : "Decline"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-[#0F172A]">
                  Response recorded
                </p>
                <p className="mt-1 text-sm leading-6 text-[#475569]">
                  This proposal is marked{" "}
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
                    ? "text-amber-700"
                    : "text-emerald-700"
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
