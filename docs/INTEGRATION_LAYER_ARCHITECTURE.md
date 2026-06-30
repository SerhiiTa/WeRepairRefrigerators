# Integration Layer Architecture

## Purpose

The integration layer is the future boundary between WeRepairRefrigerators and external systems such as calendars, phone/SMS providers, AI voice agents, analytics platforms, payment processors, and automation tools.

This document is architecture only. Task 104 does not add provider code, database tables, API routes, UI, secrets, webhooks, or production integrations.

## Design Principles

- Keep app workflows provider-neutral. Business logic should talk to internal interfaces, not directly to Google, Stripe, Telnyx, Twilio, Retell, Zapier, or another vendor.
- Keep provider credentials server-side only. Browser code may use explicitly public keys where appropriate, such as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, but never private OAuth secrets, webhook secrets, service-role keys, or payment secrets.
- Treat external events as untrusted until verified. Webhooks must verify signatures, normalize payloads, and process idempotently.
- Prefer durable internal records over provider state. Service requests, estimates, invoices, technician profiles, and audit records remain the source of truth.
- Make sync observable. Every sync or webhook path should have logs, retry status, and enough metadata to debug without storing sensitive raw data unnecessarily.
- Scope integrations by company/user where possible. Multi-company access and provider tokens must be isolated.

## Provider-Neutral Interfaces

The following TypeScript-like interfaces describe the intended adapter boundary. They are not implementation code yet.

```ts
type ProviderResult<T> =
  | { ok: true; data: T; providerRequestId?: string }
  | { ok: false; error: IntegrationError };

type IntegrationError = {
  code:
    | "authentication_required"
    | "permission_denied"
    | "rate_limited"
    | "provider_unavailable"
    | "invalid_request"
    | "not_found"
    | "conflict"
    | "unknown";
  message: string;
  retryable: boolean;
  providerStatus?: number;
};
```

### CalendarProvider

Responsible for calendar availability, service appointment events, rescheduling, cancellation, and future dispatch travel-time planning.

```ts
interface CalendarProvider {
  listCalendars(connectionId: string): Promise<ProviderResult<CalendarSummary[]>>;
  getAvailability(input: AvailabilityRequest): Promise<ProviderResult<AvailabilityWindow[]>>;
  createEvent(input: CalendarEventCreate): Promise<ProviderResult<CalendarEventRef>>;
  updateEvent(input: CalendarEventUpdate): Promise<ProviderResult<CalendarEventRef>>;
  cancelEvent(input: CalendarEventCancel): Promise<ProviderResult<{ canceled: true }>>;
  syncEvents(input: CalendarSyncRequest): Promise<ProviderResult<CalendarSyncResult>>;
}
```

Future providers: Google Calendar, Apple Calendar, Outlook.

### CommunicationProvider

Responsible for SMS, phone calls, call recordings, transcripts, AI voice agent handoff, inbound lead creation signals, and outbound service updates.

```ts
interface CommunicationProvider {
  sendSms(input: SmsSendRequest): Promise<ProviderResult<MessageRef>>;
  placeCall(input: CallRequest): Promise<ProviderResult<CallRef>>;
  getCallTranscript(input: TranscriptRequest): Promise<ProviderResult<CallTranscript>>;
  getRecording(input: RecordingRequest): Promise<ProviderResult<RecordingRef>>;
  normalizeWebhook(input: ProviderWebhook): Promise<ProviderResult<CommunicationEvent>>;
}
```

Future providers: Telnyx, Twilio, Retell.

### MapsProvider

Responsible for address search, geocoding, reverse geocoding, distance estimation, technician routing, and future service-area matching.

```ts
interface MapsProvider {
  autocompleteAddress(input: AddressSearchRequest): Promise<ProviderResult<AddressSuggestion[]>>;
  resolvePlace(input: PlaceResolveRequest): Promise<ProviderResult<ResolvedAddress>>;
  geocode(input: GeocodeRequest): Promise<ProviderResult<ResolvedAddress>>;
  reverseGeocode(input: ReverseGeocodeRequest): Promise<ProviderResult<ResolvedAddress>>;
  distanceMatrix(input: DistanceMatrixRequest): Promise<ProviderResult<DistanceMatrixResult>>;
  optimizeRoute(input: RouteOptimizationRequest): Promise<ProviderResult<RoutePlan>>;
}
```

Current browser-side foundation: Google Places through `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for dashboard address editing. Future providers may include Mapbox, Radar, Apple, or an internal geocoder.

### AnalyticsProvider

Responsible for lead attribution, public SEO performance, conversion events, Google Business Profile metrics, and future marketplace growth reporting.

```ts
interface AnalyticsProvider {
  trackEvent(input: AnalyticsEvent): Promise<ProviderResult<{ accepted: true }>>;
  importSearchPerformance(input: SearchPerformanceSyncRequest): Promise<ProviderResult<SearchPerformanceResult>>;
  importBusinessProfileMetrics(input: BusinessProfileSyncRequest): Promise<ProviderResult<BusinessProfileMetrics>>;
  syncAttribution(input: AttributionSyncRequest): Promise<ProviderResult<AttributionSyncResult>>;
}
```

Future providers: Google Analytics, Google Search Console, Google Business Profile.

### PaymentProvider

Responsible for invoice payment links, payment status, refunds/voids later, and provider payment webhooks.

```ts
interface PaymentProvider {
  createCustomer(input: PaymentCustomerCreate): Promise<ProviderResult<PaymentCustomerRef>>;
  createPaymentLink(input: PaymentLinkCreate): Promise<ProviderResult<PaymentLinkRef>>;
  getPaymentStatus(input: PaymentStatusRequest): Promise<ProviderResult<PaymentStatus>>;
  voidPaymentLink(input: PaymentLinkVoid): Promise<ProviderResult<{ voided: true }>>;
  normalizeWebhook(input: ProviderWebhook): Promise<ProviderResult<PaymentEvent>>;
}
```

Future provider: Stripe.

## Future Data Flow

1. Customer submits a service request through `/schedule-service`.
2. Address data is normalized through the MapsProvider and stored on the service request.
3. AI Dispatcher may classify the request, extract appliance details, and suggest next actions.
4. CalendarProvider checks technician availability and creates appointment holds/events after technician confirmation.
5. CommunicationProvider sends customer reminders or receives inbound updates.
6. Technician creates estimate and invoice documents inside the CRM.
7. PaymentProvider creates a payment link when payment workflows are approved.
8. AnalyticsProvider records source, conversion, city/ZIP, and service category performance.
9. Sync logs and webhook events provide traceability without making provider systems the source of truth.

## Sync Patterns

- Pull sync: calendar events, analytics reports, Search Console data, Google Business Profile metrics.
- Push webhooks: call events, SMS delivery, Retell conversation events, Stripe payment events, calendar change notifications where supported.
- Manual resync: dashboard/admin-triggered repair for a single connection or time window.
- Incremental cursors: store provider cursor/page token/timestamp in connection metadata or sync logs.
- Idempotency: every provider event must be deduplicated by provider, event ID, and normalized event type.
- Retry model: retry transient provider errors with backoff; mark permanent failures with a user-safe reason and an internal diagnostic.

## Webhook Patterns

Future webhook handlers should:

1. Receive the raw request server-side.
2. Verify provider signature and timestamp.
3. Store a sanitized `webhook_events` row with provider event ID, event type, status, payload hash, and safe metadata.
4. Process idempotently in a narrow handler.
5. Write domain updates through server-side code or trusted RPCs.
6. Record success/failure in `sync_logs` or the webhook event row.
7. Avoid storing raw tokens, payment secrets, full call recordings, or unnecessary customer-sensitive data.

## Error Handling Strategy

- Normalize provider-specific errors into a small internal error shape.
- Separate user-safe messages from developer/provider diagnostics.
- Treat rate limits, 5xx responses, network failures, and temporary provider outages as retryable.
- Treat invalid credentials, missing scopes, signature failures, bad provider IDs, and unsupported status transitions as non-retryable until configuration changes.
- Log provider request IDs where available.
- Never expose provider tokens, webhook secrets, Supabase service-role keys, or raw customer-sensitive payloads in browser responses.

## Future Tables

These tables are documentation-only for Task 104. Do not create them until a provider implementation task explicitly requires reviewed SQL/RLS.

### integration_connections

Tracks a connected provider account for a company, technician, or internal system.

Suggested fields:

- `id`
- `company_id` nullable
- `profile_id` nullable
- `provider`
- `domain` such as calendar, communication, maps, analytics, payment, automation
- `status` such as active, needs_reauth, disabled, error
- `external_account_id` nullable
- `scopes` text array or jsonb
- `metadata` jsonb, sanitized
- `last_sync_at`
- `created_at`
- `updated_at`
- `archived_at`

### provider_tokens

Stores encrypted provider credentials server-side only.

Suggested fields:

- `id`
- `integration_connection_id`
- `token_type`
- `encrypted_access_token`
- `encrypted_refresh_token` nullable
- `expires_at` nullable
- `rotated_at` nullable
- `created_at`
- `updated_at`

Security note: this table should be server/admin-only. Browser clients should never read or write provider tokens.

### webhook_events

Stores verified provider event envelopes and processing status.

Suggested fields:

- `id`
- `provider`
- `domain`
- `provider_event_id`
- `event_type`
- `payload_hash`
- `metadata` jsonb, sanitized
- `processing_status` such as received, processed, ignored, failed, retrying
- `attempt_count`
- `last_error` nullable
- `received_at`
- `processed_at` nullable

### sync_logs

Stores observable sync attempts and outcomes.

Suggested fields:

- `id`
- `integration_connection_id` nullable
- `provider`
- `domain`
- `sync_type`
- `status`
- `cursor_before` nullable
- `cursor_after` nullable
- `records_seen`
- `records_changed`
- `started_at`
- `finished_at` nullable
- `error_code` nullable
- `error_message` nullable, sanitized

## AI Dispatcher Integration Points

AI Dispatcher should use the integration layer rather than direct provider calls.

Future flow:

1. CommunicationProvider receives inbound call/SMS/voice-agent events.
2. AI Dispatcher extracts customer name, appliance, symptoms, urgency, address, preferred window, and callback details.
3. MapsProvider validates the address and returns coordinates/service-area hints.
4. AI Dispatcher creates or updates a service request draft through reviewed server-side mutations.
5. CalendarProvider checks availability and proposes technician windows.
6. CommunicationProvider sends confirmation text/call only after business rules allow it.
7. Timeline/audit records capture the dispatcher action, transcript references, and human review state.

Important boundaries:

- AI should not auto-escalate roles, approve technicians, expose internal notes, or assign jobs across company boundaries without explicit business rules.
- Call transcripts and recordings should be stored as private operational data, not public SEO material.
- Any AI-generated customer communication should have a clear provider, source event, and audit trail.

## Security Boundaries

- No service-role key in frontend code.
- No private provider secrets in browser code.
- Provider tokens should be encrypted and readable only by trusted server-side code.
- Public pages should only read sanitized public views.
- Webhook handlers must verify signatures before processing.
- Cross-company isolation must be enforced in SQL/RLS and server mutations, not only in UI filters.
- Payment, communication, and calendar webhooks must be idempotent.
- Analytics imports should avoid storing unnecessary raw personal data.

## Phased Implementation Recommendation

1. Keep Task 104 as documentation-only.
2. Add provider connection tables and RLS only when the first real provider needs them.
3. Start with MapsProvider server-side address verification because address intelligence already exists in the CRM.
4. Add CalendarProvider one-way appointment creation before two-way sync.
5. Add CommunicationProvider inbound webhook ingestion for AI Dispatcher call intake.
6. Add PaymentProvider for Stripe invoice payment links after invoice customer visibility and payment rules are designed.
7. Add AnalyticsProvider imports after attribution events and reporting boundaries are defined.
8. Add automation exports to Zapier, Make.com, or Google Sheets only after the internal event model is stable.

## Open Questions

- Which provider domain should be implemented first after address autocomplete: calendar scheduling, communication/AI Dispatcher, Stripe payments, or analytics attribution?
- Should provider tokens be managed per company, per technician, or both?
- Which events should be copied into audit logs versus sync logs?
- What retention rules apply to call recordings, transcripts, webhook payload metadata, and analytics imports?
- Which integration events should appear in the service request timeline?
