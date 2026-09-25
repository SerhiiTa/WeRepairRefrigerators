"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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
type TranscriptRow = PublicSchema["Tables"]["communication_transcripts"]["Row"];

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

type CreateJobState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type ConversationDetailData = {
  intake: IntakeRequestRow | null;
  customer: CustomerRow | null;
  appliance: CustomerApplianceRow | null;
  job: ServiceRequestRow | null;
  messages: MessageRow[];
  transcripts: TranscriptRow[];
  timelineEvents: CommunicationTimelineEvent[];
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
  created_at: string;
  updated_at: string;
};

type HubConversation = CommunicationConversation & {
  sourceAccountId: string | null;
  inboundSourceId: string | null;
  attribution: Json | null;
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
  customer: null,
  appliance: null,
  job: null,
  messages: [],
  transcripts: [],
  timelineEvents: [],
};

type ContextTab = "customer" | "intake" | "job" | "activity";
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

function getChannelFilter(conversation: HubConversation): ChannelFilter {
  if (conversation.sourceType === "phone") {
    return "calls";
  }
  if (conversation.sourceType === "sms") {
    return "texts";
  }
  if (conversation.sourceType === "website_form") {
    return "forms";
  }
  if (getAttributionValue(conversation.attribution, "channel") === "booking_widget") {
    return "booking";
  }

  return "all";
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
  return conversation.summary ?? conversation.nextAction ?? "No message preview yet.";
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

function isTrustedWebsiteBooking(detail: ConversationDetailData, conversation: HubConversation) {
  return (
    conversation.sourceType === "website_form" &&
    getJsonString(detail.intake?.raw_payload, "event_type") === "booking_request" &&
    Boolean(detail.intake?.id)
  );
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

function getRequiredNextAction(detail: ConversationDetailData, conversation: CommunicationConversation) {
  if (!detail.intake) {
    return "Review conversation";
  }

  if (!detail.customer) {
    return "Create / Match Customer";
  }

  if (!detail.appliance && (detail.intake.appliance_type || detail.job?.appliance_type)) {
    return "Create / Match Appliance";
  }

  if (!detail.job) {
    return "Convert to Job";
  }

  if (detail.job.status === "scheduled" || detail.job.status === "contacted") {
    return "Open Job";
  }

  return conversation.status === "resolved" ? "No action needed" : "Open Job";
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
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() =>
    getInitialQueryParam("conversation"),
  );
  const [detailState, setDetailState] = useState<DetailState>({
    status: "idle",
    data: emptyDetailData,
    error: null,
  });
  const [recordingState, setRecordingState] = useState<RecordingState>({
    status: "idle",
    recording: null,
    audioUrl: null,
    message: null,
  });
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
  const [createJobState, setCreateJobState] = useState<CreateJobState>({
    status: "idle",
    message: null,
  });

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
          "id,primary_source_type,status,provider_name,customer_display_name,customer_id,customer_phone,customer_email,service_address,summary,next_action,last_event_at,call_started_at,call_ended_at,intake_request_id,service_request_id,source_account_id,inbound_source_id,attribution,created_at,updated_at",
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

      const conversations = ((data ?? []) as ConversationRow[]).map(mapConversation);

      setHubState({ status: "ready", conversations, error: null });
      setSelectedConversationId((current) => current ?? conversations[0]?.id ?? null);
    }

    void loadConversations();

    return () => {
      isMounted = false;
    };
  }, []);

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

      const [messagesResult, transcriptsResult, timelineResult, intakeResult] =
        await Promise.all([
          supabase
            .from("communication_messages")
            .select("*")
            .eq("conversation_id", selectedConversationId)
            .order("occurred_at", { ascending: false })
            .limit(5),
          supabase
            .from("communication_transcripts")
            .select("*")
            .eq("conversation_id", selectedConversationId)
            .order("created_at", { ascending: false })
            .limit(2),
          supabase
            .from("communication_timeline_events")
            .select(
              "id,event_type,title,body,event_time,service_request_id,appointment_id,estimate_id,invoice_id",
            )
            .eq("conversation_id", selectedConversationId)
            .order("event_time", { ascending: false })
            .limit(30),
          conversation.linkedIntakeRequestId
            ? supabase
                .from("intake_requests")
                .select("*")
                .eq("id", conversation.linkedIntakeRequestId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

      if (!isMounted) {
        return;
      }

      if (messagesResult.error || transcriptsResult.error || timelineResult.error) {
        setDetailState({
          status: "error",
          data: emptyDetailData,
          error: "Conversation detail is unavailable right now.",
        });
        return;
      }

      const intake = (intakeResult.data ?? null) as IntakeRequestRow | null;
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
          customer: (customerResult.data ?? null) as CustomerRow | null,
          appliance: (applianceResult.data ?? null) as CustomerApplianceRow | null,
          job,
          messages: (messagesResult.data ?? []) as MessageRow[],
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
    let isMounted = true;
    let audioObjectUrl: string | null = null;

    async function loadRecording() {
      if (!selectedConversationId) {
        setRecordingState({ status: "idle", recording: null, audioUrl: null, message: null });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setRecordingState({
          status: "error",
          recording: null,
          audioUrl: null,
          message: "Recording lookup is not configured for this workspace.",
        });
        return;
      }

      setRecordingState({ status: "loading", recording: null, audioUrl: null, message: null });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (isMounted) {
          setRecordingState({
            status: "error",
            recording: null,
            audioUrl: null,
            message: "Log in again to load call recordings.",
          });
        }
        return;
      }

      const response = await fetch(
        `/api/communications/retell-recording?conversationId=${encodeURIComponent(
          selectedConversationId,
        )}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );
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
        setRecordingState({
          status: "error",
          recording: null,
          audioUrl: null,
          message: payload?.message ?? "Could not load call recording.",
        });
        return;
      }

      let audioUrl: string | null = null;
      let message = payload.message ?? null;

      if (payload.recording && !message) {
        const audioResponse = await fetch(
          `/api/communications/retell-recording/audio?conversationId=${encodeURIComponent(
            selectedConversationId,
          )}`,
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
          audioObjectUrl = URL.createObjectURL(audioBlob);
          audioUrl = audioObjectUrl;
        } else {
          message = "Recording metadata loaded, but audio playback is unavailable.";
        }
      }

      setRecordingState({
        status: "ready",
        recording: payload.recording ?? null,
        audioUrl,
        message,
      });
    }

    void loadRecording();

    return () => {
      isMounted = false;
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
      }
    };
  }, [selectedConversationId]);

  const selectedConversation = useMemo(
    () =>
      hubState.conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ) ?? null,
    [hubState.conversations, selectedConversationId],
  );
  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return hubState.conversations.filter((conversation) => {
      const matchesFilter =
        activeFilter === "all" || getChannelFilter(conversation) === activeFilter;
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
      calls: hubState.conversations.filter((item) => getChannelFilter(item) === "calls").length,
      texts: hubState.conversations.filter((item) => getChannelFilter(item) === "texts").length,
      forms: hubState.conversations.filter((item) => getChannelFilter(item) === "forms").length,
      booking: hubState.conversations.filter((item) => getChannelFilter(item) === "booking").length,
    }),
    [hubState.conversations],
  );
  const detail = detailState.data;
  const latestTranscript = detail.transcripts[0] ?? null;
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
  const recordingAudioUrl = recordingState.status === "ready" ? recordingState.audioUrl : null;
  const requiredAction = selectedConversation
    ? getRequiredNextAction(detail, selectedConversation)
    : "Select conversation";
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
    setCreateJobState({ status: "idle", message: null });
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
  const intakeHref = detail.intake
    ? `/dashboard/intake?selected=${encodeURIComponent(detail.intake.id)}`
    : "/dashboard/intake";
  const canCreateJobFromConversation = Boolean(
    selectedConversation &&
      detail.intake &&
      isTrustedWebsiteBooking(detail, selectedConversation) &&
      !detail.job &&
      !detail.intake.linked_service_request_id,
  );
  const linkedJobId =
    detail.job?.id ??
    detail.intake?.linked_service_request_id ??
    selectedConversation?.linkedServiceRequestId ??
    null;
  const requestDetailRows = selectedConversation
    ? getRequestDetailRows(detail, selectedConversation)
    : [];

  async function handleCreateJobFromConversation() {
    if (!selectedConversation || !detail.intake) {
      return;
    }

    if (linkedJobId) {
      window.location.assign(withReturnTo(`/dashboard/leads/${linkedJobId}`));
      return;
    }

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

      const response = await fetch(`/api/intake/${detail.intake.id}/convert`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allowPossibleDuplicate: true }),
      });
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
                        <p className="min-w-0 truncate text-sm font-black text-[#0F172A]">
                          {getConversationTitle(conversation)}
                        </p>
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
                {detail.intake ? (
                  <ActionLink href={withReturnTo(intakeHref)} label="Open Intake" />
                ) : (
                  <ActionLink href={withReturnTo(intakeHref)} label="Create Intake" />
                )}
              </div>
              {createJobState.message ? (
                <p
                  className={`mt-3 text-sm font-semibold ${
                    createJobState.status === "error"
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {createJobState.message}
                </p>
              ) : null}
            </div>

            <div className="flex overflow-x-auto border-b border-[#E5E7EB]">
              {([
                ["conversation", "Conversation"],
                ["customer", "Customer"],
                ["intake", "Intake"],
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
                  {selectedConversation.sourceType === "phone" ? (
                    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <p className="text-sm font-semibold text-[#0F172A]">Inbound call</p>
                      <p className="mt-1 text-xs font-medium text-[#64748B]">
                        {selectedConversation.customerPhone ?? "No phone captured"}
                        {recordingState.status === "ready" &&
                        recordingState.recording?.durationMs
                          ? ` · ${formatDuration(recordingState.recording.durationMs)}`
                          : ""}
                      </p>
                      {latestTranscript?.transcript_text ? (
                        <div className="mt-4">
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                            Transcript
                          </p>
                          <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-[#334155]">
                            {latestTranscript.transcript_text}
                          </p>
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <RecordingPlayer
                          audioUrl={recordingAudioUrl}
                          recordingState={recordingState}
                        />
                      </div>
                    </div>
                  ) : null}

                  {requestDetailRows.length > 0 ? (
                    <RequestDetailsCard rows={requestDetailRows} />
                  ) : null}

                  {chronologicalMessages.map((message) => {
                    const outbound = message.direction === "outbound";
                    return (
                      <div
                        className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                        key={message.id}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                            outbound
                              ? "bg-[#0F6BFF] text-white"
                              : "bg-white text-[#0F172A]"
                          }`}
                        >
                          <p className="text-sm font-medium leading-6">
                            {message.body ?? "Message body unavailable."}
                          </p>
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
                  })}

                  {visibleTimeline.slice(-6).map((event) => (
                    <PreviewBlock
                      key={event.id}
                      label={event.title || getTimelineEventLabel(event.type)}
                      timestamp={event.eventTime}
                      value={event.body ?? "No details captured."}
                    />
                  ))}

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <div className="mb-3 flex gap-4 text-sm font-semibold">
                      <span className="text-[#0F6BFF]">Message</span>
                      <span className="text-[#64748B]">Note</span>
                      <span className="text-[#64748B]">Internal</span>
                    </div>
                    <textarea
                      className="h-24 w-full resize-none rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-sm font-medium text-[#64748B]"
                      disabled
                      placeholder="Outbound messaging is not connected yet."
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        className="rounded-lg bg-blue-200 px-5 py-2 text-sm font-semibold text-white"
                        disabled
                        type="button"
                      >
                        Send
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
              ) : mobileDetailTab === "intake" ? (
                <MobileIntakePanel
                  detail={detail}
                  requestDetailRows={requestDetailRows}
                  requiredAction={requiredAction}
                  returnTo={destinationReturnTo}
                />
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
                  {detail.intake ? (
                    <ActionLink href={withReturnTo(intakeHref)} label="Open Intake" />
                  ) : (
                    <ActionLink href={withReturnTo(intakeHref)} label="Create Intake" />
                  )}
                </div>
                {createJobState.message ? (
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
                    {selectedConversation.sourceType === "phone" ? (
                      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#0F172A]">
                              Inbound call
                            </p>
                            <p className="mt-1 text-xs font-medium text-[#64748B]">
                              {selectedConversation.customerPhone ?? "No phone captured"}
                              {recordingState.status === "ready" &&
                              recordingState.recording?.durationMs
                                ? ` · ${formatDuration(recordingState.recording.durationMs)}`
                                : ""}
                            </p>
                          </div>
                          <Badge tone="blue">Call</Badge>
                        </div>
                        {latestTranscript?.transcript_text ? (
                          <div className="mt-4 rounded-xl bg-[#F8FAFC] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                              Transcript
                            </p>
                            <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-[#334155]">
                              {latestTranscript.transcript_text}
                            </p>
                          </div>
                        ) : null}
                        <div className="mt-3">
                          <RecordingPlayer
                            audioUrl={recordingAudioUrl}
                            recordingState={recordingState}
                          />
                        </div>
                      </div>
                    ) : null}

                    {requestDetailRows.length > 0 ? (
                      <RequestDetailsCard rows={requestDetailRows} />
                    ) : null}

                    {chronologicalMessages.length === 0 &&
                    visibleTimeline.length === 0 &&
                    !latestTranscript ? (
                      <EmptyState
                        title="No conversation events yet"
                        body="Messages, call events and internal timeline entries will appear here."
                      />
                    ) : null}

                    {chronologicalMessages.map((message) => {
                      const outbound = message.direction === "outbound";
                      return (
                        <div
                          className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                          key={message.id}
                        >
                          <div
                            className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                              outbound
                                ? "bg-[#0F6BFF] text-white"
                                : "bg-white text-[#0F172A]"
                            }`}
                          >
                            <p className="text-sm font-medium leading-6">
                              {message.body ?? "Message body unavailable."}
                            </p>
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
                    })}

                    {visibleTimeline.slice(-6).map((event) => (
                      <div
                        className="rounded-xl border border-[#E5E7EB] bg-white p-3"
                        key={event.id}
                      >
                        <p className="text-sm font-semibold text-[#0F172A]">
                          {event.title || getTimelineEventLabel(event.type)}
                        </p>
                        {event.body ? (
                          <p className="mt-1 text-sm font-medium leading-6 text-[#64748B]">
                            {event.body}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs font-medium text-[#64748B]">
                          {formatServiceRequestDate(event.eventTime)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-[#E5E7EB] p-4">
                    <div className="mb-3 flex gap-4 text-sm font-semibold">
                      <span className="text-[#0F6BFF]">Message</span>
                      <span className="text-[#64748B]">Note</span>
                      <span className="text-[#64748B]">Internal</span>
                    </div>
                    <textarea
                      className="h-24 w-full resize-none rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-sm font-medium text-[#64748B]"
                      disabled
                      placeholder="Outbound messaging is not connected yet."
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        className="rounded-lg bg-blue-200 px-5 py-2 text-sm font-semibold text-white"
                        disabled
                        type="button"
                      >
                        Send
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
              ["intake", "Intake"],
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
                      <ActionLink href={withReturnTo(intakeHref)} label="Link to customer" />
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

            {contextTab === "intake" ? (
              <Panel title="Intake">
                {detail.intake ? (
                  <div className="space-y-2">
                    {requestDetailRows.length > 0 ? (
                      <RequestDetailsList rows={requestDetailRows} />
                    ) : null}
                    <ContextRow label="Status" value={getStatusLabel(detail.intake.status)} />
                    <ContextRow
                      label="Problem"
                      value={detail.intake.problem_description ?? "Not captured"}
                    />
                    <ActionLink href={withReturnTo(intakeHref)} label="Review Intake" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <EmptyState title="No intake created yet" body={requiredAction} />
                    <ActionLink href={withReturnTo(intakeHref)} label="Create intake request" />
                  </div>
                )}
              </Panel>
            ) : null}

            {contextTab === "job" ? (
              <Panel title="Job">
                {detail.job ? (
                  <div className="space-y-2">
                    <ContextRow label="Status" value={getStatusLabel(detail.job.status)} />
                    <ContextRow label="Customer" value={detail.job.customer_name} />
                    <ContextRow label="Problem" value={detail.job.issue_description} />
                    <ActionLink href={withReturnTo(`/dashboard/leads/${detail.job.id}`)} label="Open Job" />
                  </div>
                ) : (
                  <EmptyState
                    title="No job linked"
                    body="Create Job is reserved for a later backend workflow."
                  />
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
    </main>
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
  const intakeHref = detail.intake
    ? `/dashboard/intake?selected=${encodeURIComponent(detail.intake.id)}`
    : "/dashboard/intake";

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
            <ActionLink href={withReturnTo(intakeHref)} label="Link to customer" />
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

function MobileIntakePanel({
  detail,
  requestDetailRows,
  requiredAction,
  returnTo,
}: {
  detail: ConversationDetailData;
  requestDetailRows: Array<[string, string]>;
  requiredAction: string;
  returnTo: string;
}) {
  const withReturnTo = (href: string) =>
    `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
  const intakeHref = detail.intake
    ? `/dashboard/intake?selected=${encodeURIComponent(detail.intake.id)}`
    : "/dashboard/intake";

  return (
    <Panel title="Intake">
      {detail.intake ? (
        <div className="space-y-2">
          <ContextRow label="Status" value={getStatusLabel(detail.intake.status)} />
          <ContextRow
            label="Problem"
            value={detail.intake.problem_description ?? "Not captured"}
          />
          {requestDetailRows.length > 0 ? (
            <RequestDetailsList rows={requestDetailRows} />
          ) : null}
          <ActionLink href={withReturnTo(intakeHref)} label="Review Intake" />
        </div>
      ) : (
        <div className="space-y-3">
          <EmptyState title="No intake created yet" body={requiredAction} />
          <ActionLink href={withReturnTo(intakeHref)} label="Create intake request" />
        </div>
      )}
    </Panel>
  );
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
          <ContextRow label="Status" value={getStatusLabel(detail.job.status)} />
          <ContextRow label="Customer" value={detail.job.customer_name} />
          <ContextRow label="Problem" value={detail.job.issue_description} />
          <ActionLink href={withReturnTo(`/dashboard/leads/${detail.job.id}`)} label="Open Job" />
        </div>
      ) : (
        <EmptyState
          title="No job linked"
          body="Create Job is reserved for a later backend workflow."
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

function RequestDetailsCard({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#0F172A]">Request details</p>
        <Badge tone="purple">Website</Badge>
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

function RecordingPlayer({
  audioUrl,
  recordingState,
}: {
  audioUrl: string | null;
  recordingState: RecordingState;
}) {
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
      <p className="text-sm font-black text-[#0F172A]">{title}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">{body}</p>
    </div>
  );
}
