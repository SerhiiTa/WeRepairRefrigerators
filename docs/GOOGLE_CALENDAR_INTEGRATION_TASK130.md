# Google Calendar Integration Task 130

## Scope

Task 130 adds a safe server-side Google Calendar integration path for appointment sync.

Task 131 clarified the scheduling architecture: the internal CRM `appointments` table and `/dashboard/technician-schedule` Dispatch Board are the source of truth for technician schedules. Google Calendar remains optional outbound sync only; technician personal calendars are not the primary scheduling system.

Current behavior:

- Appointment booking remains functional without Google credentials.
- After booking, the server attempts calendar event creation only when Google Calendar env vars are configured.
- If Google Calendar is not configured, booking still succeeds and the UI shows `Calendar Sync: Not configured`.
- If Google Calendar succeeds, the appointment metadata can store the provider/event/status through migration `0033`.
- If Google Calendar fails, the appointment remains booked and the UI shows a safe failed sync message.

No SMS, email, phone calls, AI dispatcher, maps routing, payments, customer notifications, or provider webhooks were added.

## New Files

- `supabase/migrations/0033_google_calendar_appointment_sync_apply_ready.sql`
- `frontend/src/server/integrations/calendar/google-calendar.ts`
- `frontend/src/server/integrations/calendar/appointment-calendar-sync.ts`

## Required Environment Variables

Do not commit real secrets. These are server-side variables only:

```bash
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_DEFAULT_CALENDAR_ID=primary
```

`GOOGLE_CALENDAR_REDIRECT_URI` is documented for the OAuth setup flow. The current server sync implementation uses the approved refresh-token approach through `GOOGLE_CALENDAR_REFRESH_TOKEN`.

## Database Changes

Apply-ready migration:

`supabase/migrations/0033_google_calendar_appointment_sync_apply_ready.sql`

Adds safe metadata fields to `public.appointments`:

- `external_calendar_provider`
- `external_calendar_event_id`
- `external_calendar_status`
- `external_calendar_last_synced_at`
- `external_calendar_error`

Adds narrow RPC:

- `set_appointment_calendar_sync_rpc(...)`

The RPC updates only safe calendar sync metadata for appointments the current authenticated user can access. It does not store credentials or provider tokens.

## Security Model

- Google credentials are read only on the server.
- No Google secrets are exposed to browser code.
- No service-role key is used in frontend/browser code.
- Appointment booking still uses the existing booking RPC.
- Calendar metadata uses a separate narrow RPC.
- Calendar sync failure does not undo the appointment booking.
- Calendar event descriptions include job context but no customer/technician phone numbers.

## UI Surfaces

Technician schedule cards show:

- Not configured
- Pending
- Synced
- Failed
- Canceled

The Job Workspace Appointment tab shows the latest sync result from the booking response, including a safe provider event reference when present.

## Manual Apply Step

Codex did not apply SQL. Apply this manually in dev/staging before expecting metadata persistence:

```bash
open -a TextEdit ./supabase/migrations/0033_google_calendar_appointment_sync_apply_ready.sql
```

Copy all SQL into Supabase SQL Editor and run it.

## Remaining Work

- Add a real OAuth connection management screen.
- Add retry controls for failed syncs.
- Add update/cancel hooks when appointment lifecycle changes are implemented.
- Add webhook/sync-log persistence after provider webhook architecture is approved.
- Add Google Calendar event update/cancel calls once appointment update/cancel UI exists.
