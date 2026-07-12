import { NextResponse } from "next/server";

import { extractBearerToken } from "@/server/intake/intake-service";
import { calculateDrivingDistance } from "@/server/maps/distance";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for distance lookups.", 503);
  }

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const body = (await request.json().catch(() => null)) as {
    origin?: string | null;
    destination?: string | null;
    originSource?: "technician" | "company" | "missing";
  } | null;

  const result = await calculateDrivingDistance({
    origin: body?.origin?.trim() || null,
    destination: body?.destination?.trim() || null,
    originSource: body?.originSource ?? "missing",
  });

  return NextResponse.json({
    ok: true,
    distance: result,
  });
}
