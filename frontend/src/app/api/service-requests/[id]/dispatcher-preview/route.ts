import { NextResponse } from "next/server";

import type { Json } from "@/lib/supabase/types";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type DispatcherPreviewRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type DispatcherPreviewSnapshotPayload = {
  normalizedZip?: unknown;
  normalizedServiceType?: unknown;
  normalizedAppliance?: unknown;
  normalizedBrand?: unknown;
  normalizedIssue?: unknown;
  requestedWindow?: unknown;
  requestedDate?: unknown;
  orchestratorStatus?: unknown;
  recommendedTechnicianProfileId?: unknown;
  recommendationSummary?: unknown;
  backupOptionsCount?: unknown;
  backupOptions?: unknown;
  safeCustomerResponseDraft?: unknown;
  validationWarnings?: unknown;
  validationErrors?: unknown;
};

const VALID_ORCHESTRATOR_STATUSES = [
  "success",
  "partial",
  "no_availability",
  "validation_failed",
] as const;

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

function cleanNullableText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().slice(0, maxLength);

  return cleaned.length > 0 ? cleaned : null;
}

function cleanNullableDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return value;
}

function cleanNullableUuid(value: unknown): string | null {
  if (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return value;
  }

  return null;
}

function cleanJsonObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function cleanJsonArray(value: unknown): Json {
  return Array.isArray(value) ? (value as Json) : [];
}

function cleanNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function formatDispatcherPreviewError(message: string): string {
  if (
    message.includes("schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("dispatcher_preview")
  ) {
    return "Dispatcher preview snapshots are not ready yet. Apply migration 0030 in Supabase, then try again.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to save dispatcher previews for that service request.";
  }

  if (message.includes("Invalid dispatcher orchestrator status")) {
    return "Dispatcher preview status was invalid.";
  }

  return "We could not save the dispatcher preview snapshot yet.";
}

async function getAuthedSupabase(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: fail("A logged-in dashboard session is required.", 401),
    };
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return {
      ok: false as const,
      response: fail("Supabase is not configured for dispatcher snapshots.", 503),
    };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return {
      ok: false as const,
      response: fail("A valid authenticated session is required.", 401),
    };
  }

  return {
    ok: true as const,
    supabase,
  };
}

export async function GET(
  request: Request,
  { params }: DispatcherPreviewRouteProps,
) {
  const authed = await getAuthedSupabase(request);

  if (!authed.ok) {
    return authed.response;
  }

  const { id } = await params;
  const { data, error } = await authed.supabase.rpc(
    "latest_dispatcher_preview_snapshot_rpc",
    {
      p_service_request_id: id,
    },
  );

  if (error) {
    return fail(formatDispatcherPreviewError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    snapshot: data ?? null,
  });
}

export async function POST(
  request: Request,
  { params }: DispatcherPreviewRouteProps,
) {
  const authed = await getAuthedSupabase(request);

  if (!authed.ok) {
    return authed.response;
  }

  let payload: DispatcherPreviewSnapshotPayload;

  try {
    payload = (await request.json()) as DispatcherPreviewSnapshotPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const rawOrchestratorStatus =
    typeof payload.orchestratorStatus === "string"
      ? payload.orchestratorStatus
      : "";

  if (
    !VALID_ORCHESTRATOR_STATUSES.includes(
      rawOrchestratorStatus as (typeof VALID_ORCHESTRATOR_STATUSES)[number],
    )
  ) {
    return fail("Dispatcher preview status was invalid.");
  }

  const orchestratorStatus =
    rawOrchestratorStatus as (typeof VALID_ORCHESTRATOR_STATUSES)[number];

  const { id } = await params;
  const { data, error } = await authed.supabase.rpc(
    "save_dispatcher_preview_snapshot_rpc",
    {
      p_service_request_id: id,
      p_normalized_zip: cleanNullableText(payload.normalizedZip, 12),
      p_normalized_service_type: cleanNullableText(
        payload.normalizedServiceType,
        120,
      ),
      p_normalized_appliance: cleanNullableText(payload.normalizedAppliance, 120),
      p_normalized_brand: cleanNullableText(payload.normalizedBrand, 120),
      p_normalized_issue: cleanNullableText(payload.normalizedIssue, 1000),
      p_requested_window: cleanNullableText(payload.requestedWindow, 120),
      p_requested_date: cleanNullableDate(payload.requestedDate),
      p_orchestrator_status: orchestratorStatus,
      p_recommended_technician_profile_id: cleanNullableUuid(
        payload.recommendedTechnicianProfileId,
      ),
      p_recommendation_summary: cleanJsonObject(payload.recommendationSummary),
      p_backup_options_count: cleanNonNegativeInteger(payload.backupOptionsCount),
      p_backup_options: cleanJsonArray(payload.backupOptions),
      p_safe_customer_response_draft: cleanNullableText(
        payload.safeCustomerResponseDraft,
        2000,
      ),
      p_validation_warnings: cleanJsonArray(payload.validationWarnings),
      p_validation_errors: cleanJsonArray(payload.validationErrors),
    },
  );

  if (error) {
    return fail(formatDispatcherPreviewError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    snapshot: data,
  });
}
