import { NextResponse } from "next/server";

import { HOMEFIX_PRIVATE_COMPANY_ID } from "@/lib/auth/homefix-private-access";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

type InvoiceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type InvoiceAction = "send" | "paid" | "void";
type ServiceRequestInvoiceRow =
  Database["public"]["Tables"]["service_request_invoices"]["Row"];

const PROTECTED_STEVEN_WOLF_CUSTOMER_ID =
  "d17fd120-c80c-4161-ab00-744f58aec139";
const PROTECTED_STEVEN_WOLF_SERVICE_REQUEST_IDS = new Set([
  "43c96a00-0dbd-4062-9210-6b6d7175843b",
  "f3cf151a-5e94-463a-b86e-8e22cd7e2bef",
  "2874b705-d5ec-4cdd-9263-5d748b7fbe66",
  "febd751a-9fee-4ffd-a093-3928d6e952b9",
  "8e2f0bda-979a-46d8-92c5-c00f765de4f6",
  "ecfca6eb-2804-4fe0-9680-68d9a93a00ff",
  "2f300f36-3397-4e3b-b009-8d6998054907",
  "687f7df1-c8de-4474-bb33-ba8b9b2a16db",
  "365ae26c-947b-43c9-ba92-4b9c63c12321",
]);
const PROTECTED_STEVEN_WOLF_INVOICE_IDS = new Set([
  "c07234e1-67ec-48a1-ae5e-19e39c79dc54",
  "56c56717-f36e-4a8c-9c7e-2629925019b4",
  "91968956-bca7-4f17-80ff-b40ec4e58cca",
  "78ca4d06-cb68-4ab8-a15a-24dc29215d60",
  "4660562c-d06e-4da6-aaa5-ddc07547cb3c",
  "7d9616e4-4300-4ef9-8463-fd8641f9c5f9",
  "c4bd05bc-8e8f-4b99-84a6-4a50df6fce32",
  "01644cd5-3993-4657-a629-60929de88f8d",
]);

function isSchemaMissingError(message: string): boolean {
  return (
    message.includes("service_request_payment_allocations") &&
    (message.includes("schema cache") ||
      message.includes("Could not find the table") ||
      message.includes("does not exist"))
  );
}

function isProvenanceProtectedInvoice(invoice: ServiceRequestInvoiceRow): boolean {
  return (
    invoice.source_system !== "native" ||
    invoice.external_invoice_id !== null ||
    invoice.external_import_key !== null ||
    invoice.imported_at !== null
  );
}

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

function isInvoiceAction(value: unknown): value is InvoiceAction {
  return value === "send" || value === "paid" || value === "void";
}

function formatInvoiceActionError(message: string): string {
  if (
    message.includes("send_service_request_invoice_rpc") ||
    message.includes("mark_service_request_invoice_paid_rpc") ||
    message.includes("void_service_request_invoice_rpc") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Invoice actions are not ready yet. Apply migration 0028 in Supabase, then try again.";
  }

  if (message.includes("not accessible") || message.includes("permission denied")) {
    return "This account is not allowed to manage that invoice.";
  }

  if (message.includes("not found")) {
    return "Invoice not found.";
  }

  if (message.includes("Only") || message.includes("cannot")) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "We could not update this invoice yet."
    : `Invoice update failed: ${message}`;
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

export async function PATCH(request: Request, { params }: InvoiceRouteProps) {
  const auth = await requireInvoiceSupabase(request);

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid invoice.");
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  if (!isInvoiceAction(payload.action)) {
    return fail("Choose a valid invoice action.");
  }

  const rpcName =
    payload.action === "send"
      ? "send_service_request_invoice_rpc"
      : payload.action === "paid"
        ? "mark_service_request_invoice_paid_rpc"
        : "void_service_request_invoice_rpc";

  const { data, error } = await auth.supabase.rpc(rpcName, {
    p_invoice_id: id,
  });

  if (error) {
    return fail(formatInvoiceActionError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    invoice: data,
  });
}

export async function DELETE(request: Request, { params }: InvoiceRouteProps) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }

  const serviceRole = getSupabaseServiceRoleClient();
  if (!serviceRole) {
    return fail("Invoice deletion is not configured for this workspace.", 503);
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid invoice to delete.");
  }

  const { data: invoice, error: invoiceError } = await serviceRole
    .from("service_request_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (invoiceError) {
    return fail("Invoice could not be loaded.", 500);
  }

  if (!invoice) {
    return fail("Invoice not found.", 404);
  }

  const { data: serviceRequest, error: requestError } = await serviceRole
    .from("service_requests")
    .select("id,company_id,customer_id")
    .eq("id", invoice.service_request_id)
    .maybeSingle();

  if (requestError) {
    return fail("Invoice job could not be loaded.", 500);
  }

  if (!serviceRequest) {
    return fail("Invoice job not found.", 404);
  }

  if (serviceRequest.company_id !== HOMEFIX_PRIVATE_COMPANY_ID) {
    return fail("This account is not allowed to delete that invoice.", 403);
  }

  if (
    serviceRequest.customer_id === PROTECTED_STEVEN_WOLF_CUSTOMER_ID ||
    PROTECTED_STEVEN_WOLF_SERVICE_REQUEST_IDS.has(invoice.service_request_id) ||
    PROTECTED_STEVEN_WOLF_INVOICE_IDS.has(invoice.id)
  ) {
    return fail("This real customer invoice is protected and cannot be deleted.", 403);
  }

  if (isProvenanceProtectedInvoice(invoice)) {
    return fail(
      "Imported or provenance-bearing invoices cannot be deleted from the dashboard.",
      403,
    );
  }

  const { data: payments, error: paymentsError } = await serviceRole
    .from("service_request_payments")
    .select("id,payment_status")
    .eq("invoice_id", invoice.id)
    .limit(1);

  if (paymentsError) {
    return fail("Invoice payment relationships could not be checked.", 500);
  }

  if ((payments ?? []).length > 0) {
    return fail("Invoices with payment history cannot be deleted.", 409);
  }

  const { data: allocations, error: allocationError } = await serviceRole
    .from("service_request_payment_allocations")
    .select("id")
    .eq("invoice_id", invoice.id)
    .eq("allocation_status", "active")
    .limit(1);

  if (allocationError && !isSchemaMissingError(allocationError.message)) {
    return fail("Invoice payment allocations could not be checked.", 500);
  }

  if (!allocationError && (allocations ?? []).length > 0) {
    return fail("Invoices with active payment allocations cannot be deleted.", 409);
  }

  const estimateId = invoice.estimate_id;

  const { error: deleteError } = await serviceRole
    .from("service_request_invoices")
    .delete()
    .eq("id", invoice.id);

  if (deleteError) {
    return fail("Invoice could not be deleted.", 500);
  }

  let restoredEstimate = false;

  if (estimateId) {
    const { count: remainingInvoiceCount } = await serviceRole
      .from("service_request_invoices")
      .select("id", { count: "exact", head: true })
      .eq("estimate_id", estimateId);

    if (remainingInvoiceCount === 0) {
      const { data: estimate } = await serviceRole
        .from("service_request_estimates")
        .select("id,estimate_status")
        .eq("id", estimateId)
        .maybeSingle();

      if (estimate?.estimate_status === "converted_to_invoice") {
        const { error: estimateError } = await serviceRole
          .from("service_request_estimates")
          .update({ estimate_status: "approved" })
          .eq("id", estimateId)
          .eq("estimate_status", "converted_to_invoice");

        restoredEstimate = !estimateError;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Invoice deleted.",
    deletedInvoiceId: invoice.id,
    estimateId,
    restoredEstimate,
  });
}
