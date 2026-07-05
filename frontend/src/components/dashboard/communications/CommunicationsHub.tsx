"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  filterBusinessTimelineEvents,
  getTimelineEventLabel,
  type CommunicationConversation,
  type CommunicationTimelineEvent,
} from "@/lib/communications";
import {
  formatServiceRequestDate,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  DatabaseCommunicationTimelineEventType,
  DatabaseCommunicationSourceType,
} from "@/lib/supabase/types";

type HubState =
  | { status: "loading"; conversations: CommunicationConversation[]; error: null }
  | { status: "ready"; conversations: CommunicationConversation[]; error: null }
  | { status: "error"; conversations: CommunicationConversation[]; error: string };

type TimelineState =
  | { status: "idle"; events: CommunicationTimelineEvent[]; error: null }
  | { status: "loading"; events: CommunicationTimelineEvent[]; error: null }
  | { status: "ready"; events: CommunicationTimelineEvent[]; error: null }
  | { status: "error"; events: CommunicationTimelineEvent[]; error: string };

type RecordingState =
  | { status: "idle"; recording: null; message: null }
  | { status: "loading"; recording: null; message: null }
  | {
      status: "ready";
      recording: RetellRecording | null;
      audioUrl: string | null;
      message: string | null;
    }
  | { status: "error"; recording: null; message: string };

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

function mapConversation(row: ConversationRow): CommunicationConversation {
  return {
    id: row.id,
    sourceType: row.primary_source_type,
    status: row.status,
    providerName: row.provider_name,
    customerDisplayName: row.customer_display_name,
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

function getStatusLabel(status: CommunicationConversation["status"]): string {
  const labels: Record<CommunicationConversation["status"], string> = {
    open: "Open",
    needs_action: "Needs action",
    linked: "Linked",
    resolved: "Resolved",
    archived: "Archived",
  };

  return labels[status];
}

function formatProviderName(providerName: string | null): string {
  if (!providerName) {
    return "Provider pending";
  }

  return providerName
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCallWindow(conversation: CommunicationConversation): string {
  if (conversation.callStartedAt && conversation.callEndedAt) {
    return `${formatServiceRequestDate(conversation.callStartedAt)} - ${formatServiceRequestDate(
      conversation.callEndedAt,
    )}`;
  }

  if (conversation.callStartedAt) {
    return `Started ${formatServiceRequestDate(conversation.callStartedAt)}`;
  }

  if (conversation.lastEventAt) {
    return `Last activity ${formatServiceRequestDate(conversation.lastEventAt)}`;
  }

  return "Call time pending";
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

export function CommunicationsHub() {
  const [hubState, setHubState] = useState<HubState>({
    status: "loading",
    conversations: [],
    error: null,
  });
  const [selectedConversationId, setSelectedConversationId] =
    useState<string | null>(null);
  const [timelineState, setTimelineState] = useState<TimelineState>({
    status: "idle",
    events: [],
    error: null,
  });
  const [recordingState, setRecordingState] = useState<RecordingState>({
    status: "idle",
    recording: null,
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
          "id,primary_source_type,status,provider_name,customer_display_name,customer_phone,customer_email,service_address,summary,next_action,last_event_at,call_started_at,call_ended_at,intake_request_id,service_request_id,created_at,updated_at",
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

      const conversations = ((data ?? []) as ConversationRow[]).map(
        mapConversation,
      );

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

    async function loadTimeline() {
      if (!selectedConversationId) {
        setTimelineState({ status: "idle", events: [], error: null });
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setTimelineState({
          status: "error",
          events: [],
          error: "Timeline is not configured for this workspace.",
        });
        return;
      }

      setTimelineState({ status: "loading", events: [], error: null });

      const { data, error } = await supabase
        .from("communication_timeline_events")
        .select(
          "id,event_type,title,body,event_time,service_request_id,appointment_id,estimate_id,invoice_id",
        )
        .eq("conversation_id", selectedConversationId)
        .order("event_time", { ascending: false })
        .limit(100);

      if (!isMounted) {
        return;
      }

      if (error) {
        setTimelineState({
          status: "error",
          events: [],
          error: getHubReadError(error.message),
        });
        return;
      }

      setTimelineState({
        status: "ready",
        events: filterBusinessTimelineEvents(
          ((data ?? []) as TimelineRow[]).map(mapTimelineEvent),
        ),
        error: null,
      });
    }

    void loadTimeline();

    return () => {
      isMounted = false;
    };
  }, [selectedConversationId]);

  useEffect(() => {
    let isMounted = true;
    let audioObjectUrl: string | null = null;

    async function loadRecording() {
      if (!selectedConversationId) {
        setRecordingState({ status: "idle", recording: null, message: null });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setRecordingState({
          status: "error",
          recording: null,
          message: "Recording lookup is not configured for this workspace.",
        });
        return;
      }

      setRecordingState({ status: "loading", recording: null, message: null });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (isMounted) {
          setRecordingState({
            status: "error",
            recording: null,
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
  const recordingAudioUrl =
    recordingState.status === "ready" ? recordingState.audioUrl : null;

  return (
    <main className="space-y-5">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
              Communications Hub
            </p>
            <h1 className="mt-2 text-2xl font-black text-[#0F172A]">
              Calls and Messages
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#64748B]">
              One customer conversation across calls, messages, forms, email,
              jobs, appointments, estimates, invoices, and payments.
            </p>
          </div>
          <Link
            className="rounded-[10px] border border-[#E5E7EB] px-4 py-3 text-center text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            href="/dashboard/intake"
          >
            Review Intake
          </Link>
        </div>
      </section>

      {hubState.status === "error" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
          {hubState.error}
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0F172A]">
                Conversations
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#64748B]">
                Who contacted us and what needs action.
              </p>
            </div>
            <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-black text-[#64748B]">
              {hubState.conversations.length}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {hubState.status === "loading" ? (
              <p className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                Loading conversations...
              </p>
            ) : hubState.conversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
                <p className="text-sm font-black text-[#0F172A]">
                  No conversations yet
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">
                  Calls, messages, forms, and email will appear here when this
                  account has access to the company conversations.
                </p>
              </div>
            ) : (
              hubState.conversations.map((conversation) => {
                const isSelected = conversation.id === selectedConversationId;

                return (
                  <button
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected
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
                        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#64748B]">
                          {conversation.summary ?? "No summary yet."}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[#E5E7EB] bg-white px-2 py-1 text-[11px] font-black text-[#334155]">
                        {getSourceLabel(conversation.sourceType)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-black text-[#64748B]">
                        {formatProviderName(conversation.providerName)}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
                        {getStatusLabel(conversation.status)}
                      </span>
                      {conversation.linkedIntakeRequestId ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                          Intake created
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-[#64748B]">
                      {formatCallWindow(conversation)}
                    </p>
                    {conversation.nextAction ? (
                      <p className="mt-2 rounded-lg bg-white px-2 py-1 text-xs font-black text-[#0F6BFF]">
                        {conversation.nextAction}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          {selectedConversation ? (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                    Conversation
                  </p>
                  <h2 className="mt-1 text-xl font-black text-[#0F172A]">
                    {selectedConversation.customerDisplayName ??
                      "Unknown customer"}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-[#64748B]">
                    {[
                      selectedConversation.customerPhone,
                      selectedConversation.customerEmail,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No contact details yet"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {selectedConversation.linkedServiceRequestId ? (
                    <Link
                      className="rounded-[10px] bg-[#0F6BFF] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-[#0057D9]"
                      href={`/dashboard/leads/${selectedConversation.linkedServiceRequestId}`}
                    >
                      Open Job
                    </Link>
                  ) : selectedConversation.linkedIntakeRequestId ? (
                    <Link
                      className="rounded-[10px] bg-[#0F6BFF] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-[#0057D9]"
                      href="/dashboard/intake"
                    >
                      Review Intake
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Source
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#334155]">
                    {getSourceLabel(selectedConversation.sourceType)} via{" "}
                    {formatProviderName(selectedConversation.providerName)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#64748B]">
                    {getStatusLabel(selectedConversation.status)}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Call window
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#334155]">
                    {formatCallWindow(selectedConversation)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#64748B]">
                    Last activity:{" "}
                    {selectedConversation.lastEventAt
                      ? formatServiceRequestDate(selectedConversation.lastEventAt)
                      : "Pending"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 md:col-span-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                        Call recording
                      </p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-[#334155]">
                        {recordingState.status === "loading"
                          ? "Loading recording..."
                          : recordingState.status === "error"
                            ? recordingState.message
                            : recordingAudioUrl
                              ? "Recording available for internal review."
                              : recordingState.message ?? "No recording available yet."}
                      </p>
                    </div>
                    {recordingState.recording?.durationMs ? (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#64748B]">
                        {formatDuration(recordingState.recording.durationMs)}
                      </span>
                    ) : null}
                  </div>
                  {recordingAudioUrl ? (
                    <div className="mt-3">
                      <audio
                        className="w-full"
                        controls
                        preload="none"
                        src={recordingAudioUrl}
                      >
                        <track kind="captions" />
                      </audio>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 md:col-span-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    What they need
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#334155]">
                    {selectedConversation.summary ?? "No summary yet."}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Next action
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#334155]">
                    {selectedConversation.nextAction ?? "Review conversation."}
                  </p>
                  {selectedConversation.linkedIntakeRequestId ? (
                    <p className="mt-2 text-xs font-bold text-emerald-700">
                      Intake request created
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-bold text-[#64748B]">
                      No intake linked yet
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-lg font-black text-[#0F172A]">
                  Timeline
                </h3>
                <div className="mt-3 space-y-3">
                  {timelineState.status === "loading" ? (
                    <p className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                      Loading timeline...
                    </p>
                  ) : timelineState.status === "error" ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                      {timelineState.error}
                    </p>
                  ) : timelineState.events.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                      No conversation timeline yet.
                    </p>
                  ) : (
                    timelineState.events.map((event) => (
                      <div
                        className="rounded-xl border border-[#E5E7EB] bg-white p-3"
                        key={event.id}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-black text-[#0F172A]">
                              {event.title || getTimelineEventLabel(event.type)}
                            </p>
                            {event.body ? (
                              <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">
                                {event.body}
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-xs font-bold text-[#64748B]">
                            {formatServiceRequestDate(event.eventTime)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-5">
              <p className="text-sm font-black text-[#0F172A]">
                Select a conversation
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">
                The Hub will show who contacted us, what they need, what has
                happened, and the next action.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
