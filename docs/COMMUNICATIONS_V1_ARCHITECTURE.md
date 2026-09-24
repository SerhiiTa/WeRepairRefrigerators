# Communications Hub V1 Architecture

Communications Hub V1 is the production communication workspace for WRA service companies. Its purpose is to let a dispatcher handle daily customer communication from WRA instead of switching between Workiz, a phone app, SMS, provider dashboards, and the Intake Inbox.

This document is also the source of truth for the broader WRA incoming-request architecture: Unified Intake, Source Attribution, Communications, Online Booking integration, and the boundary to the future Availability Engine.

It does not replace the existing Communications and Intake foundation. It extends the existing WRA-owned model:

- `communication_source_accounts`
- `communication_conversations`
- `communication_messages`
- `communication_transcripts`
- `communication_timeline_events`
- `intake_requests`
- existing `/dashboard/communications`
- existing `/dashboard/intake`
- existing Retell `call_analyzed` phone workflow
- existing Intake to Job conversion

WRA remains the system of record. Telnyx, Retell, email, and future providers are adapters that feed or act through WRA-controlled records.

## Product Scope

Communications Hub V1 must support the daily dispatcher workflow for:

- inbound phone calls
- inbound SMS
- outbound SMS replies
- minimum viable outbound calls through the company communication channel
- call transcripts
- call recordings
- customer matching
- job and intake context
- unread, needs-response, open, and resolved conversation states
- customer Call/Text actions that use WRA communications instead of the user's personal phone/SMS app

Email may remain outside V1 if including it would materially expand scope. The database model may continue to reserve room for email as a future source.

Communications must not become a second CRM. Customer profile editing, Job creation, appointment booking, estimates, invoices, and long-form Intake review should continue to live in their existing modules. Communications should show enough context and actions for the dispatcher to decide what to do next.

## Unified Incoming Request Architecture

WRA must treat every customer inquiry as an inbound event that moves through one central architecture.

Supported source families:

- main company website
- multiple microsites and lead-generation websites
- website contact forms
- website request-service forms
- WRA online booking widgets
- main company phone number
- tracking phone numbers
- SMS
- Google LSA
- Yelp
- Thumbtack
- other lead generators
- manual dispatcher intake
- future email
- future social and messaging channels

The conceptual flow is:

`Incoming Sources -> Source Identification & Attribution -> Unified Intake Gateway -> Customer / Property Matching -> Communications / Intake -> Job -> Appointment -> WRA Availability Engine`

This flow is not a single monolithic UI. It is a shared backend and data architecture that prevents each source from becoming its own mini CRM, mini intake system, or mini booking calendar.

Responsibilities:

- Incoming Sources provide external/customer events.
- Source Identification & Attribution records where the event came from.
- Unified Intake Gateway normalizes, deduplicates, links, and routes the event.
- Customer / Property Matching identifies known customers and service locations.
- Communications stores conversation history and dispatcher response state.
- Intake stores structured review/conversion data when needed.
- Job stores the operational service request.
- Appointment stores the scheduled service window.
- Availability Engine is the single source of bookable time.

## Source Identification And Attribution

WRA must know more than "phone" or "website." It should preserve the full practical source context whenever available.

Attribution fields should support:

- channel: phone, SMS, website form, booking widget, lead generator, manual, future email/social
- source: Google LSA, Yelp, Thumbtack, main website, microsite, manual dispatcher
- source account: company phone number, tracking number, provider account, widget account
- tracking phone number
- website/domain
- landing page
- booking widget/source id
- lead generator
- campaign
- UTM source, medium, campaign, term, content
- provider lead id
- provider conversation/message/call id
- timestamp

Examples:

- Phone -> tracking number `+1 346 555 0110` -> Google LSA -> Refrigerator Repair campaign.
- Website form -> `refrigeratorrepairhouston.com` -> landing page `/emergency-refrigerator-repair` -> `utm_campaign=emergency-repair`.
- Booking widget -> `werepairsubzero.com` -> source id `subzero_website` -> Sub-Zero campaign.
- Manual intake -> dispatcher-created -> referral/walk-in/phone/email reason selected by user.

Attribution must survive:

`Inquiry -> Intake -> Customer -> Job -> Appointment -> Revenue`

V1 does not need a reporting/analytics dashboard. It must preserve enough durable data so future reporting can answer:

- Which sources generate leads?
- Which sources become Jobs?
- Which sources produce revenue?
- Which tracking numbers or microsites perform best?
- Which campaigns create duplicate/noisy intake?

## Unified Intake Gateway

The Unified Intake Gateway is a provider/source-neutral normalization and routing layer.

It should accept inbound envelopes from:

- Retell/Telnyx phone workflow
- Telnyx SMS
- WRA booking widget
- website forms
- lead-generator webhooks
- manual dispatcher intake
- future email/social adapters

Gateway responsibilities:

- validate source identity
- capture attribution
- normalize customer/contact fields
- normalize service address/property fields
- normalize requested service/problem fields
- normalize requested appointment/window fields when present
- deduplicate provider retries
- deduplicate likely duplicate inquiries
- match existing Customer
- match existing service address/property when possible
- create or reuse Conversation when communication history is useful
- create Intake when dispatcher review is needed
- link to existing Job/Intake when the inbound event clearly belongs there
- route into Booking/Job only when rules allow it

The gateway must not blindly create every downstream record.

Do not automatically create:

- Customer for every inbound phone/SMS/form
- Intake for every customer reply
- Conversation for every internal conversion step
- Job for every provider/booking payload
- Appointment without availability and authorization checks

### Gateway Record Creation Rules

Create or reuse Conversation when:

- the source is communication-like: phone, SMS, future email/social
- a booking/form submission includes a message thread or future replies are expected
- dispatcher response is needed

Create Intake when:

- the event is a new service request that needs dispatcher review
- the source has ambiguous customer/property/job matching
- the source is a lead generator that should not directly create a Job
- provider data is incomplete or low-confidence

Create Job + Appointment directly only when:

- the source is a trusted WRA booking surface
- source attribution is verified
- customer/contact information is sufficient
- property/service address is sufficient
- requested service is supported
- Availability Engine returns a valid slot
- duplicate checks do not find an active conflicting Intake/Job
- company rules allow direct booking

Otherwise create Intake first and preserve the selected/requested booking context for dispatcher review.

## Websites And Microsites

WRA may operate many sites:

- main company site
- brand/service microsites
- local landing pages
- campaign pages
- partner/referral forms

Do not build separate backend systems for each website.

All website forms should submit into WRA through the same public inbound gateway, with source attribution supplied by the form configuration.

Each website or form instance should have a registered source identity:

- source id
- company id
- domain allowlist
- default channel/source labels
- campaign metadata
- allowed form types
- active/inactive state

Website submissions should include:

- source id
- website/domain
- landing page URL
- UTM values
- referrer when available
- submitted form type
- customer contact fields
- address/property fields
- problem/request text
- requested service
- requested appointment window if present

The gateway validates the source id and domain before attaching the event to a company.

## One WRA Booking System

WRA must not create independent booking calendars for different websites.

There must be one source of truth for appointment availability. Every booking surface must query the same WRA Availability Engine.

Preferred architecture:

- one reusable WRA Booking Widget/API
- embedded on multiple company websites and microsites
- each widget instance passes its own source id and attribution
- availability and booking rules are controlled centrally by WRA

Examples:

- `werepairsubzero.com` -> WRA Booking Widget -> source `werepairsubzero` -> WRA Availability Engine.
- `refrigeratorrepairhouston.com` -> same widget -> source `refrigeratorrepairhouston` -> same WRA Availability Engine.
- Google LSA landing page -> same widget -> source `google_lsa_refrigerator` -> same WRA Availability Engine.

This prevents double booking and keeps reporting connected to the real source.

## Availability Engine Boundary

Scheduling implementation is currently frozen. This document defines only the contract that Communications/Intake/Booking need from the future Availability Engine.

The Availability Engine should eventually consider:

- company availability
- technician availability
- appointment duration/window
- service area and ZIP coverage
- technician/company assignment rules
- existing appointments
- unavailable/busy periods
- booking lead time
- same-day/next-day rules
- emergency/priority rules if supported

All booking surfaces must call the same availability source.

Minimum future contract:

- input: company id, service address/ZIP, requested service type, optional customer/job context, source id, requested date range
- output: bookable windows with enough display metadata for the public widget
- reservation/booking action: atomically create or hold the appointment slot according to scheduling rules
- rejection reasons: unsupported ZIP, no availability, invalid source, duplicate active booking, blocked time, authorization/source failure

Public booking APIs must expose only the minimum data needed to book service. They must not expose technician private schedules, other customer appointments, internal notes, or company-wide operational data.

## Online Booking Flow

Expected WRA booking flow:

1. Customer opens booking form on any approved company website.
2. Widget captures source id, domain, landing page, campaign, UTM, and timestamp.
3. Customer selects service type.
4. Customer enters ZIP/address.
5. Widget requests availability from WRA.
6. Availability Engine returns valid windows from the central calendar/availability source.
7. Customer selects a slot.
8. Customer provides contact and problem information.
9. Gateway validates source, deduplicates, and matches Customer/Property.
10. WRA creates either Intake or Job + Appointment according to rules.
11. Attribution remains attached to the resulting records.

Direct Job + Appointment is appropriate when the booking source is trusted and all validation passes.

Intake first is appropriate when:

- duplicate or active Job risk exists
- address/property matching is uncertain
- customer identity is uncertain
- service type requires dispatcher review
- booking source is an untrusted/lead-generator source
- availability response cannot safely create the appointment
- company configuration requires dispatcher review

Dispatcher control should be preserved wherever risk or ambiguity exists.

## Dispatcher Workflow

The dispatcher starts in `/dashboard/communications`.

The primary screen should answer:

- Who contacted us?
- What channel did they use?
- What do they need?
- Is this person an existing Customer?
- Is there a related active Job?
- Is there an Intake that needs review?
- Has someone already responded?
- Does this conversation need a response now?

The V1 layout should keep the existing three-part structure and strengthen it:

- Inbox list: searchable/filterable conversation queue.
- Conversation detail: selected conversation messages, call events, transcript, recording, and reply/call actions.
- Context panel: Customer, Job, Intake, and recent activity links.

The dispatcher should be able to complete the common loop without leaving Communications:

1. Open an unread or needs-response conversation.
2. Review the latest customer message/call summary.
3. Confirm whether an existing Customer/Job/Intake is linked.
4. Reply by SMS when appropriate.
5. Open Intake only when the communication needs formal review/conversion.
6. Open Job only when service work needs update/scheduling/estimate activity.
7. Resolve the conversation when no response is needed.

## Communications Hub UI Behavior

Communications Hub is one consumer of the unified incoming-request architecture. It is not the whole Intake or Booking system.

Communications should show source context when it helps the dispatcher understand a customer interaction:

- source channel
- tracking phone number
- website/domain
- landing page
- lead generator
- campaign
- booking source
- linked Intake
- linked Job

Communications should not own booking availability, full Intake conversion, or Job scheduling logic. It should route the dispatcher to those modules when deeper structured work is required.

### Inbox List

The conversation list should show:

- customer or caller display name
- phone number when name is unknown
- channel: call, SMS, future email
- latest message/event preview
- timestamp
- unread indicator/count
- needs-response indicator
- linked record badges: Customer, Job, Intake
- source badge when useful: Telnyx, Retell, manual
- call-specific badge: missed call, voicemail/transcript ready

V1 filters:

- All
- Unread
- Needs Response
- Calls
- SMS
- Open
- Resolved

Search should match:

- customer name
- phone number
- email where available
- conversation summary
- job number where linked

### Selected Conversation

The selected conversation should show a unified event stream:

- inbound SMS
- outbound SMS
- inbound call summary
- missed call
- voicemail/call transcript
- recording availability
- internal note entries if added from the composer
- key linked-record events when helpful

The stream should preserve existing business timeline rules: technician/dispatcher UI shows actionable business events, not provider/debug internals.

### Reply Composer

The composer should support:

- SMS reply
- internal note

Outbound SMS should be disabled unless:

- the conversation has a customer phone number
- the company has an active SMS-capable source number
- the authenticated dashboard user can access that company conversation

Internal notes should stay inside WRA and must not send provider messages.

### Context Panel

The context panel should show:

- Customer card when linked or strongly matched
- Job card when linked
- Intake card when linked
- recent conversation activity
- buttons to open Customer, Job, or Intake
- action to link existing Customer/Job/Intake when V1 supports it
- action to create/review Intake when needed

Communications should not duplicate full Customer, Job, or Intake editing.

## Conversation Lifecycle

V1 conversation states should be explicit and simple:

- `open`: active conversation, no final resolution yet.
- `needs_response`: customer action requires dispatcher response.
- `resolved`: no current response needed.

Read state should be separate from lifecycle state:

- unread: latest customer/provider event has not been viewed by the current user's company workflow.
- read: viewed or acknowledged.

Recommended distinction:

- `status` remains conversation lifecycle.
- unread/read should use separate metadata or a small read-tracking table if per-user read state is required.

Initial V1 can support company-level unread by storing last inbound event timestamps and acknowledged timestamps. If per-dispatcher unread is required, add a separate read-state table rather than overloading `communication_conversations.status`.

State transitions:

- New inbound SMS: mark unread and needs response unless it is a known non-response event.
- Missed inbound call: mark unread and needs response.
- Inbound answered call with transcript: mark unread; needs response depends on transcript outcome and linked Intake status.
- Outbound SMS sent: keep open unless dispatcher resolves.
- Dispatcher marks resolved: set resolved and clear needs-response.
- Customer replies to resolved conversation: reopen and mark unread/needs response.

## Company Communication Numbers

WRA should manage company-owned communication sources through Settings -> Communications.

The existing `communication_source_accounts` table is the correct foundation. V1 should extend and expose it rather than create a parallel phone-number table.

Each communication source should support:

- company id
- source type: phone, future email, future social channel
- provider: Telnyx, Retell, future provider
- source identifier: E.164 phone number for phone/SMS
- display name
- active/inactive
- voice enabled
- SMS enabled
- default outbound SMS
- default outbound voice
- provider metadata needed for routing, without storing provider secrets

Provider credentials and webhook secrets must remain server-side environment/configuration values, not browser-visible settings.

Settings -> Communications V1 should include:

- list of company numbers
- active toggle
- Voice enabled indicator/toggle
- SMS enabled indicator/toggle
- default outbound SMS selector
- default outbound voice selector
- provider connection status
- edit display name

Do not build a large telecom administration system in V1. Number purchasing/porting, advanced IVR, call queues, and complex routing can follow later.

## Inbound SMS

Inbound SMS should follow this flow:

1. Customer sends SMS to a company number.
2. Telnyx sends webhook to WRA.
3. WRA verifies the Telnyx webhook signature.
4. WRA normalizes the payload into a provider-neutral message envelope.
5. WRA resolves the destination phone number through `communication_source_accounts`.
6. WRA rejects or safely skips events that do not map to an active company source.
7. WRA deduplicates by provider message id.
8. WRA identifies an existing conversation when possible.
9. WRA matches an existing customer by phone and email when available.
10. WRA links an active Job or Intake only when deterministic enough.
11. WRA persists a `communication_messages` inbound SMS row.
12. WRA updates `communication_conversations` summary, last event time, customer fields, and state.
13. WRA creates a `communication_timeline_events` row for business timeline display.
14. WRA marks the conversation unread and needs response.
15. WRA notifies the dispatcher.

### Inbound SMS Deduplication

Inbound SMS must not create duplicate Customers, Conversations, Intakes, or Jobs.

Minimum dedupe rules:

- Store provider message id on `communication_messages.external_message_id`.
- Treat provider message id plus source account as idempotency key.
- Reuse an existing open conversation for same company, customer phone, and source number when the latest activity is recent.
- Reuse an explicitly linked conversation when provider/thread metadata identifies it.
- Do not create a new Intake when an active Intake or active Job is already linked and the message is clearly part of that context.

### When Inbound SMS Creates Intake

Create or suggest Intake only when:

- sender is unknown and message appears to be a new service request
- existing Customer has no obvious active Job/Intake for the request
- message asks for new service at a new/problem address
- dispatcher needs structured review before Job creation

Do not automatically turn every SMS into Intake.

## Outbound SMS

Outbound SMS should be sent from WRA through the company communication source, not through the user's personal phone.

Outbound flow:

1. Dispatcher writes SMS in Communications or clicks Customer -> Text.
2. WRA determines the conversation and outbound source number.
3. WRA authorizes the user against the conversation/company/customer.
4. WRA creates a pending outbound `communication_messages` row.
5. WRA sends through Telnyx server-side.
6. WRA stores provider message id and delivery status.
7. Telnyx delivery webhooks update status.
8. Conversation summary and last event time update.

Outbound source selection:

1. Use the same active SMS-capable company number already associated with the conversation.
2. Otherwise use the source through which the Customer first entered WRA when that source is active and SMS-capable.
3. Otherwise use the company's default outbound SMS number.
4. If no source is available, disable sending and show a configuration-required message.

Outbound message statuses:

- pending
- sent
- delivered
- failed
- undeliverable

Delivery failure should keep the conversation open and surface a visible error to the dispatcher.

## Inbound Phone Calls

Preserve the existing Retell `call_analyzed` workflow. It is already the production-proven inbound-call path.

Current intended V1 behavior:

1. Phone call arrives through the company number.
2. Telnyx carries the call.
3. Retell may handle AI voice conversation and produce transcript/analysis.
4. WRA receives the Retell `call_analyzed` event.
5. WRA resolves the destination number through `communication_source_accounts`.
6. WRA creates or reuses `communication_conversations`.
7. WRA stores transcript/message/timeline rows.
8. WRA creates or links an `intake_requests` row for dispatcher review.
9. Communications Hub shows the call, transcript, recording panel, Customer/Job/Intake context, and next action.

Phone calls should appear as conversations, not isolated call logs.

Call detail should include:

- caller name/phone
- inbound number/source
- call status
- call start/end/duration
- AI summary where available
- full transcript
- recording playback where available
- linked Intake
- linked Customer
- linked Job
- next dispatcher action

## Outbound Phone Calls

Customer -> Call should eventually use WRA company communications instead of `tel:`.

Minimum V1 outbound call behavior:

- call is initiated from an active voice-capable company number
- customer sees the company phone number as caller ID
- dispatcher does not expose personal phone number
- WRA stores an outbound call event in the conversation
- provider call status updates are persisted when available

Recommended provider responsibilities:

- Telnyx: telecom carrier, number ownership, outbound call initiation, call status webhooks, SMS transport.
- Retell: AI voice agent and transcript/analysis when WRA intentionally routes a call to AI.
- WRA: authorization, source selection, conversation persistence, customer/job/intake linking, dispatcher UI, audit trail.

Do not require Retell for every human outbound call. If Telnyx can place a normal outbound call or bridge a dispatcher call, Telnyx should handle the telecom layer directly. Retell should be used when WRA intentionally needs AI voice behavior, transcription, or analysis.

Outbound call V1 can start with:

- click Call from Customer or Communications
- choose default voice-capable company number
- create conversation/call record
- initiate Telnyx call/bridge server-side
- update call status from webhook

Advanced call controls, call queues, IVR, live browser softphone, and recording policy can be later tasks.

## Telnyx vs Retell vs WRA

Telnyx:

- owns phone/SMS carrier operations
- receives and sends SMS
- carries inbound/outbound voice calls
- sends delivery/call status webhooks
- provides provider ids for idempotency

Retell:

- handles AI voice conversations when enabled
- produces transcript/analysis for calls
- provides recording metadata for Retell calls
- does not own WRA business records

WRA:

- owns Customer, Job, Intake, and Communications records
- authorizes all dashboard actions
- verifies provider webhooks
- maps provider events to company source accounts
- deduplicates provider events
- decides when Intake review is required
- stores messages, transcripts, timeline events, and links
- controls dispatcher workflow and notifications

## Customer / Job / Intake Relationships

A conversation may relate to:

- unknown/new person
- Customer only
- Job only when legacy/incomplete data requires it
- Intake only
- Customer + Job
- Customer + Intake
- Customer + Job + Intake during conversion/review windows

Recommended linking rules:

- Link Customer when phone/email match is deterministic enough.
- Link Job when the customer has one obvious active Job related to the communication.
- Link Intake when the communication needs structured review or conversion.
- Keep unknown conversations possible; do not force customer creation from every inbound event.
- Do not create a Job directly merely because an external provider payload was received. Telnyx, Retell, lead-generator webhooks, website contact forms, and similar external events should route through matching, dedupe, and Intake review unless the event comes through a trusted WRA Booking surface.
- A trusted WRA Booking surface may create Job + Appointment directly only when the source is validated and trusted, customer/contact information is sufficient, service address/property information is sufficient, the requested service is supported, the Availability Engine confirms a valid slot, duplicate/conflict checks pass, and company configuration allows direct booking.
- Otherwise, route the request through Intake for dispatcher review.
- Provider-created Intake must remain dispatcher-reviewed before becoming a Job.

### Existing Conversation Matching

Prefer an existing conversation when:

- same provider thread/call/message context identifies it
- same customer phone and same source account have a recent open conversation
- conversation is already linked to the active Intake/Job being discussed

Create a new conversation when:

- provider thread is new and no useful open conversation exists
- previous conversation is resolved and the new message is a distinct service need
- sender/source combination is materially different

### Intake Creation

Create Intake when:

- no existing active Job/Intake clearly matches
- a new service request is described
- customer identity/address/problem need dispatcher review

Do not create Intake when:

- customer is replying about an already-linked active Job
- message is a simple confirmation for an existing appointment
- dispatcher manually marks the conversation as resolved without needing service creation

## Customer Call / Text / Email Actions

Customer actions should evolve as follows:

- Call: open/start a WRA company-channel outbound call workflow.
- Text: open/create a WRA Communications conversation and SMS composer.
- Email: may remain `mailto:` or existing external behavior for V1 unless email is explicitly included.

Customer -> Text behavior:

1. Find or create conversation for the customer and selected company source.
2. Choose outbound SMS number by the source selection rules.
3. Navigate to Communications with that conversation selected.
4. Focus SMS composer.

Customer -> Call behavior:

1. Find or create conversation for the customer and selected company source.
2. Choose outbound voice number by default voice source rules.
3. Initiate server-side outbound call or present a confirmation action.
4. Navigate to Communications call detail/conversation.

No Customer action should expose the dispatcher's personal phone number.

## Read / Unread and Needs Response

Unread/read and needs-response are related but separate.

Unread means the company/user has not seen the latest inbound activity.

Needs response means WRA likely owes the customer a response or dispatcher action.

Examples:

- New inbound SMS: unread + needs response.
- Missed call: unread + needs response.
- Retell call that created Intake: unread + needs response until reviewed.
- Customer says "thanks": unread, maybe not needs response after dispatcher marks resolved.
- Outbound SMS only: read/open, not necessarily needs response.

V1 should support:

- automatic unread on inbound customer/provider events
- mark read when conversation opened or explicitly acknowledged
- automatic needs-response for inbound SMS, missed calls, and new Intake-related calls
- manual resolve/reopen
- filters for unread and needs response

## Notifications

V1 notifications should be small and operational.

Notify relevant dispatcher/company users for:

- new inbound SMS
- missed inbound call
- Retell call/transcript that requires review
- conversation needing response

Minimum notification channels:

- in-app badge/count on Communications navigation
- visible inbox badges
- optional browser notification later if already supported by WRA notification architecture

Do not design a broad notification platform in V1. Avoid cross-product notification redesign.

Notification dedupe:

- one notification per new inbound provider event
- avoid repeated notifications for webhook retries
- clear or lower urgency when conversation is opened/resolved

## Settings -> Communications

Settings -> Communications should expose the company communication source configuration backed by `communication_source_accounts`.

V1 settings sections:

- Communication Numbers
- Provider Configuration

Communication Numbers should show:

- phone number
- display name
- provider
- active/inactive
- Voice enabled
- SMS enabled
- default outbound SMS
- default outbound voice

Provider Configuration should show connection status for:

- Telnyx
- Retell

V1 can show provider connection status without exposing secrets.

Provider secrets:

- Telnyx API key/webhook secret: server-side only.
- Retell API key/webhook secret: server-side only.
- Never send secrets to the browser.

## Source Attribution Data Model

Reuse existing Communications and Intake tables where practical, but source attribution needs durable structure so it can survive from inquiry to Job and future revenue reporting.

### Existing Tables To Reuse

`communication_source_accounts` should continue to represent company-owned communication endpoints, especially phone numbers.

Use it for:

- main phone numbers
- tracking phone numbers
- provider source identifiers
- active/inactive source state
- future Voice/SMS capabilities
- default outbound source selection

`communication_conversations` should store source context that is conversation-specific:

- source account id
- provider name
- external provider conversation/call id
- primary source type
- customer-facing source summary where useful

`intake_requests` should store source context for structured review:

- source type/name/identifier
- raw message/transcript/payload
- linked customer/job/appointment
- source attribution copied from the inbound event

### Minimum New Attribution Model

V1 likely needs one small source registry and one reusable attribution payload pattern.

Recommended table: `inbound_sources`.

Purpose:
Register websites, widgets, lead sources, tracking numbers, and manual source identities that are allowed to feed WRA.

Recommended fields:

- `id`
- `company_id`
- `source_key`
- `channel`
- `source_name`
- `provider_name`
- `domain`
- `allowed_domains`
- `campaign`
- `default_service_type`
- `communication_source_account_id`
- `is_active`
- `metadata`
- `created_at`
- `updated_at`

Why it is needed:

- Public website/widget submissions need a safe way to map `source_id` to a company.
- Multiple microsites need distinct attribution without separate backends.
- Lead generators need provider/source ids independent from company phone numbers.
- Future reporting needs stable source identities.

Recommended fields to add or standardize on inbound records:

- `source_channel`
- `source_id`
- `source_name`
- `source_account_id`
- `tracking_phone_number`
- `website_domain`
- `landing_page_url`
- `referrer_url`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `provider_lead_id`
- `provider_event_id`
- `attribution`

`attribution` can be a JSON object for provider-specific values, but important filter/reporting fields should be typed columns where they will be queried.

Tables that should preserve attribution:

- `communication_conversations`
- `communication_messages` where event-level attribution differs
- `intake_requests`
- `service_requests`
- future appointment/booking records when created directly from booking

Do not create a separate analytics/event warehouse in V1. Preserve the data now; reporting can come later.

### Normalized Inbound Event

All providers and public forms should normalize into a common internal shape before writing business records.

Recommended envelope:

- `companyId`
- `sourceId`
- `channel`
- `sourceAccountId`
- `providerName`
- `providerEventId`
- `providerLeadId`
- `occurredAt`
- `attribution`
- `customer`
- `serviceAddress`
- `property`
- `requestedService`
- `problemDescription`
- `requestedAppointment`
- `message`
- `transcript`
- `rawPayloadReference`

The gateway should use this envelope for dedupe, matching, and routing.

### Tracking Number Attribution

Tracking numbers should be modeled as active `communication_source_accounts` records and may also link to `inbound_sources`.

When a call/SMS arrives:

- destination phone number resolves source account
- source account resolves company
- optional linked inbound source supplies campaign/website/lead-generator attribution
- event writes attribution into conversation/intake/job path

### Booking Widget Attribution

Each booking widget instance should have an `inbound_sources` row.

Widget requests must include:

- source id/key
- domain
- landing page URL
- campaign/UTM values

Server must validate:

- source exists
- source is active
- domain is allowed
- source belongs to the company whose availability is being requested

The source id must not be trusted blindly from the browser.

## Security Requirements

Communications contains sensitive customer information:

- names
- phone numbers
- emails
- addresses
- transcripts
- recordings
- job details
- intake details

V1 requirements:

- Company A must never access Company B communications.
- Dashboard APIs must require authenticated bearer sessions.
- User access must be checked against company membership/role before reading or mutating conversations.
- Service role may be used only server-side after authorization or inside verified provider webhook ingestion.
- Provider credentials must remain server-only.
- Browser must not receive provider API keys or webhook secrets.
- Retell recording URLs must not be exposed directly; audio should continue through authenticated/server-side proxy behavior.
- Telnyx webhook signature verification is required before accepting inbound SMS/call status events.
- Retell webhook verification should be added where available/appropriate before relying on public provider webhooks.
- Outbound SMS and outbound calls must verify the user can operate for the source account's company.
- Source account id supplied by a client must be validated server-side against the company and enabled capabilities.
- Provider webhook idempotency must prevent duplicate records on retries.

Additional public-source and booking requirements:

- Public website forms must validate source id and allowed domain.
- Booking widgets must not expose another company's availability or data.
- Public booking availability responses must be scoped to one company/source.
- Public booking APIs must be rate limited.
- Public submissions must include abuse controls such as honeypot, throttling, and server-side validation.
- Public source ids must not grant dashboard access or reveal internal records.
- Provider lead ids and webhook event ids must be treated as untrusted input until verified/deduped.
- Attribution fields must not allow cross-company record creation.
- Booking creation must be atomic with availability/appointment validation to prevent double booking.

RLS should remain enabled where it already protects dashboard reads. Service-role grants should be least privilege and only for server workflows that require them.

## Existing Architecture To Reuse

Reuse:

- `communication_source_accounts` for company/provider communication sources.
- `communication_conversations` for top-level conversation threads.
- `communication_messages` for inbound/outbound SMS and call summary messages.
- `communication_transcripts` for call transcript text and speaker segments.
- `communication_timeline_events` for business timeline display.
- `intake_requests` for dispatcher-reviewed new-service intake.
- `/dashboard/communications` as the hub surface.
- `/dashboard/intake` as the structured review/conversion surface.
- existing Retell `call_analyzed` phone ingestion.
- existing Retell recording metadata/audio proxy.
- existing Intake to Job conversion.

Also reuse or extend:

- existing Intake source fields for source type/name/identifier.
- existing communication source-account resolution for phone/SMS tracking numbers.
- existing address/customer matching principles from Intake.
- future Scheduling/Availability work as the one availability source, not a new booking-only calendar.

Do not create duplicate tables for messages, call logs, transcripts, phone numbers, or intake unless a specific V1 requirement cannot be represented by the existing model.

## Required Changes

### Database

Prefer small additions to the current tables.

Source attribution and booking additions:

- Add `inbound_sources` or equivalent source registry for websites, widgets, lead generators, tracking sources, and manual source identities.
- Add durable attribution fields or a typed-plus-JSON attribution pattern to `communication_conversations`.
- Add durable attribution fields or a typed-plus-JSON attribution pattern to `intake_requests`.
- Add durable attribution fields or a typed-plus-JSON attribution pattern to `service_requests`.
- Link `communication_source_accounts` to an attribution source where tracking phone numbers represent campaigns/websites.
- Add provider event/lead id idempotency indexes for inbound source events.

Likely required fields:

- `communication_source_accounts.voice_enabled`: whether the source can handle voice.
- `communication_source_accounts.sms_enabled`: whether the source can send/receive SMS.
- `communication_source_accounts.default_outbound_voice`: company default for outbound calls.
- `communication_source_accounts.default_outbound_sms`: company default for outbound SMS.
- `communication_messages.delivery_status`: pending/sent/delivered/failed/undeliverable for outbound provider messages.
- `communication_messages.provider_status`: raw provider status string when useful.
- `communication_messages.sent_by_profile_id`: dashboard user who sent the outbound message.
- `communication_messages.read_at` or a separate read-state table if company-level unread is sufficient.
- `communication_conversations.needs_response_at`: timestamp of latest activity requiring response.
- `communication_conversations.resolved_at`: when conversation was resolved.
- `communication_conversations.resolved_by_profile_id`: who resolved it.

Consider a separate table only if needed:

- `communication_conversation_reads`: per-profile read state for selected conversation.
- `communication_notifications`: only if existing notification architecture cannot represent communication alerts.

Indexes needed:

- provider/source idempotency lookup for messages.
- provider/source idempotency lookup for inbound form/booking/lead events.
- company + updated/last event ordering for inbox.
- company + status/needs response filtering.
- source account + customer phone recent conversation lookup.
- source id + company lookup for public forms/widgets.
- service request attribution lookup for future reporting.

### API / Webhooks

Needed APIs:

- `GET /api/communications/conversations`
- `GET /api/communications/conversations/[id]`
- `POST /api/communications/conversations/[id]/messages`
- `POST /api/communications/conversations/[id]/notes`
- `POST /api/communications/conversations/[id]/mark-read`
- `POST /api/communications/conversations/[id]/resolve`
- `POST /api/communications/conversations/find-or-create`
- `POST /api/communications/telnyx/sms-webhook`
- `POST /api/communications/telnyx/status-webhook`
- `POST /api/communications/outbound-call`
- Settings APIs for communication source account list/update/defaults.
- `POST /api/inbound/forms`
- `POST /api/inbound/lead-webhook/[provider]`
- `GET /api/booking/sources/[sourceId]/availability`
- `POST /api/booking/sources/[sourceId]/requests`
- internal gateway helper for normalized inbound event processing.

Reuse existing phone webhook routes unless a clean Telnyx-specific route is needed for SMS/status separation.

### UI

Needed UI:

- stronger Communications inbox filters/search.
- selected conversation stream with SMS/call/transcript entries.
- SMS composer.
- internal note composer.
- read/unread/needs response/resolved actions.
- context panel actions for Customer, Job, Intake.
- Customer Call/Text integration into Communications.
- Settings -> Communications page.
- in-app badge/count for unread/needs-response.
- source attribution chips/context in Communications and Intake.
- Settings source management for website/widget/tracking sources when needed.
- public booking widget UI that calls central WRA availability.

### Provider Integration

Telnyx:

- inbound SMS webhook.
- outbound SMS send.
- delivery status webhook.
- outbound call initiation/bridge.
- call status webhook.
- signature verification.

Retell:

- keep existing `call_analyzed` ingestion.
- keep existing recording lookup.
- add/confirm webhook verification if provider supports it.
- use only for AI voice flows, transcripts, and recordings.

Websites/forms:

- submit normalized public form payloads to WRA.
- provide source id/domain/landing page/UTM data.
- never write directly to CRM tables.

Lead generators:

- provider webhook adapters normalize lead payloads.
- provider lead ids are used for idempotency.
- lead-generator inquiries usually create Intake first unless company rules explicitly allow otherwise.

### Security

Needed security work:

- Telnyx webhook signature validation.
- Retell webhook validation where possible.
- outbound SMS/call authorization checks.
- source-account capability checks.
- least-privilege service-role grants for new server workflows.
- no client exposure of provider credentials.
- no direct exposure of Retell recording URLs.
- public source validation and domain allowlists.
- booking API rate limiting.
- public booking responses scoped to minimal availability data.
- atomic booking/appointment protection through the future Availability Engine.

### Notifications

Minimum notification work:

- compute unread/needs-response counts.
- show badge in dashboard navigation.
- create in-app notification for new inbound SMS/missed call.
- dedupe provider retry notifications.
- clear/acknowledge when dispatcher opens/resolves conversation.

## Implementation Roadmap

This roadmap preserves the original Communications tasks and adds the unified source-attribution, Intake Gateway, and Booking boundary work required before WRA can safely accept customer inquiries from many sources.

Each task is intentionally small enough for a future implementation session to complete without rediscovering the whole architecture.

### COM-01 - Source Attribution Foundation

Purpose:
Add the minimum durable source-attribution model for websites, widgets, lead generators, tracking numbers, and manual sources.

Files/tables likely affected:
`inbound_sources` or equivalent new source registry, attribution fields on `communication_conversations`, `intake_requests`, and `service_requests`, Supabase types.

Depends on:
Existing Communications and Intake foundation.

### COM-02 - Communication Source Account Capabilities

Purpose:
Add the minimum fields and read model for active Voice/SMS source accounts, tracking numbers, and default outbound source selection.

Files/tables likely affected:
`communication_source_accounts`, Supabase types, Settings-related API/UI.

Depends on:
COM-01.

### COM-03 - Unified Inbound Event Contract

Purpose:
Create the internal normalized inbound event type/helper used by phone, SMS, forms, booking widgets, lead generators, and manual intake.

Files/tables likely affected:
new server helper/module for inbound normalization, existing phone workflow integration points.

Depends on:
COM-01.

### COM-04 - Unified Intake Gateway Foundation

Purpose:
Create the server-side gateway that validates source identity, dedupes provider/source events, matches Customer/Property, and decides whether to create/reuse Conversation and/or Intake.

Files/tables likely affected:
new server gateway helper, `communication_conversations`, `intake_requests`, matching helpers.

Depends on:
COM-03.

### COM-05 - Website / Microsite Source Registration

Purpose:
Support registered public website/form sources with active state, domain allowlist, channel/source labels, and campaign metadata.

Files/tables likely affected:
`inbound_sources`, Settings or internal admin UI/API if needed, public source validation helper.

Depends on:
COM-01.

### COM-06 - Public Website Form Inbound API

Purpose:
Accept website contact/request-service submissions through the gateway while preserving domain, landing page, UTM, campaign, and source attribution.

Files/tables likely affected:
`POST /api/inbound/forms`, Unified Intake Gateway, `intake_requests`, optional conversation records.

Depends on:
COM-04, COM-05.

### COM-07 - Tracking Number Attribution

Purpose:
Connect tracking phone numbers to source attribution so calls/SMS from different campaigns keep source context through Conversation, Intake, and Job.

Files/tables likely affected:
`communication_source_accounts`, `inbound_sources`, phone workflow source-account resolution.

Depends on:
COM-01, COM-02.

### COM-08 - Booking Source / Widget Architecture

Purpose:
Define and register booking widget source ids so many websites can use one WRA booking system while preserving attribution.

Files/tables likely affected:
`inbound_sources`, booking source validation helper, public widget configuration API if needed.

Depends on:
COM-01, COM-05.

### COM-09 - Availability Engine Interface Contract

Purpose:
Create the narrow API/server contract that public booking will call for central WRA availability, without redesigning frozen Scheduling.

Files/tables likely affected:
booking availability API surface, future scheduling adapter boundary, no scheduling behavior changes beyond the interface stub/contract.

Depends on:
COM-08.

### COM-10 - Public Booking Availability API

Purpose:
Expose source-scoped bookable windows to approved booking widgets using the central Availability Engine contract and minimal public data.

Files/tables likely affected:
`GET /api/booking/sources/[sourceId]/availability`, source validation, Availability Engine interface.

Depends on:
COM-09.

### COM-11 - Booking Request Gateway

Purpose:
Accept a selected booking slot and customer/problem details, run gateway matching/dedupe, and route to Intake or direct Job + Appointment according to company/source rules.

Files/tables likely affected:
`POST /api/booking/sources/[sourceId]/requests`, Unified Intake Gateway, `intake_requests`, `service_requests`, appointments through future Scheduling contract.

Depends on:
COM-04, COM-10.

### COM-12 - Conversation State Fields

Purpose:
Add explicit unread/needs-response/open/resolved support without overloading provider metadata.

Files/tables likely affected:
`communication_conversations`, optional read-state table, Supabase types.

Depends on:
Existing Communications Hub, COM-01.

### COM-13 - Inbox Filters, Attribution Chips, And Badges

Purpose:
Upgrade `/dashboard/communications` list with All, Unread, Needs Response, Calls, SMS, Open, Resolved filters, source badges, and dashboard navigation counts.

Files/tables likely affected:
`CommunicationsHub.tsx`, dashboard navigation data, communication conversation queries.

Depends on:
COM-12.

### COM-14 - Inbound SMS Webhook

Purpose:
Accept Telnyx inbound SMS, verify signature, resolve source account/tracking attribution, dedupe provider message id, create/reuse conversation, persist inbound message, and mark needs response.

Files/tables likely affected:
Telnyx SMS webhook route, communication source/message/conversation tables, Unified Intake Gateway.

Depends on:
COM-02, COM-04, COM-07, COM-12.

### COM-15 - Conversation Detail Message Stream

Purpose:
Render SMS messages, call summaries, transcripts, recordings, source context, and notes in one conversation stream.

Files/tables likely affected:
`CommunicationsHub.tsx`, `communication_messages`, `communication_transcripts`, `communication_timeline_events`.

Depends on:
COM-13, COM-14.

### COM-16 - Outbound SMS API

Purpose:
Send SMS through the correct company source, persist pending/sent/failed status, and keep provider credentials server-side.

Files/tables likely affected:
outbound message API route, Telnyx server helper, `communication_messages`.

Depends on:
COM-02, COM-14.

### COM-17 - SMS Composer

Purpose:
Add dispatcher SMS reply composer to Communications using the outbound SMS API.

Files/tables likely affected:
`CommunicationsHub.tsx`, outbound SMS API.

Depends on:
COM-16.

### COM-18 - Delivery Status Webhook

Purpose:
Update outbound SMS delivery status from Telnyx webhooks and surface failed delivery to dispatchers.

Files/tables likely affected:
Telnyx status webhook route, `communication_messages`.

Depends on:
COM-16.

### COM-19 - Customer Text Opens Communications

Purpose:
Change Customer -> Text from `sms:` handoff to WRA conversation find/create and composer focus.

Files/tables likely affected:
Customer dashboard component, conversation find/create API, Communications route state.

Depends on:
COM-17.

### COM-20 - Outbound Call Foundation

Purpose:
Add server-side outbound call initiation through a company voice source, with conversation/call event persistence.

Files/tables likely affected:
outbound call API, Telnyx call helper, `communication_messages` or timeline events.

Depends on:
COM-02, COM-12.

### COM-21 - Customer Call Uses WRA

Purpose:
Change Customer -> Call from `tel:` handoff to WRA company-channel call workflow.

Files/tables likely affected:
Customer dashboard component, outbound call API, Communications route state.

Depends on:
COM-20.

### COM-22 - Internal Notes Composer

Purpose:
Allow dispatchers to add internal conversation notes that never send to providers.

Files/tables likely affected:
`CommunicationsHub.tsx`, message/note API, `communication_messages` or timeline events.

Depends on:
COM-15.

### COM-23 - Link Customer / Job / Intake Actions

Purpose:
Add minimal actions to link a conversation to an existing Customer, Job, or Intake without duplicating CRM editing.

Files/tables likely affected:
Communications context panel, linking API, existing Customer/Job/Intake tables.

Depends on:
COM-15.

### COM-24 - Intake Creation From Conversation

Purpose:
Allow dispatcher to create/review Intake from a conversation when the communication represents a new service request.

Files/tables likely affected:
Communications context panel, existing Intake APIs/RPCs, Unified Intake Gateway.

Depends on:
COM-23.

### COM-25 - Settings -> Communications Read/Edit

Purpose:
Create a small Settings -> Communications UI for company numbers, provider status, active state, Voice/SMS capability, and defaults.

Files/tables likely affected:
Settings dashboard components, settings API route, `communication_source_accounts`.

Depends on:
COM-02.

### COM-26 - Settings -> Incoming Sources

Purpose:
Expose a practical source-management surface for websites, booking widgets, lead sources, and tracking number attribution when needed.

Files/tables likely affected:
Settings dashboard components, source API route, `inbound_sources`, `communication_source_accounts`.

Depends on:
COM-05, COM-07, COM-08.

### COM-27 - Notification Badge Foundation

Purpose:
Show operational unread/needs-response counts so customer communication cannot sit unnoticed.

Files/tables likely affected:
dashboard navigation, communications query/API, conversation state fields.

Depends on:
COM-12, COM-13.

### COM-28 - Provider Webhook Hardening

Purpose:
Finalize Telnyx and Retell webhook verification, idempotency logging, source validation, and safe error handling before broader production use.

Files/tables likely affected:
phone webhook routes, Telnyx SMS/status routes, lead webhook routes, provider helper modules.

Depends on:
COM-14, COM-18, existing Retell workflow.

### COM-29 - Mobile Communications Pass

Purpose:
Make inbox, selected conversation, context panel, source context, and composer usable on mobile without redesigning the data model.

Files/tables likely affected:
`CommunicationsHub.tsx`, dashboard mobile navigation.

Depends on:
COM-15, COM-17.

### COM-30 - Public Booking Widget UI

Purpose:
Build the reusable booking widget experience that websites/microsites embed while using WRA source attribution and central availability.

Files/tables likely affected:
public booking components, booking source config API, booking availability/request APIs.

Depends on:
COM-08, COM-10, COM-11.

### COM-31 - Production QA Checklist

Purpose:
Validate the complete unified Workiz-exit loop: website form, booking widget, inbound SMS, outbound SMS, inbound Retell call, recording, Intake conversion, Customer Text, Customer Call, unread/needs response, source attribution, and tenant isolation.

Files/tables likely affected:
No product files unless QA finds bugs.

Depends on:
COM-01 through COM-30.
