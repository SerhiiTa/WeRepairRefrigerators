# Task 152.2 Phone Workflow Audit

Status: implementation hardening complete locally; apply `supabase/migrations/0056_phone_intake_mapping_hardening_apply_ready.sql` before final production recheck.

Task 153 has not started.

## Existing Architecture

The production phone workflow remains the existing Task 152 pipeline:

1. Retell posts `call_analyzed` to `/api/communications/phone-webhook`.
2. `phone-webhook-handler.ts` accepts only supported provider events and routes Retell calls into `ingestPhoneCommunication(...)`.
3. `phone-normalization.ts` normalizes Retell payload fields into provider-neutral phone workflow data.
4. `phone-workflow.ts` matches the destination phone against `communication_source_accounts`, matches an existing customer by phone/email, creates or updates a conversation, stores transcript/message/timeline records, and creates an `intake_requests` row.
5. The dispatcher reviews the intake in `/dashboard/intake`.
6. The existing authenticated conversion RPC converts the intake into a CRM job/service request and optionally an appointment when an assigned technician plus structured appointment date/window are present.

No new phone workflow, dispatcher flow, Retell call, SMS flow, or UI redesign was added.

## Verified Production Behavior

Read-only production audit used existing stored Retell calls only. No paid Retell call was made.

Latest verified production conversation:

- `communication_conversations.id`: `d98ce41d-0f09-403c-9ff1-7856013ff6ea`
- `company_id`: `f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633`
- `provider_name`: `retell`
- `primary_source_type`: `phone`
- `external_conversation_id`: `call_a694183cd68227af424945e5d38`
- `status`: `needs_action`
- `customer_id`: matched existing customer `5531d7cf-0d7d-4c8e-9385-e36ba8b6e76a`
- `intake_request_id`: `74cc4d7e-22b5-440c-b4ec-0c8d00c927f1`
- `service_request_id`: not stored on the conversation row
- `appointment_id`: not stored on the conversation row

Related verified records:

- `communication_transcripts`: one transcript row, 1,885 characters, 28 speaker segments.
- `communication_messages`: one inbound phone message row with the call summary.
- `communication_timeline_events`: one business event, `incoming_call`, linked to the intake request.
- `intake_requests`: one Retell AI intake row linked to the matched customer and converted to a CRM job.

Converted intake:

- `intake_requests.id`: `74cc4d7e-22b5-440c-b4ec-0c8d00c927f1`
- `source_type`: `retell_ai`
- `status`: `converted`
- `linked_customer_id`: `5531d7cf-0d7d-4c8e-9385-e36ba8b6e76a`
- `linked_service_request_id`: `8eff621e-324a-42e3-b4e0-42236d8e65fa`
- `linked_appointment_id`: `null`
- `assigned_technician_id`: `be191958-e702-4aa8-b294-bda2f59d37f6`
- Appliance copied onto intake: `refrigerator`, brand `LG`
- Requested window copied onto intake: `7 AM to 12 PM`
- Structured appointment date/start/end on this production intake: `null`

The existing production intake was converted into a service request/job. It did not create an appointment because the intake did not have structured `appointment_date`, `window_start_time`, and `window_end_time` at conversion time.

## Field Origin Analysis

Phone ingestion currently maps fields from the real Retell `call_analyzed` shape:

| Field | Current origin |
| --- | --- |
| Customer first/last/full name | Retell `call.call_analysis.custom_analysis_data.name`, split by server code; existing matched customer can fill display fallback |
| Customer phone | Retell `custom_analysis_data.best_phone` first, then call `from_number`; normalized for matching |
| Customer email | Retell `custom_analysis_data.customer_email`; existing matched customer can fill fallback |
| Street/service address | Retell `custom_analysis_data.address` or `service_address`; now parsed conservatively into street/unit/city/state/ZIP when possible |
| Apartment/unit | Retell `custom_analysis_data.unit`/`apartment`, or parsed from address text such as Apt/Unit/Suite/# |
| City/state/ZIP/country | Retell structured fields when present; ZIP can also be parsed from address text; state defaults later through intake normalization |
| Appliance type | Retell `custom_analysis_data.appliance_type` |
| Brand | Retell `custom_analysis_data.brand` |
| Model | Retell `custom_analysis_data.model_number` or `model` |
| Serial | Not currently supplied by the Retell normalizer; remains dispatcher-editable in the intake |
| Problem description | Retell `custom_analysis_data.problem_description`/`issues`, then summary/transcript fallback |
| Requested date | Retell `custom_analysis_data.appointment_date`; now accepts ISO, simple US date, natural month date, `today`, and `tomorrow` |
| Requested arrival window | Retell `custom_analysis_data.appointment_time`, preserved as display text |
| Window start/end | Retell explicit `window_start_time/window_end_time`, or now parsed from windows such as `9 AM to 11 AM` |
| Assigned technician | Dispatcher/intake conversion selection or default current technician fallback in conversion RPC |
| Source id / call id | Retell `call.call_id` copied to `external_conversation_id` and intake `source_identifier` |
| Intake id | Generated by `intake_requests` insert |

Fields generated by WRA:

- Conversation id
- Transcript id
- Message id
- Timeline event id
- Intake id
- Customer match status
- `next_action`
- `provider_metadata`
- Duplicate conversion protection state

Dispatcher-editable fields:

- Customer/contact corrections
- Address components
- Appliance/brand/model/serial
- Problem description
- Date/window
- Assigned technician
- Duplicate confirmation before conversion

## Entity Relationship Graph

Verified current production graph:

```text
communication_conversations
  -> communication_transcripts
  -> communication_messages
  -> communication_timeline_events
  -> intake_requests
      -> customers
      -> service_requests
      -> appointments: none for the audited converted intake
      -> customer_appliances: missing before Task 152.2 hardening
```

Customer behavior:

- The audited production call matched an existing customer by phone/email.
- If no match exists, phone ingestion creates intake only; customer creation occurs later during conversion through the existing customer RPC.
- Duplicate customers are not created during phone ingestion.

Appliance behavior before Task 152.2:

- Appliance information existed on the intake and service request as copied fields.
- No `customer_appliances` row was created or linked during intake conversion.
- Job Workspace therefore used copied service request values rather than a linked customer asset for phone-converted jobs.

Appointment behavior:

- Phone ingestion does not book appointments.
- Intake conversion creates an appointment only when the converted intake has all of: `appointment_date`, `window_start_time`, `window_end_time`, and `assigned_technician_id`.
- The audited production intake had a display window only and no structured date/start/end, so no appointment was created.

## Bugs Discovered

1. Natural-language appointment windows were not structured.

   Retell can provide `appointment_time` such as `9 AM to 11 AM` or `7 AM to 12 PM`. The old normalizer preserved only the display string. `window_start_time` and `window_end_time` stayed `null` unless Retell separately sent strict 24-hour fields.

2. Flexible appointment dates were too strict.

   The old normalizer accepted only `YYYY-MM-DD`. Common human/AI values such as `tomorrow`, `7/8/2026`, or month-name dates did not become structured `appointment_date`.

3. Address components stayed collapsed.

   A full Retell address could remain in one `service_address` field. Unit/city/state/ZIP were not reliably separated unless Retell supplied exact structured keys.

4. Converted phone jobs had no customer appliance link.

   The conversion RPC creates or matches a customer, but it did not match/create a `customer_appliances` row or set `service_requests.customer_appliance_id`.

5. Existing production conversation does not link back to the service request after manual intake conversion.

   The intake row links to the service request, but `communication_conversations.service_request_id` remains `null`. The intake linkage is enough to trace the graph, but the conversation row itself is not fully back-linked yet.

6. Full raw Retell payload values are intentionally not stored.

   The pipeline stores normalized records, transcript, safe summary, and metadata. That is privacy-safe, but exact old field provenance cannot be reconstructed from production rows after the fact beyond normalized values and code paths.

## Fixes Applied

Code hardening:

- `frontend/src/server/communications/phone-normalization.ts`
  - Parses flexible dates into `appointmentDate`.
  - Parses AM/PM arrival windows into `windowStartTime` and `windowEndTime`.
  - Parses service address into street, unit, city, state, ZIP, and country where possible.
  - Preserves the original appointment window label.
  - Adds safe metadata flags showing whether address/window normalization happened.

- `frontend/src/server/communications/phone-workflow.ts`
  - Passes parsed unit/city/state/country into `normalizeIntakeWritePayload(...)`.
  - Persists safe normalization flags in intake `raw_payload` and `extracted_data`.

Database hardening:

- `supabase/migrations/0056_phone_intake_mapping_hardening_apply_ready.sql`
  - Adds `find_or_create_customer_appliance_for_intake(...)`.
  - Adds a post-conversion trigger that syncs converted intake context onto the linked service request.
  - Links or creates a customer appliance for converted intakes.
  - Formats service request full address from structured intake address parts.
  - Backfills already-converted intakes by re-running the sync path.

## Remaining Limitations

- Apply migration `0056` in Supabase before expecting appliance link backfill or future conversion sync in production.
- No paid Retell call is needed to test `0056`; use existing converted intakes and dashboard views after applying it.
- The existing conversation row still does not automatically receive `service_request_id` after a dispatcher converts the linked intake. A future small sync can back-link conversations from converted intake rows.
- Phone ingestion currently matches customers by phone/email. Address/appliance-based matching remains a future enhancement and should avoid duplicate customer creation.
- Service-role read grants currently cover phone ingestion tables, not read-only audit of `service_requests` or `appointments`; authenticated dashboard/RLS remains the operational verification path for those records.

## Recommendations Before Task 153

1. Apply `0056_phone_intake_mapping_hardening_apply_ready.sql`.
2. Reopen the existing converted production intake and linked Job Workspace.
3. Confirm the service request has formatted address fields and a linked customer appliance.
4. Convert another existing unconverted phone intake if available; no new Retell call is required.
5. Consider a future conversation back-link migration so `communication_conversations.service_request_id` is filled after intake conversion.

## Task 152.4 Production Follow-Up

After `0056` was applied, a real production Retell call exposed additional mapping fixes that were not visible from the earlier stored audit rows:

- Address text `3306 South Fry Road, apartment 437, Katy` must map to street `3306 South Fry Road`, unit `apartment 437`, and city `Katy`.
- `today` and `tomorrow` must be calculated from the Retell call start timestamp in `America/Chicago`.
- Natural windows such as `9 to 11 AM`, `between 9 and 11`, `from 9 to 11`, and `9-11 AM` must produce structured start/end times.

Task 152.4 implements those normalizer fixes and adds deterministic cases in `frontend/src/server/communications/phone-normalization-cases.ts`.

Task 152.4 also adds an internal Retell recording panel to `/dashboard/communications`. The panel fetches recording URLs from Retell on demand through a server route. Recordings are not stored in Supabase Storage and are not shown to customers.

No new migration was required for Task 152.4, and no additional paid Retell call was made during the implementation.
