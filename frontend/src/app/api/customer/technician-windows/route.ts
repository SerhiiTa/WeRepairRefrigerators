import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

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

function isDate(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatWindowError(message: string): string {
  if (
    message.includes("get_public_technician_booking_windows_rpc") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  ) {
    return "Booking windows are waiting for the Task 147 database update.";
  }

  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "This account cannot view booking windows yet.";
  }

  return "We could not load booking windows yet.";
}

export async function GET(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in customer session is required.", 401);
  }

  const url = new URL(request.url);
  const technicianSlug = url.searchParams.get("technician")?.trim() ?? "";
  const requestedDate = url.searchParams.get("date");

  if (!technicianSlug) {
    return fail("Choose a technician first.");
  }

  if (requestedDate && !isDate(requestedDate)) {
    return fail("Choose a valid date.");
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for booking windows.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid customer session is required.", 401);
  }

  const { data, error } = await supabase.rpc(
    "get_public_technician_booking_windows_rpc",
    {
      p_technician_slug: technicianSlug,
      p_requested_date: requestedDate || null,
    },
  );

  if (error) {
    return fail(formatWindowError(error.message), 503);
  }

  return NextResponse.json(data);
}
