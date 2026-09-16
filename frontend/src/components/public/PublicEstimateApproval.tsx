"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  CustomerEstimatePreview,
  type CustomerEstimatePreviewData,
} from "@/components/public/CustomerEstimatePreview";
import {
  formatServiceRequestDate,
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

function buildServiceLocation(estimate: PublicEstimatePayload) {
  return [
    estimate.service_request.city,
    [
      estimate.service_request.state,
      estimate.service_request.zip_code,
    ]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

function buildCustomerPreviewData(
  estimate: PublicEstimatePayload,
): CustomerEstimatePreviewData {
  const proposalDescription =
    estimate.estimate.items
      .map((item) => item.notes)
      .filter((note): note is string => Boolean(note?.trim()))
      .slice(0, 2)
      .join(" ") ||
    estimate.service_request.issue_description ||
    "Recommended repair details are listed below.";

  return {
    companyName:
      estimate.service_request.selected_technician_business_name ??
      "WeRepairRefrigerators",
    estimateNumber: estimate.estimate.estimate_number,
    estimateStatus: estimate.estimate.estimate_status,
    customerName: estimate.service_request.customer_name,
    serviceAddress: buildServiceLocation(estimate),
    estimateDate: estimate.estimate.sent_at ?? new Date().toISOString(),
    whatWeFound: estimate.service_request.issue_description,
    repairSolution: proposalDescription,
    items: estimate.estimate.items.map((item, index) => ({
      id: `${item.item_title}-${index}`,
      title: item.item_title,
      description: item.notes,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
    subtotal: Number(estimate.estimate.subtotal),
    discountAmount: Number(estimate.estimate.discount_amount ?? 0),
    tax: Number(estimate.estimate.tax ?? 0),
    taxRate: Number(estimate.estimate.tax_rate ?? 0),
    total: Number(estimate.estimate.total),
    warrantyText: estimate.estimate.warranty_text,
    estimatedCompletion: null,
    customerNotes: estimate.estimate.disclaimer_text,
  };
}

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

  const isOpenForResponse = estimate.estimate.estimate_status === "sent";
  const customerPreviewData = buildCustomerPreviewData(estimate);

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
    <main className="min-h-screen bg-[#F3F6FA] pb-6">
      <CustomerEstimatePreview data={customerPreviewData} />

      <section className="mx-auto mt-3 max-w-4xl px-3 sm:px-6">
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
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
                  className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={responseState.status === "saving"}
                  onClick={() => void submitResponse("approved")}
                  type="button"
                >
                  {pendingResponse === "approved"
                    ? "Approving..."
                    : "Approve Proposal"}
                </button>
                <button
                  className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
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
      </section>
    </main>
  );
}
