"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BrowserCallModal } from "@/components/dashboard/DashboardCustomers";
import {
  filterBusinessTimelineEvents,
  getTimelineEventLabel,
  type CommunicationConversation,
  type CommunicationTimelineEvent,
} from "@/lib/communications";
import { formatServiceRequestDate } from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerRow,
  DatabaseCommunicationSourceType,
  DatabaseCommunicationTimelineEventType,
  IntakeRequestRow,
  Json,
  PublicSchema,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type MessageRow = PublicSchema["Tables"]["communication_messages"]["Row"];
type MessageAttachmentRow =
  PublicSchema["Tables"]["communication_message_attachments"]["Row"];
type CommunicationCallRow = PublicSchema["Tables"]["communication_calls"]["Row"];
type TranscriptRow = PublicSchema["Tables"]["communication_transcripts"]["Row"];
type CommunicationLeadRow = PublicSchema["Tables"]["communication_leads"]["Row"];
type SourceAccountRow = PublicSchema["Tables"]["communication_source_accounts"]["Row"];

type HubState =
  | { status: "loading"; conversations: HubConversation[]; error: null }
  | { status: "ready"; conversations: HubConversation[]; error: null }
  | { status: "error"; conversations: HubConversation[]; error: string };

type DetailState =
  | { status: "idle"; data: ConversationDetailData; error: null }
  | { status: "loading"; data: ConversationDetailData; error: null }
  | { status: "ready"; data: ConversationDetailData; error: null }
  | { status: "error"; data: ConversationDetailData; error: string };

type RecordingState =
  | { status: "idle"; recording: null; audioUrl: null; message: null }
  | { status: "loading"; recording: null; audioUrl: null; message: null }
  | {
      status: "ready";
      recording: RetellRecording | null;
      audioUrl: string | null;
      message: string | null;
    }
  | { status: "error"; recording: null; audioUrl: null; message: string };

type RecordingStateByCallId = Record<string, RecordingState>;
type ExpandedTranscriptByCallId = Record<string, boolean>;

type CreateJobState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type ActionState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type PendingMmsAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

type ConversationDetailData = {
  intake: IntakeRequestRow | null;
  lead: CommunicationLeadRow | null;
  sourceAccount: SourceAccountRow | null;
  customer: CustomerRow | null;
  appliance: CustomerApplianceRow | null;
  job: ServiceRequestRow | null;
  messages: MessageRow[];
  attachmentsByMessageId: Record<string, SignedMessageAttachment[]>;
  calls: CommunicationCallRow[];
  transcripts: TranscriptRow[];
  timelineEvents: CommunicationTimelineEvent[];
};

type SignedMessageAttachment = MessageAttachmentRow & {
  signedUrl: string | null;
};

type RetellRecording = {
  recordingUrl: string | null;
  recordingMultiChannelUrl: string | null;
  scrubbedRecordingUrl: string | null;
  durationMs: number | null;
  startTimestamp: string | null;
  endTimestamp: string | null;
};

type ConversationRow = {
  id: string;
  primary_source_type: DatabaseCommunicationSourceType;
  status: CommunicationConversation["status"];
  provider_name: string | null;
  customer_display_name: string | null;
  customer_id: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service_address: string | null;
  summary: string | null;
  next_action: string | null;
  last_event_at: string | null;
  call_started_at: string | null;
  call_ended_at: string | null;
  intake_request_id: string | null;
  service_request_id: string | null;
  source_account_id?: string | null;
  inbound_source_id?: string | null;
  attribution?: Json | null;
  provider_metadata?: Json | null;
  unread_count?: number | null;
  last_read_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  created_at: string;
  updated_at: string;
};

type HubConversation = CommunicationConversation & {
  sourceAccountId: string | null;
  inboundSourceId: string | null;
  attribution: Json | null;
  authoritativeEventType: string | null;
  threadConversationIds: string[];
  threadKey: string;
  threadSourceTypes: DatabaseCommunicationSourceType[];
  unreadCount: number;
  lastReadAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  latestMessagePreview: string | null;
};

type TimelineRow = {
  id: string;
  event_type: DatabaseCommunicationTimelineEventType;
  title: string;
  body: string | null;
  event_time: string;
  service_request_id: string | null;
  appointment_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
};

const emptyDetailData: ConversationDetailData = {
  intake: null,
  lead: null,
  sourceAccount: null,
  customer: null,
  appliance: null,
  job: null,
  messages: [],
  attachmentsByMessageId: {},
  calls: [],
  transcripts: [],
  timelineEvents: [],
};

type ContextTab = "customer" | "lead" | "job" | "activity";
type ChannelFilter = "all" | "calls" | "texts" | "forms" | "booking";

function mapConversation(row: ConversationRow): HubConversation {
  return {
    id: row.id,
    sourceType: row.primary_source_type,
    status: row.status,
    providerName: row.provider_name,
    customerDisplayName: row.customer_display_name,
    customerId: row.customer_id,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    serviceAddress: row.service_address,
    summary: row.summary,
    nextAction: row.next_action,
    lastEventAt: row.last_event_at,
    callStartedAt: row.call_started_at,
    callEndedAt: row.call_ended_at,
    linkedIntakeRequestId: row.intake_request_id,
    linkedServiceRequestId: row.service_request_id,
    sourceAccountId: row.source_account_id ?? null,
    inboundSourceId: row.inbound_source_id ?? null,
    attribution: row.attribution ?? null,
    authoritativeEventType: getJsonString(row.provider_metadata, "authoritativeEventType"),
    threadConversationIds: [row.id],
    threadKey: "",
    threadSourceTypes: [row.primary_source_type],
    unreadCount: row.unread_count ?? 0,
    lastReadAt: row.last_read_at ?? null,
    lastInboundAt: row.last_inbound_at ?? null,
    lastOutboundAt: row.last_outbound_at ?? null,
    latestMessagePreview: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTimelineEvent(row: TimelineRow): CommunicationTimelineEvent {
  return {
    id: row.id,
    type: row.event_type,
    title: row.title,
    body: row.body,
    eventTime: row.event_time,
    serviceRequestId: row.service_request_id,
    appointmentId: row.appointment_id,
    estimateId: row.estimate_id,
    invoiceId: row.invoice_id,
  };
}

function getSourceLabel(sourceType: DatabaseCommunicationSourceType): string {
  const labels: Record<DatabaseCommunicationSourceType, string> = {
    phone: "Phone",
    sms: "SMS",
    website_form: "Website",
    email: "Email",
    yelp: "Yelp",
    google_business_messages: "Google",
    facebook_messenger: "Facebook",
    whatsapp: "WhatsApp",
    manual: "Manual",
    other: "Other",
  };

  return labels[sourceType];
}

function hasConversationChannel(conversation: HubConversation, channel: ChannelFilter): boolean {
  if (channel === "all") {
    return true;
  }

  return conversation.threadSourceTypes.some((sourceType) => {
    if (channel === "calls") {
      return sourceType === "phone";
    }
    if (channel === "texts") {
      return sourceType === "sms";
    }
    if (channel === "forms") {
      return sourceType === "website_form";
    }
    if (channel === "booking") {
      return (
        sourceType === "website_form" &&
        getAttributionValue(conversation.attribution, "channel") === "booking_widget"
      );
    }

    return false;
  });
}

function getConversationTitle(conversation: HubConversation): string {
  return (
    conversation.customerDisplayName ??
    conversation.customerPhone ??
    conversation.customerEmail ??
    "Unknown customer"
  );
}

function getConversationPreview(conversation: HubConversation): string {
  return (
    conversation.latestMessagePreview ??
    conversation.summary ??
    conversation.nextAction ??
    "No message preview yet."
  );
}

function getConversationActivityTimestamp(conversation: HubConversation): number {
  const value =
    conversation.lastEventAt ??
    conversation.lastInboundAt ??
    conversation.lastOutboundAt ??
    conversation.updatedAt ??
    conversation.createdAt;

  return value ? Date.parse(value) || 0 : 0;
}

function sortConversationsByActivity(conversations: HubConversation[]) {
  return [...conversations].sort(
    (left, right) =>
      getConversationActivityTimestamp(right) - getConversationActivityTimestamp(left),
  );
}

function normalizeThreadPhone(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (value.trim().startsWith("+") && digits.length >= 8) {
    return `+${digits}`;
  }

  return null;
}

function getCustomerThreadKey(conversation: HubConversation): string {
  if (conversation.customerId) {
    return `customer:${conversation.customerId}`;
  }

  const phone = normalizeThreadPhone(conversation.customerPhone);
  if (phone) {
    return `phone:${phone}`;
  }

  const email = conversation.customerEmail?.trim().toLowerCase();
  if (email) {
    return `email:${email}`;
  }

  return `conversation:${conversation.id}`;
}

function getConversationStatusRank(status: HubConversation["status"]): number {
  if (status === "needs_action") {
    return 4;
  }
  if (status === "open") {
    return 3;
  }
  if (status === "linked") {
    return 2;
  }
  if (status === "resolved") {
    return 1;
  }
  return 0;
}

function getLatestString(values: Array<string | null>): string | null {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

function mergeCustomerThread(conversations: HubConversation[]): HubConversation {
  const sorted = sortConversationsByActivity(conversations);
  const latest = sorted[0];
  const customerCarrier =
    sorted.find((conversation) => conversation.customerId) ?? latest;
  const phoneCarrier =
    sorted.find((conversation) => normalizeThreadPhone(conversation.customerPhone)) ?? latest;
  const statusCarrier = [...sorted].sort(
    (left, right) =>
      getConversationStatusRank(right.status) - getConversationStatusRank(left.status),
  )[0];
  const latestPreviewCarrier =
    sorted.find((conversation) => getConversationPreview(conversation) !== "No message preview yet.") ??
    latest;
  const threadSourceTypes = Array.from(
    new Set(sorted.map((conversation) => conversation.sourceType)),
  );

  return {
    ...latest,
    id: latest.id,
    sourceType: latest.sourceType,
    status: statusCarrier.status,
    providerName: latest.providerName,
    customerDisplayName:
      customerCarrier.customerDisplayName ??
      latest.customerDisplayName ??
      phoneCarrier.customerDisplayName,
    customerId: customerCarrier.customerId ?? null,
    customerPhone:
      normalizeThreadPhone(phoneCarrier.customerPhone) ??
      phoneCarrier.customerPhone ??
      latest.customerPhone,
    customerEmail: customerCarrier.customerEmail ?? latest.customerEmail,
    serviceAddress: customerCarrier.serviceAddress ?? latest.serviceAddress,
    summary: latestPreviewCarrier.summary ?? latest.summary,
    nextAction: latestPreviewCarrier.nextAction ?? latest.nextAction,
    linkedIntakeRequestId:
      customerCarrier.linkedIntakeRequestId ?? latest.linkedIntakeRequestId,
    linkedServiceRequestId:
      customerCarrier.linkedServiceRequestId ?? latest.linkedServiceRequestId,
    sourceAccountId: latest.sourceAccountId,
    inboundSourceId: latest.inboundSourceId,
    attribution: latest.attribution,
    authoritativeEventType: latest.authoritativeEventType,
    threadConversationIds: sorted.map((conversation) => conversation.id),
    threadKey: getCustomerThreadKey(latest),
    threadSourceTypes,
    unreadCount: sorted.reduce((total, conversation) => total + conversation.unreadCount, 0),
    lastReadAt: getLatestString(sorted.map((conversation) => conversation.lastReadAt)),
    lastInboundAt: getLatestString(sorted.map((conversation) => conversation.lastInboundAt)),
    lastOutboundAt: getLatestString(sorted.map((conversation) => conversation.lastOutboundAt)),
    latestMessagePreview: latestPreviewCarrier.latestMessagePreview,
  };
}

function aggregateCustomerThreads(conversations: HubConversation[]): HubConversation[] {
  const groups = new Map<string, HubConversation[]>();

  for (const conversation of conversations) {
    const key = getCustomerThreadKey(conversation);
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, { ...conversation, threadKey: key }]);
  }

  return sortConversationsByActivity(
    Array.from(groups.values()).map((threadConversations) =>
      mergeCustomerThread(threadConversations),
    ),
  ).slice(0, 50);
}

function sortMessagesByNewest(messages: MessageRow[]) {
  return [...messages].sort(
    (left, right) =>
      (Date.parse(right.occurred_at) || 0) - (Date.parse(left.occurred_at) || 0),
  );
}

function mergeMessageRows(messages: MessageRow[], nextMessage: MessageRow) {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id);
  const merged =
    existingIndex >= 0
      ? messages.map((message) => (message.id === nextMessage.id ? nextMessage : message))
      : [nextMessage, ...messages];

  return sortMessagesByNewest(merged).slice(0, 20);
}

function getMessagePreview(message: MessageRow): string | null {
  const body = message.body?.trim();
  return body || null;
}

function applyConversationUpdate(
  conversations: HubConversation[],
  row: ConversationRow,
): HubConversation[] {
  const nextConversation = mapConversation(row);
  const existing = conversations.find((conversation) => conversation.id === row.id);
  const merged = existing
    ? {
        ...existing,
        ...nextConversation,
        latestMessagePreview:
          existing.latestMessagePreview ?? nextConversation.latestMessagePreview,
      }
    : nextConversation;

  const nextConversations = existing
    ? conversations.map((conversation) =>
        conversation.id === row.id ? merged : conversation,
      )
    : [merged, ...conversations];

  return sortConversationsByActivity(nextConversations).slice(0, 50);
}

function applyMessageUpdate(
  conversations: HubConversation[],
  message: MessageRow,
): HubConversation[] {
  const preview = getMessagePreview(message);
  const activityAt = message.occurred_at;
  let matched = false;

  const nextConversations = conversations.map((conversation) => {
    if (conversation.id !== message.conversation_id) {
      return conversation;
    }

    matched = true;
    return {
      ...conversation,
      latestMessagePreview: preview ?? conversation.latestMessagePreview,
      lastEventAt: activityAt ?? conversation.lastEventAt,
      updatedAt: activityAt ?? conversation.updatedAt,
    };
  });

  return matched ? sortConversationsByActivity(nextConversations) : conversations;
}

async function hydrateLatestMessagePreviews(
  conversations: HubConversation[],
): Promise<HubConversation[]> {
  if (conversations.length === 0) {
    return conversations;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return conversations;
  }

  const { data, error } = await supabase
    .from("communication_messages")
    .select("id,conversation_id,body,occurred_at")
    .in(
      "conversation_id",
      conversations.map((conversation) => conversation.id),
    )
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return conversations;
  }

  const previews = new Map<string, string>();
  for (const message of data as Array<Pick<MessageRow, "conversation_id" | "body">>) {
    if (previews.has(message.conversation_id)) {
      continue;
    }

    const preview = message.body?.trim();
    if (preview) {
      previews.set(message.conversation_id, preview);
    }
  }

  return conversations.map((conversation) => ({
    ...conversation,
    latestMessagePreview: previews.get(conversation.id) ?? conversation.latestMessagePreview,
  }));
}

async function loadSignedMessageAttachments(messageIds: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || messageIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("communication_message_attachments")
    .select("*")
    .in("communication_message_id", messageIds)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return {};
  }

  const attachments: SignedMessageAttachment[] = [];
  for (const attachment of data as MessageAttachmentRow[]) {
    const { data: signedData } = await supabase.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, 60 * 30);
    attachments.push({
      ...attachment,
      signedUrl: signedData?.signedUrl ?? null,
    });
  }

  return attachments.reduce<Record<string, SignedMessageAttachment[]>>(
    (groups, attachment) => {
      groups[attachment.communication_message_id] = [
        ...(groups[attachment.communication_message_id] ?? []),
        attachment,
      ];
      return groups;
    },
    {},
  );
}

function getAttributionRecord(value: Json | null | undefined): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function getAttributionValue(value: Json | null | undefined, key: string): string | null {
  const record = getAttributionRecord(value);
  const direct = record?.[key];

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const utm = getAttributionRecord(record?.utm);
  const nested = utm?.[key.replace(/^utm_/, "")];

  return typeof nested === "string" && nested.trim() ? nested.trim() : null;
}

function getAttributionRows(conversation: HubConversation) {
  return [
    ["Source", getAttributionValue(conversation.attribution, "source_name")],
    ["Channel", getSourceLabel(conversation.sourceType)],
    ["Website", getAttributionValue(conversation.attribution, "websiteDomain") ?? getAttributionValue(conversation.attribution, "website_domain")],
    ["Campaign", getAttributionValue(conversation.attribution, "campaign") ?? getAttributionValue(conversation.attribution, "utm_campaign")],
    ["Tracking #", getAttributionValue(conversation.attribution, "trackingPhoneNumber") ?? getAttributionValue(conversation.attribution, "tracking_phone_number")],
    ["UTM source", getAttributionValue(conversation.attribution, "utm_source")],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

function getJsonObject(value: Json | null | undefined): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function getJsonString(value: Json | null | undefined, key: string): string | null {
  const record = getJsonObject(value);
  const entry = record?.[key];

  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

function isTrustedWebsiteRequest(detail: ConversationDetailData, conversation: HubConversation) {
  return (
    conversation.sourceType === "website_form" &&
    Boolean(conversation.inboundSourceId) &&
    Boolean(detail.intake?.id)
  );
}

function getCreateJobBlockedReason(
  detail: ConversationDetailData,
  conversation: HubConversation | null,
): string | null {
  if (!conversation) {
    return "Select a conversation before creating a Job.";
  }

  const intake = detail.intake;
  if (!intake) {
    return "Request details are required before creating a Job.";
  }

  if (!isTrustedWebsiteRequest(detail, conversation)) {
    return "A trusted website request is required before creating a Job.";
  }

  if (detail.job || intake.linked_service_request_id) {
    return null;
  }

  const customerName = [intake.customer_first_name, intake.customer_last_name]
    .filter(Boolean)
    .join(" ") || intake.customer_name;
  if (!customerName?.trim()) {
    return "Customer name is required before creating a Job.";
  }

  if (!intake.customer_phone?.trim()) {
    return "Customer phone is required before creating a Job.";
  }

  if (!intake.service_address?.trim()) {
    return "Add service address to create Job.";
  }

  if (!intake.zip_code?.trim()) {
    return "Add ZIP code to create Job.";
  }

  if (!intake.appliance_type?.trim()) {
    return "Add appliance or service type to create Job.";
  }

  if (!intake.problem_description?.trim()) {
    return "Add problem description to create Job.";
  }

  return null;
}

function getRequestDetailRows(
  detail: ConversationDetailData,
  conversation: HubConversation,
): Array<[string, string]> {
  const intake = detail.intake;
  if (!intake) {
    return [];
  }

  return [
    ["Customer", intake.customer_name ?? conversation.customerDisplayName],
    ["Phone", intake.customer_phone ?? conversation.customerPhone],
    ["Service Address", intake.service_address ?? conversation.serviceAddress],
    ["ZIP", intake.zip_code],
    ["Appliance", intake.appliance_type],
    ["Brand", intake.brand],
    ["Problem", intake.problem_description ?? conversation.summary],
    ["Requested Date", intake.appointment_date],
    ["Preferred Window", intake.preferred_appointment_window],
    ["Source", intake.source_name ?? getAttributionValue(conversation.attribution, "websiteDomain")],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

function getInitialQueryParam(name: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get(name);
}

function randomClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function getInitialChannelFilter(): ChannelFilter {
  const value = getInitialQueryParam("channel");
  return value === "calls" ||
    value === "texts" ||
    value === "forms" ||
    value === "booking"
    ? value
    : "all";
}

function getInitialInboxTab(): "inbox" | "assigned" | "archived" {
  const value = getInitialQueryParam("box");
  return value === "assigned" || value === "archived" ? value : "inbox";
}

function getStatusLabel(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatProviderName(providerName: string | null): string {
  if (!providerName) {
    return "WRA";
  }

  return providerName
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivity(conversation: CommunicationConversation): string {
  const value =
    conversation.lastEventAt ??
    conversation.callEndedAt ??
    conversation.callStartedAt ??
    conversation.updatedAt;

  return value ? formatServiceRequestDate(value) : "Activity pending";
}

function formatDuration(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCallStatus(status: string | null): string {
  if (!status) {
    return "Call";
  }

  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCallDurationText(call: CommunicationCallRow | null): string | null {
  return call?.duration_seconds ? formatDuration(call.duration_seconds * 1000) : null;
}

function getCallTimeLabel(call: CommunicationCallRow): string {
  return formatServiceRequestDate(call.started_at ?? call.created_at);
}

function getEffectiveCallStatus(call: CommunicationCallRow): string | null {
  if (call.ended_at && (call.status === "calling" || call.status === "ringing")) {
    return "ended";
  }

  return call.status;
}

function getCallProviderMetadata(call: CommunicationCallRow): Record<string, unknown> {
  return call.provider_metadata &&
    typeof call.provider_metadata === "object" &&
    !Array.isArray(call.provider_metadata)
    ? (call.provider_metadata as Record<string, unknown>)
    : {};
}

function getCallDisplayTitle(call: CommunicationCallRow): string {
  const metadata = getCallProviderMetadata(call);
  if (metadata.call_phase === "human_transfer") {
    return "Human Transfer";
  }
  return call.direction === "outbound" ? "Outgoing Call" : "Incoming Call";
}

function getCallParticipantLabel(
  call: CommunicationCallRow,
  fallbackCustomerPhone: string | null,
): string {
  const metadata = getCallProviderMetadata(call);
  if (metadata.call_phase === "human_transfer") {
    const participants =
      metadata.participants &&
      typeof metadata.participants === "object" &&
      !Array.isArray(metadata.participants)
        ? (metadata.participants as Record<string, unknown>)
        : {};
    const ownerName =
      typeof participants.owner_name === "string" && participants.owner_name.trim()
        ? participants.owner_name.trim()
        : "Owner";
    return `Customer ↔ ${ownerName}`;
  }
  return fallbackCustomerPhone ?? "No phone captured";
}

type CallSession = {
  id: string;
  calls: CommunicationCallRow[];
};

type ThreadEvent =
  | { id: string; occurredAt: string; session: CallSession; type: "call_session" }
  | { id: string; message: MessageRow; occurredAt: string; type: "message" }
  | { event: CommunicationTimelineEvent; id: string; occurredAt: string; type: "timeline" };

function getNestedMetadata(
  metadata: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = metadata[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getCallSessionKey(call: CommunicationCallRow): string {
  const metadata = getCallProviderMetadata(call);
  const transfer = getNestedMetadata(metadata, "transfer");
  const retellCallId = typeof transfer.retell_call_id === "string" ? transfer.retell_call_id : null;
  if (retellCallId) {
    return `retell:${retellCallId}`;
  }

  if (call.provider_name === "retell" && call.provider_call_id) {
    return `retell:${call.provider_call_id}`;
  }

  const transferSessionNonce =
    typeof transfer.transfer_session_nonce === "string"
      ? transfer.transfer_session_nonce
      : null;
  if (transferSessionNonce) {
    return `transfer:${transferSessionNonce}`;
  }

  return `call:${call.id}`;
}

function groupCallSessions(calls: CommunicationCallRow[]): CallSession[] {
  const groups = new Map<string, CommunicationCallRow[]>();

  for (const call of calls) {
    const key = getCallSessionKey(call);
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, call]);
  }

  return Array.from(groups.entries())
    .map(([id, sessionCalls]) => ({
      id,
      calls: [...sessionCalls].sort(
        (left, right) =>
          (Date.parse(left.started_at ?? left.created_at) || 0) -
          (Date.parse(right.started_at ?? right.created_at) || 0),
      ),
    }))
    .sort((left, right) => {
      const leftLatest = left.calls
        .map((call) => Date.parse(call.started_at ?? call.created_at) || 0)
        .reduce((latest, value) => Math.max(latest, value), 0);
      const rightLatest = right.calls
        .map((call) => Date.parse(call.started_at ?? call.created_at) || 0)
        .reduce((latest, value) => Math.max(latest, value), 0);
      return rightLatest - leftLatest;
    });
}

function getCallSessionOccurredAt(session: CallSession): string {
  return session.calls[0]?.started_at ?? session.calls[0]?.created_at ?? new Date(0).toISOString();
}

function buildThreadEvents({
  calls,
  messages,
  timelineEvents,
}: {
  calls: CommunicationCallRow[];
  messages: MessageRow[];
  timelineEvents: CommunicationTimelineEvent[];
}): ThreadEvent[] {
  const hasCalls = calls.length > 0;
  const callEvents: ThreadEvent[] = groupCallSessions(calls).map((session) => ({
    id: session.id,
    occurredAt: getCallSessionOccurredAt(session),
    session,
    type: "call_session",
  }));
  const messageEvents: ThreadEvent[] = messages.map((message) => ({
    id: `message:${message.id}`,
    message,
    occurredAt: message.occurred_at,
    type: "message",
  }));
  const timelineOnlyEvents: ThreadEvent[] = timelineEvents
    .filter((event) => !(hasCalls && event.type === "incoming_call"))
    .map((event) => ({
      event,
      id: `timeline:${event.id}`,
      occurredAt: event.eventTime,
      type: "timeline",
    }));

  return [...callEvents, ...messageEvents, ...timelineOnlyEvents].sort(
    (left, right) =>
      (Date.parse(left.occurredAt) || 0) - (Date.parse(right.occurredAt) || 0),
  );
}

function formatServiceAddress(detail: ConversationDetailData, conversation: CommunicationConversation) {
  const job = detail.job;
  const intake = detail.intake;

  if (job?.full_address) {
    return job.full_address;
  }

  const jobAddress = [
    job?.street_address,
    job?.unit,
    [job?.city, job?.state, job?.zip_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return jobAddress || intake?.service_address || conversation.serviceAddress || "Not captured";
}

function formatJobAddress(job: ServiceRequestRow): string {
  if (job.full_address?.trim()) {
    return job.full_address;
  }

  return (
    [
      job.street_address,
      job.unit,
      [job.city, job.state, job.zip_code].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ") || "Not captured"
  );
}

function getJobDetailRows(job: ServiceRequestRow): Array<[string, string]> {
  const jobNumber =
    "job_number" in job && job.job_number ? String(job.job_number) : "Pending";
  const scheduledWindow = [
    job.scheduled_date,
    [job.scheduled_window_start_time, job.scheduled_window_end_time]
      .filter(Boolean)
      .join(" - "),
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    ["Job", `Job #${jobNumber}`],
    ["Status", getStatusLabel(job.status)],
    ["Customer", job.customer_name],
    ["Service Address", formatJobAddress(job)],
    ["Appliance", job.appliance_type],
    ["Brand", job.appliance_brand],
    ["Problem", job.issue_description],
    ["Requested Window", job.preferred_time_window],
    ["Scheduled", scheduledWindow],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

function getHubReadError(message: string) {
  if (
    message.includes("communication_conversations") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  ) {
    return "Communications Hub is not ready in this workspace yet.";
  }

  return "Communications Hub is unavailable right now.";
}

function getConversationFlags(
  conversation: CommunicationConversation,
  detail?: ConversationDetailData | null,
  hasRecording?: boolean,
) {
  const flags: Array<{ label: string; tone: "blue" | "amber" | "emerald" | "slate" | "purple" }> = [];

  if (conversation.status === "needs_action" || conversation.status === "open") {
    flags.push({ label: "Needs Review", tone: "amber" });
  }

  if (!conversation.customerId && !detail?.customer) {
    flags.push({ label: "Missing Customer", tone: "purple" });
  }

  if (!conversation.linkedServiceRequestId && !detail?.job) {
    flags.push({ label: "Missing Job", tone: "slate" });
  }

  if (conversation.linkedServiceRequestId || detail?.job) {
    flags.push({ label: "Converted", tone: "emerald" });
  }

  if (hasRecording) {
    flags.push({ label: "Has Recording", tone: "blue" });
  }

  return flags;
}

export function CommunicationsHub() {
  const [hubState, setHubState] = useState<HubState>({
    status: "loading",
    conversations: [],
    error: null,
  });
  const [, setRawConversations] = useState<HubConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() =>
    getInitialQueryParam("conversation"),
  );
  const [detailState, setDetailState] = useState<DetailState>({
    status: "idle",
    data: emptyDetailData,
    error: null,
  });
  const [recordingStatesByCallId, setRecordingStatesByCallId] =
    useState<RecordingStateByCallId>({});
  const recordingStatesRef = useRef<RecordingStateByCallId>({});
  const [activeFilter, setActiveFilter] = useState<ChannelFilter>(getInitialChannelFilter);
  const [inboxTab, setInboxTab] =
    useState<"inbox" | "assigned" | "archived">(getInitialInboxTab);
  const [searchQuery, setSearchQuery] = useState(() => getInitialQueryParam("q") ?? "");
  const [contextTab, setContextTab] = useState<ContextTab>("customer");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(
    () => getInitialQueryParam("view") === "detail" && Boolean(getInitialQueryParam("conversation")),
  );
  const [mobileDetailTab, setMobileDetailTab] = useState<
    "conversation" | ContextTab
  >("conversation");
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);
  const [createJobState, setCreateJobState] = useState<CreateJobState>({
    status: "idle",
    message: null,
  });
  const [createLeadState, setCreateLeadState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [smsDraft, setSmsDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingMmsAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] =
    useState<SignedMessageAttachment | null>(null);
  const [retryingTranscriptCallId, setRetryingTranscriptCallId] = useState<string | null>(null);
  const [sendMessageState, setSendMessageState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [isBrowserCallOpen, setIsBrowserCallOpen] = useState(false);
  const [expandedTranscriptByCallId, setExpandedTranscriptByCallId] =
    useState<ExpandedTranscriptByCallId>({});

  useEffect(() => {
    let isMounted = true;

    async function loadConversations() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setHubState({
            status: "error",
            conversations: [],
            error: "Communications Hub is not configured for this workspace.",
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from("communication_conversations")
        .select(
          "id,primary_source_type,status,provider_name,customer_display_name,customer_id,customer_phone,customer_email,service_address,summary,next_action,last_event_at,call_started_at,call_ended_at,intake_request_id,service_request_id,source_account_id,inbound_source_id,attribution,provider_metadata,unread_count,last_read_at,last_inbound_at,last_outbound_at,created_at,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(50);

      if (!isMounted) {
        return;
      }

      if (error) {
        setHubState({
          status: "error",
          conversations: [],
          error: getHubReadError(error.message),
        });
        return;
      }

      const conversations = await hydrateLatestMessagePreviews(
        sortConversationsByActivity(((data ?? []) as ConversationRow[]).map(mapConversation)),
      );
      const threads = aggregateCustomerThreads(conversations);

      setRawConversations(conversations);
      setHubState({ status: "ready", conversations: threads, error: null });
      setSelectedConversationId((current) => {
        if (!current) {
          return threads[0]?.id ?? null;
        }
        return (
          threads.find((thread) => thread.threadConversationIds.includes(current))?.id ??
          current
        );
      });
    }

    void loadConversations();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("communications-live-inbox")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_conversations",
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setRawConversations((current) => {
              const nextRaw = current.filter((conversation) => conversation.id !== payload.old.id);
              setHubState((hub) => ({
                ...hub,
                conversations: aggregateCustomerThreads(nextRaw),
              }));
              return nextRaw;
            });
            return;
          }

          const row = payload.new as ConversationRow;
          setRawConversations((current) => {
            const nextRaw = applyConversationUpdate(current, row);
            setHubState((hub) => ({
              ...hub,
              conversations: aggregateCustomerThreads(nextRaw),
            }));
            return nextRaw;
          });

          const selectedConversation = hubState.conversations.find(
            (conversation) => conversation.id === selectedConversationId,
          );
          if (
            selectedConversation?.threadConversationIds.includes(row.id) ||
            row.id === selectedConversationId
          ) {
            setDetailReloadToken((value) => value + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_messages",
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            const conversationId = payload.old.conversation_id;

            setDetailState((current) =>
              current.data.messages.some((message) => message.id === deletedId)
                ? {
                    ...current,
                    data: {
                      ...current.data,
                      messages: current.data.messages.filter(
                        (message) => message.id !== deletedId,
                      ),
                    },
                  }
                : current,
            );

            const selectedConversation = hubState.conversations.find(
              (conversation) => conversation.id === selectedConversationId,
            );
            if (
              conversationId &&
              (selectedConversation?.threadConversationIds.includes(conversationId) ||
                conversationId === selectedConversationId)
            ) {
              setDetailReloadToken((value) => value + 1);
            }
            return;
          }

          const message = payload.new as MessageRow;

          setRawConversations((current) => {
            const nextRaw = applyMessageUpdate(current, message);
            setHubState((hub) => ({
              ...hub,
              conversations: aggregateCustomerThreads(nextRaw),
            }));
            return nextRaw;
          });

          const selectedConversation = hubState.conversations.find(
            (conversation) => conversation.id === selectedConversationId,
          );
          if (
            !selectedConversation?.threadConversationIds.includes(message.conversation_id) &&
            message.conversation_id !== selectedConversationId
          ) {
            return;
          }

          setDetailState((current) => ({
            ...current,
            data: {
              ...current.data,
              messages: mergeMessageRows(current.data.messages, message),
            },
          }));
          window.setTimeout(() => {
            setDetailReloadToken((value) => value + 1);
          }, 600);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_calls",
        },
        (payload) => {
          const row =
            payload.eventType === "DELETE"
              ? (payload.old as Partial<CommunicationCallRow>)
              : (payload.new as Partial<CommunicationCallRow>);

          const selectedConversation = hubState.conversations.find(
            (conversation) => conversation.id === selectedConversationId,
          );
          if (
            row.conversation_id &&
            (selectedConversation?.threadConversationIds.includes(row.conversation_id) ||
              row.conversation_id === selectedConversationId)
          ) {
            setDetailReloadToken((value) => value + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_transcripts",
        },
        (payload) => {
          const row =
            payload.eventType === "DELETE"
              ? (payload.old as Partial<TranscriptRow>)
              : (payload.new as Partial<TranscriptRow>);

          const selectedConversation = hubState.conversations.find(
            (conversation) => conversation.id === selectedConversationId,
          );
          if (
            row.conversation_id &&
            (selectedConversation?.threadConversationIds.includes(row.conversation_id) ||
              row.conversation_id === selectedConversationId)
          ) {
            setDetailReloadToken((value) => value + 1);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hubState.conversations, selectedConversationId]);

  useEffect(() => {
    let isMounted = true;

    async function loadDetail() {
      if (!selectedConversationId) {
        setDetailState({ status: "idle", data: emptyDetailData, error: null });
        return;
      }

      const conversation =
        hubState.conversations.find((item) => item.id === selectedConversationId) ?? null;

      if (!conversation) {
        setDetailState({ status: "idle", data: emptyDetailData, error: null });
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setDetailState({
          status: "error",
          data: emptyDetailData,
          error: "Conversation detail is not configured for this workspace.",
        });
        return;
      }

      setDetailState({ status: "loading", data: emptyDetailData, error: null });
      const conversationIds = conversation.threadConversationIds.length > 0
        ? conversation.threadConversationIds
        : [conversation.id];

      const [
        messagesResult,
        callsResult,
        timelineResult,
        intakeResult,
        leadResult,
        sourceAccountResult,
      ] =
        await Promise.all([
          supabase
            .from("communication_messages")
            .select("*")
            .in("conversation_id", conversationIds)
            .order("occurred_at", { ascending: false })
            .limit(25),
          supabase
            .from("communication_calls")
            .select("*")
            .in("conversation_id", conversationIds)
            .order("started_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(25),
          supabase
            .from("communication_timeline_events")
            .select(
              "id,event_type,title,body,event_time,service_request_id,appointment_id,estimate_id,invoice_id",
            )
            .in("conversation_id", conversationIds)
            .order("event_time", { ascending: false })
            .limit(30),
          conversation.linkedIntakeRequestId
            ? supabase
                .from("intake_requests")
                .select("*")
                .eq("id", conversation.linkedIntakeRequestId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from("communication_leads")
            .select("*")
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          conversation.sourceAccountId
            ? supabase
                .from("communication_source_accounts")
                .select("*")
                .eq("id", conversation.sourceAccountId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

      if (!isMounted) {
        return;
      }

      if (
        messagesResult.error ||
        callsResult.error ||
        timelineResult.error ||
        leadResult.error ||
        sourceAccountResult.error
      ) {
        setDetailState({
          status: "error",
          data: emptyDetailData,
          error: "Conversation detail is unavailable right now.",
        });
        return;
      }

      const intake = (intakeResult.data ?? null) as IntakeRequestRow | null;
      const lead = (leadResult.data ?? null) as CommunicationLeadRow | null;
      const messages = (messagesResult.data ?? []) as MessageRow[];
      const calls = (callsResult.data ?? []) as CommunicationCallRow[];
      const transcriptIds = Array.from(
        new Set(calls.map((call) => call.transcript_id).filter((id): id is string => Boolean(id))),
      );
      const transcriptsResult =
        transcriptIds.length > 0
          ? await supabase.from("communication_transcripts").select("*").in("id", transcriptIds)
          : { data: [], error: null };

      if (!isMounted) {
        return;
      }

      if (transcriptsResult.error) {
        setDetailState({
          status: "error",
          data: emptyDetailData,
          error: "Conversation detail is unavailable right now.",
        });
        return;
      }

      const attachmentsByMessageId = await loadSignedMessageAttachments(
        messages.map((message) => message.id),
      );
      const jobId = conversation.linkedServiceRequestId ?? intake?.linked_service_request_id ?? null;
      const jobResult = jobId
        ? await supabase.from("service_requests").select("*").eq("id", jobId).maybeSingle()
        : { data: null, error: null };

      if (!isMounted) {
        return;
      }

      const job = (jobResult.data ?? null) as ServiceRequestRow | null;
      const customerId = conversation.customerId ?? intake?.linked_customer_id ?? job?.customer_id ?? null;
      const customerResult = customerId
        ? await supabase.from("customers").select("*").eq("id", customerId).maybeSingle()
        : { data: null, error: null };
      const applianceId = job?.customer_appliance_id ?? null;
      const applianceResult = applianceId
        ? await supabase
            .from("customer_appliances")
            .select("*")
            .eq("id", applianceId)
            .maybeSingle()
        : { data: null, error: null };

      if (!isMounted) {
        return;
      }

      setDetailState({
        status: "ready",
        data: {
          intake,
          lead,
          sourceAccount: (sourceAccountResult.data ?? null) as SourceAccountRow | null,
          customer: (customerResult.data ?? null) as CustomerRow | null,
          appliance: (applianceResult.data ?? null) as CustomerApplianceRow | null,
          job,
          messages,
          attachmentsByMessageId,
          calls,
          transcripts: (transcriptsResult.data ?? []) as TranscriptRow[],
          timelineEvents: filterBusinessTimelineEvents(
            ((timelineResult.data ?? []) as TimelineRow[]).map(mapTimelineEvent),
          ),
        },
        error: null,
      });
    }

    void loadDetail();

    return () => {
      isMounted = false;
    };
  }, [detailReloadToken, hubState.conversations, selectedConversationId]);

  useEffect(() => {
    recordingStatesRef.current = recordingStatesByCallId;
  }, [recordingStatesByCallId]);

  useEffect(() => {
    let isMounted = true;
    const createdAudioUrls: string[] = [];
    const callsToLoad = detailState.data.calls.filter(
      (call) =>
        call.recording_reference &&
        !recordingStatesRef.current[call.id] &&
        detailState.status === "ready",
    );

    if (callsToLoad.length === 0) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setRecordingStatesByCallId((current) => {
        const next = { ...current };
        for (const call of callsToLoad) {
          next[call.id] = {
            status: "error",
            recording: null,
            audioUrl: null,
            message: "Recording lookup is not configured for this workspace.",
          };
        }
        return next;
      });
      return;
    }

    setRecordingStatesByCallId((current) => {
      const next = { ...current };
      for (const call of callsToLoad) {
        next[call.id] = { status: "loading", recording: null, audioUrl: null, message: null };
      }
      return next;
    });

    const supabaseClient = supabase;

    async function loadRecordings() {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (!session?.access_token) {
        if (isMounted) {
          setRecordingStatesByCallId((current) => {
            const next = { ...current };
            for (const call of callsToLoad) {
              next[call.id] = {
                status: "error",
                recording: null,
                audioUrl: null,
                message: "Log in again to load call recordings.",
              };
            }
            return next;
          });
        }
        return;
      }

      for (const call of callsToLoad) {
        const recordingQuery = `callId=${encodeURIComponent(call.id)}`;
        const response = await fetch(`/api/communications/retell-recording?${recordingQuery}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              recording?: RetellRecording | null;
              message?: string | null;
            }
          | null;

        if (!isMounted) {
          return;
        }

        if (!response.ok || !payload?.ok) {
          setRecordingStatesByCallId((current) => ({
            ...current,
            [call.id]: {
              status: "error",
              recording: null,
              audioUrl: null,
              message: payload?.message ?? "Could not load call recording.",
            },
          }));
          continue;
        }

        let audioUrl: string | null = null;
        let message = payload.message ?? null;

        if (payload.recording && !message) {
          const audioResponse = await fetch(
            `/api/communications/retell-recording/audio?${recordingQuery}`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            },
          );

          if (!isMounted) {
            return;
          }

          if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            if (!isMounted) {
              return;
            }
            audioUrl = URL.createObjectURL(audioBlob);
            createdAudioUrls.push(audioUrl);
          } else {
            message = "Recording metadata loaded, but audio playback is unavailable.";
          }
        }

        setRecordingStatesByCallId((current) => ({
          ...current,
          [call.id]: {
            status: "ready",
            recording: payload.recording ?? null,
            audioUrl,
            message,
          },
        }));
      }
    }

    void loadRecordings();

    return () => {
      isMounted = false;
      for (const audioUrl of createdAudioUrls) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [detailState.data.calls, detailState.status]);

  const selectedConversation = useMemo(
    () =>
      hubState.conversations.find(
        (conversation) =>
          conversation.id === selectedConversationId ||
          (selectedConversationId
            ? conversation.threadConversationIds.includes(selectedConversationId)
            : false),
      ) ?? null,
    [hubState.conversations, selectedConversationId],
  );

  useEffect(() => {
    if (
      !selectedConversationId ||
      detailState.status !== "ready" ||
      !selectedConversation ||
      selectedConversation.unreadCount <= 0
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(() => {
      const conversationIds =
        selectedConversation.threadConversationIds.length > 0
          ? selectedConversation.threadConversationIds
          : [selectedConversation.id];

      void Promise.all(
        conversationIds.map((conversationId) =>
          supabase.rpc("mark_communication_conversation_read_rpc", {
            p_conversation_id: conversationId,
          }),
        ),
      ).then((results) => {
          if (results.some(({ error }) => error) || canceled) {
            return;
          }

          const readAt = new Date().toISOString();
          setRawConversations((current) =>
            current.map((conversation) =>
              conversationIds.includes(conversation.id)
                ? { ...conversation, unreadCount: 0, lastReadAt: readAt }
                : conversation,
            ),
          );
          setHubState((current) => ({
            ...current,
            conversations: current.conversations.map((conversation) =>
              conversation.id === selectedConversationId
                ? { ...conversation, unreadCount: 0, lastReadAt: readAt }
                : conversation,
            ),
          }));
        });
    }, 400);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [
    detailState.status,
    selectedConversation,
    selectedConversationId,
    selectedConversation?.unreadCount,
  ]);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return hubState.conversations.filter((conversation) => {
      const matchesFilter =
        activeFilter === "all" || hasConversationChannel(conversation, activeFilter);
      const matchesInbox =
        inboxTab === "archived"
          ? conversation.status === "resolved"
          : inboxTab === "assigned"
            ? conversation.status !== "resolved"
            : conversation.status !== "resolved";
      const haystack = [
        getConversationTitle(conversation),
        conversation.customerPhone,
        conversation.customerEmail,
        conversation.serviceAddress,
        conversation.summary,
        conversation.nextAction,
        getSourceLabel(conversation.sourceType),
        formatProviderName(conversation.providerName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesFilter && matchesInbox && (!query || haystack.includes(query));
    });
  }, [activeFilter, hubState.conversations, inboxTab, searchQuery]);
  const channelCounts = useMemo(
    () => ({
      all: hubState.conversations.length,
      calls: hubState.conversations.filter((item) => hasConversationChannel(item, "calls")).length,
      texts: hubState.conversations.filter((item) => hasConversationChannel(item, "texts")).length,
      forms: hubState.conversations.filter((item) => hasConversationChannel(item, "forms")).length,
      booking: hubState.conversations.filter((item) => hasConversationChannel(item, "booking")).length,
    }),
    [hubState.conversations],
  );
  const detail = detailState.data;
  const transcriptsById = useMemo(
    () => new Map(detail.transcripts.map((transcript) => [transcript.id, transcript])),
    [detail.transcripts],
  );
  const chronologicalMessages = [...detail.messages].reverse();
  const chronologicalTimeline = [...detail.timelineEvents].reverse();
  const visibleTimeline = chronologicalTimeline.filter((event) => {
    const eventBody = event.body?.trim();
    const summary = selectedConversation?.summary?.trim();

    return !(
      selectedConversation?.sourceType === "phone" &&
      event.type === "incoming_call" &&
      eventBody &&
      summary &&
      eventBody === summary
    );
  });
  const threadEvents = useMemo(
    () =>
      buildThreadEvents({
        calls: detail.calls,
        messages: chronologicalMessages,
        timelineEvents: visibleTimeline,
      }),
    [chronologicalMessages, detail.calls, visibleTimeline],
  );
  const buildCommunicationsReturnTo = (conversationId = selectedConversationId) => {
    const params = new URLSearchParams();
    if (conversationId) {
      params.set("conversation", conversationId);
      params.set("view", "detail");
    }
    if (activeFilter !== "all") {
      params.set("channel", activeFilter);
    }
    if (inboxTab !== "inbox") {
      params.set("box", inboxTab);
    }
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    }

    const query = params.toString();
    return query ? `/dashboard/communications?${query}` : "/dashboard/communications";
  };
  const openConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setCreatedLeadId(null);
    setCreateJobState({ status: "idle", message: null });
    setCreateLeadState({ status: "idle", message: null });
    setSmsDraft("");
    setSendMessageState({ status: "idle", message: null });
    recordingStatesRef.current = {};
    setRecordingStatesByCallId({});
    setExpandedTranscriptByCallId({});
    setMobileDetailOpen(true);
    setMobileDetailTab("conversation");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", buildCommunicationsReturnTo(conversationId));
    }
  };
  const destinationReturnTo = buildCommunicationsReturnTo();
  const withReturnTo = (href: string) =>
    `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(
      destinationReturnTo,
    )}`;
  const linkedLeadId = detail.lead?.id ?? createdLeadId;
  const linkedJobId =
    detail.job?.id ??
    detail.intake?.linked_service_request_id ??
    selectedConversation?.linkedServiceRequestId ??
    null;
  const createJobBlockedReason = getCreateJobBlockedReason(detail, selectedConversation);
  const canCreateJobFromConversation = Boolean(
    selectedConversation &&
      !detail.job &&
      !linkedJobId,
  );
  const canCreateLeadFromConversation = Boolean(
    selectedConversation && !linkedLeadId,
  );

  async function handleRetryTranscript(callId: string) {
    setRetryingTranscriptCallId(callId);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Communications is not configured for transcription retry.");
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        throw new Error("Log in again to retry transcription.");
      }

      const response = await fetch(
        `/api/communications/browser-call/${callId}/transcript/retry`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; ok?: boolean }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "Could not retry this transcription.");
      }

      setDetailReloadToken((value) => value + 1);
    } catch (error) {
      setCreateJobState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not retry this transcription.",
      });
    } finally {
      setRetryingTranscriptCallId(null);
    }
  }

  const communicationCallPhone =
    detail.customer?.phone ?? selectedConversation?.customerPhone ?? null;
  const communicationCallTarget = selectedConversation
    ? {
        conversationId: selectedConversation.id,
        customerId: detail.customer?.id ?? selectedConversation.customerId ?? null,
        displayName: getConversationTitle(selectedConversation),
        phone: communicationCallPhone,
      }
    : null;
  const smsSourceAccount = detail.sourceAccount;
  const canSendSmsFromConversation = Boolean(
    selectedConversation &&
      selectedConversation.customerPhone &&
      smsSourceAccount?.provider_name === "telnyx" &&
      smsSourceAccount.supports_outbound_sms === true,
  );
  const sendMessageBlockedReason = !selectedConversation
    ? "Select a conversation before sending."
    : !selectedConversation.customerPhone
      ? "This conversation does not have a customer phone number."
      : !smsSourceAccount
        ? "This conversation is not connected to an SMS source account."
        : smsSourceAccount.provider_name !== "telnyx" ||
            smsSourceAccount.supports_outbound_sms !== true
          ? "Outbound SMS is not enabled for this conversation source."
          : null;
  const requestDetailRows = selectedConversation
    ? getRequestDetailRows(detail, selectedConversation)
    : [];

  function handleSelectMessageAttachments(files: FileList | null) {
    if (!files) {
      return;
    }

    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const selectedFiles = Array.from(files)
      .filter((file) => supportedTypes.has(file.type) && file.size <= 5 * 1024 * 1024)
      .slice(0, Math.max(0, 5 - pendingAttachments.length));

    if (selectedFiles.length === 0) {
      setSendMessageState({
        status: "error",
        message: "Attach JPEG, PNG, or WebP images up to 5 MB each.",
      });
      return;
    }

    setPendingAttachments((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        id: `${file.name}-${file.lastModified}-${randomClientId()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    setSendMessageState({ status: "idle", message: null });
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  async function handleCreateLeadFromConversation() {
    if (!selectedConversation) {
      return;
    }

    if (linkedLeadId) {
      window.location.assign(withReturnTo(`/dashboard/communication-leads/${linkedLeadId}`));
      return;
    }

    setCreateJobState({ status: "idle", message: null });
    setCreateLeadState({ status: "saving", message: "Creating lead..." });

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Communications is not configured for lead creation.");
      }

      const { data, error } = await supabase.rpc("create_communication_lead_rpc", {
        p_conversation_id: selectedConversation.id,
      });

      if (error) {
        throw new Error(error.message);
      }

      const result =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {};
      const leadId = typeof result.lead_id === "string" ? result.lead_id : null;

      if (!leadId) {
        throw new Error("Lead creation did not return a Lead id.");
      }

      setDetailReloadToken((value) => value + 1);
      setCreatedLeadId(leadId);
      setContextTab("lead");
      setMobileDetailTab("lead");
      setCreateLeadState({
        status: "success",
        message:
          result.already_created === true
            ? "Lead already existed. Open it from this conversation."
            : "Lead created and linked to this conversation.",
      });
    } catch (error) {
      setCreateLeadState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not create this lead.",
      });
    }
  }

  async function handleSendMessage() {
    if (
      !selectedConversation ||
      (!smsDraft.trim() && pendingAttachments.length === 0) ||
      !canSendSmsFromConversation
    ) {
      return;
    }

    setSendMessageState({ status: "saving", message: "Sending message..." });

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Communications is not configured for messaging.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in again to send this message.");
      }

      const bodyText = smsDraft.trim();
      const hasAttachments = pendingAttachments.length > 0;
      const requestBody = hasAttachments ? new FormData() : JSON.stringify({ body: bodyText });

      if (requestBody instanceof FormData) {
        requestBody.set("body", bodyText);
        pendingAttachments.forEach((attachment) => {
          requestBody.append("attachments", attachment.file, attachment.file.name);
        });
      }

      const response = await fetch(
        `/api/communications/conversations/${selectedConversation.id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(hasAttachments ? {} : { "Content-Type": "application/json" }),
          },
          body: requestBody,
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message ?? "Could not send this message.");
      }

      setSmsDraft("");
      pendingAttachments.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl);
      });
      setPendingAttachments([]);
      setDetailReloadToken((value) => value + 1);
      setSendMessageState({
        status: "success",
        message: "Message sent.",
      });
    } catch (error) {
      setSendMessageState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not send this message.",
      });
      setDetailReloadToken((value) => value + 1);
    }
  }

  async function handleCreateJobFromConversation() {
    if (!selectedConversation) {
      return;
    }

    if (linkedJobId) {
      window.location.assign(withReturnTo(`/dashboard/leads/${linkedJobId}`));
      return;
    }

    setCreateLeadState({ status: "idle", message: null });
    setCreateJobState({ status: "saving", message: "Creating job..." });

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Communications is not configured for job creation.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in again to create this job.");
      }

      const response = await fetch(
        `/api/communications/conversations/${selectedConversation.id}/create-job`,
        {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allowPossibleDuplicate: true }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        conversion?: { serviceRequestId?: string | null; alreadyConverted?: boolean };
        message?: string;
        ok?: boolean;
      } | null;

      if (!response.ok || !payload?.ok || !payload.conversion?.serviceRequestId) {
        throw new Error(payload?.message ?? "Could not create this job.");
      }

      const serviceRequestId = payload.conversion.serviceRequestId;
      const { data: jobData } = await supabase
        .from("service_requests")
        .select("*")
        .eq("id", serviceRequestId)
        .maybeSingle();

      setHubState((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === selectedConversation.id
            ? { ...conversation, linkedServiceRequestId: serviceRequestId }
            : conversation,
        ),
      }));
      setDetailState((current) => ({
        ...current,
        data: {
          ...current.data,
          job: (jobData ?? current.data.job) as ServiceRequestRow | null,
          intake: current.data.intake
            ? {
                ...current.data.intake,
                linked_service_request_id: serviceRequestId,
              }
            : current.data.intake,
        },
      }));
      setContextTab("job");
      setMobileDetailTab("job");
      setDetailReloadToken((value) => value + 1);
      setCreateJobState({
        status: "success",
        message: payload.conversion.alreadyConverted
          ? "Job already existed. Opening link is available below."
          : "Job created and linked to this conversation.",
      });
    } catch (error) {
      setCreateJobState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not create this job.",
      });
    }
  }

  return (
    <>
    <main className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#0F172A]">Communications</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-[#475569]">
            All incoming calls, texts, website forms and booking requests in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["calls", "Calls"],
            ["texts", "Texts"],
            ["forms", "Forms"],
            ["booking", "Booking"],
          ] as Array<[ChannelFilter, string]>).map(([value, label]) => (
            <button
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                activeFilter === value
                  ? "border-[#0F6BFF] bg-blue-50 text-[#0F6BFF]"
                  : "border-[#E5E7EB] bg-white text-[#475569] hover:border-blue-200"
              }`}
              key={value}
              onClick={() => setActiveFilter(value)}
              type="button"
            >
              {label}
              {channelCounts[value] > 0 ? (
                <span className="ml-2 rounded-md bg-[#E2E8F0] px-1.5 py-0.5 text-xs">
                  {channelCounts[value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {hubState.status === "error" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
          {hubState.error}
        </section>
      ) : null}

      <section className="xl:hidden">
        {!mobileDetailOpen ? (
          <aside className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="border-b border-[#E5E7EB] p-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {([
                  ["inbox", "Inbox"],
                  ["assigned", "Assigned"],
                  ["archived", "Archived"],
                ] as Array<[typeof inboxTab, string]>).map(([value, label]) => (
                  <button
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${
                      inboxTab === value
                        ? "bg-blue-50 text-[#0F6BFF]"
                        : "text-[#64748B] hover:bg-[#F8FAFC]"
                    }`}
                    key={value}
                    onClick={() => setInboxTab(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                className="mt-3 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search conversations..."
                type="search"
                value={searchQuery}
              />
            </div>

            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {hubState.status === "loading" ? (
                <p className="m-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                  Loading conversations...
                </p>
              ) : filteredConversations.length === 0 ? (
                <EmptyState
                  title="No conversations yet"
                  body="Calls and future messages appear here when they match this view."
                />
              ) : (
                filteredConversations.map((conversation) => {
                  const flags = getConversationFlags(conversation);

                  return (
                    <button
                      className="w-full border-b border-[#E5E7EB] bg-white p-4 text-left transition hover:bg-[#F8FAFC]"
                      key={conversation.id}
                      onClick={() => openConversation(conversation.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#0F172A]">
                            {getConversationTitle(conversation)}
                          </p>
                          {conversation.unreadCount > 0 ? (
                            <span className="mt-1 inline-flex rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-black text-white">
                              {conversation.unreadCount}
                            </span>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-xs font-bold text-[#0F6BFF]">
                          {formatActivity(conversation)}
                        </p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-[#334155]">
                        {getConversationPreview(conversation)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone="blue">{getSourceLabel(conversation.sourceType)}</Badge>
                        <Badge tone="purple">{formatProviderName(conversation.providerName)}</Badge>
                        <Badge tone="amber">{getStatusLabel(conversation.status)}</Badge>
                        {flags.slice(0, 1).map((flag) => (
                          <Badge key={flag.label} tone={flag.tone}>
                            {flag.label}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        ) : selectedConversation ? (
          <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="border-b border-[#E5E7EB] p-4">
              <button
                className="mb-3 text-sm font-semibold text-[#0F6BFF]"
                onClick={() => setMobileDetailOpen(false)}
                type="button"
              >
                ‹ Communications
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-[#0F172A]">
                  {getConversationTitle(selectedConversation)}
                </h2>
                <Badge tone="blue">{getSourceLabel(selectedConversation.sourceType)}</Badge>
                <Badge>{getStatusLabel(selectedConversation.status)}</Badge>
              </div>
              <p className="mt-2 text-sm font-medium text-[#64748B]">
                {formatProviderName(selectedConversation.providerName)} ·{" "}
                {formatActivity(selectedConversation)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm font-semibold text-[#64748B]"
                  disabled
                  type="button"
                >
                  Assign
                </button>
                <button
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    communicationCallTarget?.phone
                      ? "border-[#0F6BFF] bg-white text-[#0F6BFF]"
                      : "border-[#E5E7EB] text-[#64748B]"
                  }`}
                  disabled={!communicationCallTarget?.phone}
                  onClick={() => setIsBrowserCallOpen(true)}
                  title={
                    communicationCallTarget?.phone
                      ? "Call this conversation"
                      : "No callable phone number is available."
                  }
                  type="button"
                >
                  Call
                </button>
                <button
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    canCreateLeadFromConversation || linkedLeadId
                      ? "border-[#0F6BFF] bg-white text-[#0F6BFF]"
                      : "border-[#E5E7EB] text-[#64748B]"
                  }`}
                  disabled={
                    createLeadState.status === "saving" ||
                    (!canCreateLeadFromConversation && !linkedLeadId)
                  }
                  onClick={() => void handleCreateLeadFromConversation()}
                  type="button"
                >
                  {createLeadState.status === "saving"
                    ? "Creating..."
                    : linkedLeadId
                      ? "Open Lead"
                      : "Create Lead"}
                </button>
                <button
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    canCreateJobFromConversation || linkedJobId
                      ? "border-[#0F6BFF] bg-[#0F6BFF] text-white"
                      : "border-[#E5E7EB] text-[#64748B]"
                  }`}
                  disabled={
                    createJobState.status === "saving" ||
                    (!canCreateJobFromConversation && !linkedJobId)
                  }
                  onClick={() => void handleCreateJobFromConversation()}
                  type="button"
                >
                  {createJobState.status === "saving"
                    ? "Creating..."
                    : linkedJobId
                      ? "Open Job"
                      : "Create Job"}
                </button>
              </div>
              {createLeadState.message ? (
                <p
                  className={`mt-3 text-sm font-semibold ${
                    createLeadState.status === "error"
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {createLeadState.message}
                </p>
              ) : createJobState.message ? (
                <p
                  className={`mt-3 text-sm font-semibold ${
                    createJobState.status === "error"
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {createJobState.message}
                </p>
              ) : createJobBlockedReason && !linkedJobId ? (
                <p className="mt-3 text-sm font-semibold text-amber-700">
                  {createJobBlockedReason}
                </p>
              ) : null}
            </div>

            <div className="flex overflow-x-auto border-b border-[#E5E7EB]">
              {([
                ["conversation", "Conversation"],
                ["customer", "Customer"],
                ["lead", "Lead"],
                ["job", "Job"],
                ["activity", "Activity"],
              ] as Array<[typeof mobileDetailTab, string]>).map(([value, label]) => (
                <button
                  className={`shrink-0 px-4 py-3 text-sm font-semibold ${
                    mobileDetailTab === value
                      ? "border-b-2 border-[#0F6BFF] text-[#0F6BFF]"
                      : "text-[#64748B]"
                  }`}
                  key={value}
                  onClick={() => setMobileDetailTab(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-4 bg-[#F8FAFC] p-4">
              {detailState.status === "loading" ? (
                <p className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-sm font-semibold text-[#64748B]">
                  Loading conversation...
                </p>
              ) : detailState.status === "error" ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                  {detailState.error}
                </p>
              ) : mobileDetailTab === "conversation" ? (
                <>
                  {requestDetailRows.length > 0 ? (
                    <RequestDetailsCard
                      rows={requestDetailRows}
                      sourceLabel={getSourceLabel(selectedConversation.sourceType)}
                    />
                  ) : null}

                  <ThreadEventTimeline
                    attachmentsByMessageId={detail.attachmentsByMessageId}
                    customerPhone={selectedConversation.customerPhone}
                    events={threadEvents}
                    expandedTranscriptByCallId={expandedTranscriptByCallId}
                    onPreviewAttachment={setPreviewAttachment}
                    onRetryTranscript={(callId) => void handleRetryTranscript(callId)}
                    onToggleTranscript={(callId) =>
                      setExpandedTranscriptByCallId((current) => ({
                        ...current,
                        [callId]: !current[callId],
                      }))
                    }
                    recordingStatesByCallId={recordingStatesByCallId}
                    retryingTranscriptCallId={retryingTranscriptCallId}
                    transcriptsById={transcriptsById}
                  />

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <div className="mb-3 flex gap-4 text-sm font-semibold">
                      <span className="text-[#0F6BFF]">Message</span>
                      <span className="text-[#64748B]">Note</span>
                      <span className="text-[#64748B]">Internal</span>
                    </div>
                    <textarea
                      className="h-24 w-full resize-none rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-sm font-medium text-[#0F172A] placeholder:text-[#94A3B8]"
                      disabled={
                        !canSendSmsFromConversation ||
                        sendMessageState.status === "saving"
                      }
                      onChange={(event) => setSmsDraft(event.target.value)}
                      placeholder={
                        sendMessageBlockedReason ?? "Type a customer-facing SMS..."
                      }
                      value={smsDraft}
                    />
                    <PendingAttachmentsPreview
                      attachments={pendingAttachments}
                      onRemove={removePendingAttachment}
                    />
                    {sendMessageState.message ? (
                      <p
                        className={`mt-2 text-xs font-semibold ${
                          sendMessageState.status === "error"
                            ? "text-red-600"
                            : "text-[#64748B]"
                        }`}
                      >
                        {sendMessageState.message}
                      </p>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <label className="mr-2 inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#0F6BFF]">
                        Photo
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          multiple
                          onChange={(event) => {
                            handleSelectMessageAttachments(event.target.files);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                      <button
                        className={`rounded-lg px-5 py-2 text-sm font-semibold text-white ${
                          canSendSmsFromConversation &&
                          (smsDraft.trim() || pendingAttachments.length > 0) &&
                          sendMessageState.status !== "saving"
                            ? "bg-[#0F6BFF]"
                            : "bg-blue-200"
                        }`}
                        disabled={
                          !canSendSmsFromConversation ||
                          (!smsDraft.trim() && pendingAttachments.length === 0) ||
                          sendMessageState.status === "saving"
                        }
                        onClick={handleSendMessage}
                        type="button"
                      >
                        {sendMessageState.status === "saving" ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </div>
                </>
              ) : mobileDetailTab === "customer" ? (
                <MobileCustomerPanel
                  conversation={selectedConversation}
                  detail={detail}
                  returnTo={destinationReturnTo}
                />
              ) : mobileDetailTab === "lead" ? (
                <MobileLeadPanel detail={detail} state={createLeadState} />
              ) : mobileDetailTab === "job" ? (
                <MobileJobPanel detail={detail} returnTo={destinationReturnTo} />
              ) : (
                <MobileActivityPanel events={detail.timelineEvents} />
              )}
            </div>
          </section>
        ) : null}
      </section>

      <section className="hidden min-h-[720px] gap-4 xl:grid xl:grid-cols-[360px_minmax(0,1fr)_340px]">
        <aside className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="border-b border-[#E5E7EB] p-4">
            <div className="flex gap-2">
              {([
                ["inbox", "Inbox"],
                ["assigned", "Assigned"],
                ["archived", "Archived"],
              ] as Array<[typeof inboxTab, string]>).map(([value, label]) => (
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    inboxTab === value
                      ? "bg-blue-50 text-[#0F6BFF]"
                      : "text-[#64748B] hover:bg-[#F8FAFC]"
                  }`}
                  key={value}
                  onClick={() => setInboxTab(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="mt-3 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations..."
              type="search"
              value={searchQuery}
            />
          </div>

          <div className="max-h-[680px] overflow-y-auto">
            {hubState.status === "loading" ? (
              <p className="m-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                Loading conversations...
              </p>
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                title="No conversations yet"
                body="Calls and future messages appear here when they match this view."
              />
            ) : (
              filteredConversations.map((conversation) => {
                const selected = conversation.id === selectedConversationId;
                const flags = getConversationFlags(conversation);

                return (
                  <button
                    className={`w-full border-b border-[#E5E7EB] p-4 text-left transition ${
                      selected
                        ? "bg-blue-50 shadow-[inset_3px_0_0_#0F6BFF]"
                        : "bg-white hover:bg-[#F8FAFC]"
                    }`}
                    key={conversation.id}
                    onClick={() => openConversation(conversation.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#0F172A]">
                          {getConversationTitle(conversation)}
                        </p>
                        {conversation.unreadCount > 0 ? (
                          <span className="mt-1 inline-flex rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-black text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-xs font-bold text-[#0F6BFF]">
                        {formatActivity(conversation)}
                      </p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-[#334155]">
                      {getConversationPreview(conversation)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="blue">{getSourceLabel(conversation.sourceType)}</Badge>
                      <Badge tone="purple">{formatProviderName(conversation.providerName)}</Badge>
                      <Badge tone="amber">{getStatusLabel(conversation.status)}</Badge>
                      {flags.slice(0, 2).map((flag) => (
                        <Badge key={flag.label} tone={flag.tone}>
                          {flag.label}
                        </Badge>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-[720px] flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          {selectedConversation ? (
            <>
              <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold text-[#0F172A]">
                      {getConversationTitle(selectedConversation)}
                    </h2>
                    <Badge tone="blue">{getSourceLabel(selectedConversation.sourceType)}</Badge>
                    <Badge>{getStatusLabel(selectedConversation.status)}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#64748B]">
                    Started {formatActivity(selectedConversation)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm font-semibold text-[#64748B]"
                    disabled
                    type="button"
                  >
                    Assign
                  </button>
                  <button
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      communicationCallTarget?.phone
                        ? "border-[#0F6BFF] bg-white text-[#0F6BFF]"
                        : "border-[#E5E7EB] text-[#64748B]"
                    }`}
                    disabled={!communicationCallTarget?.phone}
                    onClick={() => setIsBrowserCallOpen(true)}
                    title={
                      communicationCallTarget?.phone
                        ? "Call this conversation"
                        : "No callable phone number is available."
                    }
                    type="button"
                  >
                    Call
                  </button>
                  <button
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      canCreateLeadFromConversation || linkedLeadId
                        ? "border-[#0F6BFF] bg-white text-[#0F6BFF]"
                        : "border-[#E5E7EB] text-[#64748B]"
                    }`}
                    disabled={
                      createLeadState.status === "saving" ||
                      (!canCreateLeadFromConversation && !linkedLeadId)
                    }
                    onClick={() => void handleCreateLeadFromConversation()}
                    type="button"
                  >
                    {createLeadState.status === "saving"
                      ? "Creating..."
                      : linkedLeadId
                        ? "Open Lead"
                        : "Create Lead"}
                  </button>
                  <button
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      canCreateJobFromConversation || linkedJobId
                        ? "border-[#0F6BFF] bg-[#0F6BFF] text-white"
                        : "border-[#E5E7EB] text-[#64748B]"
                    }`}
                    disabled={
                      createJobState.status === "saving" ||
                      (!canCreateJobFromConversation && !linkedJobId)
                    }
                    onClick={() => void handleCreateJobFromConversation()}
                    type="button"
                  >
                    {createJobState.status === "saving"
                      ? "Creating..."
                      : linkedJobId
                        ? "Open Job"
                        : "Create Job"}
                  </button>
                </div>
                {createLeadState.message ? (
                  <p
                    className={`text-sm font-semibold ${
                      createLeadState.status === "error"
                        ? "text-amber-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {createLeadState.message}
                  </p>
                ) : createJobState.message ? (
                  <p
                    className={`text-sm font-semibold ${
                      createJobState.status === "error"
                        ? "text-amber-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {createJobState.message}
                  </p>
                ) : null}
              </div>

              {detailState.status === "loading" ? (
                <p className="m-5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                  Loading conversation...
                </p>
              ) : detailState.status === "error" ? (
                <p className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                  {detailState.error}
                </p>
              ) : (
                <>
                  <div className="flex-1 space-y-4 overflow-y-auto bg-[#F8FAFC] p-5">
                    {requestDetailRows.length > 0 ? (
                      <RequestDetailsCard
                        rows={requestDetailRows}
                        sourceLabel={getSourceLabel(selectedConversation.sourceType)}
                      />
                    ) : null}

                    {threadEvents.length === 0 && detail.transcripts.length === 0 ? (
                      <EmptyState
                        title="No conversation events yet"
                        body="Messages, call events and internal timeline entries will appear here."
                      />
                    ) : null}

                    <ThreadEventTimeline
                      attachmentsByMessageId={detail.attachmentsByMessageId}
                      customerPhone={selectedConversation.customerPhone}
                      events={threadEvents}
                      expandedTranscriptByCallId={expandedTranscriptByCallId}
                      onPreviewAttachment={setPreviewAttachment}
                      onRetryTranscript={(callId) => void handleRetryTranscript(callId)}
                      onToggleTranscript={(callId) =>
                        setExpandedTranscriptByCallId((current) => ({
                          ...current,
                          [callId]: !current[callId],
                        }))
                      }
                      recordingStatesByCallId={recordingStatesByCallId}
                      retryingTranscriptCallId={retryingTranscriptCallId}
                      transcriptsById={transcriptsById}
                    />
                  </div>

                  <div className="border-t border-[#E5E7EB] p-4">
                    <div className="mb-3 flex gap-4 text-sm font-semibold">
                      <span className="text-[#0F6BFF]">Message</span>
                      <span className="text-[#64748B]">Note</span>
                      <span className="text-[#64748B]">Internal</span>
                    </div>
                    <textarea
                      className="h-24 w-full resize-none rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-sm font-medium text-[#0F172A] placeholder:text-[#94A3B8]"
                      disabled={
                        !canSendSmsFromConversation ||
                        sendMessageState.status === "saving"
                      }
                      onChange={(event) => setSmsDraft(event.target.value)}
                      placeholder={
                        sendMessageBlockedReason ?? "Type a customer-facing SMS..."
                      }
                      value={smsDraft}
                    />
                    <PendingAttachmentsPreview
                      attachments={pendingAttachments}
                      onRemove={removePendingAttachment}
                    />
                    {sendMessageState.message ? (
                      <p
                        className={`mt-2 text-xs font-semibold ${
                          sendMessageState.status === "error"
                            ? "text-red-600"
                            : "text-[#64748B]"
                        }`}
                      >
                        {sendMessageState.message}
                      </p>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <label className="mr-2 inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#0F6BFF]">
                        Photo
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          multiple
                          onChange={(event) => {
                            handleSelectMessageAttachments(event.target.files);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                      <button
                        className={`rounded-lg px-5 py-2 text-sm font-semibold text-white ${
                          canSendSmsFromConversation &&
                          (smsDraft.trim() || pendingAttachments.length > 0) &&
                          sendMessageState.status !== "saving"
                            ? "bg-[#0F6BFF]"
                            : "bg-blue-200"
                        }`}
                        disabled={
                          !canSendSmsFromConversation ||
                          (!smsDraft.trim() && pendingAttachments.length === 0) ||
                          sendMessageState.status === "saving"
                        }
                        onClick={handleSendMessage}
                        type="button"
                      >
                        {sendMessageState.status === "saving" ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <EmptyState
              title="Select a conversation"
              body="Conversation details appear after selecting an inbox item."
            />
          )}
        </section>

        <aside className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex border-b border-[#E5E7EB]">
            {([
              ["customer", "Customer"],
              ["lead", "Lead"],
              ["job", "Job"],
              ["activity", "Activity"],
            ] as Array<[ContextTab, string]>).map(([value, label]) => (
              <button
                className={`flex-1 px-3 py-3 text-sm font-semibold ${
                  contextTab === value
                    ? "border-b-2 border-[#0F6BFF] text-[#0F6BFF]"
                    : "text-[#64748B]"
                }`}
                key={value}
                onClick={() => setContextTab(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[680px] space-y-4 overflow-y-auto p-4">
            {selectedConversation && contextTab === "customer" ? (
              <>
                <Panel title="Customer">
                  {detail.customer ? (
                    <div className="space-y-2 text-sm font-medium text-[#334155]">
                      <p className="text-base font-semibold text-[#0F172A]">
                        {detail.customer.full_name}
                      </p>
                      <p>{detail.customer.phone ?? selectedConversation.customerPhone}</p>
                      <p>{detail.customer.email ?? "No email available"}</p>
                      <p>{formatServiceAddress(detail, selectedConversation)}</p>
                      <ActionLink
                        href={withReturnTo(`/dashboard/customers/${detail.customer.id}`)}
                        label="Open Customer"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <EmptyState
                        title="Unknown customer"
                        body="Not linked to a customer yet."
                      />
                    </div>
                  )}
                </Panel>
                <Panel title="Source & Attribution">
                  {getAttributionRows(selectedConversation).length > 0 ? (
                    <div className="space-y-2">
                      {getAttributionRows(selectedConversation).map(([label, value]) => (
                        <ContextRow key={label} label={label} value={value} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No attribution captured"
                      body="Source details will appear here when present on the conversation."
                    />
                  )}
                </Panel>
              </>
            ) : null}

            {contextTab === "lead" ? (
              <LeadPanel
                detail={detail}
                state={createLeadState}
              />
            ) : null}

            {contextTab === "job" ? (
              <Panel title="Job">
                {detail.job ? (
                  <div className="space-y-2">
                    {getJobDetailRows(detail.job).map(([label, value]) => (
                      <ContextRow key={label} label={label} value={value} />
                    ))}
                    <ActionLink href={withReturnTo(`/dashboard/leads/${detail.job.id}`)} label="Open Job" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <EmptyState
                      title="No job linked"
                      body={
                        canCreateJobFromConversation
                          ? "Create a Job from this conversation."
                          : createJobBlockedReason ?? "Complete the missing request details before creating a Job."
                      }
                    />
                    {canCreateJobFromConversation ? (
                      <button
                        className="rounded-lg bg-[#0F6BFF] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={createJobState.status === "saving"}
                        onClick={() => void handleCreateJobFromConversation()}
                        type="button"
                      >
                        {createJobState.status === "saving" ? "Creating..." : "Create Job"}
                      </button>
                    ) : null}
                  </div>
                )}
              </Panel>
            ) : null}

            {contextTab === "activity" ? (
              <Panel title="Recent Activity">
                <div className="space-y-3">
                  {detail.timelineEvents.length === 0 ? (
                    <EmptyState
                      title="No activity yet"
                      body="Communication activity appears here when available."
                    />
                  ) : (
                    detail.timelineEvents.slice(0, 8).map((event) => (
                      <PreviewBlock
                        key={event.id}
                        label={event.title || getTimelineEventLabel(event.type)}
                        timestamp={event.eventTime}
                        value={event.body ?? "No details captured."}
                      />
                    ))
                  )}
                </div>
              </Panel>
            ) : null}
          </div>
        </aside>
      </section>
      {previewAttachment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/80 p-4">
          <button
            aria-label="Close photo preview"
            className="absolute inset-0"
            onClick={() => setPreviewAttachment(null)}
            type="button"
          />
          <div className="relative max-h-full max-w-4xl overflow-hidden rounded-2xl bg-white p-3 shadow-2xl">
            <button
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-sm font-black text-[#0F172A]"
              onClick={() => setPreviewAttachment(null)}
              type="button"
            >
              Close
            </button>
            {previewAttachment.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={previewAttachment.original_filename ?? "Communication attachment"}
                className="max-h-[82vh] max-w-full rounded-xl object-contain"
                src={previewAttachment.signedUrl}
              />
            ) : (
              <p className="p-8 text-sm font-semibold text-[#64748B]">
                Photo preview is unavailable.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </main>
    {isBrowserCallOpen && communicationCallTarget ? (
      <BrowserCallModal
        onClose={() => setIsBrowserCallOpen(false)}
        target={communicationCallTarget}
      />
    ) : null}
    </>
  );
}

function MessageAttachments({
  attachments,
  onPreview,
}: {
  attachments: SignedMessageAttachment[];
  onPreview: (attachment: SignedMessageAttachment) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {attachments.map((attachment) => (
        <button
          className="overflow-hidden rounded-xl border border-white/30 bg-white/10"
          key={attachment.id}
          onClick={() => onPreview(attachment)}
          type="button"
        >
          {attachment.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={attachment.original_filename ?? "Communication attachment"}
              className="aspect-square w-full object-cover"
              src={attachment.signedUrl}
            />
          ) : (
            <span className="flex aspect-square items-center justify-center px-2 text-xs font-semibold">
              Photo unavailable
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function PendingAttachmentsPreview({
  attachments,
  onRemove,
}: {
  attachments: PendingMmsAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div
          className="relative overflow-hidden rounded-xl border border-[#E5E7EB] bg-white"
          key={attachment.id}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={attachment.file.name || "Selected attachment"}
            className="h-20 w-20 object-cover"
            src={attachment.previewUrl}
          />
          <button
            aria-label="Remove photo"
            className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-xs font-black text-[#0F172A]"
            onClick={() => onRemove(attachment.id)}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function MobileCustomerPanel({
  conversation,
  detail,
  returnTo,
}: {
  conversation: HubConversation;
  detail: ConversationDetailData;
  returnTo: string;
}) {
  const withReturnTo = (href: string) =>
    `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <>
      <Panel title="Customer">
        {detail.customer ? (
          <div className="space-y-2 text-sm font-medium text-[#334155]">
            <p className="text-base font-semibold text-[#0F172A]">
              {detail.customer.full_name}
            </p>
            <p>{detail.customer.phone ?? conversation.customerPhone}</p>
            <p>{detail.customer.email ?? "No email available"}</p>
            <p>{formatServiceAddress(detail, conversation)}</p>
            <ActionLink
              href={withReturnTo(`/dashboard/customers/${detail.customer.id}`)}
              label="Open Customer"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <EmptyState title="Unknown customer" body="Not linked to a customer yet." />
          </div>
        )}
      </Panel>
      <Panel title="Source & Attribution">
        {getAttributionRows(conversation).length > 0 ? (
          <div className="space-y-2">
            {getAttributionRows(conversation).map(([label, value]) => (
              <ContextRow key={label} label={label} value={value} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No attribution captured"
            body="Source details will appear here when present on the conversation."
          />
        )}
      </Panel>
    </>
  );
}

function LeadPanel({
  detail,
  state,
}: {
  detail: ConversationDetailData;
  state: ActionState;
}) {
  if (!detail.lead) {
    return (
      <Panel title="Lead">
        <div className="space-y-3">
          <EmptyState
            title="No lead created"
            body="Use Create Lead in the conversation header to keep this opportunity open without creating a Customer or Job."
          />
          {state.message ? (
            <p
              className={`text-sm font-semibold ${
                state.status === "error" ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </Panel>
    );
  }

  const leadName =
    [detail.lead.customer_first_name, detail.lead.customer_last_name]
      .filter(Boolean)
      .join(" ") ||
    detail.lead.customer_name ||
    detail.lead.customer_phone ||
    "Unknown contact";

  return (
    <Panel title="Lead">
      <div className="space-y-2">
        <ContextRow label="Status" value={getStatusLabel(detail.lead.status)} />
        <ContextRow label="Name" value={leadName} />
        <ContextRow label="Phone" value={detail.lead.customer_phone ?? "Not captured"} />
        <ContextRow label="Email" value={detail.lead.customer_email ?? "Not captured"} />
        <ContextRow label="Address" value={detail.lead.service_address ?? "Not captured"} />
        <ContextRow
          label="Service"
          value={
            [detail.lead.brand, detail.lead.appliance_type].filter(Boolean).join(" ") ||
            "Not captured"
          }
        />
        <ContextRow
          label="Problem"
          value={detail.lead.problem_description ?? "Not captured"}
        />
      </div>
    </Panel>
  );
}

function MobileLeadPanel({
  detail,
  state,
}: {
  detail: ConversationDetailData;
  state: ActionState;
}) {
  return <LeadPanel detail={detail} state={state} />;
}

function MobileJobPanel({
  detail,
  returnTo,
}: {
  detail: ConversationDetailData;
  returnTo: string;
}) {
  const withReturnTo = (href: string) =>
    `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <Panel title="Job">
      {detail.job ? (
        <div className="space-y-2">
          {getJobDetailRows(detail.job).map(([label, value]) => (
            <ContextRow key={label} label={label} value={value} />
          ))}
          <ActionLink href={withReturnTo(`/dashboard/leads/${detail.job.id}`)} label="Open Job" />
        </div>
      ) : (
        <EmptyState
          title="No job linked"
          body="Create Job from the conversation header when the required request details are available."
        />
      )}
    </Panel>
  );
}

function MobileActivityPanel({ events }: { events: CommunicationTimelineEvent[] }) {
  return (
    <Panel title="Recent Activity">
      <div className="space-y-3">
        {events.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Communication activity appears here when available."
          />
        ) : (
          events.slice(0, 8).map((event) => (
            <PreviewBlock
              key={event.id}
              label={event.title || getTimelineEventLabel(event.type)}
              timestamp={event.eventTime}
              value={event.body ?? "No details captured."}
            />
          ))
        )}
      </div>
    </Panel>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-sm">
      <p className="font-medium text-[#64748B]">{label}</p>
      <p className="min-w-0 font-semibold text-[#0F172A]">{value}</p>
    </div>
  );
}

function RequestDetailsList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <ContextRow key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function RequestDetailsCard({
  rows,
  sourceLabel,
}: {
  rows: Array<[string, string]>;
  sourceLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#0F172A]">Request details</p>
        <Badge tone={sourceLabel === "Website" ? "purple" : "blue"}>{sourceLabel}</Badge>
      </div>
      <div className="mt-4">
        <RequestDetailsList rows={rows} />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <h2 className="text-lg font-black text-[#0F172A]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ThreadEventTimeline({
  attachmentsByMessageId,
  customerPhone,
  events,
  expandedTranscriptByCallId,
  onPreviewAttachment,
  onRetryTranscript,
  onToggleTranscript,
  recordingStatesByCallId,
  retryingTranscriptCallId,
  transcriptsById,
}: {
  attachmentsByMessageId: Record<string, SignedMessageAttachment[]>;
  customerPhone: string | null;
  events: ThreadEvent[];
  expandedTranscriptByCallId: ExpandedTranscriptByCallId;
  onPreviewAttachment: (attachment: SignedMessageAttachment) => void;
  onRetryTranscript: (callId: string) => void;
  onToggleTranscript: (callId: string) => void;
  recordingStatesByCallId: RecordingStateByCallId;
  retryingTranscriptCallId: string | null;
  transcriptsById: Map<string, TranscriptRow>;
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {events.map((event) => {
        if (event.type === "call_session") {
          return (
            <CallSessionCard
              customerPhone={customerPhone}
              expandedTranscriptByCallId={expandedTranscriptByCallId}
              key={event.id}
              onRetryTranscript={onRetryTranscript}
              onToggleTranscript={onToggleTranscript}
              recordingStatesByCallId={recordingStatesByCallId}
              retryingTranscriptCallId={retryingTranscriptCallId}
              session={event.session}
              transcriptsById={transcriptsById}
            />
          );
        }

        if (event.type === "message") {
          const message = event.message;
          const outbound = message.direction === "outbound";
          const attachments = attachmentsByMessageId[message.id] ?? [];
          return (
            <div
              className={`flex ${outbound ? "justify-end" : "justify-start"}`}
              key={event.id}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 lg:max-w-[78%] ${
                  outbound ? "bg-[#0F6BFF] text-white" : "bg-white text-[#0F172A]"
                }`}
              >
                {message.body ? (
                  <p className="text-sm font-medium leading-6">{message.body}</p>
                ) : attachments.length === 0 ? (
                  <p className="text-sm font-medium leading-6">Message body unavailable.</p>
                ) : null}
                <MessageAttachments attachments={attachments} onPreview={onPreviewAttachment} />
                <p
                  className={`mt-1 text-xs font-medium ${
                    outbound ? "text-blue-100" : "text-[#64748B]"
                  }`}
                >
                  {formatServiceRequestDate(message.occurred_at)}
                </p>
              </div>
            </div>
          );
        }

        return (
          <PreviewBlock
            key={event.id}
            label={event.event.title || getTimelineEventLabel(event.event.type)}
            timestamp={event.event.eventTime}
            value={event.event.body ?? "No details captured."}
          />
        );
      })}
    </div>
  );
}

function CallSessionCard({
  customerPhone,
  expandedTranscriptByCallId,
  onRetryTranscript,
  onToggleTranscript,
  recordingStatesByCallId,
  retryingTranscriptCallId,
  session,
  transcriptsById,
}: {
  customerPhone: string | null;
  expandedTranscriptByCallId: ExpandedTranscriptByCallId;
  onRetryTranscript: (callId: string) => void;
  onToggleTranscript: (callId: string) => void;
  recordingStatesByCallId: RecordingStateByCallId;
  retryingTranscriptCallId: string | null;
  session: CallSession;
  transcriptsById: Map<string, TranscriptRow>;
}) {
  const primaryCall = session.calls[0];
  const isMultiPhase = session.calls.length > 1;

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      {isMultiPhase ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#0F172A]">Call Session</p>
            <p className="mt-1 text-xs font-semibold text-[#64748B]">
              {getCallTimeLabel(primaryCall)} · {session.calls.length} phases
            </p>
          </div>
          <Badge tone="purple">Transferred</Badge>
        </div>
      ) : null}

      <div className={isMultiPhase ? "space-y-3" : ""}>
        {session.calls.map((call, index) => {
          const effectiveStatus = getEffectiveCallStatus(call);
          const duration = getCallDurationText(call);
          const hasTranscript = Boolean(call.transcript_id);
          const hasRecording = Boolean(call.recording_reference);
          const recordingState =
            recordingStatesByCallId[call.id] ??
            ({
              status: "loading",
              recording: null,
              audioUrl: null,
              message: null,
            } satisfies RecordingState);
          const canRetryTranscript =
            call.provider_name === "telnyx" &&
            hasRecording &&
            !hasTranscript &&
            retryingTranscriptCallId !== call.id;
          const transcript = call.transcript_id
            ? transcriptsById.get(call.transcript_id) ?? null
            : null;
          const isTranscriptExpanded = expandedTranscriptByCallId[call.id] === true;

          return (
            <div
              className={isMultiPhase ? "rounded-lg border border-[#E5E7EB] bg-white p-3" : ""}
              key={call.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#0F172A]">
                    {isMultiPhase ? `Phase ${index + 1}: ` : ""}
                    {getCallDisplayTitle(call)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#64748B]">
                    {getCallTimeLabel(call)}
                    {duration ? ` · ${duration}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#64748B]">
                    {getCallParticipantLabel(call, customerPhone)}
                  </p>
                </div>
                <Badge tone={effectiveStatus === "missed" ? "amber" : "blue"}>
                  {formatCallStatus(effectiveStatus)}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={hasRecording ? "blue" : "slate"}>
                  {hasRecording ? "Recording" : "No recording yet"}
                </Badge>
                <Badge tone={hasTranscript ? "emerald" : "slate"}>
                  {hasTranscript ? "Transcript" : "No transcript yet"}
                </Badge>
              </div>

              {canRetryTranscript ? (
                <button
                  className="mt-3 text-xs font-black text-[#0F6BFF]"
                  onClick={() => onRetryTranscript(call.id)}
                  type="button"
                >
                  Retry transcription
                </button>
              ) : retryingTranscriptCallId === call.id ? (
                <p className="mt-3 text-xs font-black text-[#64748B]">
                  Retrying transcription...
                </p>
              ) : null}

              {transcript?.transcript_text ? (
                <TranscriptPanel
                  expanded={isTranscriptExpanded}
                  onToggle={() => onToggleTranscript(call.id)}
                  segments={getTranscriptDialogueSegments(transcript.speaker_segments)}
                  text={transcript.transcript_text}
                />
              ) : null}

              {hasRecording ? (
                <div className="mt-3">
                  <RecordingPlayer recordingState={recordingState} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "blue" | "amber" | "emerald" | "slate" | "purple";
}) {
  const classes = {
    blue: "bg-blue-50 text-[#0F6BFF]",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-[#F8FAFC] text-[#64748B]",
    purple: "bg-purple-50 text-purple-700",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-black ${classes[tone]}`}>
      {children}
    </span>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#0F172A] transition hover:border-[#0F6BFF] hover:bg-blue-50 hover:text-[#0F6BFF]"
      href={href}
    >
      {label}
    </Link>
  );
}

function PreviewBlock({
  label,
  value,
  timestamp,
}: {
  label: string;
  value: string;
  timestamp: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
        {label}
      </p>
      <p className="mt-2 line-clamp-6 text-sm font-semibold leading-6 text-[#334155]">
        {value}
      </p>
      <p className="mt-2 text-xs font-bold text-[#64748B]">
        {formatServiceRequestDate(timestamp)}
      </p>
    </div>
  );
}

function RecordingPlayer({ recordingState }: { recordingState: RecordingState }) {
  const audioUrl = recordingState.status === "ready" ? recordingState.audioUrl : null;

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-sm font-semibold leading-6 text-[#334155]">
        {recordingState.status === "loading"
          ? "Loading recording..."
          : recordingState.status === "error"
            ? recordingState.message
            : audioUrl
              ? "Recording available."
              : recordingState.message ?? "No recording available."}
      </p>
      {recordingState.status === "ready" && recordingState.recording?.durationMs ? (
        <p className="mt-1 text-xs font-bold text-[#64748B]">
          Duration {formatDuration(recordingState.recording.durationMs)}
        </p>
      ) : null}
      {audioUrl ? (
        <audio className="mt-3 w-full" controls preload="none" src={audioUrl}>
          <track kind="captions" />
        </audio>
      ) : null}
    </div>
  );
}

type TranscriptDialogueSegment = {
  speaker: "agent" | "customer" | "human_transfer";
  text: string;
};

function getTranscriptDialogueSegments(value: Json): TranscriptDialogueSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): TranscriptDialogueSegment | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const speaker =
        record.speaker === "agent" || record.speaker === "ai"
          ? "agent"
          : record.speaker === "customer"
            ? "customer"
            : record.speaker === "human_transfer"
              ? "human_transfer"
              : null;
      const text = typeof record.text === "string" && record.text.trim()
        ? record.text.trim()
        : null;

      return speaker && text ? { speaker, text } : null;
    })
    .filter((segment): segment is TranscriptDialogueSegment => Boolean(segment));
}

function TranscriptPanel({
  expanded,
  onToggle,
  segments,
  text,
}: {
  expanded: boolean;
  onToggle: () => void;
  segments: TranscriptDialogueSegment[];
  text: string;
}) {
  const previewText =
    segments[0]?.text ??
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ??
    "Transcript available.";

  return (
    <div className="mt-4 rounded-xl bg-[#F8FAFC] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
          Transcript
        </p>
        <button
          className="text-xs font-black text-[#0F6BFF]"
          onClick={onToggle}
          type="button"
        >
          {expanded ? "Hide transcript" : "Show transcript"}
        </button>
      </div>
      {!expanded ? (
        <p className="mt-2 line-clamp-1 text-sm font-medium leading-6 text-[#334155]">
          {previewText}
        </p>
      ) : segments.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {segments.map((segment, index) => (
            <p
              className="whitespace-pre-line text-sm font-medium leading-5 text-[#334155]"
              key={`${segment.speaker}-${index}`}
            >
              <span className="font-black uppercase text-[#475569]">
                {segment.speaker === "agent"
                  ? "Sarah"
                  : segment.speaker === "human_transfer"
                    ? "Serhii"
                    : "Customer"}:
              </span>{" "}
              {segment.text}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-[#334155]">
          {text}
        </p>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
      <p className="text-sm font-black text-[#0F172A]">{title}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">{body}</p>
    </div>
  );
}
