import { NextResponse } from "next/server";

import type { PropertyIntelligenceResponse } from "@/lib/property-intelligence";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import { extractBearerToken } from "@/server/intake/intake-service";
import {
  getPropertyIntelligence,
  normalizePropertyAddress,
  propertyIntelligenceCache,
} from "@/server/property-intelligence/hasdata-zillow";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function requireDashboardSession(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return { ok: false as const, response: fail("A logged-in dashboard session is required.", 401) };
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return { ok: false as const, response: fail("Supabase is not configured for property intelligence.", 503) };
  }

  const { data: userData, error } = await supabase.auth.getUser(accessToken);

  if (error || !userData.user) {
    return { ok: false as const, response: fail("A valid dashboard session is required.", 401) };
  }

  return { ok: true as const };
}

function response(property: PropertyIntelligenceResponse["property"]) {
  return NextResponse.json<PropertyIntelligenceResponse>(
    { property },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Property-Intelligence-Cache-Seconds": String(
          propertyIntelligenceCache.revalidateSeconds,
        ),
      },
    },
  );
}

async function handlePropertyIntelligenceRequest(
  request: Request,
  address: unknown,
) {
  const session = await requireDashboardSession(request);

  if (!session.ok) {
    return session.response;
  }

  const normalizedAddress = normalizePropertyAddress(address);

  if (!normalizedAddress) {
    return response(null);
  }

  const property = await getPropertyIntelligence(normalizedAddress);

  return response(property);
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  return handlePropertyIntelligenceRequest(
    request,
    url.searchParams.get("address"),
  );
}

export async function POST(request: Request) {
  let payload: { address?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  return handlePropertyIntelligenceRequest(request, payload.address);
}
