# First Live Phone Workflow - Task 152

Task 152 adds the first server-side phone workflow foundation for Workiz Exit.

This is not a production phone-number launch, SMS launch, Retell agent launch, or complete telephony product. It is the first safe path for Telnyx/Retell-style phone events to enter WRA-owned records.

## Architecture

Provider flow:

1. Telnyx carries the phone call.
2. Retell can provide the AI voice conversation and transcript.
3. WRA receives a normalized provider payload through a server route.
4. WRA resolves the owned phone source through `communication_source_accounts`.
5. WRA creates or reuses a `communication_conversations` row.
6. WRA stores transcript/message/timeline business content.
7. WRA creates an Intake Inbox record for dispatcher review.
8. Dispatcher conversion remains the safe path to create a real job/appointment.

WRA remains the source of truth. Telnyx and Retell remain providers only.

## New Provider Ingestion Routes

- `POST /api/communications/phone-webhook`
- `POST /api/intake/webhook-retell-telnyx`

Both routes use the same server-side phone workflow handler.

The route accepts Telnyx- or Retell-shaped JSON and returns:

- `accepted: true` when WRA accepted the event into Communications Hub
- `accepted: false` when source mapping or server configuration is missing
- `conversationId` when a conversation was created or reused
- `intakeRequestId` when an intake record was created or reused

## Source Account Requirement

Migration `0052_first_live_phone_workflow_foundation_apply_ready.sql` adds:

- `communication_source_accounts`
- call/source metadata columns on `communication_conversations`

An incoming phone event must resolve an active source account by destination phone number before WRA writes operational records. This avoids unscoped provider webhooks creating orphaned or cross-company data.

Example source account setup after applying the migration:

```sql
insert into public.communication_source_accounts (
  company_id,
  source_type,
  provider_name,
  source_identifier,
  display_name,
  is_active
)
values (
  '<company-id>',
  'phone',
  'telnyx',
  '<10-digit-owned-dev-number>',
  'WRA dev phone line',
  true
);
```

Do not store provider API keys, webhook secrets, or raw sensitive payloads in this table.

## Customer Recognition

Task 152 currently matches existing customers by:

- customer phone
- customer email

When a match exists, the conversation and intake link to the customer. If no match exists, the workflow creates intake only and does not create a duplicate customer automatically.

Address, appliance, and previous-history matching remain next-step improvements.

## Conversation Records

Accepted phone events can create:

- `communication_conversations`
- `communication_messages`
- `communication_transcripts`
- `communication_timeline_events`
- `intake_requests`

Normal technician UI shows only business timeline events such as `Incoming call`.

Provider/debug details, payload shape, booking status, signature state, confidence, language, and extraction internals stay out of normal technician UI.

## Job Creation Boundary

Task 152 intentionally does not allow a provider payload to directly create service requests or appointments.

If Retell/Telnyx reports that booking is complete, WRA still creates a conversation plus intake and marks it for review. A dispatcher converts intake through the existing trusted Intake Inbox flow.

This preserves:

- duplicate protection
- customer recognition review
- company/technician access checks
- appointment validation
- CRM job visibility rules

Direct provider-to-job automation can be added later only after source verification, idempotency, appointment validation, and rollback rules are proven.

## SMS Foundation

The ingestion result exposes `smsConfirmationPrepared` when a provider payload indicates a completed booking, but no SMS is sent.

Future SMS confirmation should use the Communications Hub and template/audit rules, not direct provider writes.

## Current Limitations

- A real phone call was not placed by Codex during Task 152.
- Production phone numbers were not connected.
- Provider signature verification remains future work.
- Source-account setup must be done in dev/staging after applying `0052`.
- Job and appointment creation still require dispatcher conversion from Intake.
- Outbound SMS confirmation remains foundation only.

## Verification

Task 152 verification:

- `npm run lint`
- `npm run build -- --webpack`
- `git diff --check`

Manual real-call QA still requires:

1. Apply `0051` and `0052`.
2. Add a dev/staging `communication_source_accounts` row for the owned test number.
3. Point the development Telnyx/Retell webhook at `/api/communications/phone-webhook`.
4. Place a real call.
5. Verify conversation, transcript, intake, business timeline, customer link, and no duplicate customer/job records.

## Task 152.1 Retell Webhook Stabilization

Retell production/staging webhook QA showed that `POST /api/communications/phone-webhook` returned `202`, but no records appeared in Communications Hub or Intake Inbox.

Root cause:

- The endpoint was reachable, but the first normalizer did not fully support Retell's actual `call_analyzed` payload shape under `body.call.*`.
- The real Retell data uses `body.event = call_analyzed`, `body.call.call_id`, `body.call.from_number`, `body.call.to_number`, `body.call.transcript`, and `body.call.call_analysis.custom_analysis_data`.
- Source matching also needed to tolerate stored WRA source identifiers such as `+13466461949` while incoming provider payloads may send `+13466461949`, `13466461949`, `+1 346 646 1949`, or equivalent formatting.

Task 152.1 adds safe structural webhook diagnostics and supports this Retell payload shape:

- `event`
- `call.call_id`
- `call.from_number`
- `call.to_number`
- `call.start_timestamp`
- `call.end_timestamp`
- `call.transcript`
- `call.call_analysis.call_summary`
- `call.call_analysis.call_successful`
- `call.call_analysis.user_sentiment`
- `call.call_analysis.custom_analysis_data.name`
- `call.call_analysis.custom_analysis_data.best_phone`
- `call.call_analysis.custom_analysis_data.address`
- `call.call_analysis.custom_analysis_data.zip`
- `call.call_analysis.custom_analysis_data.brand`
- `call.call_analysis.custom_analysis_data.appliance_type`
- `call.call_analysis.custom_analysis_data.issues`
- `call.call_analysis.custom_analysis_data.appointment_date`
- `call.call_analysis.custom_analysis_data.appointment_time`

Safe diagnostics log only:

- event name
- top-level keys
- call keys
- call id
- from/to number
- transcript presence/length
- call analysis presence
- custom analysis data keys
- source matching / skip reason

Diagnostics do not log full transcripts, full raw payloads, authorization headers, API keys, or provider secrets.

Idempotency:

- Repeated `call_id` reuses the existing `communication_conversations` row.
- Existing linked intake is reused.
- Duplicate transcript/message/timeline rows are not created for the same conversation.

Non-`call_analyzed` Retell events return a safe `202` skipped response and do not create operational records.

## Task 152.5 Service Role Grant Fix

Production Retell QA confirmed the real `call_analyzed` payload reaches WRA, but ingestion stopped at source-account lookup with:

- table: `communication_source_accounts`
- operation: `select_source_account`
- message: `permission denied for table communication_source_accounts`
- code: `42501`
- hint: `Grant the required privileges to the current role with: GRANT SELECT ON public.communication_source_accounts TO service_role;`

Root cause:

- `0051` and `0052` created the Communications Hub tables and authenticated dashboard policies, but did not explicitly grant the PostgreSQL `service_role` role the table privileges used by the server-side phone ingestion workflow.
- The issue is database privileges, not Retell, Vercel, payload normalization, or webhook routing.

Fix:

- Apply `supabase/migrations/0053_communications_service_role_grants_apply_ready.sql`.
- The migration grants only the minimum operations used by phone ingestion:
  - `SELECT` on `communication_source_accounts`
  - `SELECT, INSERT, UPDATE` on `communication_conversations`
  - `SELECT, INSERT` on `communication_transcripts`
  - `SELECT, INSERT` on `communication_messages`
  - `SELECT, INSERT` on `communication_timeline_events`
  - `INSERT` on `intake_requests`
  - `SELECT` on `customers`
- It does not disable RLS, change anon/authenticated policies, modify auth, connect providers, or create jobs/appointments.

After applying `0053`, rerun live Retell QA with one real `call_analyzed` phone call and verify records in Communications Hub plus Intake Inbox.

## Task 152.6 Intake Payload Schema Fix

Production Retell QA after the service-role grant fix created a `communication_conversations` row, then failed while inserting `intake_requests`:

- table: `intake_requests`
- operation: `insert_phone_intake`
- message: `Could not find the 'duplicate_confirmed' column of 'intake_requests' in the schema cache`
- code: `PGRST204`

Root cause:

- `normalizeIntakeWritePayload()` returns `duplicate_confirmed` because dashboard intake create/update RPCs accept it as a JSON control flag.
- The real table stores duplicate confirmation as `duplicate_confirmed_at` and `duplicate_confirmed_by`.
- `duplicate_confirmed` is not, and should not become, a physical `intake_requests` column.
- Phone ingestion inserts directly with the server-side service-role client, so it must not send RPC-only control fields to PostgREST table insert.

Fix:

- Phone ingestion now strips `duplicate_confirmed` before inserting into `intake_requests`.
- No migration is required for this mismatch.
- Other phone-ingestion intake fields match the schema from migrations `0047` through `0050`: source/customer/address/appliance/problem/preferred-window/raw/transcript/extracted/duplicate-candidate/status/company/link/audit fields.

Do not spend another live Retell call on this step unless production has been deployed and a replay/safe test cannot prove the insert payload shape.
