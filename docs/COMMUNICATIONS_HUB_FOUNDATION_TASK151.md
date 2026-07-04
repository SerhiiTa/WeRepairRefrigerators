# Communications Hub Foundation - Task 151

Task 151 creates the provider-neutral Communications Hub foundation for Workiz Exit Phase 2.

This is not a Telnyx integration, Retell integration, SMS launch, email launch, or production phone-number setup. It is the WRA-owned conversation architecture that future providers must feed.

## Core Principle

WRA is the single source of truth for customer communication history.

Providers are adapters:

- Telnyx is only the phone/SMS carrier.
- Retell is only the future AI voice engine.
- Email, website forms, Yelp, Google Business Messages, Facebook Messenger, and WhatsApp are future input channels.

Provider payloads should normalize into Communications Hub records before they affect intake, jobs, appointments, estimates, invoices, or payments.

## Conversation Model

The foundation uses:

- `communication_conversations`
- `communication_messages`
- `communication_transcripts`
- `communication_timeline_events`

Each conversation may link to:

- customer
- intake request
- service request / job
- appointment
- estimate
- invoice
- payment reference

The conversation stores technician-useful context:

- who contacted us
- how they contacted us
- what they need
- contact details
- service address
- next action
- linked job

## Customer Recognition Flow

When a future communication arrives:

1. Normalize the source payload into a provider-neutral envelope.
2. Search existing customers by phone and email first.
3. Use address, known appliances, brand, and model as secondary matching signals.
4. If a strong match exists, link the conversation to the customer.
5. Load customer appliances, open jobs, repair history, warranty context, appointments, estimates, and invoices for technician review.
6. If no strong match exists, create/review intake only.
7. Do not automatically create duplicate customers.

Task 151 adds deterministic customer-recognition helpers in `frontend/src/lib/communications/customer-recognition.ts`; production provider ingestion can reuse or extend them.

## Business Timeline Rules

The normal technician timeline must show only business events that help decide what to do next.

Allowed examples:

- Incoming call
- Incoming SMS
- Website request
- Incoming email
- Customer replied
- Appointment scheduled
- Appointment changed
- Estimate sent
- Estimate approved
- Invoice sent
- Payment received
- Repair completed
- Customer canceled
- Note added

Do not show internal implementation events in the normal timeline:

- AI answered
- Transcript parsed
- Confidence score
- Language detection
- Normalization
- Extraction
- ZIP validation
- Provider webhook metadata
- Signature validation

Developer/debug events can exist later in a separate developer surface if needed.

## Transcript Foundation

`communication_transcripts` prepares for:

- full transcript text
- speaker-separated segments
- timestamps
- future recording references
- future playback references

Task 151 does not implement recording storage, playback, telephony, or AI voice processing.

## Provider Integration Strategy

Future providers should plug into:

`Provider payload -> CommunicationProviderAdapter -> Communications Hub -> Intake/Job links`

Current provider adapters are disabled noops:

- Telnyx
- Retell
- Email
- Website

Do not let future provider handlers write directly to CRM business tables unless a trusted WRA service first creates or links the conversation.

## Current UI

`/dashboard/communications` is intentionally minimal:

- conversation list
- customer/contact summary
- what they need
- next action
- linked job shortcut
- business-only timeline

There are no send, call, SMS, AI voice, phone number, or provider setup controls in Task 151.

## Security Boundaries

- No authentication changes.
- No `.env.local` changes.
- No production phone numbers connected.
- No provider secrets added.
- No customer phone exposure beyond authenticated dashboard communication context already intended for operations.
- No outbound SMS, email, phone calls, or AI calls.

## Next Safe Steps

1. Apply `supabase/migrations/0051_communications_hub_foundation_apply_ready.sql` in dev/staging.
2. Add trusted server ingestion for one provider at a time.
3. Add source authentication/signature verification before accepting public webhooks.
4. Link provider-created conversations to Intake Inbox for dispatcher review.
5. Add outbound messaging only after communication consent, templates, audit rules, and provider credentials are defined.
