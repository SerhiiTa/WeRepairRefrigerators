import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type InvoiceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type InvoiceAction = "send" | "paid" | "void";

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
