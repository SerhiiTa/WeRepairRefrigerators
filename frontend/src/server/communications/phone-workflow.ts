import { normalizeIntakeWritePayload } from "@/server/intake/intake-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

import { getPhoneProviderAdapter } from "./provider-adapters";
import {
  normalizePhoneNumber,
  type NormalizedPhoneWorkflow,
  type PhoneWorkflowProvider,
} from "./phone-normalization";

export type PhoneWorkflowIngestionResult = {
  ok: boolean;
  accepted: boolean;
  provider: PhoneWorkflowProvider;
  reason?: string;
  conversationId?: string;
  intakeRequestId?: string | null;
  customerId?: string | null;
  customerRecognitionStatus?: "matched" | "new_customer";
  timelineEventsCreated?: number;
  transcriptCreated?: boolean;
  jobCreated: boolean;
  appointmentCreated: boolean;
  smsConfirmationPrepared: boolean;
};

type SourceAccountRow = {
  id: string;
  company_id: string;
  provider_name: string;
  source_identifier: string;
  display_name: string | null;
};

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type SupabaseErrorMetadata = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logSupabasePhoneIngestionError(
  table: string,
  operation: string,
  error: SupabaseErrorMetadata,
) {
  console.error("[communications-phone-ingestion-supabase-error]", {
    table,
    operation,
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function splitName(name: string | null): {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
} {
  if (!name) {
    return { firstName: null, lastName: null, fullName: null };
  }

  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    fullName: name,
  };
}

function safeJsonObject(value: Record<string, unknown>): Record<string, Json> {
  return JSON.parse(JSON.stringify(value)) as Record<string, Json>;
}

function buildPhoneIntakeInsertPayload(
  normalizedPayload: Record<string, Json>,
): Record<string, Json> {
  // `duplicate_confirmed` is an RPC control flag, not an intake_requests column.
  // The RPC maps it onto duplicate_confirmed_at/by; direct service-role inserts
  // must not send it to PostgREST.
  const insertPayload = { ...normalizedPayload };
  delete insertPayload.duplicate_confirmed;

  return insertPayload;
}

function phoneVariants(phone: string | null): string[] {
  if (!phone) {
    return [];
  }

  return Array.from(
    new Set([
      phone,
      `1${phone}`,
      `+1${phone}`,
      `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`,
      `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`,
    ]),
  );
}

async function findSourceAccount(
  provider: PhoneWorkflowProvider,
  normalized: NormalizedPhoneWorkflow,
): Promise<{ account: SourceAccountRow | null; reason?: string }> {
  const supabase = getSupabaseServiceRoleClient();

  if (!supabase) {
    return { account: null, reason: "Server Supabase service client is not configured." };
  }

  const identifiers = phoneVariants(normalized.toPhone);

  if (identifiers.length === 0) {
    return { account: null, reason: "Incoming call is missing a destination phone number." };
  }

  const { data, error } = await supabase
    .from("communication_source_accounts")
    .select("id,company_id,provider_name,source_identifier,display_name")
    .eq("source_type", "phone")
    .eq("is_active", true)
    .in("source_identifier", identifiers)
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabasePhoneIngestionError(
      "communication_source_accounts",
      "select_source_account",
      error,
    );
    return { account: null, reason: error.message };
  }

  const row = data as SourceAccountRow | null;

  if (!row) {
    return {
      account: null,
      reason:
        "No active WRA phone source account is mapped to this destination number.",
    };
  }

  return { account: row };
}

async function findExistingCustomer(
  normalized: NormalizedPhoneWorkflow,
): Promise<CustomerRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const phone = normalizePhoneNumber(normalized.fromPhone);
  const email = normalized.customerEmail?.toLowerCase() ?? null;

  if (phone) {
    const { data } = await supabase
      .from("customers")
      .select("id,first_name,last_name,full_name,phone,email")
      .in("phone", phoneVariants(phone))
      .limit(1)
      .maybeSingle();

    if (data) {
      return data as CustomerRow;
    }
  }

  if (email) {
    const { data } = await supabase
      .from("customers")
      .select("id,first_name,last_name,full_name,phone,email")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (data) {
      return data as CustomerRow;
    }
  }

  return null;
}

async function createPhoneIntake(
  normalized: NormalizedPhoneWorkflow,
  sourceAccount: SourceAccountRow,
  customer: CustomerRow | null,
): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const name = splitName(normalized.customerName ?? customer?.full_name ?? null);
  const intakePayload = buildPhoneIntakeInsertPayload(normalizeIntakeWritePayload({
    sourceType: normalized.provider === "retell" ? "retell_ai" : "phone",
    sourceName: `${normalized.provider} phone call`,
    sourceIdentifier: normalized.externalConversationId ?? normalized.fromPhone,
    customerFirstName: name.firstName,
    customerLastName: name.lastName,
    customerName: name.fullName,
    customerPhone: normalized.fromPhone,
    customerEmail: normalized.customerEmail ?? customer?.email,
    serviceAddress: normalized.serviceAddress,
    zipCode: normalized.zipCode,
    applianceType: normalized.applianceType,
    brand: normalized.brand,
    modelNumber: normalized.modelNumber,
    problemDescription: normalized.issueDescription ?? normalized.summary,
    preferredAppointmentWindow: normalized.preferredAppointmentWindow,
    appointmentDate: normalized.appointmentDate,
    windowStartTime: normalized.windowStartTime,
    windowEndTime: normalized.windowEndTime,
    transcript: normalized.transcriptText,
    rawMessage: normalized.summary,
    rawPayload: {
      provider: normalized.provider,
      external_conversation_id: normalized.externalConversationId,
      source_account_id: sourceAccount.id,
      payload_shape: normalized.providerMetadata.payload_shape,
      booking_status: normalized.bookingStatus,
    },
    extractedData: {
      conversation_source: "phone_workflow",
      provider: normalized.provider,
      booking_status: normalized.bookingStatus,
    },
    status: customer ? "customer_matched" : "new",
  }));

  const { data, error } = await supabase
    .from("intake_requests")
    .insert({
      ...intakePayload,
      company_id: sourceAccount.company_id,
      linked_customer_id: customer?.id ?? null,
      created_by: null,
      updated_by: null,
    })
    .select("id")
    .single();

  if (error) {
    logSupabasePhoneIngestionError(
      "intake_requests",
      "insert_phone_intake",
      error,
    );
    throw new Error(`Phone intake creation failed: ${error.message}`);
  }

  return typeof data?.id === "string" ? data.id : null;
}

export async function ingestPhoneCommunication(
  provider: PhoneWorkflowProvider,
  payload: unknown,
): Promise<PhoneWorkflowIngestionResult> {
  const supabase = getSupabaseServiceRoleClient();
  const normalized = getPhoneProviderAdapter(provider).normalizePhonePayload(payload);

  if (!supabase) {
    return {
      ok: false,
      accepted: false,
      provider,
      reason: "Server Supabase service client is not configured.",
      jobCreated: false,
      appointmentCreated: false,
      smsConfirmationPrepared: false,
    };
  }

  const sourceAccountResult = await findSourceAccount(provider, normalized);
  const sourceAccount = sourceAccountResult.account;

  if (!sourceAccount) {
    return {
      ok: false,
      accepted: false,
      provider,
      reason: sourceAccountResult.reason,
      jobCreated: false,
      appointmentCreated: false,
      smsConfirmationPrepared: false,
    };
  }

  const customer = await findExistingCustomer(normalized);
  const customerDisplayName =
    customer?.full_name ?? normalized.customerName ?? normalized.fromPhone ?? "Phone customer";

  const existingConversationResult = normalized.externalConversationId
    ? await supabase
        .from("communication_conversations")
        .select("id,intake_request_id")
        .eq("provider_name", provider)
        .eq("external_conversation_id", normalized.externalConversationId)
        .maybeSingle()
    : { data: null };

  if ("error" in existingConversationResult && existingConversationResult.error) {
    logSupabasePhoneIngestionError(
      "communication_conversations",
      "select_existing_conversation",
      existingConversationResult.error,
    );
    throw new Error(
      `Phone conversation lookup failed: ${existingConversationResult.error.message}`,
    );
  }

  const existingConversation = existingConversationResult.data;

  let conversationId =
    typeof existingConversation?.id === "string" ? existingConversation.id : null;
  let intakeRequestId =
    typeof existingConversation?.intake_request_id === "string"
      ? existingConversation.intake_request_id
      : null;

  if (!conversationId) {
    const { data, error } = await supabase
      .from("communication_conversations")
      .insert({
        company_id: sourceAccount.company_id,
        source_account_id: sourceAccount.id,
        provider_name: provider,
        external_conversation_id: normalized.externalConversationId,
        primary_source_type: "phone",
        status: "needs_action",
        customer_id: customer?.id ?? null,
        customer_display_name: customerDisplayName,
        customer_phone: normalized.fromPhone,
        customer_email: normalized.customerEmail ?? customer?.email ?? null,
        service_address: normalized.serviceAddress,
        summary: normalized.summary,
        next_action: normalized.nextAction,
        last_event_at: normalized.occurredAt,
        call_status: normalized.callStatus,
        call_started_at: normalized.callStartedAt,
        call_ended_at: normalized.callEndedAt,
        provider_metadata: normalized.providerMetadata,
      })
      .select("id")
      .single();

    if (error) {
      logSupabasePhoneIngestionError(
        "communication_conversations",
        "insert_conversation",
        error,
      );
      throw new Error(`Phone conversation creation failed: ${error.message}`);
    }

    conversationId = data.id;
  } else {
    const { error } = await supabase
      .from("communication_conversations")
      .update({
        customer_id: customer?.id ?? null,
        customer_display_name: customerDisplayName,
        customer_phone: normalized.fromPhone,
        customer_email: normalized.customerEmail ?? customer?.email ?? null,
        service_address: normalized.serviceAddress,
        summary: normalized.summary,
        next_action: normalized.nextAction,
        last_event_at: normalized.occurredAt,
        call_status: normalized.callStatus,
        call_started_at: normalized.callStartedAt,
        call_ended_at: normalized.callEndedAt,
        provider_metadata: normalized.providerMetadata,
      })
      .eq("id", conversationId);

    if (error) {
      logSupabasePhoneIngestionError(
        "communication_conversations",
        "update_existing_conversation",
        error,
      );
      throw new Error(`Phone conversation update failed: ${error.message}`);
    }
  }

  if (!intakeRequestId) {
    intakeRequestId = await createPhoneIntake(normalized, sourceAccount, customer);
  }

  const { data: existingTranscript, error: existingTranscriptError } = await supabase
    .from("communication_transcripts")
    .select("id")
    .eq("conversation_id", conversationId)
    .limit(1)
    .maybeSingle();

  if (existingTranscriptError) {
    logSupabasePhoneIngestionError(
      "communication_transcripts",
      "select_existing_transcript",
      existingTranscriptError,
    );
    throw new Error(
      `Phone transcript lookup failed: ${existingTranscriptError.message}`,
    );
  }

  if (
    (normalized.transcriptText || normalized.transcriptSegments.length > 0) &&
    !existingTranscript
  ) {
    const { error } = await supabase.from("communication_transcripts").insert({
      conversation_id: conversationId,
      source_type: "phone",
      transcript_text: normalized.transcriptText,
      speaker_segments: safeJsonObject({
        segments: normalized.transcriptSegments,
      }).segments,
      started_at: normalized.callStartedAt,
      ended_at: normalized.callEndedAt,
    });

    if (error) {
      logSupabasePhoneIngestionError(
        "communication_transcripts",
        "insert_transcript",
        error,
      );
      throw new Error(`Phone transcript creation failed: ${error.message}`);
    }
  }

  const existingMessageResult = normalized.externalMessageId
    ? await supabase
        .from("communication_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("external_message_id", normalized.externalMessageId)
        .limit(1)
        .maybeSingle()
    : await supabase
        .from("communication_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("source_type", "phone")
        .limit(1)
        .maybeSingle();

  if (existingMessageResult.error) {
    logSupabasePhoneIngestionError(
      "communication_messages",
      "select_existing_message",
      existingMessageResult.error,
    );
    throw new Error(
      `Phone message lookup failed: ${existingMessageResult.error.message}`,
    );
  }

  const existingMessage = existingMessageResult.data;

  if ((normalized.summary || normalized.transcriptText) && !existingMessage) {
    const { error } = await supabase.from("communication_messages").insert({
      conversation_id: conversationId,
      source_type: "phone",
      direction: "inbound",
      sender_role: "customer",
      sender_display_name: customerDisplayName,
      body: normalized.summary ?? normalized.transcriptText,
      external_message_id: normalized.externalMessageId,
      occurred_at: normalized.occurredAt,
    });

    if (error) {
      logSupabasePhoneIngestionError(
        "communication_messages",
        "insert_message",
        error,
      );
      throw new Error(`Phone message creation failed: ${error.message}`);
    }
  }

  const { data: existingTimelineEvent, error: existingTimelineEventError } = await supabase
    .from("communication_timeline_events")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("event_type", "incoming_call")
    .limit(1)
    .maybeSingle();

  if (existingTimelineEventError) {
    logSupabasePhoneIngestionError(
      "communication_timeline_events",
      "select_existing_timeline_event",
      existingTimelineEventError,
    );
    throw new Error(
      `Phone timeline lookup failed: ${existingTimelineEventError.message}`,
    );
  }

  if (!existingTimelineEvent) {
    const { error } = await supabase.from("communication_timeline_events").insert({
      conversation_id: conversationId,
      event_type: "incoming_call",
      title: "Incoming call",
      body: normalized.summary,
      event_time: normalized.occurredAt,
      intake_request_id: intakeRequestId,
    });

    if (error) {
      logSupabasePhoneIngestionError(
        "communication_timeline_events",
        "insert_timeline_event",
        error,
      );
      throw new Error(`Phone timeline creation failed: ${error.message}`);
    }
  }

  const { error: conversationUpdateError } = await supabase
    .from("communication_conversations")
    .update({
      intake_request_id: intakeRequestId,
      customer_id: customer?.id ?? null,
      status: normalized.bookingStatus === "complete" ? "linked" : "needs_action",
      updated_by: null,
      last_event_at: normalized.occurredAt,
    })
    .eq("id", conversationId);

  if (conversationUpdateError) {
    logSupabasePhoneIngestionError(
      "communication_conversations",
      "update_conversation_links",
      conversationUpdateError,
    );
    throw new Error(
      `Phone conversation update failed: ${conversationUpdateError.message}`,
    );
  }

  return {
    ok: true,
    accepted: true,
    provider,
    conversationId,
    intakeRequestId,
    customerId: customer?.id ?? null,
    customerRecognitionStatus: customer ? "matched" : "new_customer",
    timelineEventsCreated: existingTimelineEvent ? 0 : 1,
    transcriptCreated:
      !existingTranscript &&
      (Boolean(normalized.transcriptText) || normalized.transcriptSegments.length > 0),
    jobCreated: false,
    appointmentCreated: false,
    smsConfirmationPrepared: normalized.bookingStatus === "complete",
  };
}
