import {
  noopAnalyticsProvider,
  noopCalendarProvider,
  noopCommunicationProvider,
  noopMapsProvider,
  noopPaymentProvider,
} from "./noop-providers";
import type {
  AnalyticsProvider,
  CalendarProvider,
  CommunicationProvider,
  IntegrationProviderKind,
  MapsProvider,
  PaymentProvider,
} from "./types";

export type IntegrationProviderRegistry = {
  calendar: CalendarProvider;
  communication: CommunicationProvider;
  maps: MapsProvider;
  analytics: AnalyticsProvider;
  payment: PaymentProvider;
};

const noopRegistry: IntegrationProviderRegistry = {
  calendar: noopCalendarProvider,
  communication: noopCommunicationProvider,
  maps: noopMapsProvider,
  analytics: noopAnalyticsProvider,
  payment: noopPaymentProvider,
};

// Task 105 intentionally returns noop providers only. Future provider tasks should
// swap adapters here after their schema, secret handling, webhooks, and RLS are reviewed.
export function getIntegrationProviders(): IntegrationProviderRegistry {
  return noopRegistry;
}

export function getIntegrationProvider<TKind extends IntegrationProviderKind>(
  kind: TKind,
): IntegrationProviderRegistry[TKind] {
  return noopRegistry[kind];
}
