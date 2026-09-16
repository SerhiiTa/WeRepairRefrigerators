"use client";

import {
  formatServiceRequestDate,
  formatServiceRequestMoney,
  formatServiceRequestSource,
} from "@/lib/service-request-records";

export type CustomerEstimatePreviewItem = {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type CustomerEstimatePreviewData = {
  companyName: string;
  estimateNumber: string;
  estimateStatus: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  serviceAddress: string;
  estimateDate: string;
  whatWeFound: string;
  repairSolution: string;
  items: CustomerEstimatePreviewItem[];
  subtotal: number;
  discountAmount: number;
  tax: number;
  taxRate: number;
  total: number;
  warrantyText: string | null;
  estimatedCompletion: string | null;
  customerNotes: string | null;
};

type CustomerEstimatePreviewProps = {
  data: CustomerEstimatePreviewData;
  mode?: "technician-preview" | "customer";
  onBack?: () => void;
};

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value?.trim()) {
    return null;
  }

  return (
    <div className="border-t border-[#E5E7EB] py-2.5 first:border-t-0 first:pt-0">
      <p className="text-[0.68rem] font-black uppercase text-[#64748B]">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[#334155] sm:text-sm">
        {value}
      </p>
    </div>
  );
}

export function CustomerEstimatePreview({
  data,
  mode = "customer",
  onBack,
}: CustomerEstimatePreviewProps) {
  const isTechnicianPreview = mode === "technician-preview";
  const statusLabel = formatServiceRequestSource(data.estimateStatus);

  return (
    <main className="min-h-screen bg-[#F3F6FA] px-3 py-3 text-[#0F172A] sm:px-6 sm:py-6">
      {isTechnicianPreview ? (
        <div className="mx-auto mb-2 flex max-w-4xl items-center justify-between gap-3 px-1 text-sm">
          <span className="font-black text-[#0F6BFF]">Customer Preview</span>
          {onBack ? (
            <button
              className="font-black text-[#0F6BFF] underline decoration-[#0F6BFF]/35 underline-offset-4"
              onClick={onBack}
              type="button"
            >
              Back to Estimate
            </button>
          ) : null}
        </div>
      ) : null}

      <article className="mx-auto max-w-4xl bg-white px-4 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-[#E5E7EB] sm:px-8 sm:py-7">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[#CBD5E1] pb-3">
          <div className="min-w-0">
            <p className="text-lg font-black leading-6 text-[#0F6BFF] sm:text-2xl">
              {data.companyName}
            </p>
            <p className="mt-1 text-[0.68rem] font-black uppercase text-[#64748B]">
              Professional repair estimate
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black leading-6 sm:text-3xl">
              ESTIMATE
            </h1>
            <p className="mt-1 text-xs font-black text-[#475569]">
              {data.estimateNumber}
            </p>
            <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[0.68rem] font-black text-[#0F6BFF]">
              {statusLabel}
            </span>
          </div>
        </header>

        <section className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[#E5E7EB] py-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase text-[#64748B]">
              Prepared for
            </p>
            <p className="mt-1 text-sm font-black leading-5 sm:text-base">
              {data.customerName}
            </p>
            {data.serviceAddress ? (
              <p className="mt-1 text-xs font-semibold leading-5 text-[#475569] sm:text-sm">
                {data.serviceAddress}
              </p>
            ) : null}
            {[data.customerPhone, data.customerEmail].filter(Boolean).length > 0 ? (
              <p className="mt-1 text-xs font-semibold leading-5 text-[#64748B]">
                {[data.customerPhone, data.customerEmail].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[0.68rem] font-black uppercase text-[#64748B]">
              Date
            </p>
            <p className="mt-1 text-xs font-bold text-[#334155] sm:text-sm">
              {formatServiceRequestDate(data.estimateDate)}
            </p>
            <p className="mt-2 text-[0.68rem] font-black uppercase text-[#64748B]">
              Total
            </p>
            <p className="mt-0.5 text-lg font-black text-[#0F6BFF] sm:text-2xl">
              {formatServiceRequestMoney(data.total)}
            </p>
          </div>
        </section>

        <section className="py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_3rem_4.5rem_4.5rem] border-b border-[#CBD5E1] pb-1.5 text-[0.68rem] font-black uppercase text-[#64748B]">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {data.items.map((item) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_3rem_4.5rem_4.5rem] gap-1 py-2 text-xs sm:text-sm"
                key={item.id}
              >
                <div className="min-w-0 pr-2">
                  <p className="font-black leading-5">{item.title}</p>
                  {item.description ? (
                    <p className="mt-0.5 text-[0.72rem] font-semibold leading-4 text-[#64748B] sm:text-xs">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <p className="text-right font-bold">{item.quantity}</p>
                <p className="text-right font-bold">
                  {formatServiceRequestMoney(item.unitPrice)}
                </p>
                <p className="text-right font-black">
                  {formatServiceRequestMoney(item.lineTotal)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 border-y border-[#E5E7EB] py-3 sm:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-0">
            <DetailBlock
              label="What we found"
              value={data.whatWeFound || "The technician prepared this estimate for review."}
            />
            <DetailBlock
              label="Repair solution"
              value={data.repairSolution || "Recommended repair details are listed above."}
            />
          </div>
          <div className="rounded-xl bg-[#F8FAFC] p-3">
            <div className="flex items-center justify-between gap-4 text-xs font-bold">
              <span className="text-[#475569]">Subtotal</span>
              <span>{formatServiceRequestMoney(data.subtotal)}</span>
            </div>
            {data.discountAmount > 0 ? (
              <div className="mt-2 flex items-center justify-between gap-4 text-xs font-bold">
                <span className="text-[#475569]">Discount</span>
                <span>-{formatServiceRequestMoney(data.discountAmount)}</span>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-4 text-xs font-bold">
              <span className="text-[#475569]">
                Tax{data.taxRate > 0 ? ` (${data.taxRate.toFixed(2)}%)` : ""}
              </span>
              <span>{formatServiceRequestMoney(data.tax)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-[#CBD5E1] pt-3">
              <span className="text-sm font-black">Total</span>
              <span className="text-2xl font-black text-[#0F6BFF]">
                {formatServiceRequestMoney(data.total)}
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-x-6 text-xs leading-5 text-[#475569] sm:grid-cols-2">
          <DetailBlock label="Warranty" value={data.warrantyText} />
          <DetailBlock
            label="Estimated completion"
            value={data.estimatedCompletion}
          />
          <DetailBlock label="Notes / Terms" value={data.customerNotes} />
        </section>

        {isTechnicianPreview ? (
          <p className="mt-3 border-t border-[#E5E7EB] pt-2 text-[0.68rem] font-bold text-[#64748B]">
            Technician preview only. Customer approval controls are not shown.
          </p>
        ) : null}
      </article>
    </main>
  );
}
