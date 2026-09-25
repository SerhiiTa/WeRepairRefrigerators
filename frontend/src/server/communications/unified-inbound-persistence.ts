import type { UnifiedInboundEvent } from "@/lib/communications/unified-inbound-event";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  DatabaseCommunicationSourceType,
  DatabaseIntakeSourceType,
  Json,
  PublicSchema,
} from "@/lib/supabase/types";
import type { UnifiedIntakeGatewayAcceptedResult } from "@/server/communications/unified-intake-gateway";

export type PersistUnifiedInboundEventResult = {
  ok: true;
  created: boolean;
  duplicate: boolean;
  intakeRequestId: string;
  conversationId: string | null;
  messageId: string | null;
  timelineEventId: string | null;
};

type IntakeInsertResult = {
  id: string;
  created: boolean;
  duplicate: boolean;
};

type ConversationResult = {
  id: string;
  created: boolean;
};

type CommunicationConversationUpdate =
  PublicSchema["Tables"]["communication_conversations"]["Update"];

type ExistingCustomerMatch = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type InboundCustomerResolverClient = {
  rpc: (
    functionName: "resolve_existing_customer_for_inbound_rpc",
    args: {
      p_company_id: string;
      p_phone?: string | null;
      p_email?: string | null;
    },
  ) => Promise<{
    data: ExistingCustomerMatch[] | null;
    error: { code?: string; message: string } | null;
  }>;
};

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function jsonRecord(value: unknown): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, Json>;
}

function toIntakeSourceType(event: UnifiedInboundEvent): DatabaseIntakeSourceType {
  return event.channel === "website_form" ? "website_form" : "other";
}

function toCommunicationSourceType(
  event: UnifiedInboundEvent,
): DatabaseCommunicationSourceType {
  return event.channel === "website_form" ? "website_form" : "other";
}

function summarizeEvent(event: UnifiedInboundEvent): string | null {
  return (
    nullableText(event.message?.summary) ??
    nullableText(event.message?.body) ??
    nullableText(event.requestedService?.problemDescription) ??
    null
  );
}

function buildRawPayload(event: UnifiedInboundEvent): Record<string, Json> {
  return {
    channel: event.channel,
    event_type: event.eventType,
    direction: event.direction ?? "inbound",
    provider_name: event.providerName ?? null,
    provider_event_id: event.providerEventId ?? null,
    provider_lead_id: event.providerLeadId ?? null,
    external_conversation_id: event.externalConversationId ?? null,
    external_message_id: event.externalMessageId ?? null,
    source: jsonRecord(event.source),
    attribution: jsonRecord(event.attribution),
    requested_appointment: jsonRecord(event.requestedAppointment),
    provider_metadata: jsonRecord(event.providerMetadata),
  };
}

function buildExtractedData(event: UnifiedInboundEvent): Record<string, Json> {
  return {
    normalized_event: {
      channel: event.channel,
      event_type: event.eventType,
      occurred_at: event.occurredAt,
    },
    customer: jsonRecord(event.customer),
    service_address: jsonRecord(event.serviceAddress),
    requested_service: jsonRecord(event.requestedService),
    requested_appointment: jsonRecord(event.requestedAppointment),
  };
}

async function resolveExistingCustomerForIntake(
  gateway: UnifiedIntakeGatewayAcceptedResult,
  intakeRequestId: string,
): Promise<ExistingCustomerMatch | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    throw new Error("Server Supabase service client is not configured.");
  }

  const event = gateway.event;
  if (!event.customer?.phone && !event.customer?.email) {
    return null;
  }

  const { data, error } = await (supabase as unknown as InboundCustomerResolverClient).rpc(
    "resolve_existing_customer_for_inbound_rpc",
    {
      p_company_id: gateway.companyId,
      p_phone: event.customer?.phone ?? null,
      p_email: event.customer?.email ?? null,
    },
  );

  if (error) {
    console.warn("Unified inbound customer resolver failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Inbound customer lookup failed.");
  }

  const customer = data?.[0] ?? null;
  if (!customer) {
    return null;
  }

  const { error: updateError } = await supabase
    .from("intake_requests")
    .update({
      linked_customer_id: customer.id,
      status: "customer_matched",
      updated_by: null,
    })
    .eq("id", intakeRequestId)
    .eq("company_id", gateway.companyId)
    .is("linked_customer_id", null);

  if (updateError) {
    console.warn("Unified inbound intake customer link update failed", {
      code: updateError.code,
      message: updateError.message,
    });
    throw new Error("Inbound intake customer update failed.");
  }

  return customer;
}

function idempotencyFilters(gateway: UnifiedIntakeGatewayAcceptedResult):
  | { providerEventId: string }
  | { providerLeadId: string }
  | null {
  if (gateway.idempotency.providerEventId) {
    return { providerEventId: gateway.idempotency.providerEventId };
  }
  if (gateway.idempotency.providerLeadId) {
    return { providerLeadId: gateway.idempotency.providerLeadId };
  }
  return null;
}

async function findExistingIntake(
  gateway: UnifiedIntakeGatewayAcceptedResult,
): Promise<string | null> {
  const filters = idempotencyFilters(gateway);
  if (!filters || !gateway.source.inboundSourceId) {
    return null;
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    throw new Error("Server Supabase service client is not configured.");
  }

  let query = supabase
    .from("intake_requests")
    .select("id")
    .eq("company_id", gateway.companyId)
    .eq("inbound_source_id", gateway.source.inboundSourceId)
    .limit(1);

  if ("providerEventId" in filters) {
    query = query.eq("provider_event_id", filters.providerEventId);
  } else {
    query = query.eq("provider_lead_id", filters.providerLeadId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.warn("Unified inbound intake idempotency lookup failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Inbound persistence lookup failed.");
  }

  return typeof data?.id === "string" ? data.id : null;
}

async function createOrReuseIntake(
  gateway: UnifiedIntakeGatewayAcceptedResult,
): Promise<IntakeInsertResult> {
  const existingIntakeId = await findExistingIntake(gateway);
  if (existingIntakeId) {
    return { id: existingIntakeId, created: false, duplicate: true };
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    throw new Error("Server Supabase service client is not configured.");
  }

  const event = gateway.event;
  const { data, error } = await supabase
    .from("intake_requests")
    .insert({
      company_id: gateway.companyId,
      source_type: toIntakeSourceType(event),
      source_name: event.source?.sourceName ?? gateway.source.inboundSource?.source_name ?? null,
      source_identifier:
        event.source?.sourceKey ?? gateway.source.inboundSource?.source_key ?? null,
      customer_first_name: event.customer?.firstName ?? null,
      customer_last_name: event.customer?.lastName ?? null,
      customer_name: event.customer?.name ?? null,
      customer_phone: event.customer?.phone ?? null,
      customer_email: event.customer?.email ?? null,
      service_address: event.serviceAddress?.formatted ?? null,
      unit: event.serviceAddress?.unit ?? null,
      city: event.serviceAddress?.city ?? null,
      state: event.serviceAddress?.state ?? "TX",
      zip_code: event.serviceAddress?.postalCode ?? null,
      country: event.serviceAddress?.country ?? "US",
      latitude: event.serviceAddress?.latitude ?? null,
      longitude: event.serviceAddress?.longitude ?? null,
      place_id: event.serviceAddress?.placeId ?? null,
      appliance_type: event.requestedService?.applianceType ?? null,
      brand: event.requestedService?.brand ?? null,
      model_number: event.requestedService?.modelNumber ?? null,
      serial_number: event.requestedService?.serialNumber ?? null,
      problem_description: event.requestedService?.problemDescription ?? null,
      preferred_appointment_window:
        event.requestedAppointment?.preferredWindow ?? null,
      appointment_date: event.requestedAppointment?.date ?? null,
      window_start_time: event.requestedAppointment?.windowStartTime ?? null,
      window_end_time: event.requestedAppointment?.windowEndTime ?? null,
      raw_message: event.message?.body ?? event.message?.summary ?? null,
      transcript: event.transcript?.text ?? null,
      raw_payload: buildRawPayload(event),
      extracted_data: buildExtractedData(event),
      status: "new",
      inbound_source_id: gateway.source.inboundSourceId,
      source_account_id: gateway.source.sourceAccountId,
      provider_lead_id: gateway.idempotency.providerLeadId,
      provider_event_id: gateway.idempotency.providerEventId,
      attribution: event.attribution ?? {},
      created_by: null,
      updated_by: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicateIntakeId = await findExistingIntake(gateway);
      if (duplicateIntakeId) {
        return { id: duplicateIntakeId, created: false, duplicate: true };
      }
    }

    console.warn("Unified inbound intake insert failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Inbound intake persistence failed.");
  }

  return { id: data.id, created: true, duplicate: false };
}

async function createOrReuseConversation(
  gateway: UnifiedIntakeGatewayAcceptedResult,
  intakeRequestId: string,
  customer: ExistingCustomerMatch | null,
): Promise<ConversationResult | null> {
  const event = gateway.event;
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    throw new Error("Server Supabase service client is not configured.");
  }

  const externalConversationId =
    nullableText(event.externalConversationId) ?? gateway.idempotency.providerEventId;

  if (externalConversationId && gateway.source.inboundSourceId) {
    const { data: existing, error: lookupError } = await supabase
      .from("communication_conversations")
      .select("id,intake_request_id,customer_id")
      .eq("company_id", gateway.companyId)
      .eq("inbound_source_id", gateway.source.inboundSourceId)
      .eq("external_conversation_id", externalConversationId)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.warn("Unified inbound conversation lookup failed", {
        code: lookupError.code,
        message: lookupError.message,
      });
      throw new Error("Inbound conversation lookup failed.");
    }

    if (existing?.id) {
      const updates: CommunicationConversationUpdate = {};
      if (!existing.intake_request_id) {
        updates.intake_request_id = intakeRequestId;
      }
      if (!existing.customer_id && customer?.id) {
        updates.customer_id = customer.id;
        updates.customer_display_name = customer.full_name;
        updates.customer_phone = customer.phone ?? event.customer?.phone ?? null;
        updates.customer_email = customer.email ?? event.customer?.email ?? null;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("communication_conversations")
          .update(updates)
          .eq("id", existing.id);

        if (updateError) {
          console.warn("Unified inbound conversation link update failed", {
            code: updateError.code,
            message: updateError.message,
          });
          throw new Error("Inbound conversation update failed.");
        }
      }

      return { id: existing.id, created: false };
    }
  }

  const summary = summarizeEvent(event);
  const { data, error } = await supabase
    .from("communication_conversations")
    .insert({
      company_id: gateway.companyId,
      source_account_id: gateway.source.sourceAccountId,
      provider_name: event.providerName ?? null,
      external_conversation_id: externalConversationId,
      primary_source_type: toCommunicationSourceType(event),
      status: "needs_action",
      intake_request_id: intakeRequestId,
      customer_id: customer?.id ?? null,
      customer_display_name: customer?.full_name ?? event.customer?.name ?? null,
      customer_phone: customer?.phone ?? event.customer?.phone ?? null,
      customer_email: customer?.email ?? event.customer?.email ?? null,
      service_address: event.serviceAddress?.formatted ?? null,
      summary,
      next_action: "Review inbound request",
      last_event_at: event.occurredAt,
      provider_metadata: event.providerMetadata ?? {},
      inbound_source_id: gateway.source.inboundSourceId,
      attribution: event.attribution ?? {},
      created_by: null,
      updated_by: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && externalConversationId && gateway.source.inboundSourceId) {
      const { data: existing, error: duplicateLookupError } = await supabase
        .from("communication_conversations")
        .select("id,intake_request_id,customer_id")
        .eq("company_id", gateway.companyId)
        .eq("inbound_source_id", gateway.source.inboundSourceId)
        .eq("external_conversation_id", externalConversationId)
        .limit(1)
        .maybeSingle();

      if (!duplicateLookupError && existing?.id) {
        const updates: CommunicationConversationUpdate = {};
        if (!existing.intake_request_id) {
          updates.intake_request_id = intakeRequestId;
        }
        if (!existing.customer_id && customer?.id) {
          updates.customer_id = customer.id;
          updates.customer_display_name = customer.full_name;
          updates.customer_phone = customer.phone ?? event.customer?.phone ?? null;
          updates.customer_email = customer.email ?? event.customer?.email ?? null;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from("communication_conversations")
            .update(updates)
            .eq("id", existing.id)
            .is(existing.intake_request_id ? "customer_id" : "intake_request_id", null);

          if (updateError) {
            console.warn("Unified inbound duplicate conversation link update failed", {
              code: updateError.code,
              message: updateError.message,
            });
            throw new Error("Inbound conversation update failed.");
          }
        }

        return { id: existing.id, created: false };
      }
    }

    console.warn("Unified inbound conversation insert failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Inbound conversation persistence failed.");
  }

  return { id: data.id, created: true };
}

async function createMessageIfMissing(
  gateway: UnifiedIntakeGatewayAcceptedResult,
  conversationId: string,
): Promise<string | null> {
  const event = gateway.event;
  const body = summarizeEvent(event);
  if (!body) {
    return null;
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    throw new Error("Server Supabase service client is not configured.");
  }

  const messageIdentity =
    nullableText(event.externalMessageId) ??
    gateway.idempotency.providerEventId ??
    gateway.idempotency.providerLeadId;

  if (messageIdentity) {
    const { data: existing, error: lookupError } = await supabase
      .from("communication_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("external_message_id", messageIdentity)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.warn("Unified inbound message lookup failed", {
        code: lookupError.code,
        message: lookupError.message,
      });
      throw new Error("Inbound message lookup failed.");
    }

    if (existing?.id) {
      return existing.id;
    }
  }

  const { data, error } = await supabase
    .from("communication_messages")
    .insert({
      conversation_id: conversationId,
      source_type: toCommunicationSourceType(event),
      direction: "inbound",
      sender_role: "customer",
      sender_display_name: event.customer?.name ?? null,
      body,
      external_message_id: messageIdentity,
      occurred_at: event.occurredAt,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && messageIdentity) {
      const { data: existing, error: duplicateLookupError } = await supabase
        .from("communication_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("external_message_id", messageIdentity)
        .limit(1)
        .maybeSingle();

      if (!duplicateLookupError && existing?.id) {
        return existing.id;
      }
    }

    console.warn("Unified inbound message insert failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Inbound message persistence failed.");
  }

  return data.id;
}

async function createTimelineEvent(
  gateway: UnifiedIntakeGatewayAcceptedResult,
  conversationId: string,
  intakeRequestId: string,
): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    throw new Error("Server Supabase service client is not configured.");
  }

  const { data: existing, error: lookupError } = await supabase
    .from("communication_timeline_events")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("event_type", "website_request")
    .eq("intake_request_id", intakeRequestId)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.warn("Unified inbound timeline lookup failed", {
      code: lookupError.code,
      message: lookupError.message,
    });
    throw new Error("Inbound timeline lookup failed.");
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("communication_timeline_events")
    .insert({
      conversation_id: conversationId,
      event_type: "website_request",
      title: "Website request",
      body: summarizeEvent(gateway.event),
      event_time: gateway.event.occurredAt,
      intake_request_id: intakeRequestId,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("Unified inbound timeline insert failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Inbound timeline persistence failed.");
  }

  return data.id;
}

export async function persistUnifiedInboundEvent(
  gateway: UnifiedIntakeGatewayAcceptedResult,
): Promise<PersistUnifiedInboundEventResult> {
  const intake = await createOrReuseIntake(gateway);
  const customer = await resolveExistingCustomerForIntake(gateway, intake.id);
  const conversation = await createOrReuseConversation(gateway, intake.id, customer);
  const messageId = conversation
    ? await createMessageIfMissing(gateway, conversation.id)
    : null;
  const timelineEventId = conversation
    ? await createTimelineEvent(gateway, conversation.id, intake.id)
    : null;

  return {
    ok: true,
    created: intake.created,
    duplicate: intake.duplicate,
    intakeRequestId: intake.id,
    conversationId: conversation?.id ?? null,
    messageId,
    timelineEventId,
  };
}
