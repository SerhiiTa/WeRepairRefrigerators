# Task 125 Authenticated Booking QA Access

## Purpose

Task 124 could not complete authenticated browser QA because the Codex in-app browser was logged out and the repository does not contain a test password. Task 125 defines a dev/staging-only way to prepare a dashboard-ready technician account and appointment-booking fixtures without weakening production authentication or committing credentials.

## Security Boundaries

- Do not store passwords in git, docs, SQL, or screenshots.
- Do not apply this fixture to production.
- Do not expose customer or technician phone numbers.
- Do not add Google Calendar, SMS, email, calls, maps, AI, or external provider integrations.
- This setup uses normal Supabase Auth login in the browser. It does not add an auth bypass route.
- The fixture temporarily disables profile protection triggers only inside Supabase SQL Editor for a controlled dev/staging QA profile update.

## Dev Test Account Setup

1. In the dev/staging Supabase dashboard, create or update this Auth user:
   - Email: `qa-booking-tech@example.test`
   - Temporary password: create one locally and store it in a password manager only.
   - Confirm the user if email confirmation is enabled.
2. Apply the fixture in Supabase SQL Editor:
   - `supabase/fixtures/booking_qa_dev_fixture.sql`
3. The fixture prepares:
   - active `technician` profile with completed onboarding;
   - verified public-ready independent technician profile;
   - Monday 9 AM-12 PM availability matching the current dispatcher fallback date `2026-06-01`;
   - two private QA service requests selected for the QA technician slug;
   - no real phone numbers.

If a different QA email is required, edit only the `qa_user_email` variable at the top of the SQL before applying.

## Browser QA Steps

1. Start the local app on `localhost:3002`.
2. Log in at `/login` with the QA email and locally stored temporary password.
3. Open `/dashboard/dev/supabase-check`.
4. Confirm `/dashboard` is `Allowed`.
5. Open `/dashboard/leads`.
6. Open the `QA Booking Primary` service request.
7. Confirm Dispatcher Preview shows:
   - `QA Booking Technician`;
   - ZIP `77494`;
   - a Monday morning recommendation;
   - availability rules configured.
8. Click `Book Appointment`.
9. Confirm success message says no SMS/email/calls/calendar sync were sent.
10. Refresh the detail page.
11. Confirm the service request shows:
   - status `scheduled`;
   - scheduled window;
   - appointment booked state.
12. Try booking the same request again or call the appointment API again with the same request. Expected: duplicate active appointment is blocked.
13. Open `QA Booking Overlap`.
14. Click `Book Appointment`. Expected: overlapping appointment is blocked because the first request already occupies the same technician/date/window.
15. Open `/dashboard/technician-schedule`.
16. Confirm the appointment appears.
17. Confirm no raw customer phone number is visible. The only communication controls should be disabled `Call via Platform` and `Message via Platform` placeholders.

## SQL Verification

After booking, verify rows in Supabase SQL Editor:

```sql
select id, customer_name, status, appointment_id,
       assigned_technician_profile_id, scheduled_date,
       scheduled_window_start_time, scheduled_window_end_time
from public.service_requests
where customer_email = 'qa-booking@example.test'
order by created_at desc;

select id, service_request_id, technician_profile_id, appointment_date,
       window_start_time, window_end_time, status, source
from public.appointments
where service_request_id in (
  select id
  from public.service_requests
  where customer_email = 'qa-booking@example.test'
)
order by created_at desc;
```

## Task 125 Result

Codex added the dev/staging setup path and fixture, but did not apply SQL or create passwords. Authenticated booking QA remains pending until the QA Auth user exists and the fixture is manually applied in Supabase SQL Editor.
