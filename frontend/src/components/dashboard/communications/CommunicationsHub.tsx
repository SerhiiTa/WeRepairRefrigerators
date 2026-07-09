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
  PublicSchema,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type MessageRow = PublicSchema["Tables"]["communication_messages"]["Row"];
type TranscriptRow = PublicSchema["Tables"]["communication_transcripts"]["Row"];

type HubState =
  | { status: "loading"; conversations: CommunicationConversation[]; error: null }
  | { status: "ready"; conversations: CommunicationConversation[]; error: null }
  | { status: "error"; conversations: CommunicationConversation[]; error: string };

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
  created_at: string;
  updated_at: string;
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

function mapConversation(row: ConversationRow): CommunicationConversation {
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

function getProblemSummary(conversation: CommunicationConversation, detail: ConversationDetailData) {
  return (
    detail.job?.issue_description ??
    detail.intake?.problem_description ??
    conversation.summary ??
    "Not captured"
  );
}

function getApplianceSummary(detail: ConversationDetailData) {
  const applianceType =
    detail.appliance?.appliance_type ??
    detail.job?.appliance_type ??
    detail.intake?.appliance_type;
  const brand =
    detail.appliance?.brand ?? detail.job?.appliance_brand ?? detail.intake?.brand;

  return [brand, applianceType].filter(Boolean).join(" ") || "Not captured";
}

function getApplianceMatchStatus(detail: ConversationDetailData) {
  if (detail.appliance) {
    return "Matched";
  }

  if (
    detail.job?.customer_appliance_id ||
    detail.job?.appliance_type ||
    detail.intake?.appliance_type
  ) {
    return "Possible match";
  }

  return "Not matched";
}

function getJobState(detail: ConversationDetailData) {
  if (detail.job) {
    return "Converted job exists";
  }

  if (detail.intake) {
    return "No job yet";
  }

  return "No intake or job yet";
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
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
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
          "id,primary_source_type,status,provider_name,customer_display_name,customer_id,customer_phone,customer_email,service_address,summary,next_action,last_event_at,call_started_at,call_ended_at,intake_request_id,service_request_id,created_at,updated_at",
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
  }, [hubState.conversations, selectedConversationId]);

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
  const detail = detailState.data;
  const latestMessage = detail.messages[0] ?? null;
  const latestTranscript = detail.transcripts[0] ?? null;
  const recordingAudioUrl = recordingState.status === "ready" ? recordingState.audioUrl : null;
  const requiredAction = selectedConversation
    ? getRequiredNextAction(detail, selectedConversation)
    : "Select conversation";

  return (
    <main className="space-y-5">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
            Communications Hub
          </p>
          <h1 className="text-2xl font-black text-[#0F172A]">
            Calls, Messages, and Intake
          </h1>
          <p className="max-w-3xl text-sm font-semibold leading-6 text-[#64748B]">
            Decide what happened after a customer contact: who called, what they said,
            whether the customer/intake/job exists, and what action is required next.
          </p>
        </div>
      </section>

      {hubState.status === "error" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
          {hubState.error}
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.1fr_0.9fr]">
        <aside className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0F172A]">Conversations</h2>
              <p className="mt-1 text-sm font-semibold text-[#64748B]">
                Calls and future messages needing review.
              </p>
            </div>
            <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-black text-[#64748B]">
              {hubState.conversations.length}
            </span>
          </div>

          <div className="mt-4 max-h-[72rem] space-y-2 overflow-y-auto pr-1">
            {hubState.status === "loading" ? (
              <p className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                Loading conversations...
              </p>
            ) : hubState.conversations.length === 0 ? (
              <EmptyState
                title="No conversations yet"
                body="Phone calls and future messages appear here when they are available."
              />
            ) : (
              hubState.conversations.map((conversation) => {
                const selected = conversation.id === selectedConversationId;
                const flags = getConversationFlags(conversation);

                return (
                  <button
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-[#0F6BFF] bg-blue-50"
                        : "border-[#E5E7EB] bg-white hover:border-blue-200 hover:bg-[#F8FAFC]"
                    }`}
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#0F172A]">
                          {conversation.customerDisplayName ?? "Unknown customer"}
                        </p>
                        <p className="mt-1 truncate text-xs font-bold text-[#64748B]">
                          {[conversation.customerPhone, conversation.customerEmail]
                            .filter(Boolean)
                            .join(" · ") || "No contact captured"}
                        </p>
                      </div>
                      <Badge tone="blue">{getSourceLabel(conversation.sourceType)}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-[#64748B]">
                      {conversation.summary ?? conversation.nextAction ?? "No summary yet."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{formatProviderName(conversation.providerName)}</Badge>
                      <Badge tone="amber">{getStatusLabel(conversation.status)}</Badge>
                      {flags.slice(0, 2).map((flag) => (
                        <Badge key={flag.label} tone={flag.tone}>
                          {flag.label}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-[#64748B]">
                      {formatActivity(conversation)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          {selectedConversation ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                  Decision Card
                </p>
                <h2 className="mt-1 text-xl font-black text-[#0F172A]">
                  {requiredAction}
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">
                  This card answers the post-call workflow questions. Use the
                  existing action links below when the decision is clear.
                </p>
              </div>

              {detailState.status === "loading" ? (
                <p className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                  Loading decision context...
                </p>
              ) : detailState.status === "error" ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                  {detailState.error}
                </p>
              ) : (
                <>
                  <div className="grid gap-3">
                    <DecisionRow
                      label="Who contacted us?"
                      value={
                        detail.customer?.full_name ??
                        selectedConversation.customerDisplayName ??
                        "Unknown customer"
                      }
                      helper={
                        [detail.customer?.phone ?? selectedConversation.customerPhone,
                        detail.customer?.email ?? selectedConversation.customerEmail]
                          .filter(Boolean)
                          .join(" · ") || "Contact details not captured"
                      }
                    />
                    <DecisionRow
                      label="What did they say?"
                      value={getProblemSummary(selectedConversation, detail)}
                      helper={formatServiceAddress(detail, selectedConversation)}
                    />
                    <DecisionRow
                      label="Existing customer?"
                      value={detail.customer ? "Matched" : "Not matched"}
                      helper={
                        detail.customer
                          ? "Customer object opens the Customer CRM."
                          : "Use Intake to create or match the customer."
                      }
                    />
                    <DecisionRow
                      label="Intake?"
                      value={detail.intake ? getStatusLabel(detail.intake.status) : "No intake"}
                      helper={
                        detail.intake
                          ? "Review or convert from the Intake Inbox."
                          : "No intake is linked to this conversation yet."
                      }
                    />
                    <DecisionRow
                      label="Appliance?"
                      value={getApplianceMatchStatus(detail)}
                      helper={getApplianceSummary(detail)}
                    />
                    <DecisionRow
                      label="Job?"
                      value={getJobState(detail)}
                      helper={
                        detail.job
                          ? `${getStatusLabel(detail.job.status)} · ${detail.job.customer_name}`
                          : "Convert the intake to a job when ready."
                      }
                    />
                  </div>

                  <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                      Required next action
                    </p>
                    <p className="mt-1 text-lg font-black text-[#0F172A]">
                      {requiredAction}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detail.intake ? (
                        <ActionLink href="/dashboard/intake" label="Review Intake" />
                      ) : null}
                      {detail.intake && !detail.customer ? (
                        <ActionLink href="/dashboard/intake" label="Create / Match Customer" />
                      ) : null}
                      {detail.intake && !detail.appliance && getApplianceMatchStatus(detail) !== "Not matched" ? (
                        <ActionLink href="/dashboard/intake" label="Create / Match Appliance" />
                      ) : null}
                      {detail.intake && !detail.job ? (
                        <ActionLink href="/dashboard/intake" label="Convert to Job" />
                      ) : null}
                      {detail.customer ? (
                        <ActionLink
                          href={`/dashboard/customers/${detail.customer.id}`}
                          label="Open Customer"
                        />
                      ) : null}
                      {detail.job ? (
                        <ActionLink href={`/dashboard/leads/${detail.job.id}`} label="Open Job" />
                      ) : null}
                      {!detail.intake && !detail.customer && !detail.job ? (
                        <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#64748B]">
                          No action link yet
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <EmptyState
              title="Select a conversation"
              body="The decision card appears after selecting a conversation."
            />
          )}
        </section>

        <aside className="space-y-5">
          <Panel title="Transcript / Messages">
            {latestMessage ? (
              <PreviewBlock
                label={`${getStatusLabel(latestMessage.direction)} message`}
                value={latestMessage.body ?? "Message body unavailable."}
                timestamp={latestMessage.occurred_at}
              />
            ) : latestTranscript ? (
              <PreviewBlock
                label="Latest transcript"
                value={latestTranscript.transcript_text ?? "Transcript text unavailable."}
                timestamp={latestTranscript.created_at}
              />
            ) : (
              <EmptyState
                title="No transcript yet"
                body="Transcript or message text will appear here when available."
              />
            )}
          </Panel>

          <Panel title="Call Recording">
            <RecordingPlayer audioUrl={recordingAudioUrl} recordingState={recordingState} />
          </Panel>

          <Panel title="Timeline">
            <div className="space-y-3">
              {detail.timelineEvents.length === 0 ? (
                <EmptyState
                  title="No business timeline yet"
                  body="Incoming call, intake, job, estimate, invoice, and repair events will appear here."
                />
              ) : (
                detail.timelineEvents.map((event) => (
                  <div
                    className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3"
                    key={event.id}
                  >
                    <p className="text-sm font-black text-[#0F172A]">
                      {event.title || getTimelineEventLabel(event.type)}
                    </p>
                    {event.body ? (
                      <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">
                        {event.body}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs font-bold text-[#64748B]">
                      {formatServiceRequestDate(event.eventTime)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function DecisionRow({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-[#0F172A]">{value}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">{helper}</p>
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
