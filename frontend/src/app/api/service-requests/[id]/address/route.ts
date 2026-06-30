import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type ServiceRequestAddressRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_ADDRESS_TEXT = 180;
const MAX_UNIT_TEXT = 80;

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
}

function cleanText(value: unknown, maxLength = MAX_ADDRESS_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNullableText(
  value: unknown,
  maxLength = MAX_ADDRESS_TEXT,
): string | null {
  const cleaned = cleanText(value, maxLength);

  return cleaned.length > 0 ? cleaned : null;
}

function cleanZip(value: unknown): string {
  return cleanText(value).replace(/[^0-9]/g, "").slice(0, 5);
}

function cleanCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : null;
}

function formatAddressUpdateError(message: string): string {
  if (
    message.includes("schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("update_service_request_address_rpc")
  ) {
    return "Address updates are not ready yet. Apply migration 0029 in Supabase, then try again.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to update that service request address.";
  }

  if (
    message.includes("ZIP code") ||
    message.includes("State") ||
    message.includes("Country") ||
    message.includes("Latitude") ||
    message.includes("Longitude")
  ) {
    return message;
  }

  return "We could not update the service address yet.";
}

export async function PATCH(
  request: Request,
  { params }: ServiceRequestAddressRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: {
    streetAddress?: unknown;
    unit?: unknown;
    city?: unknown;
    state?: unknown;
    zipCode?: unknown;
    country?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    placeId?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const streetAddress = cleanNullableText(payload.streetAddress);
  const unit = cleanNullableText(payload.unit, MAX_UNIT_TEXT);
  const city = cleanNullableText(payload.city);
  const state = cleanText(payload.state, 2).toUpperCase();
  const zipCode = cleanZip(payload.zipCode);
  const country = cleanText(payload.country || "US", 2).toUpperCase() || "US";
  const latitude = cleanCoordinate(payload.latitude);
  const longitude = cleanCoordinate(payload.longitude);
  const placeId = cleanNullableText(payload.placeId, 220);

  if (state.length !== 2) {
    return fail("Enter a 2-letter state.");
  }

  if (zipCode.length !== 5) {
    return fail("Enter a valid 5-digit ZIP code.");
  }

  if (country.length !== 2) {
    return fail("Enter a 2-letter country code.");
  }

  if (
    (latitude === null && longitude !== null) ||
    (latitude !== null && longitude === null)
  ) {
    return fail("Latitude and longitude must be saved together.");
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for address updates.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data, error } = await supabase.rpc(
    "update_service_request_address_rpc",
    {
      p_request_id: id,
      p_street_address: streetAddress,
      p_unit: unit,
      p_city: city,
      p_state: state,
      p_zip_code: zipCode,
      p_country: country,
      p_latitude: latitude,
      p_longitude: longitude,
      p_place_id: placeId,
    },
  );

  if (error) {
    return fail(formatAddressUpdateError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    address: data,
  });
}
