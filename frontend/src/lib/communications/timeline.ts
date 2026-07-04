import type {
  CommunicationTimelineEvent,
  CommunicationTimelineEventType,
} from "./types";

export const businessTimelineEventLabels: Record<
  CommunicationTimelineEventType,
  string
> = {
  incoming_call: "Incoming call",
  incoming_sms: "Incoming SMS",
  website_request: "Website request",
  incoming_email: "Incoming email",
  customer_replied: "Customer replied",
  appointment_scheduled: "Appointment scheduled",
  appointment_changed: "Appointment changed",
  estimate_sent: "Estimate sent",
  estimate_approved: "Estimate approved",
  invoice_sent: "Invoice sent",
  payment_received: "Payment received",
  repair_completed: "Repair completed",
  customer_canceled: "Customer canceled",
  note_added: "Note added",
};

const businessTimelineEventTypes = new Set<CommunicationTimelineEventType>(
  Object.keys(businessTimelineEventLabels) as CommunicationTimelineEventType[],
);

export function isBusinessTimelineEvent(
  value: string,
): value is CommunicationTimelineEventType {
  return businessTimelineEventTypes.has(value as CommunicationTimelineEventType);
}

export function filterBusinessTimelineEvents(
  events: CommunicationTimelineEvent[],
): CommunicationTimelineEvent[] {
  return events
    .filter((event) => isBusinessTimelineEvent(event.type))
    .sort(
      (first, second) =>
        new Date(second.eventTime).getTime() -
        new Date(first.eventTime).getTime(),
    );
}

export function getTimelineEventLabel(
  eventType: CommunicationTimelineEventType,
): string {
  return businessTimelineEventLabels[eventType];
}
