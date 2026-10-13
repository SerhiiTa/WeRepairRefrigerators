import { loadStripeReturnStatus } from "@/server/finance/stripe-return-status";
import type { StripeReturnStatus } from "@/server/finance/stripe-return-status";

import { StripeSuccessExperience } from "./StripeSuccessExperience";

export const dynamic = "force-dynamic";

type StripeSuccessPageProps = {
  searchParams: Promise<{
    attempt?: string;
    devReceiptModal?: string;
    devPreview?: string;
    returnPath?: string;
    token?: string;
  }>;
};

function getSafeDashboardReturnPath(value: string | undefined) {
  return value?.startsWith("/dashboard") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\n")
    ? value
    : null;
}

export default async function StripeSuccessPage({
  searchParams,
}: StripeSuccessPageProps) {
  const params = await searchParams;
  const dashboardReturnPath = getSafeDashboardReturnPath(params.returnPath);
  const devPreview =
    process.env.NODE_ENV !== "production" ? params.devPreview ?? null : null;
  const isDashboardReturn = Boolean(
    dashboardReturnPath && params.attempt && !params.token,
  );
  const status: StripeReturnStatus = devPreview === "success"
    ? {
        amount: "55.00",
        authorized: true,
        balanceDue: null,
        documentHref: "/dashboard",
        documentNumber: null,
        paid: "55.00",
        paymentStatus: "received",
        receipt: {
          amount: "55.00",
          cardBrand: "visa",
          cardLast4: "4242",
          href: "/receipts/0000000000000000000000000000000000000000000000000000000000000000",
          jobNumber: "1034",
          paidAt: "2026-10-12T23:58:06.523232+00:00",
          paymentMethod: "card",
          receiptNumber: "RCP-1034-007",
        },
        staffReceiptDelivery: {
          paymentId: "00000000-0000-4000-8000-000000000001",
          previewOnly: true,
          serviceRequestId: "00000000-0000-4000-8000-000000000002",
        },
        targetType: "estimate",
        total: null,
      }
    : devPreview === "processing"
      ? {
          amount: "0.00",
          authorized: true,
          balanceDue: null,
          documentHref: dashboardReturnPath ?? "/dashboard",
          documentNumber: null,
          paid: null,
          paymentStatus: "processing",
          receipt: null,
          targetType: "estimate",
          total: null,
        }
      : isDashboardReturn
    ? {
        amount: "0.00",
        authorized: true,
        balanceDue: null,
        documentHref: dashboardReturnPath ?? "/dashboard",
        documentNumber: null,
        paid: null,
        paymentStatus: "processing",
        receipt: null,
        targetType: "estimate",
        total: null,
      }
    : await loadStripeReturnStatus({
        attemptId: params.attempt ?? null,
        token: params.token ?? null,
      });

  return (
    <StripeSuccessExperience
      dashboardReturnPath={dashboardReturnPath}
      devOpenReceiptDelivery={
        devPreview === "success" && params.devReceiptModal === "1"
      }
      initialStatus={status}
      query={{
        attempt: params.attempt ?? null,
        returnPath: params.returnPath ?? null,
        token: params.token ?? null,
      }}
    />
  );
}
