import type {
  AnalyticsProvider,
  CalendarProvider,
  CommunicationProvider,
  IntegrationError,
  MapsProvider,
  PaymentProvider,
  ProviderResult,
} from "./types";

const noopError: IntegrationError = {
  code: "provider_unavailable",
  message: "No real integration provider is configured for this adapter yet.",
  retryable: false,
};

function unavailable<T>(): Promise<ProviderResult<T>> {
  return Promise.resolve({
    ok: false,
    error: noopError,
    providerRequestId: "noop",
  });
}

function empty<T>(data: T): Promise<ProviderResult<T>> {
  return Promise.resolve({
    ok: true,
    data,
    providerRequestId: "noop",
  });
}

export const noopCalendarProvider: CalendarProvider = {
  listCalendars: () => empty([]),
  getAvailability: () => empty([]),
  createEvent: () => unavailable(),
  updateEvent: () => unavailable(),
  cancelEvent: () => unavailable(),
  syncEvents: () => empty({ eventsChanged: 0 }),
};

export const noopCommunicationProvider: CommunicationProvider = {
  sendSms: () => unavailable(),
  placeCall: () => unavailable(),
  getCallTranscript: () => empty({ text: "" }),
  getRecording: () => unavailable(),
  normalizeWebhook: () => unavailable(),
};

export const noopMapsProvider: MapsProvider = {
  autocompleteAddress: () => empty([]),
  resolvePlace: () => empty(null),
  geocode: () => empty(null),
  reverseGeocode: () => empty(null),
  distanceMatrix: () => empty({ rows: [] }),
  optimizeRoute: () => empty(null),
};

export const noopAnalyticsProvider: AnalyticsProvider = {
  trackEvent: () => empty({ accepted: true }),
  importSearchPerformance: () => empty({ rowsImported: 0 }),
  importBusinessProfileMetrics: () => empty({ rowsImported: 0 }),
  syncAttribution: () => empty({ eventsMatched: 0 }),
};

export const noopPaymentProvider: PaymentProvider = {
  createCustomer: () => unavailable(),
  createPaymentLink: () => unavailable(),
  getPaymentStatus: () => empty({ status: "unknown" }),
  voidPaymentLink: () => unavailable(),
  normalizeWebhook: () => unavailable(),
};
