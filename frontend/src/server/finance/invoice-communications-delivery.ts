import crypto from "node:crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { PublicSchema } from "@/lib/supabase/types";
import {
  checkConversationSmsReadiness,
  normalizeSmsPhone,
  sendConversationSms,
} from "@/server/communications/telnyx-sms-transport";

type ServiceRequestRow = PublicSchema["Tables"]["service_requests"]["Row"];
type InvoiceRow = PublicSchema["Tables"]["service_request_invoices"]["Row"];
type ConversationRow = PublicSchema["Tables"]["communication_conversations"]["Row"];

type InvoiceDeliveryRpcResult = {
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

type ExistingInvoiceDeliveryRow = {
  id: string;
  communication_message_id: string | null;
  delivery_metadata: { invoice_url?: string } | null;
  delivery_status: string;
  invoice_token_id: string | null;
  provider_message_id: string | null;
  request_fingerprint: string | null;
};

type SendInvoiceDeliveryResult =
  | {
      ok: true;
      channel: "sms" | "email";
      conversationId: string;
      invoiceTokenId: string | null;
      invoiceUrl: string | null;
      messageId: string | null;
      providerMessageId: string | null;
    }
  | { ok: false; status: number; message: string };

function getBaseUrl(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin.replace(/\/$/, "");
  }

  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";

  return host ? `${proto}://${host}` : "";
}

function buildInvoiceUrl(request: Request, token: string): string {
  return `${getBaseUrl(request)}/invoices/${token}`;
}

function createInvoiceSendFingerprint(input: {
  channel: "sms" | "email";
  invoiceId: string;
  recipient: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        channel: input.channel,
        invoiceId: input.invoiceId,
        recipient: input.recipient,
      }),
    )
    .digest("hex");
}

function isLocalEmailMockEnabled(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return (
    process.env.WRA_QA_ENVIRONMENT === "local" &&
    process.env.WRA_DISABLE_PROVIDER_CALLS === "1" &&
    process.env.EMAIL_MOCK_MODE === "1" &&
    (supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost"))
  );
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function assertSameCompanyConversation(
  conversation: ConversationRow,
  serviceRequest: ServiceRequestRow,
): boolean {
  return Boolean(
    conversation.company_id &&
      serviceRequest.company_id &&
      conversation.company_id === serviceRequest.company_id,
  );
}

async function resolveInvoiceContext(input: {
  channel: "sms" | "email";
  invoiceId: string;
  recipient: string;
}): Promise<
  | {
      ok: true;
      companyId: string;
      conversationId: string;
      invoice: InvoiceRow;
      normalizedRecipient: string;
      serviceRequest: ServiceRequestRow;
    }
  | { ok: false; status: number; message: string }
> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Invoice delivery is not configured." };
  }

  const normalizedRecipient =
    input.channel === "sms"
      ? normalizeSmsPhone(input.recipient)
      : normalizeEmail(input.recipient);

  if (!normalizedRecipient) {
    return {
      ok: false,
      status: 400,
      message:
        input.channel === "sms"
          ? "Enter a valid customer phone number before sending."
          : "Enter a valid customer email before sending.",
    };
  }

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("service_request_invoices")
    .select("*")
    .eq("id", input.invoiceId)
    .maybeSingle();

  if (invoiceError || !invoiceData) {
    return { ok: false, status: 404, message: "Invoice was not found." };
  }

  const invoice = invoiceData as InvoiceRow;
  const { data: requestData, error: requestError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", invoice.service_request_id)
    .maybeSingle();

  if (requestError || !requestData) {
    return { ok: false, status: 404, message: "Job was not found for this Invoice." };
  }

  const serviceRequest = requestData as ServiceRequestRow;
  if (!serviceRequest.company_id) {
    return { ok: false, status: 400, message: "Job is missing company context." };
  }

  const companyId = serviceRequest.company_id;
  const { data: conversations, error: conversationsError } = await supabase
    .from("communication_conversations")
    .select("*")
    .eq("company_id", companyId)
    .eq("service_request_id", serviceRequest.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (conversationsError) {
    return { ok: false, status: 503, message: "Unable to resolve Communications conversation." };
  }

  const existingConversation = ((conversations ?? []) as ConversationRow[]).find(
    (conversation) => {
      if (!assertSameCompanyConversation(conversation, serviceRequest)) {
        return false;
      }

      return input.channel === "sms"
        ? normalizeSmsPhone(conversation.customer_phone) === normalizedRecipient
        : normalizeEmail(conversation.customer_email ?? "") === normalizedRecipient;
    },
  );

  if (existingConversation) {
    return {
      ok: true,
      companyId,
      conversationId: existingConversation.id,
      invoice,
      normalizedRecipient,
      serviceRequest,
    };
  }

  const now = new Date().toISOString();
  const { data: createdConversation, error: createError } = await supabase
    .from("communication_conversations")
    .insert({
      company_id: companyId,
      primary_source_type: input.channel,
      status: "linked",
      customer_id: serviceRequest.customer_id,
      service_request_id: serviceRequest.id,
      customer_display_name: serviceRequest.customer_name,
      customer_phone: input.channel === "sms" ? normalizedRecipient : serviceRequest.customer_phone,
      customer_email: input.channel === "email" ? normalizedRecipient : serviceRequest.customer_email,
      service_address: serviceRequest.full_address,
      summary: `Invoice delivery for ${invoice.invoice_number ?? "Invoice"}`,
      next_action: "Customer invoice payment pending.",
      last_event_at: now,
    })
    .select("*")
    .single();

  if (createError || !createdConversation) {
    return { ok: false, status: 503, message: "Unable to create Communications conversation." };
  }

  return {
    ok: true,
    companyId,
    conversationId: (createdConversation as ConversationRow).id,
    invoice,
    normalizedRecipient,
    serviceRequest,
  };
}

async function findExistingDelivery(
  companyId: string,
  idempotencyKey: string,
): Promise<ExistingInvoiceDeliveryRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data } = await (supabase as never as {
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            maybeSingle(): Promise<{ data: ExistingInvoiceDeliveryRow | null }>;
          };
        };
      };
    };
  })
    .from("service_request_invoice_deliveries")
    .select(
      "id,communication_message_id,delivery_metadata,delivery_status,invoice_token_id,provider_message_id,request_fingerprint",
    )
    .eq("company_id", companyId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return data ?? null;
}

async function insertTimelineEvent(input: {
  body: string | null;
  companyId: string;
  conversationId: string;
  eventType: "invoice_sent" | "invoice_delivery_failed";
  invoiceId: string;
  serviceRequestId: string;
  title: string;
}) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return;
  }

  const { data: existing } = await supabase
    .from("communication_timeline_events")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .eq("service_request_id", input.serviceRequestId)
    .eq("invoice_id", input.invoiceId)
    .eq("event_type", input.eventType)
    .eq("title", input.title)
    .limit(1);

  if ((existing ?? []).length > 0) {
    return;
  }

  await supabase.from("communication_timeline_events").insert({
    conversation_id: input.conversationId,
    event_type: input.eventType,
    title: input.title,
    body: input.body,
    event_time: new Date().toISOString(),
    service_request_id: input.serviceRequestId,
    invoice_id: input.invoiceId,
  } as never);
}

async function insertMockEmailMessage(input: {
  body: string;
  conversationId: string;
}): Promise<
  | { ok: true; messageId: string; providerMessageId: string }
  | { ok: false; status: number; message: string; messageId: null }
> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Communications delivery is not configured.", messageId: null };
  }

  if (!isLocalEmailMockEnabled()) {
    return { ok: false, status: 503, message: "Email invoice delivery is not configured yet.", messageId: null };
  }

  const now = new Date().toISOString();
  const providerMessageId = `mock-email-${crypto.randomUUID()}`;
  const { data, error } = await supabase
    .from("communication_messages")
    .insert({
      conversation_id: input.conversationId,
      source_type: "email",
      direction: "outbound",
      sender_role: "system",
      body: input.body,
      delivery_status: "sent",
      provider_message_id: providerMessageId,
      sent_at: now,
      occurred_at: now,
    } as never)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, status: 503, message: "Mock email could not be recorded.", messageId: null };
  }

  return {
    ok: true,
    messageId: String((data as { id: string }).id),
    providerMessageId,
  };
}

export async function sendInvoiceToCustomer(input: {
  channel: "sms" | "email";
  idempotencyKey: string;
  invoiceId: string;
  messagePreview: string;
  recipient: string;
  request: Request;
  prepareInvoiceToken: () => Promise<InvoiceDeliveryRpcResult>;
}): Promise<SendInvoiceDeliveryResult> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Invoice delivery is not configured." };
  }

  const context = await resolveInvoiceContext({
    channel: input.channel,
    invoiceId: input.invoiceId,
    recipient: input.recipient,
  });
  if (!context.ok) {
    return context;
  }

  const requestFingerprint = createInvoiceSendFingerprint({
    channel: input.channel,
    invoiceId: input.invoiceId,
    recipient: context.normalizedRecipient,
  });

  const existingDelivery = await findExistingDelivery(
    context.companyId,
    input.idempotencyKey,
  );
  if (existingDelivery) {
    if (existingDelivery.request_fingerprint !== requestFingerprint) {
      return {
        ok: false,
        status: 409,
        message: "This send request was already used for a different Invoice delivery.",
      };
    }

    if (
      existingDelivery.delivery_status !== "sent" ||
      !existingDelivery.delivery_metadata?.invoice_url
    ) {
      return {
        ok: false,
        status: 409,
        message: "This send request already has a recorded delivery attempt. Start a new send request to retry.",
      };
    }

    return {
      ok: true,
      channel: input.channel,
      conversationId: context.conversationId,
      invoiceTokenId: existingDelivery.invoice_token_id,
      invoiceUrl: existingDelivery.delivery_metadata.invoice_url,
      messageId: existingDelivery.communication_message_id,
      providerMessageId: existingDelivery.provider_message_id,
    };
  }

  let readiness:
    | Awaited<ReturnType<typeof checkConversationSmsReadiness>>
    | { ok: true; sourceAccountId: null } = { ok: true, sourceAccountId: null };

  if (input.channel === "sms") {
    readiness = await checkConversationSmsReadiness(context.conversationId);
    if (!readiness.ok) {
      return { ok: false, status: readiness.status, message: readiness.message };
    }
  }

  await supabase
    .from("communication_conversations")
    .update({
      source_account_id: readiness.sourceAccountId,
      provider_name: input.channel === "sms" ? "telnyx" : "mock-email",
      primary_source_type: input.channel,
      status: "linked",
    } as never)
    .eq("id", context.conversationId)
    .eq("company_id", context.companyId);

  const prepared = await input.prepareInvoiceToken();
  if (!prepared.invoice_token || !prepared.invoice_token_id) {
    return { ok: false, status: 503, message: "Invoice payment link could not be prepared." };
  }

  const invoiceUrl = buildInvoiceUrl(input.request, prepared.invoice_token);
  const body = input.messagePreview.includes(invoiceUrl)
    ? input.messagePreview
    : `${input.messagePreview}\n${invoiceUrl}`;

  const sendResult =
    input.channel === "sms"
      ? await sendConversationSms({
          conversationId: context.conversationId,
          body,
        })
      : await insertMockEmailMessage({
          conversationId: context.conversationId,
          body,
        });

  const now = new Date().toISOString();
  const deliveryRow = {
    company_id: context.companyId,
    service_request_id: context.serviceRequest.id,
    invoice_id: input.invoiceId,
    invoice_token_id: prepared.invoice_token_id,
    communication_message_id: sendResult.ok ? sendResult.messageId : sendResult.messageId ?? null,
    delivery_channel: input.channel,
    delivery_status: sendResult.ok ? "sent" : "failed",
    recipient: context.normalizedRecipient,
    idempotency_key: input.idempotencyKey,
    request_fingerprint: requestFingerprint,
    provider: input.channel === "sms" ? "telnyx" : "mock-email",
    provider_message_id: sendResult.ok ? sendResult.providerMessageId : null,
    provider_status: sendResult.ok ? "sent" : "failed",
    provider_error: sendResult.ok ? null : sendResult.message,
    sent_by_profile_id: context.invoice.created_by_profile_id,
    sent_at: sendResult.ok ? now : null,
    failed_at: sendResult.ok ? null : now,
    delivery_metadata: {
      conversation_id: context.conversationId,
      invoice_id: input.invoiceId,
      invoice_number: prepared.invoice_number ?? context.invoice.invoice_number,
      invoice_url: invoiceUrl,
      source_account_id: readiness.sourceAccountId,
    },
  };

  const { error: deliveryInsertError } = await (supabase as never as {
    from(table: string): {
      insert(row: unknown): Promise<{ error: { message: string } | null }>;
    };
  })
    .from("service_request_invoice_deliveries")
    .insert(deliveryRow);

  if (deliveryInsertError) {
    return {
      ok: false,
      status: 503,
      message: `Invoice delivery audit could not be recorded: ${deliveryInsertError.message}`,
    };
  }

  if (!sendResult.ok) {
    await insertTimelineEvent({
      body: sendResult.message,
      companyId: context.companyId,
      conversationId: context.conversationId,
      eventType: "invoice_delivery_failed",
      invoiceId: input.invoiceId,
      serviceRequestId: context.serviceRequest.id,
      title: `Invoice ${prepared.invoice_number ?? context.invoice.invoice_number ?? ""} delivery failed`.trim(),
    });
    return { ok: false, status: sendResult.status, message: sendResult.message };
  }

  await supabase
    .from("communication_conversations")
    .update({
      provider_name: input.channel === "sms" ? "telnyx" : "mock-email",
      primary_source_type: input.channel,
      status: "linked",
      summary: `Invoice ${
        prepared.invoice_number ?? context.invoice.invoice_number ?? ""
      } sent by ${input.channel.toUpperCase()}.`.trim(),
      next_action: "Awaiting customer invoice payment.",
      last_event_at: now,
      last_outbound_at: now,
    } as never)
    .eq("id", context.conversationId)
    .eq("company_id", context.companyId);

  await insertTimelineEvent({
    body,
    companyId: context.companyId,
    conversationId: context.conversationId,
    eventType: "invoice_sent",
    invoiceId: input.invoiceId,
    serviceRequestId: context.serviceRequest.id,
    title: `Invoice ${prepared.invoice_number ?? context.invoice.invoice_number ?? ""} sent`.trim(),
  });

  return {
    ok: true,
    channel: input.channel,
    conversationId: context.conversationId,
    invoiceTokenId: prepared.invoice_token_id,
    invoiceUrl,
    messageId: sendResult.messageId,
    providerMessageId: sendResult.providerMessageId,
  };
}
