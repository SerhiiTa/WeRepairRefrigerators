import { NextResponse } from "next/server";

import { sendInvoiceToCustomer } from "@/server/finance/invoice-communications-delivery";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type InvoiceSendRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type SendInvoicePayload = {
  channel?: unknown;
  idempotencyKey?: unknown;
  messagePreview?: unknown;
  recipient?: unknown;
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidSmsRecipient(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function normalizeChannel(value: unknown): "sms" | "email" | null {
  return value === "sms" || value === "email" ? value : null;
}

function formatInvoiceSendFailure(message: string): string {
  if (
    message.includes("send_service_request_invoice_to_customer_rpc") ||
    message.includes("service_request_invoice_delivery_tokens") ||
    message.includes("service_request_invoice_deliveries") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Invoice delivery is not ready yet. Apply the Invoice Delivery migration before sending.";
  }

  if (message.includes("not allowed") || message.includes("permission denied")) {
    return "This account is not allowed to send that Invoice.";
  }

  if (
    message.includes("Voided") ||
    message.includes("Imported") ||
    message.includes("not found") ||
    message.includes("valid")
  ) {
    return message;
  }

  return process.env.NODE_ENV === "production"
    ? "Invoice could not be sent. Please try again."
    : `Invoice send failed: ${message}`;
}

export async function POST(request: Request, { params }: InvoiceSendRouteProps) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for Invoice delivery.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid Invoice to send.");
  }

  let payload: SendInvoicePayload;

  try {
    payload = (await request.json()) as SendInvoicePayload;
  } catch {
    return fail("Send Invoice requires a valid JSON body.");
  }

  const channel = normalizeChannel(payload.channel);
  const recipient =
    typeof payload.recipient === "string" ? payload.recipient.trim() : "";
  const idempotencyKey =
    typeof payload.idempotencyKey === "string"
      ? payload.idempotencyKey.trim().slice(0, 220)
      : "";

  if (!channel) {
    return fail("Choose SMS or Email before sending this Invoice.");
  }

  if (
    (channel === "sms" && !isValidSmsRecipient(recipient)) ||
    (channel === "email" && !isValidEmail(recipient))
  ) {
    return fail(
      channel === "sms"
        ? "Enter a valid customer phone number before sending."
        : "Enter a valid customer email before sending.",
    );
  }

  if (!idempotencyKey) {
    return fail("Send Invoice requires an idempotency key.");
  }

  const deliveryResult = await sendInvoiceToCustomer({
    channel,
    idempotencyKey,
    invoiceId: id,
    messagePreview:
      typeof payload.messagePreview === "string" && payload.messagePreview.trim()
        ? payload.messagePreview.trim()
        : "Please review and pay your invoice:",
    recipient,
    request,
    prepareInvoiceToken: async () => {
      const { data, error } = await supabase.rpc(
        "send_service_request_invoice_to_customer_rpc" as never,
        { p_invoice_id: id } as never,
      );

      if (error) {
        throw error;
      }

      return (data ?? {}) as {
        company_id?: string;
        expires_at?: string;
        invoice_id?: string;
        invoice_number?: string | null;
        invoice_status?: string;
        invoice_token?: string;
        invoice_token_id?: string;
        service_request_id?: string;
        service_request_status?: string;
      };
    },
  }).catch((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : "Invoice could not be sent.";
    return { ok: false as const, status: 503, message: formatInvoiceSendFailure(rawMessage) };
  });

  if (!deliveryResult.ok) {
    return fail(deliveryResult.message, deliveryResult.status);
  }

  return NextResponse.json({
    ok: true,
    message:
      deliveryResult.channel === "sms"
        ? "Invoice sent by SMS."
        : "Invoice sent by Email.",
    invoiceUrl: deliveryResult.invoiceUrl,
    delivery: {
      channel,
      conversationId: deliveryResult.conversationId,
      communicationMessageId: deliveryResult.messageId,
      invoiceTokenId: deliveryResult.invoiceTokenId,
      providerMessageId: deliveryResult.providerMessageId,
    },
    invoice: {
      id,
      invoice_status: "sent",
    },
  });
}
