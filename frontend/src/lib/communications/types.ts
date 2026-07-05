import type {
  DatabaseCommunicationConversationStatus,
  DatabaseCommunicationDirection,
  DatabaseCommunicationSenderRole,
  DatabaseCommunicationSourceType,
  DatabaseCommunicationTimelineEventType,
} from "@/lib/supabase/types";

export type CommunicationSourceType = DatabaseCommunicationSourceType;
export type CommunicationConversationStatus =
  DatabaseCommunicationConversationStatus;
export type CommunicationDirection = DatabaseCommunicationDirection;
export type CommunicationSenderRole = DatabaseCommunicationSenderRole;
export type CommunicationTimelineEventType =
  DatabaseCommunicationTimelineEventType;

export type CommunicationCustomerSignal = {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  applianceType?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
};

export type CommunicationCustomerMatch = {
  customerId: string;
  displayName: string;
  matchReasons: string[];
  openJobsCount: number;
  appliancesCount: number;
  score: number;
};

export type CommunicationRecognitionResult = {
  status: "matched" | "possible_match" | "new_customer";
  bestMatch: CommunicationCustomerMatch | null;
  matches: CommunicationCustomerMatch[];
};

export type CommunicationTimelineEvent = {
  id: string;
  type: CommunicationTimelineEventType;
  title: string;
  body: string | null;
  eventTime: string;
  serviceRequestId: string | null;
  appointmentId: string | null;
  estimateId: string | null;
  invoiceId: string | null;
};

export type CommunicationConversation = {
  id: string;
  sourceType: CommunicationSourceType;
  status: CommunicationConversationStatus;
  providerName: string | null;
  customerDisplayName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceAddress: string | null;
  summary: string | null;
  nextAction: string | null;
  lastEventAt: string | null;
  callStartedAt: string | null;
  callEndedAt: string | null;
  linkedIntakeRequestId: string | null;
  linkedServiceRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationProviderEnvelope = {
  sourceType: CommunicationSourceType;
  sourceName?: string | null;
  externalConversationId?: string | null;
  externalMessageId?: string | null;
  direction: CommunicationDirection;
  customer: CommunicationCustomerSignal;
  messageBody?: string | null;
  transcriptText?: string | null;
  occurredAt?: string | null;
  rawPayload?: Record<string, unknown>;
};

export type CommunicationProviderAdapter = {
  providerName: string;
  isConfigured: boolean;
  normalizeInbound(payload: unknown): CommunicationProviderEnvelope | null;
};
