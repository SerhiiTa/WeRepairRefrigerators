# Task 159 - Communications Hub Daily Workflow

Task 159 upgrades the existing `/dashboard/communications` page into the daily work center for calls, messages, intake, and customer conversations.

This task does not create a new Workspace, route, communication table, customer system, job system, provider integration, SMS/email workflow, notification delivery, or database migration.

## Purpose

The Communications Hub should answer:

Who contacted us and what needs to happen next?

It is the correct work center for:

- Phone calls.
- Future SMS.
- Future email.
- Website and marketplace intake.
- Transcript and audio review.
- Customer matching.
- Intake review.
- Job conversion.
- Opening linked customers and jobs.

## Reused Data Sources

The upgraded Hub reads existing records only:

- `communication_conversations`
- `communication_messages`
- `communication_transcripts`
- `communication_timeline_events`
- `intake_requests`
- `customers`
- `customer_addresses`
- `customer_appliances`
- `service_requests`

## UI Behavior

The Communications Hub now has three daily-work zones:

1. Conversation Queue
   - Shows channel badge.
   - Shows matched customer name when available.
   - Shows phone/email.
   - Shows last activity.
   - Shows status and simple indicators such as Needs Review, Missing Customer, Missing Job, Converted, Intake, and Has Recording when supported by real data.

2. Selected Conversation Context
   - Shows customer summary.
   - Shows customer primary address and job service address separately.
   - Shows appliance summary.
   - Shows problem summary.
   - Shows linked intake and linked job cards.
   - Shows transcript/message preview.
   - Keeps existing internal Retell recording proxy playback.
   - Shows business timeline events only.

3. Next Actions
   - Review Intake.
   - Create / Match Customer.
   - Open Customer.
   - Convert to Job.
   - Open Job.
   - Copy phone/email/address.

Objects navigate. Buttons act.

## Preserved Boundaries

- Retell webhook and recording APIs were not changed.
- No Retell calls were made.
- No SMS/email/Yelp/Thumbtack provider behavior was implemented.
- No notification delivery was implemented.
- No Dashboard, Job Workspace, Estimate, Invoice, Payment, Supabase, or auth behavior was changed.

## Remaining Placeholders

- SMS/email/website/Yelp/Thumbtack channels are represented by source labels only until those providers are explicitly implemented.
- Unread indicators are not shown because there is no real unread data yet.
- Add Customer Note remains a future action unless connected to an existing customer-note write flow in a future task.
- Conversation-to-job backfill still depends on existing `communication_conversations.service_request_id` or `intake_requests.linked_service_request_id`.

## Workiz Exit Impact

The Communications Hub now behaves more like the daily inbound-work surface needed to stop opening Workiz for calls and leads. A dispatcher or solo owner can start from a real phone conversation, understand the customer/appliance/problem context, review the intake, open or match the customer, and open the linked job through existing WRA workflows.
