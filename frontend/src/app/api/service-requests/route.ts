import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ServiceRequestSubmitPayload } from "@/lib/service-requests";

type PublicTechnicianContext = {
  slug: string;
  display_name: string | null;
  business_name: string | null;
};

const MAX_SHORT_TEXT = 120;
const MAX_LONG_TEXT = 1200;

function cleanText(value: unknown, maxLength = MAX_SHORT_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNullableText(value: unknown, maxLength = MAX_SHORT_TEXT): string | null {
  const cleaned = cleanText(value, maxLength);

  return cleaned.length > 0 ? cleaned : null;
}

function cleanZip(value: unknown): string {
  return cleanText(value).replace(/[^0-9]/g, "").slice(0, 5);
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function formatSupabaseError(message: string): string {
  if (
    message.includes("service_requests") &&
    (message.includes("schema cache") || message.includes("Could not find"))
  ) {
    return "Service request storage is not ready yet. Apply migration 0017 in Supabase, then try again.";
  }

  if (message.includes("row-level security")) {
    return "Service request storage is not accepting public requests yet. Check the Task 91 insert policy.";
  }

  return "We could not save this request yet. Please try again.";
}

export async function POST(request: Request) {
  let payload: ServiceRequestSubmitPayload;

  try {
    payload = (await request.json()) as ServiceRequestSubmitPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const values = payload.values;

  if (!values) {
    return fail("Request details are missing.");
  }

  const customerName = cleanText(values.customerFirstName);
  const customerPhone = cleanNullableText(values.phone, 40);
  const applianceType = cleanText(values.applianceType);
  const applianceBrand = cleanNullableText(values.brand);
  const issueDescription = cleanText(values.issueDescription, MAX_LONG_TEXT);
  const zipCode = cleanZip(values.zipCode);
  const preferredTimeWindow = cleanNullableText(values.preferredServiceWindow);
  const selectedTechnicianSlug = cleanNullableText(values.technicianPreference);

  if (!customerName) {
    return fail("Please enter a customer first name.");
  }

  if (zipCode.length !== 5) {
    return fail("Please enter a valid 5-digit ZIP code.");
  }

  if (!applianceType) {
    return fail("Please choose an appliance type.");
  }

  if (!issueDescription) {
    return fail("Please describe the refrigerator issue.");
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return fail("Supabase is not configured for service request storage.", 503);
  }

  let publicTechnician: PublicTechnicianContext | null = null;

  if (selectedTechnicianSlug) {
    const { data, error } = await supabase
      .from("public_technician_profiles")
      .select("slug,display_name,business_name")
      .eq("slug", selectedTechnicianSlug)
      .maybeSingle();

    if (!error && data) {
      publicTechnician = data as PublicTechnicianContext;
    }
  }

  const selectedTechnicianName =
    publicTechnician?.business_name?.trim() ||
    publicTechnician?.display_name?.trim() ||
    null;

  const requestId = crypto.randomUUID();

  const { error } = await supabase.from("service_requests").insert({
    id: requestId,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: null,
    appliance_type: applianceType,
    appliance_brand: applianceBrand,
    appliance_model: null,
    issue_description: issueDescription,
    zip_code: zipCode,
    city: null,
    state: "TX",
    preferred_time_window: preferredTimeWindow,
    selected_technician_slug: publicTechnician?.slug ?? null,
    selected_technician_business_name: selectedTechnicianName,
    request_source: publicTechnician ? "technician_profile" : "schedule_service",
    status: "new",
  });

  if (error) {
    return fail(formatSupabaseError(error.message), 503);
  }

  return NextResponse.json({
    ok: true,
    requestId,
    selectedTechnicianName,
  });
}
