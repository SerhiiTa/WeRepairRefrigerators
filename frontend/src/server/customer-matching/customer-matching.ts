import type { DatabaseIntakeSourceType, Json } from "@/lib/supabase/types";

export type CustomerMatchSourceType =
  | DatabaseIntakeSourceType
  | "website_chat"
  | "thumbtack"
  | "future_source";

export type CustomerMatchInput = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  streetAddress?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  sourceType?: CustomerMatchSourceType | null;
  sourceId?: string | null;
};

export type CustomerMatchResult = {
  customerId: string | null;
  confidence: "high" | "medium" | "new" | "none";
  reason: string | null;
  reviewRequired: boolean;
  created: boolean;
};

type CustomerMatchingRpcClient = {
  rpc: (
    functionName: "match_or_create_customer_for_intake_rpc",
    args: {
      p_intake_request_id?: string | null;
      p_payload?: Json;
    },
  ) => Promise<{
    data: Json | null;
    error: { message: string } | null;
  }>;
};

function cleanText(value: string | null | undefined, maxLength = 180) {
  const cleaned = value?.trim();

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/[^0-9]/g, "") ?? "";

  return digits || null;
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();

  return email && email.includes("@") ? email : null;
}

function normalizeZip(value: string | null | undefined) {
  const zip = value?.replace(/[^0-9]/g, "").slice(0, 5) ?? "";

  return zip.length === 5 ? zip : null;
}

export function normalizeCustomerMatchInput(input: CustomerMatchInput): Record<string, Json> {
  const firstName = cleanText(input.firstName);
  const lastName = cleanText(input.lastName);
  const fullName =
    cleanText(input.fullName) ??
    cleanText([firstName, lastName].filter(Boolean).join(" "));

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    street_address: cleanText(input.streetAddress, 240),
    unit: cleanText(input.unit),
    city: cleanText(input.city),
    state: cleanText(input.state, 2)?.toUpperCase() ?? null,
    zip_code: normalizeZip(input.zipCode),
    country: cleanText(input.country, 2)?.toUpperCase() ?? "US",
    source_type: cleanText(input.sourceType),
    source_id: cleanText(input.sourceId, 240),
  };
}

export async function matchOrCreateCustomerForIntake({
  supabase,
  intakeRequestId,
  input,
}: {
  supabase: CustomerMatchingRpcClient;
  intakeRequestId?: string | null;
  input: CustomerMatchInput;
}): Promise<CustomerMatchResult> {
  const { data, error } = await supabase.rpc("match_or_create_customer_for_intake_rpc", {
    p_intake_request_id: intakeRequestId ?? null,
    p_payload: normalizeCustomerMatchInput(input),
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, Json>)
    : {};

  return {
    customerId: typeof payload.customer_id === "string" ? payload.customer_id : null,
    confidence:
      payload.confidence === "high" ||
      payload.confidence === "medium" ||
      payload.confidence === "new"
        ? payload.confidence
        : "none",
    reason: typeof payload.reason === "string" ? payload.reason : null,
    reviewRequired: payload.review_required === true,
    created: payload.created === true,
  };
}
