import { NextResponse } from "next/server";

import {
  loadDashboardStripeReturnStatus,
  loadStripeReturnStatus,
} from "@/server/finance/stripe-return-status";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

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
  const dashboardReturnPath = getSafeDashboardReturnPath(
    url.searchParams.get("returnPath"),
  );
  const token = url.searchParams.get("token");
  const attemptId = url.searchParams.get("attempt");
  let status;

  if (dashboardReturnPath && !token) {
    const privateAccess = await requireHomeFixPrivateAccess(request);

    if (!privateAccess.ok) {
      return privateAccess.response;
    }

    status = await loadDashboardStripeReturnStatus({
      attemptId,
      dashboardReturnPath,
      supabase: privateAccess.context.supabase,
    });
  } else {
    status = await loadStripeReturnStatus({
      attemptId,
      dashboardReturnPath,
      token,
    });
  }

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
