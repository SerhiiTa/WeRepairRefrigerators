import { NextResponse } from "next/server";

import { loadStripeReturnStatus } from "@/server/finance/stripe-return-status";

export const dynamic = "force-dynamic";

function getSafeDashboardReturnPath(value: string | null) {
  return value?.startsWith("/dashboard") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\n")
    ? value
    : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = await loadStripeReturnStatus({
    attemptId: url.searchParams.get("attempt"),
    dashboardReturnPath: getSafeDashboardReturnPath(url.searchParams.get("returnPath")),
    token: url.searchParams.get("token"),
  });

  return NextResponse.json(
    { ok: true, status },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
