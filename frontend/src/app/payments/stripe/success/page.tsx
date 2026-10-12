import { loadStripeReturnStatus } from "@/server/finance/stripe-return-status";
import type { StripeReturnStatus } from "@/server/finance/stripe-return-status";

import { StripeSuccessExperience } from "./StripeSuccessExperience";

export const dynamic = "force-dynamic";

type StripeSuccessPageProps = {
  searchParams: Promise<{
    attempt?: string;
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
  const isDashboardReturn = Boolean(
    dashboardReturnPath && params.attempt && !params.token,
  );
  const status: StripeReturnStatus = isDashboardReturn
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
      initialStatus={status}
      query={{
        attempt: params.attempt ?? null,
        returnPath: params.returnPath ?? null,
        token: params.token ?? null,
      }}
    />
  );
}
