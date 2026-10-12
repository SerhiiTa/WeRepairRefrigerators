import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateInvoiceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatInvoiceError(message: string): string {
  if (
    message.includes("sync_job_invoice_from_approved_estimates_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Job Invoice sync is not ready yet. Apply the latest Finance V2 migration in Supabase, then try again.";
  }

  if (message.includes("no_approved_scope")) {
    return "Approve at least one estimate before creating an invoice.";
  }

  if (message.includes("Active checkout")) {
    return "Finish or cancel the active checkout before updating this invoice.";
  }

  if (message.includes("not accessible") || message.includes("permission denied")) {
    return "This account is not allowed to create an invoice for that estimate.";
  }

  if (message.includes("not found")) {
    return "Estimate not found.";
  }

  return process.env.NODE_ENV === "production"
    ? "We could not create this invoice yet."
    : `Invoice creation failed: ${message}`;
}

function createInvoiceSyncRequestId(): string {
  return `invoice_sync_${crypto.randomUUID()}`;
}

function categorizeInvoiceSyncError(
  error: { code?: string; message?: string } | null,
): string {
  const code = error?.code ?? null;
  const message = error?.message ?? "";

  if (code === "42501" || message.includes("permission denied")) {
    return "permission_denied";
  }

  if (code === "28000" || message.includes("Authentication is required")) {
    return "authentication_required";
  }

  if (code === "P0002" || message.includes("not found")) {
    return "not_found";
  }

  if (
    code === "23514" ||
    message.includes("Active checkout") ||
    message.includes("no_approved_scope")
  ) {
    return "business_rule";
  }

  if (
    message.includes("schema cache") ||
    message.includes("Could not find the function")
  ) {
    return "schema_cache";
  }

  return code ? "database_error" : "unknown";
}

function logInvoiceSyncDiagnostic(details: {
  requestId: string;
  stage: "estimate_lookup" | "sync_rpc";
  success: boolean;
  errorCode?: string | null;
  category?: string;
}) {
  console.info("[invoice-sync-diagnostic]", {
    operation: "invoice_sync",
    requestId: details.requestId,
    stage: details.stage,
    success: details.success,
    errorCode: details.errorCode ?? null,
    category: details.category ?? null,
  });
}

async function requireInvoiceSupabase(request: Request) {
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
      response: fail("Supabase is not configured for invoices.", 503),
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

export async function POST(
  request: Request,
  { params }: EstimateInvoiceRouteProps,
) {
  const requestId = createInvoiceSyncRequestId();
  const auth = await requireInvoiceSupabase(request);

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid approved estimate to invoice.");
  }

  const { data: estimate, error: estimateError } = await auth.supabase
    .from("service_request_estimates")
    .select("id, service_request_id")
    .eq("id", id)
    .maybeSingle();

  if (estimateError) {
    logInvoiceSyncDiagnostic({
      requestId,
      stage: "estimate_lookup",
      success: false,
      errorCode: estimateError.code ?? null,
      category: categorizeInvoiceSyncError(estimateError),
    });

    return fail(formatInvoiceError(estimateError.message), 403);
  }

  if (!estimate?.service_request_id) {
    logInvoiceSyncDiagnostic({
      requestId,
      stage: "estimate_lookup",
      success: false,
      errorCode: null,
      category: "not_found",
    });

    return fail("Estimate not found.", 404);
  }

  logInvoiceSyncDiagnostic({
    requestId,
    stage: "estimate_lookup",
    success: true,
  });

  const { data, error } = await auth.supabase.rpc(
    "sync_job_invoice_from_approved_estimates_rpc",
    {
      p_service_request_id: estimate.service_request_id,
    },
  );

  if (error) {
    logInvoiceSyncDiagnostic({
      requestId,
      stage: "sync_rpc",
      success: false,
      errorCode: error.code ?? null,
      category: categorizeInvoiceSyncError(error),
    });

    return fail(formatInvoiceError(error.message), 403);
  }

  logInvoiceSyncDiagnostic({
    requestId,
    stage: "sync_rpc",
    success: true,
  });

  return NextResponse.json({
    ok: true,
    invoice: data,
  });
}
