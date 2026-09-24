import {
  validateUnifiedInboundEventIdentity,
  type UnifiedInboundAttribution,
  type UnifiedInboundEvent,
} from "@/lib/communications/unified-inbound-event";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  DatabaseCommunicationSourceType,
  DatabaseInboundSourceChannel,
  Json,
} from "@/lib/supabase/types";

export type UnifiedIntakeGatewayRejectionCode =
  | "invalid_event"
  | "unresolved_company"
  | "source_not_found"
  | "inactive_source"
  | "source_lookup_failed"
  | "source_company_mismatch"
  | "source_account_not_found"
  | "inactive_source_account"
  | "source_account_lookup_failed"
  | "source_account_company_mismatch"
  | "conflicting_source_identity";

export type UnifiedIntakeGatewayRoute =
  | "communication_event"
  | "intake_producing_event"
  | "trusted_booking_candidate";

type InboundSourceRow = {
  id: string;
  company_id: string;
  source_key: string;
  channel: DatabaseInboundSourceChannel;
  source_name: string;
  provider_name: string | null;
  communication_source_account_id: string | null;
  is_active: boolean;
  metadata: Json;
};

type CommunicationSourceAccountRow = {
  id: string;
  company_id: string;
  source_type: DatabaseCommunicationSourceType;
  provider_name: "telnyx" | "retell" | "email" | "website" | "manual" | "other";
  source_identifier: string;
  display_name: string | null;
  is_active: boolean;
  metadata: Json;
};

export type UnifiedIntakeSourceContext = {
  companyId: string;
  inboundSourceId: string | null;
  sourceAccountId: string | null;
  inboundSource: InboundSourceRow | null;
  sourceAccount: CommunicationSourceAccountRow | null;
  attribution: UnifiedInboundAttribution | undefined;
};

export type UnifiedIntakeIdempotencyContext = {
  providerName: string | null;
  providerEventId: string | null;
  providerLeadId: string | null;
  externalConversationId: string | null;
  externalMessageId: string | null;
  existingLookupHints: {
    intakeByProviderEventId: boolean;
    intakeByProviderLeadId: boolean;
    conversationByExternalConversationId: boolean;
    messageByExternalMessageId: boolean;
  };
};

export type UnifiedIntakeRouteDecision = {
  route: UnifiedIntakeGatewayRoute;
  shouldCreateOrReuseConversation: boolean;
  shouldCreateIntakeForReview: boolean;
  shouldCreateJobDirectly: false;
  shouldCreateAppointmentDirectly: false;
  reason: string;
};

export type UnifiedIntakeGatewayAcceptedResult = {
  ok: true;
  accepted: true;
  companyId: string;
  source: UnifiedIntakeSourceContext;
  idempotency: UnifiedIntakeIdempotencyContext;
  route: UnifiedIntakeRouteDecision;
  event: UnifiedInboundEvent;
};

export type UnifiedIntakeGatewayRejectedResult = {
  ok: false;
  accepted: false;
  code: UnifiedIntakeGatewayRejectionCode;
  reason: string;
  event: UnifiedInboundEvent;
};

export type UnifiedIntakeGatewayResult =
  | UnifiedIntakeGatewayAcceptedResult
  | UnifiedIntakeGatewayRejectedResult;

function rejectUnifiedInboundEvent(
  event: UnifiedInboundEvent,
  code: UnifiedIntakeGatewayRejectionCode,
  reason: string,
): UnifiedIntakeGatewayRejectedResult {
  return {
    ok: false,
    accepted: false,
    code,
    reason,
    event,
  };
}

function nullableText(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

export function buildUnifiedInboundIdempotencyContext(
  event: UnifiedInboundEvent,
): UnifiedIntakeIdempotencyContext {
  const providerEventId = nullableText(event.providerEventId);
  const providerLeadId = nullableText(event.providerLeadId);
  const externalConversationId = nullableText(event.externalConversationId);
  const externalMessageId = nullableText(event.externalMessageId);

  return {
    providerName: nullableText(event.providerName),
    providerEventId,
    providerLeadId,
    externalConversationId,
    externalMessageId,
    existingLookupHints: {
      intakeByProviderEventId: Boolean(providerEventId),
      intakeByProviderLeadId: Boolean(providerLeadId),
      conversationByExternalConversationId: Boolean(externalConversationId),
      messageByExternalMessageId: Boolean(externalMessageId),
    },
  };
}

export function decideUnifiedInboundRoute(
  event: UnifiedInboundEvent,
  source: UnifiedIntakeSourceContext,
): UnifiedIntakeRouteDecision {
  if (
    event.eventType === "booking_request" &&
    (event.channel === "booking_widget" ||
      source.inboundSource?.channel === "booking_widget" ||
      (event.channel === "website_form" &&
        source.inboundSource?.channel === "website_form"))
  ) {
    return {
      route: "trusted_booking_candidate",
      shouldCreateOrReuseConversation: Boolean(event.message || event.transcript),
      shouldCreateIntakeForReview: false,
      shouldCreateJobDirectly: false,
      shouldCreateAppointmentDirectly: false,
      reason:
        "Booking request came through a resolved booking source; later booking rules must validate before Job or Appointment creation.",
    };
  }

  if (
    event.channel === "phone" ||
    event.channel === "sms" ||
    event.channel === "email" ||
    event.channel === "social" ||
    event.eventType === "phone_call" ||
    event.eventType === "sms_message" ||
    event.eventType === "email_message" ||
    event.eventType === "social_message"
  ) {
    return {
      route: "communication_event",
      shouldCreateOrReuseConversation: true,
      shouldCreateIntakeForReview: Boolean(
        event.requestedService ||
          event.requestedAppointment ||
          event.serviceAddress ||
          event.message?.body ||
          event.transcript?.text,
      ),
      shouldCreateJobDirectly: false,
      shouldCreateAppointmentDirectly: false,
      reason:
        "Communication-like event should create or reuse conversation context before downstream Intake decisions.",
    };
  }

  return {
    route: "intake_producing_event",
    shouldCreateOrReuseConversation: Boolean(event.message || event.transcript),
    shouldCreateIntakeForReview: true,
    shouldCreateJobDirectly: false,
    shouldCreateAppointmentDirectly: false,
    reason:
      "Non-communication inbound event should enter Intake review unless later trusted booking rules allow direct booking.",
  };
}

async function fetchInboundSource(
  inboundSourceId: string,
): Promise<{
  row: InboundSourceRow | null;
  errorMessage: string | null;
}> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { row: null, errorMessage: "Server Supabase service client is not configured." };
  }

  const { data, error } = await supabase
    .from("inbound_sources")
    .select(
      "id,company_id,source_key,channel,source_name,provider_name,communication_source_account_id,is_active,metadata",
    )
    .eq("id", inboundSourceId)
    .maybeSingle();

  if (error) {
    return { row: null, errorMessage: error.message };
  }

  return { row: (data as InboundSourceRow | null) ?? null, errorMessage: null };
}

async function fetchSourceAccount(
  sourceAccountId: string,
): Promise<{
  row: CommunicationSourceAccountRow | null;
  errorMessage: string | null;
}> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return { row: null, errorMessage: "Server Supabase service client is not configured." };
  }

  const { data, error } = await supabase
    .from("communication_source_accounts")
    .select(
      "id,company_id,source_type,provider_name,source_identifier,display_name,is_active,metadata",
    )
    .eq("id", sourceAccountId)
    .maybeSingle();

  if (error) {
    return { row: null, errorMessage: error.message };
  }

  return {
    row: (data as CommunicationSourceAccountRow | null) ?? null,
    errorMessage: null,
  };
}

async function resolveUnifiedInboundSourceContext(
  event: UnifiedInboundEvent,
): Promise<
  | { ok: true; source: UnifiedIntakeSourceContext }
  | {
      ok: false;
      code: UnifiedIntakeGatewayRejectionCode;
      reason: string;
    }
> {
  const suppliedCompanyId = nullableText(event.source?.companyId);
  const suppliedInboundSourceId = nullableText(event.source?.inboundSourceId);
  const suppliedSourceAccountId = nullableText(event.source?.sourceAccountId);

  let inboundSource: InboundSourceRow | null = null;
  let sourceAccount: CommunicationSourceAccountRow | null = null;

  if (suppliedInboundSourceId) {
    const result = await fetchInboundSource(suppliedInboundSourceId);
    if (result.errorMessage) {
      return {
        ok: false,
        code: "source_lookup_failed",
        reason: "Unable to verify inbound source identity.",
      };
    }
    if (!result.row) {
      return {
        ok: false,
        code: "source_not_found",
        reason: "Inbound source was not found.",
      };
    }
    if (!result.row.is_active) {
      return {
        ok: false,
        code: "inactive_source",
        reason: "Inbound source is not active.",
      };
    }
    inboundSource = result.row;
  }

  const linkedAccountId = inboundSource?.communication_source_account_id ?? null;
  const sourceAccountIdToVerify = suppliedSourceAccountId ?? linkedAccountId;

  if (sourceAccountIdToVerify) {
    const result = await fetchSourceAccount(sourceAccountIdToVerify);
    if (result.errorMessage) {
      return {
        ok: false,
        code: "source_account_lookup_failed",
        reason: "Unable to verify communication source account identity.",
      };
    }
    if (!result.row) {
      return {
        ok: false,
        code: "source_account_not_found",
        reason: "Communication source account was not found.",
      };
    }
    if (!result.row.is_active) {
      return {
        ok: false,
        code: "inactive_source_account",
        reason: "Communication source account is not active.",
      };
    }
    sourceAccount = result.row;
  }

  if (
    linkedAccountId &&
    suppliedSourceAccountId &&
    linkedAccountId !== suppliedSourceAccountId
  ) {
    return {
      ok: false,
      code: "conflicting_source_identity",
      reason:
        "Inbound source is linked to a different communication source account.",
    };
  }

  const establishedCompanyId =
    inboundSource?.company_id ?? sourceAccount?.company_id ?? null;

  if (!establishedCompanyId) {
    return {
      ok: false,
      code: "unresolved_company",
      reason:
        "Unified inbound event must resolve company identity through an inbound source or communication source account.",
    };
  }

  if (suppliedCompanyId && suppliedCompanyId !== establishedCompanyId) {
    return {
      ok: false,
      code: "source_company_mismatch",
      reason:
        "Supplied company does not match the company established from source records.",
    };
  }

  if (
    inboundSource &&
    sourceAccount &&
    inboundSource.company_id !== sourceAccount.company_id
  ) {
    return {
      ok: false,
      code: "source_account_company_mismatch",
      reason:
        "Inbound source and communication source account belong to different companies.",
    };
  }

  return {
    ok: true,
    source: {
      companyId: establishedCompanyId,
      inboundSourceId: inboundSource?.id ?? null,
      sourceAccountId: sourceAccount?.id ?? null,
      inboundSource,
      sourceAccount,
      attribution: event.attribution,
    },
  };
}

export async function processUnifiedInboundEvent(
  event: UnifiedInboundEvent,
): Promise<UnifiedIntakeGatewayResult> {
  const validation = validateUnifiedInboundEventIdentity(event);
  if (!validation.ok) {
    return rejectUnifiedInboundEvent(event, "invalid_event", validation.reason);
  }

  const sourceResult = await resolveUnifiedInboundSourceContext(event);
  if (!sourceResult.ok) {
    return rejectUnifiedInboundEvent(
      event,
      sourceResult.code,
      sourceResult.reason,
    );
  }

  const idempotency = buildUnifiedInboundIdempotencyContext(event);
  const route = decideUnifiedInboundRoute(event, sourceResult.source);

  return {
    ok: true,
    accepted: true,
    companyId: sourceResult.source.companyId,
    source: sourceResult.source,
    idempotency,
    route,
    event,
  };
}
