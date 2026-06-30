# M3 Job Workspace Rollback

## Milestone

- Local git tag: `milestone-m3-job-workspace-before-integrations`
- Tagged commit: `d475f99`
- Created after verification of the jobs-first CRM navigation and Job Workspace refactor.
- Purpose: provide a rollback marker before any Google Calendar, SMS, phone-call, maps, AI, or external provider integration work begins.

Important caveat: this repository currently has many uncommitted task files and edits. A git tag points only to a committed object. This tag protects the committed `HEAD`; it does not by itself preserve uncommitted working-tree files. Before destructive rollback, inspect `git status --short` and preserve any uncommitted work that should survive.

## What This Milestone Protects

This milestone marks the current pre-integration product state:

- Jobs-first dashboard navigation:
  - Dashboard
  - Jobs
  - Calendar
  - Customers
  - Technicians
  - Reports
  - Settings
- Jobs route still maps to `/dashboard/leads`; no database or API route rename has occurred.
- Calendar route still maps to `/dashboard/technician-schedule`.
- Developer diagnostics remain accessible by direct `/dashboard/dev/*` routes, but are not primary navigation.
- Job Workspace detail page is the primary technician workflow surface.
- Job detail preserves:
  - Dispatcher Preview and snapshot saving.
  - Appointment booking foundation.
  - Estimate lifecycle.
  - Customer approval flow.
  - Invoice foundation.
  - Notes and timeline.
  - Photos.
  - Address intelligence and map links.
- Technician schedule remains in place and does not expose raw customer phone numbers.

## Features Existing At This Point

- Supabase Auth/dashboard guard foundation.
- Public technician profiles and request-service flow.
- Real `service_requests` creation and dashboard reading after applicable migrations are applied.
- Real dashboard Jobs inbox at `/dashboard/leads`.
- Real job detail route at `/dashboard/leads/[id]`.
- Status update workflow.
- Internal notes and timeline foundation.
- Customer and technician photo upload foundation.
- Estimate MVP:
  - Draft creation.
  - Draft edit/update.
  - Draft void.
  - Send to customer.
  - Public approve/decline.
- Invoice foundation:
  - Create from approved estimate.
  - Send, mark paid, void.
- Address intelligence:
  - Structured address fields.
  - Manual edit.
  - Google Places browser autocomplete.
  - Google/Apple Maps links.
- Provider-free scheduling pipeline:
  - Intake normalization.
  - Company scheduling config.
  - Availability engine.
  - Dispatcher recommendations.
  - Safe response drafts.
  - Dev diagnostics.
- Dispatcher Preview in CRM:
  - Real service request input.
  - Real technician matching.
  - Technician availability rules.
  - Internal preview snapshot persistence.
- Appointment booking foundation:
  - `appointments` table migration.
  - Booking RPC.
  - Schedule page.
  - Duplicate/overlap protections planned in RPC.

## External Integrations Not Yet Added

No real external provider integration exists at this milestone:

- No Google Calendar sync.
- No Apple Calendar sync.
- No Outlook Calendar sync.
- No SMS sending.
- No email sending.
- No phone calls.
- No Telnyx/Twilio/Retell integration.
- No Google Maps routing or travel-time API.
- No AI API calls.
- No Stripe/payment processing.
- No webhook processing for providers.

## Rollback Guidance

Use this rollback marker carefully:

1. Inspect current changes:

   ```bash
   git status --short
   git diff --name-only
   ```

2. Preserve any uncommitted files that should survive rollback. Do not run destructive reset commands unless explicitly approved.

3. To inspect the milestone commit:

   ```bash
   git show --stat milestone-m3-job-workspace-before-integrations
   ```

4. To create a temporary branch from the milestone:

   ```bash
   git switch -c recovery/m3-job-workspace milestone-m3-job-workspace-before-integrations
   ```

5. To compare current work against the milestone:

   ```bash
   git diff milestone-m3-job-workspace-before-integrations
   ```

6. Do not apply database rollback SQL without a separate Supabase-specific rollback plan. Several migrations from prior tasks were manually applied in dev/staging and are not reversed by git operations.

## Verification At Milestone Creation

Commands run successfully:

```bash
cd frontend
npm run lint
npm run build -- --webpack
cd ..
git diff --check
```

Results:

- Lint passed.
- Next.js webpack production build passed.
- `git diff --check` passed.

## Future Integration Safety

Before starting Google Calendar, SMS, calls, maps routing, AI, or payment integrations:

- Keep provider code behind the integration layer.
- Do not expose provider secrets to the browser.
- Keep service-role keys out of frontend code.
- Preserve appointment booking RPC boundaries.
- Preserve communication proxy placeholders until a privacy-reviewed provider plan exists.
- Keep customer/technician raw phone numbers out of public and schedule UI.
