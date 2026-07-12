import { NextResponse } from "next/server";

import { extractBearerToken } from "@/server/intake/intake-service";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

export const dynamic = "force-dynamic";

function clean(value: unknown, limit: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, limit) || null
    : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message, error: message }, { status });
}

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for company settings.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const body = (await request.json().catch(() => null)) as {
    companyId?: string;
    baseAddressLine1?: string | null;
    baseAddressLine2?: string | null;
    baseCity?: string | null;
    baseState?: string | null;
    baseZip?: string | null;
    baseCountry?: string | null;
    baseFormattedAddress?: string | null;
    baseLatitude?: number | null;
    baseLongitude?: number | null;
    basePlaceId?: string | null;
  } | null;

  if (!body?.companyId) {
    return fail("Company is required.");
  }

  const { data, error } = await supabase.rpc("update_company_base_address_rpc", {
    p_company_id: body.companyId,
    p_base_address_line1: clean(body.baseAddressLine1, 180),
    p_base_address_line2: clean(body.baseAddressLine2, 80),
    p_base_city: clean(body.baseCity, 120),
    p_base_state: clean(body.baseState, 2)?.toUpperCase() ?? null,
    p_base_zip: clean(body.baseZip, 20),
    p_base_country: clean(body.baseCountry, 2)?.toUpperCase() ?? "US",
    p_base_formatted_address: clean(body.baseFormattedAddress, 320),
    p_base_latitude: numberOrNull(body.baseLatitude),
    p_base_longitude: numberOrNull(body.baseLongitude),
    p_base_place_id: clean(body.basePlaceId, 160),
  });

  if (error) {
    console.error("[company-base-address]", {
      operation: "update_company_base_address_rpc",
      companyId: body.companyId,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
    });

    return fail(
      process.env.NODE_ENV === "development"
        ? error.message
        : "Company base address could not be saved. Apply migration 0059 if needed.",
      503,
    );
  }

  const companyRow = data as { id?: string } | null;

  if (!companyRow?.id) {
    console.error("[company-base-address]", {
      operation: "update_company_base_address_rpc",
      companyId: body.companyId,
      error: {
        message: "RPC returned no company row.",
      },
    });

    return fail("Company base address could not be confirmed after save.", 503);
  }

  return NextResponse.json({
    ok: true,
    company: data,
  });
}
