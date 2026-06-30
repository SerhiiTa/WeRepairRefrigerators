# Backup Milestone 1: Scheduling Foundation

Created: 2026-05-30

Git HEAD at time of milestone documentation: `d475f99`

Local tag requested for this milestone: `milestone-scheduling-foundation`

## Purpose

This milestone records a safe recovery point after Task 108, before adding scheduling configuration or real calendar/provider integrations.

No application behavior, Supabase schema, API behavior, provider integrations, packages, or commits were changed by Task 108.5.

## Current Completed Task Summary

- Supabase Auth, profile role/status loading, onboarding, protected dashboard routing, and dashboard identity foundations are implemented for local/dev staging workflows.
- Public technician profiles are backed by a sanitized public view and public-safe slug routes.
- `/schedule-service` can carry public technician context and submit real service requests after the relevant dev/staging SQL is applied.
- `/dashboard/leads` and `/dashboard/leads/[id]` support the real CRM request inbox/detail workflow after RLS policies are applied.
- CRM request status updates, internal notes/timeline, photo uploads, pricing catalog, estimate lifecycle, customer estimate approval, invoice foundation, address intelligence, and Google Places address autocomplete have been implemented through prior tasks.
- Integration architecture is documented in `docs/INTEGRATION_LAYER_ARCHITECTURE.md`.
- Provider-neutral integration contracts and noop providers exist under `frontend/src/lib/integrations/`.
- Provider-free scheduling primitives and the global availability engine exist under `frontend/src/lib/integrations/scheduling/`.
- `/dashboard/dev/scheduling-engine` visually verifies provider-free scheduling output using static mock technicians only.

## Important Architecture Already Implemented

- `frontend/src/lib/integrations/types.ts`
  - Provider-neutral contracts for Calendar, Communication, Maps, Analytics, and Payment providers.
- `frontend/src/lib/integrations/noop-providers.ts`
  - Safe noop provider implementations that do not call external services.
- `frontend/src/lib/integrations/registry.ts`
  - Registry/factory that currently returns noop providers only.
- `frontend/src/lib/integrations/scheduling/types.ts`
  - Scheduling domain types for work blocks, busy blocks, service windows, durations, travel buffers, availability slots, and availability responses.
- `frontend/src/lib/integrations/scheduling/availability.ts`
  - Pure TypeScript utilities for normalizing blocks, detecting overlaps, merging blocks, subtracting busy time, and generating slots.
- `frontend/src/lib/integrations/scheduling/availability-engine.ts`
  - Provider-free multi-technician availability engine that filters by ZIP, builds candidates, and ranks by earliest slot, conflict count, and stable technician ID.
- `frontend/src/app/dashboard/dev/scheduling-engine/page.tsx`
  - Internal/dev-only diagnostics page for static scheduling scenarios.

## Known Stable Routes

The production build generated these notable routes successfully:

- `/`
- `/login`
- `/signup`
- `/onboarding`
- `/schedule-service`
- `/technicians`
- `/technicians/[slug]`
- `/estimates/[token]`
- `/dashboard`
- `/dashboard/leads`
- `/dashboard/leads/[id]`
- `/dashboard/technician-profile`
- `/dashboard/dev/supabase-check`
- `/dashboard/dev/scheduling-engine`
- `/dashboard/open-jobs`
- `/dashboard/community`
- `/dashboard/analytics`
- `/dashboard/settings`

## Scheduling and Integration Foundation Status

Current status:

- No Google Calendar integration.
- No Apple Calendar integration.
- No Outlook integration.
- No Telnyx, Twilio, or Retell integration.
- No Stripe integration.
- No Google Analytics, Search Console, or Business Profile integration.
- No Zapier, Make.com, or Google Sheets integration.
- No provider env vars were added for the integration layer.
- No scheduling schema exists yet.
- No scheduling API exists yet.
- No customer-facing booking UI exists yet.

What exists:

- Provider-neutral interfaces.
- Noop providers.
- Provider-free scheduling primitives.
- Provider-free multi-technician availability engine.
- Internal dev diagnostics page with static scenarios.

## Verification Commands and Results

Commands run from `frontend/` unless noted:

```bash
npm run lint
```

Result: passed.

```bash
npm run build -- --webpack
```

Result: passed.

Build notes:

- Next.js build compiled successfully.
- TypeScript completed successfully.
- Static generation completed successfully.
- Build generated 71 app routes, including `/dashboard/dev/scheduling-engine`.

Command run from repository root:

```bash
git diff --check
```

Result: passed with no whitespace errors.

## Current Git Status Snapshot

The worktree contains existing uncommitted Task 100-108 era changes. This milestone does not commit them.

Modified files shown at the time of backup:

- `docs/DEVELOPER_HANDOFF.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `frontend/src/app/api/service-requests/[id]/estimates/route.ts`
- `frontend/src/app/dashboard/dev/supabase-check/page.tsx`
- `frontend/src/components/dashboard/DashboardAuthGate.tsx`
- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/auth/profile.ts`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/client.ts`
- `frontend/src/lib/supabase/types.ts`

Untracked files/directories shown at the time of backup:

- `docs/ADDRESS_INTELLIGENCE_FOUNDATION.md`
- `docs/ESTIMATE_MVP_CHECKPOINT.md`
- `docs/INTEGRATION_LAYER_ARCHITECTURE.md`
- `frontend/src/app/api/estimates/`
- `frontend/src/app/api/invoices/`
- `frontend/src/app/api/service-requests/[id]/address/`
- `frontend/src/app/dashboard/dev/scheduling-engine/`
- `frontend/src/app/estimates/`
- `frontend/src/components/public/PublicEstimateApproval.tsx`
- `frontend/src/lib/address-autocomplete.ts`
- `frontend/src/lib/integrations/`
- `supabase/migrations/0025_estimate_lifecycle_rpc_apply_ready.sql`
- `supabase/migrations/0026_estimate_customer_approval_flow_apply_ready.sql`
- `supabase/migrations/0027_estimate_token_generation_fix_apply_ready.sql`
- `supabase/migrations/0028_invoice_foundation_apply_ready.sql`
- `supabase/migrations/0029_service_request_address_intelligence_apply_ready.sql`

## Restore Instructions

No automatic restore command was run.

Recommended recovery approach:

1. Inspect this milestone file and the local tag:

   ```bash
   git show milestone-scheduling-foundation
   ```

2. Inspect the current worktree:

   ```bash
   git status --short
   git diff --stat
   ```

3. If a future scheduling-config task causes a regression, compare against the milestone state:

   ```bash
   git diff milestone-scheduling-foundation -- frontend/src/lib/integrations frontend/src/app/dashboard/dev/scheduling-engine docs/PROJECT_STATE.md docs/ROADMAP.md docs/DEVELOPER_HANDOFF.md
   ```

4. Revert only the specific files involved in the regression. Do not use destructive broad resets unless explicitly approved.

5. Re-run verification:

   ```bash
   cd frontend
   npm run lint
   npm run build -- --webpack
   cd ..
   git diff --check
   ```

## Notes

- The local tag points to the current Git HEAD commit, not a new commit containing uncommitted worktree changes.
- This is expected because the task explicitly did not request a commit.
- Treat this file plus the current worktree as the human-readable recovery marker for the scheduling foundation state.
