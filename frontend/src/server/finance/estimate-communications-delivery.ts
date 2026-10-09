import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { PublicSchema } from "@/lib/supabase/types";
import {
  checkConversationSmsReadiness,
  normalizeSmsPhone,
  sendConversationSms,
} from "@/server/communications/telnyx-sms-transport";

type ServiceRequestRow = PublicSchema["Tables"]["service_requests"]["Row"];
type EstimateRow = PublicSchema["Tables"]["service_request_estimates"]["Row"];
type ConversationRow = PublicSchema["Tables"]["communication_conversations"]["Row"];

type DeliveryRpcResult = {
  approval_token?: string;
  estimate_number?: string | null;
  estimate_status?: string;
  id?: string;
  revision_id?: string;
  revision_number?: number;
  service_request_status?: string;
};

type ExistingDeliveryRow = {
  id: string;
  communication_message_id: string | null;
  delivery_status: string;
  delivery_metadata: { approval_url?: string } | null;
  provider_message_id: string | null;
  request_fingerprint: string | null;
  revision_id: string | null;
};

type DeliveryInsert = {
  communication_message_id: string | null;
  delivery_channel: "sms";
  delivery_metadata: Record<string, unknown>;
  delivery_status: "sent" | "failed";
  failed_at: string | null;
  idempotency_key: string;
  provider: "telnyx";
  provider_error: string | null;
  provider_message_id: string | null;
  provider_status: "sent" | "failed";
  recipient: string;
  request_fingerprint: string;
  revision_id: string;
  sent_at: string | null;
  sent_by_profile_id: string | null;
};

type RevisionDeliverySelectQuery = {
  eq(column: string, value: string): RevisionDeliverySelectQuery;
  maybeSingle(): Promise<{ data: ExistingDeliveryRow | null }>;
};

type RevisionDeliveryTable = {
  insert(row: DeliveryInsert): Promise<{ error: { message: string } | null }>;
  select(columns: string): RevisionDeliverySelectQuery;
};

type TimelineInsert = {
  body: string;
  conversation_id: string;
  estimate_id: string;
  event_time: string;
  event_type: "estimate_sent";
  service_request_id: string;
  title: string;
};

type TimelineTable = {
  insert(row: TimelineInsert): Promise<{ error: { message: string } | null }>;
};

function revisionDeliveryTable(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>,
): RevisionDeliveryTable {
  return (supabase as unknown as { from(table: string): RevisionDeliveryTable }).from(
    "service_request_estimate_revision_deliveries",
  );
}

function communicationTimelineTable(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>,
): TimelineTable {
  return (supabase as unknown as { from(table: string): TimelineTable }).from(
    "communication_timeline_events",
  );
}

type SendEstimateSmsResult =
  | {
      ok: true;
      approvalUrl: string | null;
      conversationId: string;
      messageId: string | null;
      providerMessageId: string | null;
      revisionId: string | null;
      revisionNumber: number | null;
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

function buildEstimateApprovalUrl(request: Request, token: string): string {
  return `${getBaseUrl(request)}/estimates/${token}`;
}

export function createEstimateSendFingerprint(input: {
  channel: "sms";
  estimateId: string;
  recipient: string;
}): string {
  return JSON.stringify({
    channel: input.channel,
    estimateId: input.estimateId,
    recipient: input.recipient,
  });
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

async function resolveEstimateContext(input: {
  estimateId: string;
  recipient: string;
}): Promise<
  | {
      ok: true;
      estimate: EstimateRow;
      serviceRequest: ServiceRequestRow;
      recipientPhone: string;
      conversationId: string;
    }
  | { ok: false; status: number; message: string }
> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Communications delivery is not configured." };
  }

  const recipientPhone = normalizeSmsPhone(input.recipient);
  if (!recipientPhone) {
    return { ok: false, status: 400, message: "Enter a valid customer phone number before sending." };
  }

  const { data: estimateData, error: estimateError } = await supabase
    .from("service_request_estimates")
    .select("*")
    .eq("id", input.estimateId)
    .maybeSingle();

  if (estimateError || !estimateData) {
    return { ok: false, status: 404, message: "Estimate was not found." };
  }

  const estimate = estimateData as EstimateRow;
  const { data: requestData, error: requestError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", estimate.service_request_id)
    .maybeSingle();

  if (requestError || !requestData) {
    return { ok: false, status: 404, message: "Job was not found for this Estimate." };
  }

  const serviceRequest = requestData as ServiceRequestRow;
  if (!serviceRequest.company_id) {
    return { ok: false, status: 400, message: "Job is missing company context." };
  }

  const { data: conversations, error: conversationsError } = await supabase
    .from("communication_conversations")
    .select("*")
    .eq("company_id", serviceRequest.company_id)
    .eq("service_request_id", serviceRequest.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (conversationsError) {
    return { ok: false, status: 503, message: "Unable to resolve Communications conversation." };
  }

  const existingConversation = ((conversations ?? []) as ConversationRow[]).find(
    (conversation) =>
      assertSameCompanyConversation(conversation, serviceRequest) &&
      normalizeSmsPhone(conversation.customer_phone) === recipientPhone,
  );

  if (existingConversation) {
    return {
      ok: true,
      estimate,
      serviceRequest,
      recipientPhone,
      conversationId: existingConversation.id,
    };
  }

  const now = new Date().toISOString();
  const { data: createdConversation, error: createError } = await supabase
    .from("communication_conversations")
    .insert({
      company_id: serviceRequest.company_id,
      primary_source_type: "sms",
      status: "linked",
      customer_id: serviceRequest.customer_id,
      service_request_id: serviceRequest.id,
      estimate_id: estimate.id,
      customer_display_name: serviceRequest.customer_name,
      customer_phone: recipientPhone,
      customer_email: serviceRequest.customer_email,
      service_address: serviceRequest.full_address,
      summary: `Estimate delivery for ${estimate.estimate_number ?? "Estimate"}`,
      next_action: "Customer estimate approval pending.",
      last_event_at: now,
    })
    .select("*")
    .single();

  if (createError || !createdConversation) {
    return { ok: false, status: 503, message: "Unable to create Communications conversation." };
  }

  return {
    ok: true,
    estimate,
    serviceRequest,
    recipientPhone,
    conversationId: (createdConversation as ConversationRow).id,
  };
}

async function findExistingDelivery(
  idempotencyKey: string,
): Promise<ExistingDeliveryRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data } = await revisionDeliveryTable(supabase)
    .select("id,communication_message_id,delivery_status,delivery_metadata,provider_message_id,request_fingerprint,revision_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return (data ?? null) as ExistingDeliveryRow | null;
}

export async function sendEstimateRevisionSms(input: {
  estimateId: string;
  idempotencyKey: string;
  messagePreview: string;
  recipient: string;
  request: Request;
  sendRevision: () => Promise<DeliveryRpcResult>;
}): Promise<SendEstimateSmsResult> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { ok: false, status: 503, message: "Communications delivery is not configured." };
  }

  const context = await resolveEstimateContext({
    estimateId: input.estimateId,
    recipient: input.recipient,
  });
  if (!context.ok) {
    return context;
  }

  const requestFingerprint = createEstimateSendFingerprint({
    channel: "sms",
    estimateId: input.estimateId,
    recipient: context.recipientPhone,
  });

  const existingDelivery = await findExistingDelivery(input.idempotencyKey);
  if (existingDelivery) {
    if (existingDelivery.request_fingerprint !== requestFingerprint) {
      return {
        ok: false,
        status: 409,
        message: "This send request was already used for a different Estimate delivery.",
      };
    }

    if (
      existingDelivery.delivery_status !== "sent" ||
      !existingDelivery.delivery_metadata?.approval_url
    ) {
      return {
        ok: false,
        status: 409,
        message: "This send request already has a recorded delivery attempt. Start a new send request to retry.",
      };
    }

    return {
      ok: true,
      approvalUrl: existingDelivery.delivery_metadata?.approval_url ?? null,
      conversationId: context.conversationId,
      messageId: existingDelivery.communication_message_id,
      providerMessageId: existingDelivery.provider_message_id,
      revisionId: existingDelivery.revision_id,
      revisionNumber: null,
    };
  }

  const readiness = await checkConversationSmsReadiness(context.conversationId);
  if (!readiness.ok) {
    return { ok: false, status: readiness.status, message: readiness.message };
  }

  const revision = await input.sendRevision();
  if (!revision.approval_token || !revision.revision_id) {
    return { ok: false, status: 503, message: "Estimate revision could not be prepared for SMS." };
  }

  const approvalUrl = buildEstimateApprovalUrl(input.request, revision.approval_token);
  const body = input.messagePreview.includes(approvalUrl)
    ? input.messagePreview
    : `${input.messagePreview}\n${approvalUrl}`;

  const sendResult = await sendConversationSms({
    conversationId: context.conversationId,
    body,
  });

  const now = new Date().toISOString();
  await revisionDeliveryTable(supabase).insert({
    revision_id: revision.revision_id,
    communication_message_id: sendResult.ok ? sendResult.messageId : sendResult.messageId ?? null,
    delivery_channel: "sms",
    delivery_status: sendResult.ok ? "sent" : "failed",
    recipient: context.recipientPhone,
    idempotency_key: input.idempotencyKey,
    request_fingerprint: requestFingerprint,
    provider: "telnyx",
    provider_message_id: sendResult.ok ? sendResult.providerMessageId : null,
    provider_status: sendResult.ok ? "sent" : "failed",
    provider_error: sendResult.ok ? null : sendResult.message,
    sent_by_profile_id: context.estimate.created_by_profile_id,
    sent_at: sendResult.ok ? now : null,
    failed_at: sendResult.ok ? null : now,
    delivery_metadata: {
      conversation_id: context.conversationId,
      source_account_id: readiness.sourceAccountId,
      estimate_id: input.estimateId,
      estimate_number: revision.estimate_number ?? context.estimate.estimate_number,
      approval_url: approvalUrl,
    },
  });

  if (!sendResult.ok) {
    return { ok: false, status: sendResult.status, message: sendResult.message };
  }

  await communicationTimelineTable(supabase).insert({
    conversation_id: context.conversationId,
    event_type: "estimate_sent",
    title: "Estimate sent",
    body: `Estimate ${revision.estimate_number ?? context.estimate.estimate_number ?? ""} revision ${
      revision.revision_number ?? ""
    } was sent by SMS.`.trim(),
    event_time: now,
    service_request_id: context.serviceRequest.id,
    estimate_id: input.estimateId,
  });

  return {
    ok: true,
    approvalUrl,
    conversationId: context.conversationId,
    messageId: sendResult.messageId,
    providerMessageId: sendResult.providerMessageId,
    revisionId: revision.revision_id,
    revisionNumber: revision.revision_number ?? null,
  };
}
