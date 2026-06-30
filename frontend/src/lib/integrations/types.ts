export type IntegrationProviderKind =
  | "calendar"
  | "communication"
  | "maps"
  | "analytics"
  | "payment";

export type IntegrationErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_request"
  | "not_found"
  | "conflict"
  | "unknown";

export type IntegrationError = {
  code: IntegrationErrorCode;
  message: string;
  retryable: boolean;
  providerStatus?: number;
};

export type ProviderResult<T> =
  | { ok: true; data: T; providerRequestId?: string }
  | { ok: false; error: IntegrationError; providerRequestId?: string };

export type CalendarSummary = {
  id: string;
  name: string;
  primary?: boolean;
};

export type AvailabilityRequest = {
  calendarId?: string;
  startsAt: string;
  endsAt: string;
};

export type AvailabilityWindow = {
  startsAt: string;
  endsAt: string;
};

export type CalendarEventCreate = {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
};

export type CalendarEventUpdate = CalendarEventCreate & {
  providerEventId: string;
};

export type CalendarEventCancel = {
  providerEventId: string;
};

export type CalendarEventRef = {
  providerEventId: string;
  url?: string;
};

export type CalendarSyncRequest = {
  connectionId: string;
  cursor?: string;
};

export type CalendarSyncResult = {
  cursor?: string;
  eventsChanged: number;
};

export interface CalendarProvider {
  listCalendars(connectionId: string): Promise<ProviderResult<CalendarSummary[]>>;
  getAvailability(input: AvailabilityRequest): Promise<ProviderResult<AvailabilityWindow[]>>;
  createEvent(input: CalendarEventCreate): Promise<ProviderResult<CalendarEventRef>>;
  updateEvent(input: CalendarEventUpdate): Promise<ProviderResult<CalendarEventRef>>;
  cancelEvent(input: CalendarEventCancel): Promise<ProviderResult<{ canceled: true }>>;
  syncEvents(input: CalendarSyncRequest): Promise<ProviderResult<CalendarSyncResult>>;
}

export type SmsSendRequest = {
  to: string;
  body: string;
  from?: string;
};

export type MessageRef = {
  providerMessageId: string;
};

export type CallRequest = {
  to: string;
  from?: string;
  scriptHint?: string;
};

export type CallRef = {
  providerCallId: string;
};

export type TranscriptRequest = {
  providerCallId: string;
};

export type CallTranscript = {
  text: string;
  confidence?: number;
};

export type RecordingRequest = {
  providerCallId: string;
};

export type RecordingRef = {
  providerRecordingId: string;
  url?: string;
};

export type ProviderWebhook = {
  provider: string;
  eventType: string;
  headers?: Record<string, string>;
  payload: unknown;
};

export type CommunicationEvent = {
  eventType: string;
  providerEventId?: string;
  normalizedAt: string;
  metadata?: Record<string, unknown>;
};

export interface CommunicationProvider {
  sendSms(input: SmsSendRequest): Promise<ProviderResult<MessageRef>>;
  placeCall(input: CallRequest): Promise<ProviderResult<CallRef>>;
  getCallTranscript(input: TranscriptRequest): Promise<ProviderResult<CallTranscript>>;
  getRecording(input: RecordingRequest): Promise<ProviderResult<RecordingRef>>;
  normalizeWebhook(input: ProviderWebhook): Promise<ProviderResult<CommunicationEvent>>;
}

export type AddressSearchRequest = {
  query: string;
  country?: string;
  biasLatitude?: number;
  biasLongitude?: number;
};

export type AddressSuggestion = {
  label: string;
  placeId?: string;
};

export type PlaceResolveRequest = {
  placeId: string;
};

export type GeocodeRequest = {
  address: string;
};

export type ReverseGeocodeRequest = {
  latitude: number;
  longitude: number;
};

export type ResolvedAddress = {
  fullAddress: string;
  streetAddress?: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
};

export type DistanceMatrixRequest = {
  origins: ResolvedAddress[];
  destinations: ResolvedAddress[];
};

export type DistanceMatrixResult = {
  rows: Array<{
    originIndex: number;
    destinationIndex: number;
    distanceMeters?: number;
    durationSeconds?: number;
  }>;
};

export type RouteOptimizationRequest = {
  stops: ResolvedAddress[];
};

export type RoutePlan = {
  stops: ResolvedAddress[];
  distanceMeters?: number;
  durationSeconds?: number;
};

export interface MapsProvider {
  autocompleteAddress(input: AddressSearchRequest): Promise<ProviderResult<AddressSuggestion[]>>;
  resolvePlace(input: PlaceResolveRequest): Promise<ProviderResult<ResolvedAddress | null>>;
  geocode(input: GeocodeRequest): Promise<ProviderResult<ResolvedAddress | null>>;
  reverseGeocode(input: ReverseGeocodeRequest): Promise<ProviderResult<ResolvedAddress | null>>;
  distanceMatrix(input: DistanceMatrixRequest): Promise<ProviderResult<DistanceMatrixResult>>;
  optimizeRoute(input: RouteOptimizationRequest): Promise<ProviderResult<RoutePlan | null>>;
}

export type AnalyticsEvent = {
  name: string;
  occurredAt?: string;
  properties?: Record<string, unknown>;
};

export type SearchPerformanceSyncRequest = {
  startsAt: string;
  endsAt: string;
  cursor?: string;
};

export type SearchPerformanceResult = {
  cursor?: string;
  rowsImported: number;
};

export type BusinessProfileSyncRequest = {
  locationId?: string;
  startsAt: string;
  endsAt: string;
};

export type BusinessProfileMetrics = {
  rowsImported: number;
};

export type AttributionSyncRequest = {
  startsAt: string;
  endsAt: string;
};

export type AttributionSyncResult = {
  eventsMatched: number;
};

export interface AnalyticsProvider {
  trackEvent(input: AnalyticsEvent): Promise<ProviderResult<{ accepted: true }>>;
  importSearchPerformance(input: SearchPerformanceSyncRequest): Promise<ProviderResult<SearchPerformanceResult>>;
  importBusinessProfileMetrics(input: BusinessProfileSyncRequest): Promise<ProviderResult<BusinessProfileMetrics>>;
  syncAttribution(input: AttributionSyncRequest): Promise<ProviderResult<AttributionSyncResult>>;
}

export type PaymentCustomerCreate = {
  name?: string;
  email?: string;
  phone?: string;
};

export type PaymentCustomerRef = {
  providerCustomerId: string;
};

export type PaymentLinkCreate = {
  invoiceId: string;
  amountCents: number;
  currency: string;
  customer?: PaymentCustomerCreate;
};

export type PaymentLinkRef = {
  providerPaymentLinkId: string;
  url?: string;
};

export type PaymentStatusRequest = {
  providerPaymentLinkId: string;
};

export type PaymentStatus = {
  status: "unknown" | "open" | "paid" | "void";
};

export type PaymentLinkVoid = {
  providerPaymentLinkId: string;
};

export type PaymentEvent = {
  eventType: string;
  providerEventId?: string;
  paymentStatus?: PaymentStatus["status"];
};

export interface PaymentProvider {
  createCustomer(input: PaymentCustomerCreate): Promise<ProviderResult<PaymentCustomerRef>>;
  createPaymentLink(input: PaymentLinkCreate): Promise<ProviderResult<PaymentLinkRef>>;
  getPaymentStatus(input: PaymentStatusRequest): Promise<ProviderResult<PaymentStatus>>;
  voidPaymentLink(input: PaymentLinkVoid): Promise<ProviderResult<{ voided: true }>>;
  normalizeWebhook(input: ProviderWebhook): Promise<ProviderResult<PaymentEvent>>;
}
