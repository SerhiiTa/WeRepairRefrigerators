# Roadmap

Read first:

docs/CODEX_OPERATING_RULES.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/DEVELOPER_HANDOFF.md

P0 auth recovery note: Owner account passwords were restored using a temporary password outside git; future QA provisioning must remain limited to `qa-` accounts.

## Platform Bible Documentation

The official WeRepairRefrigerators source-of-truth documentation is now organized under `docs/platform-bible/`.

Before starting major architecture, workflow, customer, technician, marketplace, CRM, AI, inventory, vendor, or dashboard work, read `docs/platform-bible/README.md` and align implementation with the Platform Bible documents.

## Milestone: Workiz Exit / HomeFix Pilot

Primary two-month goal: HomeFix must stop using Workiz and run daily operations inside WRA.

Success definition:

- Dispatcher uses WRA instead of Workiz.
- Technician uses WRA instead of Workiz.
- Customer receives estimate, invoice, and appointment links from WRA.
- Jobs are created, scheduled, estimated, invoiced, paid, and closed inside WRA.
- Workiz is not opened for 30 days.

Future task filter: every task must answer `Does this help HomeFix stop using Workiz within two months?` If no, move it to backlog.

## Next Task Sequence

### Task 149 — Professional Job Workspace Completion

Focus:

- Make Job Workspace ready for daily technician use.
- No cosmetic redesign.
- Improve practical workflow only.
- Technician can open job, call customer, view address, notes, photos, appointments, estimate, invoice, status, and close job from mobile.

### Task 150 — Dispatcher Board + Real Calendar

Focus:

- Dispatcher daily board.
- Schedule by technician.
- Move/reschedule appointments.
- Return visits.
- Google Calendar outbound sync validation.
- Mobile/tablet friendly dispatcher view.

### Task 151 — Real SMS Automation

Focus:

- Twilio or selected provider.
- Appointment confirmation.
- On-my-way message.
- Estimate sent.
- Appointment reminder.
- Review request.
- No demo messaging.

### Task 152 — Invoice + Payment Completion

Focus:

- Invoice creation from approved/completed work.
- Stripe payment.
- Payment status.
- Receipt.
- Customer payment page.

### Task 153 — HomeFix Daily Pilot

Focus:

- Run real HomeFix jobs inside WRA.
- Identify blockers from daily use.
- Fix only operational blockers.
- Prepare Workiz shutoff checklist.

## Phase 1: Frontend MVP

- Task 148.10 created the Repair Intelligence Engine foundation. Future estimate work should treat estimates as the output of structured repair planning: complaint/findings/intents become a `RepairPlan`, then operations, parts, materials, labor considerations, risk notes, warranty, and pricing policy produce the estimate draft. The first knowledge packs cover refrigeration, laundry, dishwasher, and cooking. Do not move into inventory, vendor search, payments, community, dashboard redesign, or new estimate UI redesign from this task.

- Task 148.11 connected the Repair Intelligence output to the technician review loop. The compact estimate card now surfaces a small Repair Plan summary and stores that summary in the existing estimate learning context when a technician saves a generated draft. Generated lines continue to use the existing estimate builder/save path, so future improvements should focus on authenticated save/reopen QA and learning-event analysis rather than adding more UI surface.

- Task 148.12 attempted authenticated persistence QA but remained blocked by the Codex in-app browser being logged out of the dashboard. Next estimate QA must start with a confirmed dashboard technician/company-owner session that can open `/dashboard/leads`; then generate one Repair Intelligence estimate, save it, leave/reopen the job, and verify saved lines, non-zero total, and learning context.

- Task 148.13 added a credential-safe Repair Intelligence estimate QA setup path. Create and confirm `qa-estimate-tech@example.test` manually in Supabase Auth, store the password outside git, then apply `supabase/fixtures/repair_intelligence_estimate_qa_fixture.sql` in dev/staging. After that, log in at `/login`, open `/dashboard/leads`, run the `QA Estimate Persistence` job, and complete the blocked generated estimate save/reopen QA before Task 149.

- Task 148.14 used the newly available service-role key to create/reuse QA Auth users and establish an authenticated dashboard session. Live browser QA reached the Job Workspace and generated a `$4,476.91` OpenAI Repair Intelligence estimate, but save/reopen QA is blocked by a live DB mismatch: `service_requests.company_id` is missing while the Task 148 estimate RPC expects it. Apply `supabase/migrations/0044_repair_intelligence_estimate_persistence_company_scope_fix_apply_ready.sql`, then apply `supabase/fixtures/repair_intelligence_estimate_qa_fixture.sql`, then rerun the save/reopen QA before Task 149.

- Task 148.15 verified that `0044` resolves the missing-column blocker and that the live estimate-agent route uses OpenAI for Repair Intelligence generation. The remaining persistence blocker is compatibility with legacy independent-technician QA jobs: those requests are dashboard-visible through `selected_technician_slug` but have `company_id = null`, so the professional estimate RPC still rejects them as `Service request not found`. Apply `supabase/migrations/0045_repair_intelligence_independent_technician_estimate_compat_apply_ready.sql` to allow those already-authorized legacy jobs to save estimates and learning payloads without changing company-owned estimate behavior. After `0045` is applied, rerun Generate Estimate → Save Estimate → leave job → reopen job and verify lines, non-zero total, RepairPlanSummary, and estimateDecisionContext persistence before starting Task 149.

- Task 148 is COMPLETE. After live migrations `0044`, `0045`, and `0046`, authenticated browser QA passed for the full Repair Intelligence workflow: Generate Estimate -> review repair plan -> Send/Save Estimate -> leave job -> reopen job -> verify persisted estimate number, line items, non-zero total, single saved estimate row, and no fresh browser console errors. Task 149 was not started during this completion pass.

- Task 138 professionalized the technician dashboard Phase 1: compact alert strip, 70/30 Today's Schedule and Sales Snapshot center, denser AI/parts/manual tools, compact operational widgets, and sidebar polish. This was UI-only with no backend or schema changes.

- Task 137 turned `/dashboard` into Technician Dashboard Brain v1. It now prioritizes attention items, upcoming work, money snapshot, AI/parts/manual/calls/community preview widgets, and safe empty states. Raw database relationship errors are no longer shown on the dashboard.

- Task 136 aligned the main CRM screens closer to the approved field-technician mockup: `/dashboard` now leads with operational metrics and quick actions, `/dashboard/leads` is denser like a dispatch board, and the Job Workspace has a compact header, quick action row, immediate-save status dropdown, and cleaner operational copy.

- Task 135.1 cleaned up dashboard contrast and removed normal-dashboard auth diagnostics from the CRM topbar. Developer diagnostics remain isolated to `/dashboard/dev/*`.

- Task 135 completed the Jobs Inbox visual transformation: the former admin-style list is now a technician-first operational job board with search, status, technician, and schedule filters.

- Task 134 completed the real Job Workspace visual pass: the main service request detail screen now uses light Workiz-style operational cards across address, appointment, dispatcher, estimate, invoice, notes, photos, and timeline sections.

- Build the public homepage.
- Build the dashboard shell.
- Add navigation surfaces for repair cases, AI articles, technicians, and settings.
- Keep the app static and mock-data driven.
- Completed mock dashboard expansions through Task 34:
  - Task 29: Marketplace analytics dashboard.
  - Task 30: Open Job Board mock.
  - Task 31: Technician Community / Knowledge Base mock.
  - Task 32: Repair Help Request creation mock.
  - Task 33: Technician Discussion Detail mock.
  - Task 34: Technician Reputation and Expert Badges mock.
- Completed planning:
  - Task 36: Backend architecture planning for Supabase/Auth/Postgres, RLS, dispatch locking, private community persistence, analytics, Stripe, and AI/RAG phases.
  - Task 37: Auth and role-based access planning for public visitors, customers, technicians, verified technicians, expert technicians, company owners, and admins.
  - Task 38: Supabase data model planning for profiles, companies, service requests, leads, jobs, open jobs, repair cases, community, reputation, public profiles, and audit logs.
  - Task 39: RLS and permission architecture planning for table policies, public/private boundaries, company isolation, open jobs, community, audit, and future API security.
  - Task 40: API and backend service architecture planning for thin backend layers, API domains, uploads, AI, realtime, payments, scaling, security, and observability.
  - Task 41: Supabase client foundation with defensive env handling and typed placeholders. No auth, tables, route protection, or mock workflow replacement yet.
  - Task 42: Auth readiness helpers for planned roles, permission checks, and null-safe session snapshots. No login UI, route protection, middleware, or mock workflow replacement yet.
  - Task 43: Mock-safe login/signup UI pages with defensive Supabase Auth calls. No profile persistence, route protection, middleware, tables, or mock workflow replacement yet.
  - Task 44: Dashboard auth-awareness showing Supabase unavailable, guest/demo mode, or authenticated email/placeholder role. No route protection, middleware, tables, or mock workflow replacement yet.
  - Task 45: Draft Supabase profiles/roles migration. The SQL file exists for review but has not been applied to any database.
  - Task 46: Frontend profile role/status read helpers and typed `public.profiles` placeholder shape. Profile reads remain inactive until the profiles migration is reviewed/applied and helpers are intentionally not wired into route protection yet.
  - Task 47: Supabase setup guide for creating a project, configuring frontend env vars, reviewing/applying the first migration safely, and verifying profile row creation. Documentation only; no migration has been applied.
  - Task 48: Local dashboard Supabase verification helper at `/dashboard/dev/supabase-check` for env/client/session/profile checks after manual migration setup. This is direct-URL development tooling only, not production admin tooling or route protection.
  - Task 49: Dashboard auth badge now displays the authenticated user's `public.profiles` role/status when available. This is display-only role sync; dashboard routes remain mock-safe and unprotected.
  - Task 50: Owner/admin promotion guide for safely promoting a known development account by email in Supabase SQL Editor. Documentation only; no SQL was applied and no frontend behavior changed.
  - Task 51: Route protection foundation with typed auth/profile guard helpers and non-blocking dashboard notices for logged-out, missing-profile, pending, suspended, or rejected states. No redirects, middleware, route gating, migrations, or mock workflow changes yet.
  - Task 52: Auth middleware and safe redirect strategy planning. Documentation only; no middleware, redirects, route blocking, migrations, or behavior changes yet.
  - Task 53: Auth guard dry-run diagnostics for dashboard routes. Access decisions are evaluated and displayed without redirects, blocking, middleware enforcement, service-role usage, migrations, or public page changes.
  - Task 54: Real data model planning for service requests, leads, jobs, assignments, repair cases, customer addressing, pricing, open jobs, and future AI article drafts. Documentation only; no migrations, SQL, tables, or frontend behavior changes.
  - Task 55: Review-only draft migration for first real marketplace tables: `service_requests`, `leads`, `jobs`, and `repair_cases`. The migration has not been applied and should be reviewed with RLS policy design before use.
  - Task 55A: Auth QA visibility improvements for login/signup and dashboard status panels, post-login dashboard redirect, logout controls, profile loading timeout messaging, and local mobile testing documentation. No route protection, migrations, or database changes.
  - Task 55B: iPhone/Safari local session hydration diagnostics with guarded browser storage, explicit Supabase auth persistence options, current-origin/localStorage/session/profile diagnostics, and a forced post-login session check before redirect. No route protection, migrations, SQL, or database changes.
  - Task 59: Real onboarding flow planning for customers, technicians, company owners, admins, company creation, membership, invites, join requests, statuses, redirects, and RLS implications. Documentation only; no UI, migrations, SQL, or Supabase changes.
  - Task 60: Review-only onboarding foundation migration draft for companies, company members, technician profiles, company invites, join requests, onboarding status support, indexes, and RLS planning comments. The migration has not been applied.
  - Task 61: Hardened the onboarding migration draft for lifecycle constraints, safer foreign keys, invite token hashing semantics, independent/company technician modeling, soft-archive fields, indexes, and clearer RLS TODOs. The migration remains review-only and has not been applied.
  - Task 62: Review-only onboarding RLS policy plan for profiles onboarding fields, companies, company members, technician profiles, company invites, and company join requests, including abuse scenarios and test cases. No executable policies or SQL were applied.
  - Task 63: Review-only server-side onboarding actions plan for company creation, invites, invite acceptance, join requests, technician profile updates, verification, onboarding completion, and member archival. No code, SQL, migrations, or behavior changes were made.
  - Task 64: Review-only audit logging plan and migration draft for sensitive onboarding/company actions, append-only audit records, sanitized metadata, admin/server-only access, and abuse/support investigation. No SQL was applied and no frontend behavior changed.
  - Task 65: Review-only RLS helper function plan and SQL draft for reusable policy predicates covering current user role, admin status, company membership/management, technician profile access, and public technician visibility. No SQL was applied and no frontend behavior changed.
  - Task 78: Protected dashboard routing through `DashboardAuthGate`, centralized dashboard access decisions, `/account-status` blocked-access screens, login `next` redirects, and onboarding redirects. No SQL, service-role usage, package install, or public route protection was added.
  - Task 79: Auth/onboarding/dashboard runtime test documentation. Logged-out dashboard redirects, nested dashboard redirects, `/dashboard/dev/*`, unsafe `next` URLs, and localhost/LAN route availability passed; seeded role/status account tests remain pending.
  - Task 80: Real dashboard identity loading from Supabase Auth/profile/onboarding/company/technician context, with dashboard account cards separated from mock operations data.
  - Task 81: Role-aware dashboard navigation using centralized allowed-role/status/onboarding rules, grouped real/mock/coming-soon/dev navigation, and role-specific dashboard home context.
  - Task 82: Real `/dashboard/technician-profile` workflow for reading the authenticated user's technician profile, creating a draft profile through current RLS when missing, and surfacing the current RLS limitation for existing profile updates.
  - Task 83: Safe technician profile update path. Created an apply-ready dev/staging RPC migration for self-owned technician profile edits and wired the existing server action to call it while preserving a clear error when the migration has not been applied.
  - Task 84: Technician onboarding loop fix. Dashboard readiness now treats `technician_verification_pending` as dashboard-ready for technician roles, onboarding avoids fake success when completion still blocks access, and a safe technician profile upsert RPC migration was created for review/application.
  - Task 85: Dashboard auth mismatch fix. Real dashboard routing now uses the profile-backed session role/status from `public.profiles`, matching the dev Supabase checker and avoiding stale auth-metadata role redirects.
  - Task 86: Auth/onboarding regression lock. Added a safety backup and regression checklist, unified dashboard auth diagnostics with the enforced `evaluateDashboardAccess()` helper, and updated `/dashboard/dev/supabase-check` to show real `/dashboard` and `/dashboard/technician-profile` guard outcomes instead of only the dev-route bypass.
  - Task 87: Public technician profile foundation. Added a sanitized public technician profile loader, dynamic public technician routes backed by a public-safe Supabase view when available, public exposure boundaries, and review/apply-ready migration `0015_public_technician_profiles_view_apply_ready.sql`.
  - Task 88: Public technician profile application check. The user manually applied `0015`; the sanitized public view is reachable and raw `technician_profiles` remains anonymous-protected.
  - Task 89: Dev public-ready technician profile SQL. Created `0016_dev_public_ready_technician_profile_apply_ready.sql`; the user manually applied it and the real slug `refrigerator-houston-repair-8166b185` now renders from Supabase public data.
  - Task 90: Technician profile request service flow. Public technician pages now pass the public slug into `/schedule-service`, and the intake displays selected technician context while falling back safely for invalid/unavailable slugs.
  - Task 91: Service request persistence foundation. Created `0017_service_requests_foundation_apply_ready.sql` and wired `/schedule-service` to `/api/service-requests`; real saves require manual dev/staging SQL application before dashboard lead work.
  - Task 92: Real service requests dashboard inbox. Created `0018_service_requests_dashboard_read_policies_apply_ready.sql`; `/dashboard/leads` and `/dashboard/leads/[id]` now load real `service_requests` through RLS once the read policy is applied.
  - Task 93: Real CRM dashboard navigation integration. Leads is now a real CRM navigation section for technician-capable dashboard roles, Technician Profile remains a real account tool, and mock/coming-soon labels are reserved for incomplete preview areas.
  - Task 94: Service request status updates. Created `0019_service_request_status_update_policies_apply_ready.sql` with a status-only RPC and added `/dashboard/leads/[id]` CRM status controls for `new`, `contacted`, `scheduled`, `completed`, and `canceled`.
  - Task 95: Internal notes and service timeline foundation. Created `0020_service_request_notes_foundation_apply_ready.sql` and added quick internal notes plus timeline rendering to `/dashboard/leads/[id]`.
  - Task 96: Service request photo uploads foundation. Created `0021_service_request_photos_foundation_apply_ready.sql`, added customer intake photo selection/upload wiring, and added technician photo upload/gallery/timeline UI to request detail pages.
  - Task 96B: Verified customer photo upload through anon Supabase storage/table policies and added `0022_patch_service_request_photos_anon_select_revoke_apply_ready.sql` to hard-block anonymous photo metadata reads.
  - Task 97: Estimate foundation and pricing catalog MVP. Created `0023_pricing_catalog_and_estimates_foundation_apply_ready.sql`, seeded a small appliance repair catalog, and added a dashboard estimate panel on service request detail pages.
  - Task 98: Estimate UX v2. Created `0024_estimate_ux_v2_fields_apply_ready.sql`, added appliance-type catalog filtering, richer customer/internal estimate fields, and a customer-facing preview panel.
  - Task 101: Customer estimate approval flow. Created `0026_estimate_customer_approval_flow_apply_ready.sql`, added tokenized public estimate review at `/estimates/[token]`, and added dashboard Send To Customer / approval-link actions for draft estimates.
  - Task 101.1: Customer approval checkpoint. The user manually applied `0025`, `0026`, and `0027`; browser QA passed for draft creation, edit draft, Send To Customer, approval link generation, public approve/decline, status persistence after refresh, and read-only approved estimates.
  - Task 100: Proper estimate lifecycle refactor. Created `0025_estimate_lifecycle_rpc_apply_ready.sql`, added draft update/void RPC wiring, and updated the dashboard estimate UI with create/edit modes, read-only estimate view, active-draft guidance, and intentional new-version behavior.
  - Task 102: Invoice foundation. Created `0028_invoice_foundation_apply_ready.sql`, added invoice/invoice line item snapshots, invoice lifecycle RPCs, and dashboard invoice actions for Create Invoice, View Invoice, Send Invoice, Mark Paid, and Void Invoice.
  - Task 102.2: Invoice foundation checkpoint. Browser QA passed for invoice creation from an approved estimate, invoice viewing, manual send/paid/void actions, refresh persistence, and the cleaned financial document list UX.
  - Task 103: Address intelligence foundation. Created `0029_service_request_address_intelligence_apply_ready.sql`, added structured service request address fields, a narrow address-update RPC, CRM address card/editing, maps links, and an address autocomplete adapter foundation.
  - Task 103.2: Google Places address autocomplete. Wired `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` into the provider-neutral adapter so dashboard address edits can search Google Places, auto-fill structured address fields, capture coordinates/place ID, and fall back to manual entry.
  - Task 104: Integration layer architecture. Created `docs/INTEGRATION_LAYER_ARCHITECTURE.md` with provider-neutral Calendar, Communication, Maps, Analytics, and Payment interfaces, future integration table plans, sync/webhook/error patterns, and AI Dispatcher integration points. Documentation only; no schema, API, UI, provider, or Supabase changes.
  - Task 105: Integration layer minimal code skeleton. Created `frontend/src/lib/integrations/` with provider-neutral TypeScript contracts, noop providers, and a registry/factory that returns noop adapters only. No real providers, env vars, schemas, APIs, UI, packages, or Supabase changes.
  - Task 106: Calendar availability domain model. Added pure TypeScript scheduling primitives in `frontend/src/lib/integrations/scheduling/` for work blocks, busy blocks, service windows, travel buffers, availability slots, overlap detection, block merging, workday subtraction, and slot generation. No real calendar provider, schema, API, UI, env, package, or Supabase changes.
  - Task 107: Global availability engine. Added provider-free multi-technician scheduling in `frontend/src/lib/integrations/scheduling/availability-engine.ts`, including ZIP service-area filtering, candidate generation, deterministic ranking, and response summaries for future AI Dispatcher/booking flows.
  - Task 108: Scheduling engine dev diagnostics. Added `/dashboard/dev/scheduling-engine` with static scenarios for multiple matching technicians, one matching technician, and no matching technician. It visualizes provider-free scheduling output only and does not create customer booking UI or provider integrations.
  - Task 109: Company scheduling configuration domain. Added `frontend/src/lib/integrations/scheduling/company-config.ts` with provider-neutral business hours, service area, appointment default, scheduling rule, emergency rule, default config, and validation helpers. No persistence or runtime wiring yet.
  - Task 110: Company scheduling config applied to availability. Added `frontend/src/lib/integrations/scheduling/company-availability.ts` to convert company policies into provider-free availability requests, apply ZIP/service-area rules, enforce same-day/next-day/horizon/working-day checks, and return validation-aware empty responses when config is invalid.
  - Task 111: Company scheduling config dev diagnostics. Extended `/dashboard/dev/scheduling-engine` with static company-policy scenarios showing business hours, appointment defaults, travel buffer, same-day/date/service-area rule results, validation errors, and ranked provider-free availability candidates.
  - Task 112: Dispatcher recommendation engine. Added `frontend/src/lib/integrations/scheduling/dispatcher-recommendations.ts` to turn raw provider-free availability candidates into customer-friendly best/backup recommendations with service-window labels and deterministic reason codes. The dev diagnostics page now previews these recommendations with static data.
  - Task 113: Dispatcher recommendation dev scenarios. Added static scenario coverage for same-day, next-day, morning preference, afternoon preference, emergency, unsupported ZIP, and no-slot recommendation cases on `/dashboard/dev/scheduling-engine`.
  - Task 114: Dispatcher conversation response builder. Added `frontend/src/lib/integrations/scheduling/dispatcher-response-builder.ts` to turn recommendations into safe customer-facing primary, backup, and no-availability message drafts plus internal summaries. No sending, booking, AI, provider, API, or customer-facing UI behavior was added.
  - Task 115: Scheduling request intake model. Added `frontend/src/lib/integrations/scheduling/scheduling-intake.ts` to normalize and validate customer, location, service, preference, and source data before provider-free availability/recommendation/response generation. `/dashboard/dev/scheduling-engine` now includes an internal static intake preview.
  - Task 116: Scheduling orchestrator pipeline. Added `frontend/src/lib/integrations/scheduling/scheduling-orchestrator.ts` to connect intake normalization, company config validation, provider-free availability, dispatcher recommendations, and safe response draft generation. `/dashboard/dev/scheduling-engine` now includes an internal static pipeline preview.
  - Task 117: Scheduling orchestrator dev scenarios. Expanded `frontend/src/lib/integrations/scheduling/dev-scenarios.ts` and `/dashboard/dev/scheduling-engine` with static end-to-end scenarios covering success, partial, no availability, and validation-failed outcomes.
  - Task 118: Scheduling pipeline stabilization audit. Consolidated static diagnostics scenarios in `dev-scenarios.ts`, reviewed provider-free scheduling exports and validation patterns, and added `docs/SCHEDULING_PIPELINE_FOUNDATION.md` as the checkpoint before persistence, CRM appointment objects, or real provider integrations.
  - Task 119: Read-only CRM dispatcher preview. Added `frontend/src/lib/integrations/scheduling/service-request-adapter.ts` and an internal preview on `/dashboard/leads/[id]` that runs the provider-free orchestrator from existing service request data with static company/technician scheduling inputs. It does not book, persist, send, or call providers.
  - Task 66: Review-only table-specific onboarding RLS policy draft for profiles onboarding fields, companies, company members, technician profiles, company invites, company join requests, and audit logs. No SQL was applied and no frontend behavior changed.
  - Task 67: Review-only migration application readiness checklist for onboarding/audit/RLS migrations, including order, dependencies, rollback, staging, seed fixtures, access tests, mobile auth regression, frontend impact, and go/no-go blockers. No SQL was applied and no frontend behavior changed.
  - Task 68: Migration application readiness evaluation. Application was blocked before any Supabase command because `0003`-`0006` and the readiness checklist still contain explicit review-only/do-not-apply blockers. See `docs/MIGRATION_APPLICATION_BLOCKERS_TASK68.md`.
  - Task 69: Staging apply-ready copies of onboarding, audit, RLS helper, and onboarding policy migrations were created as `0007`-`0010`, with unsafe browser mutations deferred and documented. No SQL was applied and no frontend behavior changed.
  - Task 70: Human review of `0007`-`0010` found the set conditionally staging-safe only, documented remaining server-action/RLS test blockers, and made comment-only cleanup in `0007`/`0008`/`0009`. No SQL was applied and no frontend behavior changed.
  - Task 71: Staging application gate for `0007`-`0010` blocked before SQL execution because the Supabase target could not be independently confirmed as staging/test from local repo or CLI metadata. No SQL was applied and no frontend behavior changed.
  - Task 72: User confirmed project ref `hejpgyzorrxpfcyvmypb` is dev/staging. Pre-checks passed, but Supabase CLI was unavailable, so Codex created manual SQL Editor instructions and verification queries in `docs/MIGRATION_SQL_EDITOR_INSTRUCTIONS_TASK72.md`. No SQL was executed by Codex and no frontend behavior changed.
  - Task 72 follow-up: The user manually applied `0007`-`0010` through Supabase SQL Editor successfully. Codex documented the result in `docs/MIGRATION_APPLICATION_RESULT_TASK72.md` and verified anonymous browser access is denied for private onboarding/audit tables and selected helper RPCs.
  - Task 73: Onboarding RLS test plan/results documented in `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md`. Anonymous private-table probes passed, but static review found suspended members may still read their own `company_members` row/private notes while `archived_at` is null. RLS needs a follow-up patch before server actions.
  - Task 74: Created and manually applied `supabase/migrations/0011_patch_company_members_rls_visibility.sql` to remove raw `company_members` own-row reads for non-manager members. The user applied it through Supabase SQL Editor with `Success. No rows returned`; Codex documented verification in `docs/RLS_PATCH_RESULT_TASK74.md`.
  - Task 75: Added the first onboarding server action foundation in `frontend/src/server/onboarding`. The implementation validates authenticated sessions/profile state, creates safe draft technician profiles where RLS allows it, and blocks company creation/onboarding completion until reviewed trusted transaction paths exist.

## Phase 2: Repair case workflow

- Expand the repair case creation form.
- Add validation.
- Add repair case preview pages.
- Add edit states and draft states.
- Keep data local or mocked until the backend is approved.

## Phase 3: Supabase auth/database

- Use `docs/BACKEND_ARCHITECTURE_PLAN.md` as the implementation planning reference before creating backend code.
- Use `docs/AUTH_ROLES_PLAN.md` as the implementation planning reference before adding auth, middleware, protected dashboard routes, role-aware navigation, or RLS role policies.
- Use `docs/SUPABASE_DATA_MODEL_PLAN.md` as the schema planning reference before creating tables, migrations, storage policies, or RLS policies.
- Use `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md` as the permission planning reference before writing RLS policies, server mutations, admin tools, or protected API routes.
- Use `docs/API_BACKEND_SERVICE_ARCHITECTURE_PLAN.md` as the service/API planning reference before adding API routes, Edge Functions, upload flows, webhooks, AI endpoints, realtime channels, or background jobs.
- Use `docs/INTEGRATION_LAYER_ARCHITECTURE.md` before connecting external providers such as Google Calendar, Apple Calendar, Outlook, Telnyx, Twilio, Retell, Google Analytics, Google Search Console, Google Business Profile, Stripe, Zapier, Make.com, or Google Sheets. Task 104 is documentation only and does not create provider tables, APIs, webhooks, UI, or real integrations.
- Use `frontend/src/lib/integrations/` as the future adapter boundary for provider work. The current Task 105 registry intentionally returns noop providers only and must not be mistaken for configured Google, Telnyx, Twilio, Retell, Stripe, analytics, calendar, or automation integrations.
- Use `frontend/src/lib/integrations/scheduling/` for provider-free availability calculations before introducing calendar providers. Task 106 utilities are pure TypeScript and should be fed by future CRM appointments, Google Calendar events, or AI Dispatcher proposals only after those sources are reviewed.
- Use `generateAvailabilityResponse()` from `frontend/src/lib/integrations/scheduling/availability-engine.ts` when future booking or AI Dispatcher flows need deterministic multi-technician appointment options. It currently filters by ZIP and ranks by earliest slot, conflict count, and technician ID only; it does not use maps, drive time, AI scoring, or provider calendars.
- Use `/dashboard/dev/scheduling-engine` only as an internal diagnostics page for static scheduling scenarios. It is not linked from public pages and should not be treated as a customer booking or CRM scheduling workflow.
- Use `frontend/src/lib/integrations/scheduling/company-config.ts` as the provider-neutral company scheduling policy shape before adding persisted company scheduling settings. Future CRM booking, technician assignment, Google Calendar sync, and AI Dispatcher tasks should validate company config before generating appointment options.
- Use `generateCompanyAvailabilityResponse()` from `frontend/src/lib/integrations/scheduling/company-availability.ts` when future AI Dispatcher or CRM booking flows need availability driven by company scheduling policy. It is still provider-free and does not read Supabase or calendars.
- Use the company-policy section on `/dashboard/dev/scheduling-engine` when changing business-hours, same-day cutoff, service-area, or horizon behavior. It uses static scenarios only and remains internal diagnostics, not customer-facing scheduling.
- Use `generateDispatcherRecommendationResponse()` from `frontend/src/lib/integrations/scheduling/dispatcher-recommendations.ts` when future AI Dispatcher or CRM booking flows need customer-friendly recommendation copy from raw availability. It is rule-based only and does not call AI, maps, calendars, SMS, or booking APIs.
- Use `frontend/src/lib/integrations/scheduling/dev-scenarios.ts` and the dispatcher section on `/dashboard/dev/scheduling-engine` to verify recommendation behavior across same-day, next-day, preferred-window, emergency, unsupported ZIP, and no-slot cases before adding real booking behavior.
- Use `buildDispatcherSchedulingResponse()` from `frontend/src/lib/integrations/scheduling/dispatcher-response-builder.ts` for future phone/SMS/CRM draft copy. The output is safe text only and must not be treated as a booking confirmation or sent message without a focused provider/API task.
- Use `normalizeSchedulingIntake()` and `validateSchedulingIntake()` from `frontend/src/lib/integrations/scheduling/scheduling-intake.ts` before feeding phone, SMS, website, AI chat, or manual admin requests into availability matching. The model is storage-free and provider-free.
- Use `runSchedulingOrchestrator()` from `frontend/src/lib/integrations/scheduling/scheduling-orchestrator.ts` when a future flow needs the whole provider-free pipeline from raw intake to safe response draft. It does not book appointments, persist data, call providers, or send messages.
- Use the orchestrator scenario selector on `/dashboard/dev/scheduling-engine` before changing the full scheduling pipeline. Current static scenarios cover phone and website intake, preferred windows, emergency handling, unsupported ZIPs, missing ZIP, missing appliance/service info, no available slots, and weekend scheduling rules.
- Read `docs/SCHEDULING_PIPELINE_FOUNDATION.md` before adding scheduling persistence, CRM appointment records, customer-facing booking, Google Calendar sync, Maps drive-time logic, AI Dispatcher provider calls, SMS/call delivery, or webhook behavior.
- Treat the `/dashboard/leads/[id]` dispatcher preview as read-only until scheduling persistence is designed. It currently uses real service request fields plus static fallback scheduling config and technicians; do not infer that it represents confirmed technician availability.
- Use the existing `frontend/src/lib/supabase` helpers as the starting point for future client/server Supabase access. They are intentionally inert when public env vars are missing.
- Use the existing `frontend/src/lib/auth` helpers as the starting point for role-aware UI and dashboard route protection, but do not treat frontend permission helpers as the production data security boundary.
- Use `/login` and `/signup` as the future auth UI starting point. Role intent remains UI-only until profile persistence exists.
- Dashboard route protection is active at the shell/runtime layer for normal `/dashboard/*` routes. Middleware/SSR enforcement and role-aware navigation hiding remain future work.
- Review `supabase/migrations/0001_profiles_roles.sql` before applying the first profiles/roles migration.
- Follow `docs/SUPABASE_SETUP_GUIDE.md` before connecting a Supabase project or manually applying the first profiles/roles migration.
- Use `frontend/src/lib/auth/profile.ts` as the future profile role/status sync starting point after migration `0001_profiles_roles.sql` is reviewed and applied. It currently falls back safely when Supabase, sessions, or the profiles table are unavailable.
- Use `/dashboard/dev/supabase-check` only as a local verification helper after configuring Supabase env vars and manually applying the reviewed profiles migration. Do not expose it as production admin tooling.
- Dashboard role/status display can read from `public.profiles` when available. `DashboardAuthGate` now uses the same profile source for runtime route enforcement, while Supabase RLS remains the data authorization boundary.
- Login/signup and dashboard auth panels now display session/profile QA state for local desktop and mobile testing. Login preserves `/login?next=...` redirects for protected dashboard routes.
- Supabase browser auth uses guarded storage with `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` enabled for local desktop/mobile QA. Treat this as session hydration support only, not authorization.
- Use `docs/OWNER_ADMIN_PROMOTION_GUIDE.md` before manually promoting the owner/developer account. Prefer `company_owner` with `active` status for routine development; reserve `admin` for short admin-specific testing.
- Use the route protection helpers in `frontend/src/lib/auth/permissions.ts` and `frontend/src/lib/auth/dashboard-access.ts` for dashboard guard implementation. They support typed checks such as authenticated session presence, profile presence, active profile status, onboarding completion, role membership, and dashboard access eligibility.
- Dashboard auth notices now surface the active guard result for authenticated users. Logged-out, missing-profile, inactive, incomplete-onboarding, and unauthorized role states are redirected before normal dashboard content renders.
- Use `docs/AUTH_MIDDLEWARE_PLAN.md` before adding middleware, SSR route guards, or role-gated navigation. Task 78 covers client/runtime dashboard blocking; the next enforcement phase should focus on middleware/SSR cookies and redirect-loop safety.
- Use `frontend/src/lib/auth/access-decisions.ts` for dashboard diagnostics, and `frontend/src/lib/auth/dashboard-access.ts` for the enforced dashboard shell decision. Both helpers must stay aligned as middleware/SSR enforcement is added later.
- Use `docs/REAL_DATA_MODEL_PLAN.md` before creating real migrations for service requests, leads, jobs, job assignments, repair cases, pricing rules, service areas, customer address handling, open jobs, or AI article drafts.
- Use `docs/ONBOARDING_FLOW_PLAN.md` before creating onboarding UI, company tables, technician profile tables, company invites, join requests, onboarding redirects, or owner/technician setup flows.
- Use `docs/ONBOARDING_RLS_POLICY_PLAN.md` before writing onboarding RLS helper functions, policies, server actions, invite-token flows, or company membership access checks.
- Use `docs/ONBOARDING_SERVER_ACTIONS_PLAN.md` before implementing onboarding Server Actions, API routes, RPC calls, service-role boundaries, invite hashing, or transactional company/member/technician mutations.
- Use `docs/AUDIT_LOG_PLAN.md` before implementing sensitive onboarding/company/admin mutations. Audit metadata must be sanitized, raw logs should stay admin/server-only at first, and audit writes should be transactional with privileged changes where possible.
- Use `docs/RLS_HELPER_FUNCTIONS_PLAN.md` before writing reusable RLS predicates or final table policies. Review `SECURITY DEFINER`, `search_path`, grants, recursion risk, public/private technician profile separation, and multi-company/suspended-member cases first.
- Review `supabase/migrations/0002_real_marketplace_core_draft.sql` before creating or applying real marketplace tables. It is a Task 55 draft only; it has not been applied, does not include final RLS policies, and should not be used for production without review.
- Review `supabase/migrations/0003_onboarding_foundation_draft.sql` before creating or applying real onboarding tables. It is a Task 60/61 draft only; it has not been applied, does not include final RLS policies, and should not be used for production without review.
- Review `supabase/migrations/0004_audit_log_foundation_draft.sql` before creating or applying audit logging. It is a Task 64 draft only; it has not been applied, does not include final RLS policies, and should not be used for production without reviewed server insert paths and metadata validation.
- Review `supabase/migrations/0005_rls_helpers_draft.sql` before creating or applying reusable RLS helper functions. It is a Task 65 draft only; it has not been applied, does not create final policies, and should not be used for production without helper recursion, grant, ownership, and policy tests.
- Review `supabase/migrations/0006_onboarding_rls_policies_draft.sql` before creating or applying table-specific onboarding policies. It is a Task 66 draft only; it has not been applied, and should not be used for production without grant review, invite/audit server-only path review, column-protection strategy, and full access tests.
- Use `docs/MIGRATION_APPLICATION_READINESS_CHECKLIST.md` before applying any onboarding, audit, RLS helper, or table-policy migration. It is a Task 67 review gate only; it does not authorize production application.
- Use `docs/MIGRATION_APPLICATION_BLOCKERS_TASK68.md` before attempting migration application again. The next step is to harden the draft SQL and resolve blockers, not to apply the current files as-is.
- Review `docs/APPLY_READY_MIGRATIONS_REVIEW_TASK69.md` and `supabase/migrations/0007_onboarding_foundation_apply_ready.sql` through `0010_onboarding_rls_policies_apply_ready.sql` before any staging application. They are staging-oriented and not production-approved.
- Review `docs/APPLY_READY_MIGRATIONS_HUMAN_REVIEW_TASK70.md` before any staging application. It records the conditional staging-safe decision, production blockers, and remaining tests for the apply-ready migration set.
- Review `docs/MIGRATION_APPLICATION_BLOCKERS_TASK71.md` before attempting application again. Confirm the target Supabase project name/ref is staging/test, backup/export, rollback, and the application method before SQL execution.
- Use `docs/MIGRATION_SQL_EDITOR_INSTRUCTIONS_TASK72.md` to manually apply `0007`-`0010` through the Supabase SQL Editor when CLI is unavailable. Run one migration at a time, stop on any error, and paste results back for verification.
- Use `docs/MIGRATION_APPLICATION_RESULT_TASK72.md` as the current source of truth for the applied dev/staging onboarding/audit/RLS foundation. Next verification should use SQL Editor/admin catalog checks and seeded authenticated users.
- Use `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md`, `docs/RLS_PATCH_RESULT_TASK74.md`, and `docs/ONBOARDING_SERVER_ACTIONS_IMPLEMENTATION_TASK75.md` before expanding onboarding server actions. The current action foundation respects RLS and only supports safe technician draft creation as a real write.
- Add Supabase authentication.
- Create database tables for users, technician profiles, repair cases, parts, photos, and article drafts.
- Add tables for marketplace leads, open jobs, technician availability, technician community discussions, messages, accepted solutions, knowledge cases, and reputation events.
- Add Row Level Security policies.
- Add server-side data access patterns.
- Protect all dashboard and technician community routes behind authentication before production.

Recommended backend implementation order:

1. Supabase project, profiles, auth roles, reviewed RLS helper predicates, reviewed table-specific onboarding RLS policies, reviewed audit logging, reviewed onboarding tables/flows, protected dashboard routes, and baseline RLS.
2. Marketplace lead persistence and validated dashboard lead status updates.
3. Open jobs, job claims, dispatch eligibility, and transactional claiming/locking.
4. Private technician community persistence, moderation, accepted answers, and permissions.
5. Reputation events, badges, and leaderboard views.
6. Privacy-safe analytics events and aggregate dashboard views.
7. Stripe subscriptions, paid leads, premium placement, and payout-compatible audit records.
8. Server-side AI, translation, and RAG for approved private knowledge and reviewed public SEO drafts.

Auth planning order:

1. Create profiles, roles, statuses, and basic dashboard protection.
2. Review the Task 60/61 onboarding migration draft, `docs/ONBOARDING_RLS_POLICY_PLAN.md`, `docs/ONBOARDING_SERVER_ACTIONS_PLAN.md`, Task 65 helper draft, and Task 66 table-policy draft for companies, company members, technician profiles, invites, and join requests, then finalize executable helper functions, table-specific RLS policies, and server mutations before applying.
3. Add technician onboarding and verification status.
4. Gate open jobs and private community routes to verified technicians or higher.
5. Add company-owner team scoping.
6. Add admin verification, moderation, and audit tooling.

Supabase data model order:

1. `profiles`, roles, auth status, and audit foundations.
2. Review the Task 65 RLS helper plan/draft migration, then test helper recursion, grants, `SECURITY DEFINER` ownership, multi-company cases, suspended/archived member cases, and public/private technician visibility.
3. Review the Task 64 audit plan/draft migration, then design the trusted audit insertion path, metadata validation, admin read model, and append-only tests before wiring privileged onboarding mutations.
4. Use `docs/COMPANY_MEMBER_SELF_STATUS_VIEW_PLAN.md` if a future sanitized inactive-member status surface is needed.
5. Verify the applied Task 72 onboarding/audit/RLS foundation and Task 74 patch with SQL Editor catalog checks, seeded users, positive/negative RLS tests, cross-company isolation tests, invite privacy tests, audit append-only tests, and helper recursion tests.
6. Add reviewed RPC/server-only transaction paths for company creation, owner membership creation, protected profile onboarding updates, audit inserts, invite flows, join request review, technician profile updates, technician verification, and onboarding completion.
7. Review the Task 55 draft migration for `service_requests`, `leads`, basic `jobs`, and basic `repair_cases`, then design table-specific RLS policies before applying.
8. `job_assignments`, `open_jobs`, `pricing_rules`, and `service_areas`.
9. `repair_case_photos`, `repair_case_notes`, AI-ready notes, voice/transcription support, and `ai_article_drafts`.
10. `community_posts`, `community_replies`, and `accepted_solutions`.
11. `reputation_events` and `technician_badges`.
12. Payments/subscriptions after marketplace workflows are stable.

RLS planning order:

1. Enable deny-by-default RLS on private tables.
2. Add owner-only policies for profiles/customer records.
3. Add company-scoped policies for leads, jobs, repair cases, and team records.
4. Add verified-technician policies for open jobs and private community.
5. Add admin-only policies for audit logs, role changes, verification, and moderation.
6. Add tests for cross-user, cross-company, and public/private leakage before production.
7. Validate `supabase/migrations/0006_onboarding_rls_policies_draft.sql` against seeded roles, suspended/archived memberships, invite token privacy, and audit log access before applying.

API/backend service order:

1. Start with thin server-side validation around public intake and profile/bootstrap workflows.
2. Add protected mutations for leads, jobs, repair cases, and open job claiming.
3. Add signed upload flows and private storage policies.
4. Add webhook processing for Stripe only when billing is approved.
5. Add realtime, queue, AI, and dedicated services only after core persistence and permissions are stable.

Onboarding backend progress:

- Task 75 added the first server action contracts for company creation, technician profile draft creation, and onboarding completion.
- Task 76 drafted `supabase/migrations/0012_onboarding_trusted_rpc.sql` and updated company creation/onboarding completion actions to call narrow trusted RPC transactions.
- The user manually applied `0012` to the confirmed dev/staging Supabase project through SQL Editor, and anon-key probes verified both new RPCs deny anonymous execution.
- Task 77 added the first real `/onboarding` UI wired to the Task 75/76 server actions for customer completion, technician draft profile creation, company owner company/membership creation, and onboarding completion.
- Task 78 added protected dashboard routing through `DashboardAuthGate`, centralized dashboard access decisions, `/account-status` informational screens, login `next` redirects, and onboarding redirects for incomplete profiles. `/dashboard/dev/*` remains available for local verification.
- Task 79 verified logged-out dashboard redirects, the `/dashboard/dev/*` exception, unsafe external `next` handling, and local/LAN route availability. Next step: run seeded authenticated tests for `/onboarding` customer, technician, and company owner flows, plus dashboard routing tests for pending, suspended, rejected, missing-profile, incomplete-onboarding, customer-role, and valid dashboard-role accounts.
- Task 80 added real dashboard identity loading for the authenticated user profile, onboarding state, linked company data when readable, company membership visibility state, and technician profile state. The dashboard overview now separates real account/session data from mock marketplace operations data.
- Task 81 added role-aware dashboard navigation. The sidebar/mobile nav now filters by real profile role, profile status, onboarding completion, and dev route context while labeling mock/demo and coming-soon sections.
- Task 82 added real technician profile viewing/draft creation at `/dashboard/technician-profile`. Existing profile updates still need a reviewed column-safe RLS policy or trusted RPC before they can reliably save.
- Task 83 created `supabase/migrations/0013_technician_profile_safe_update_rpc_apply_ready.sql` and updated the technician profile server action to use `update_own_technician_profile_rpc` for existing profile saves. The SQL has not been applied by Codex; apply and verify it in dev/staging before treating existing profile edits as live.
- Task 84 created `supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql` and updated onboarding/dashboard readiness so unverified technicians with `technician_verification_pending` can reach basic dashboard tools. The SQL has not been applied by Codex; apply and verify it in dev/staging before relying on technician profile draft creation from onboarding.
- Task 85 fixed the real dashboard role check so `DashboardAuthGate` receives the same profile-backed role/status that `/dashboard/dev/supabase-check` reports. No SQL was needed.
- Task 86 locked the current auth/onboarding regression surface by keeping `DashboardAuthGate`, the dashboard auth panel, and `/dashboard/dev/supabase-check` aligned on the same real dashboard access helper. Next step: run the documented seeded authenticated technician/customer/status-account QA from `docs/AUTH_ONBOARDING_REGRESSION_CHECKLIST_TASK86.md`.
- Task 87 created the public technician profile foundation with sanitized view-based reads. Next step: review/apply `0015` in dev/staging, seed one verified public-profile-ready technician, and verify anonymous public view access while raw `technician_profiles` remains private.
- Task 88/89 confirmed the sanitized public view is applied and the dev public-ready technician row now renders with slug `refrigerator-houston-repair-8166b185`; Task 90 links that public profile into the service request intake.
- Task 91 prepared the first real public intake persistence path. Apply `0017_service_requests_foundation_apply_ready.sql` in dev/staging, then verify generic and technician-selected `/schedule-service` submissions before building the dashboard inbox in Task 92.
- Task 92 prepared the real dashboard inbox for `service_requests`. Apply `0018_service_requests_dashboard_read_policies_apply_ready.sql`, then verify the authenticated dashboard user can read selected technician requests while anonymous SELECT stays blocked.
- Task 93 integrated the real CRM inbox into the dashboard shell/navigation. Next step: complete authenticated browser QA for `/dashboard/leads` and `/dashboard/leads/[id]` with a seeded logged-in technician/company owner session.
- Task 94 prepared the first real CRM status mutation for `service_requests`. Apply `0019_service_request_status_update_policies_apply_ready.sql` in dev/staging before expecting status saves to work from `/dashboard/leads/[id]`.
- Task 95 prepared internal technician notes and request timeline history. Apply `0020_service_request_notes_foundation_apply_ready.sql` in dev/staging before expecting notes or automatic status-change timeline entries to persist.
- Task 96 prepared private service request photo uploads. Apply `0021_service_request_photos_foundation_apply_ready.sql` in dev/staging before expecting customer/technician photo uploads, signed URL gallery rendering, or photo timeline entries to persist.
- Task 96B requires applying `0022_patch_service_request_photos_anon_select_revoke_apply_ready.sql` after `0021` so anonymous clients keep customer photo INSERT but cannot SELECT photo metadata.
- Task 97 prepared the first real estimate workflow. Apply `0023_pricing_catalog_and_estimates_foundation_apply_ready.sql` in dev/staging before expecting catalog reads, estimate creation, saved estimates, timeline estimate notes, or automatic new-to-contacted status transition to persist.
- Task 98 prepared estimate v2 fields and UX. Apply `0024_estimate_ux_v2_fields_apply_ready.sql` in dev/staging before expecting customer price, warranty/disclaimer, estimate number, and customer preview fields to persist.
- Task 100 prepared managed estimate lifecycle controls. `0025_estimate_lifecycle_rpc_apply_ready.sql` has now been manually applied in dev/staging and supports Update Draft / Void Draft persistence.
- Task 101 prepared customer approval links and responses. `0026_estimate_customer_approval_flow_apply_ready.sql` and `0027_estimate_token_generation_fix_apply_ready.sql` have now been manually applied in dev/staging and support Send To Customer, public approve/decline, and status persistence.
- Task 102/102.2 completed the invoice foundation checkpoint. The invoice layer now supports approved-estimate-to-invoice snapshots, manual send/paid/void states, paid-to-completed service request transition, refresh persistence, and collapsed document-list UX in dev/staging. Stripe, payment processing, PDF generation, SMS/email delivery, deposits, and invoice customer approval remain future phases.
- Task 103 prepared the address intelligence foundation. Apply `0029_service_request_address_intelligence_apply_ready.sql` in dev/staging before expecting structured address edits to persist from `/dashboard/leads/[id]`. Future phases can plug in geocoding/autocomplete providers, AI Dispatcher, route optimization, technician assignment, and calendar travel-time scheduling.
- Task 103.2 connected Google Places autocomplete for address entry. Future providers can still be added through the same adapter shape: Mapbox, Radar, Apple, or an internal geocoder.
- Task 120 prepared dispatcher preview snapshot persistence. Apply `0030_dispatcher_preview_snapshots_apply_ready.sql` in dev/staging before expecting the internal `/dashboard/leads/[id]` dispatcher preview save/load action to persist. This is an internal decision snapshot only; it does not book, assign, send messages, call providers, or update service requests.
- Task 121 replaced static CRM dispatcher preview technicians with real RLS-readable `technician_profiles`. The matching adapter ranks eligible technicians by ZIP coverage, appliance specialty, brand experience, years experience, and profile completeness, and saves the ranking explanation in dispatcher snapshot payloads. Real appointment assignment and persisted technician schedules remain future work.
- Task 122 prepared the first technician availability layer. Apply `0031_technician_availability_rules_apply_ready.sql` in dev/staging before expecting Dispatcher Preview to load recurring technician availability rules. The preview can then combine real technician matching with configured day/time windows, but it still does not create appointments, holds, assignments, customer notifications, or provider calls.
- M3 rollback milestone created before Task 123 appointment work: local git tag `milestone-m3-task122` plus `docs/MILESTONE_M3_ROLLBACK.md`. Use that document before reverting appointment-booking changes; the tag marks committed `HEAD` while the task-state worktree still includes uncommitted files.
- Task 123 prepared the first real appointment booking foundation. Apply `0032_appointments_apply_ready.sql` in dev/staging before expecting `/dashboard/leads/[id]` Book Appointment or `/dashboard/technician-schedule` to work. Booking remains internal and RPC-scoped: it validates request access, technician authority, ZIP coverage, availability, duplicate active appointments, and overlapping technician windows. It does not send messages, call providers, sync calendars, or expose customer/technician phone numbers.
- Task 125 added a credential-safe authenticated booking QA setup path. Create the `qa-booking-tech@example.test` Supabase Auth user manually with a password stored outside git, then apply `supabase/fixtures/booking_qa_dev_fixture.sql` in dev/staging to seed a dashboard-ready technician, availability, and two no-phone QA service requests for duplicate/overlap booking tests.
- Task 127 starts the Workiz-inspired jobs-first dashboard refactor. Primary navigation is now Dashboard, Jobs, Calendar, Customers, Technicians, Reports, and Settings. Jobs maps to the existing `/dashboard/leads` route and Calendar maps to `/dashboard/technician-schedule`; no database/API route renames were made.
- Task 129 created the pre-integration rollback milestone `milestone-m3-job-workspace-before-integrations` plus `docs/MILESTONE_M3_JOB_WORKSPACE_ROLLBACK.md`. Use this checkpoint before beginning Google Calendar, SMS, calls, maps routing, AI, payments, or other provider integrations. The tag points to committed `HEAD`; preserve uncommitted task files separately before destructive rollback.
- Task 130 adds the Google Calendar appointment sync foundation. Apply `0033_google_calendar_appointment_sync_apply_ready.sql` in dev/staging and configure server-only Google Calendar env vars before expecting real event creation. Without credentials, appointment booking remains functional and calendar sync displays Not configured.
- Task 131 upgrades `/dashboard/technician-schedule` into an internal CRM Dispatch Board with day navigation, technician filtering, technician-grouped appointment cards, mobile "My Jobs Today" layout, and calendar sync badges. The roadmap direction remains that CRM appointments are the source of truth; Google Calendar is optional outbound sync only.
- Task 132 upgrades the Job status dropdown to a realistic appliance repair lifecycle and prepares estimate-driven auto-transitions. Apply `0034_job_status_lifecycle_and_estimate_transitions_apply_ready.sql` in dev/staging before expecting Estimate Sent / Estimate Approved / Waiting Customer transitions to persist from send/approve/decline events.
- Task 139 rebuilds `/dashboard` into a technician command center. It keeps existing backend behavior while surfacing Today's Schedule, Need Attention, Sales Snapshot, Recent Calls, Recent Messages, AI Technician Advisor, Community Feed, Manuals Library, Parts Quick Search, and Inventory Snapshot in a compact production CRM layout. Future roadmap work can replace demo-only communication, AI, manuals, parts, and community widgets with real integrations.
- Task 140 tightens the dashboard command-center layout after the prior density pass. Today's Schedule now has compact fixed-height cards and a capped layout, Sales Snapshot sits in the top operational row, and the tool/feed widgets are arranged as dense four-column rows. This remains UI-only; the next roadmap step is wiring real integrations behind the existing widgets rather than adding more placeholder panels.
- Task 141 adds a premium SaaS visual pass for `/dashboard` and the sidebar: richer topbar, global search, notification controls, profile status, SVG navigation icons, stronger KPI hierarchy, polished Sales Snapshot, more realistic AI/community/parts/vendor widgets, and tighter hover/spacing treatment. It does not add integrations or change backend behavior.
- Task 142 corrects dashboard scale after the premium pass: smaller greeting/header controls, compact KPI cards, shorter helper labels, reduced section gaps, lower widget padding, and capped schedule cards. The roadmap remains focused on replacing UI-only widgets with real integrations when those backend tasks are explicitly started.
- Task 143 finalizes the dashboard architecture as a technician action center: Next Actions first, compact summary row, Today's Schedule second, Calls/Messages/AI directly below, combined Parts & Vendors, and compact Manuals/Community/Sales secondary sections. Future dashboard changes should be incremental or integration-backed rather than new layout rewrites.
- Task 145 starts the customer marketplace foundation. It adds mobile-first customer entry/auth/dashboard routes, customer-aware request persistence behind review-only migration `0035`, customer appliance registry tables, and real technician CRM customer list/detail routes. The next roadmap step is applying/testing `0035`, then building a real customer booking request flow without weakening technician dashboard auth.
- Task 146 reviewed the customer foundation for real QA and found the migration needed dashboard-safe customer visibility plus account-linking RPCs. The current `0035` file now contains those fixes, but remote SQL still requires manual Supabase SQL Editor apply before customer auth/dashboard/CRM QA can be completed.
- Task 146 continued after `0035` was applied. Customer-aware request persistence and dedupe now work, but customer session QA is gated by Supabase email confirmation. A forward patch `0036_customer_service_request_self_read_apply_ready.sql` is required so confirmed customer accounts can read their linked service request history and so unsupported customer request sources normalize safely.
- Task 146 final QA continued after `0036` was applied. Source normalization, customer-linked request creation, duplicate customer reuse, and logged-out route protection are verified. The remaining QA dependency is credential setup: a confirmed customer account and a confirmed dashboard account are needed for authenticated customer dashboard and CRM customer detail data checks.
- Task 146.1 adds `supabase/fixtures/customer_marketplace_qa_accounts_task146.sql` for final confirmed-account QA. Create and confirm the listed Auth users in dev/staging first; passwords must remain outside git/docs. After applying the fixture, retest customer dashboard, customer appliances, linked service requests, and dashboard customer CRM list/detail.
- Task 146 customer dashboard usability patch routes authenticated customer accounts from `/` to `/customer/dashboard`, adds real customer profile editing for name/phone/contact preference, and keeps writes scoped to the existing `customers` self-update RLS. Next Task 146 QA should retest the confirmed customer on desktop/mobile for profile persistence, appliance persistence, and linked service request history before Task 147 begins.
- Task 146.2 completes the customer dashboard UX pass by moving profile editing to `/customer/profile`, adding the customer avatar menu, and keeping `/customer/dashboard` focused on repairs, appliances, estimates, and invoices. Continue Task 146 QA on confirmed customer credentials before opening Task 147.
- Task 146.3 fixes the authenticated customer profile-save path, improves avatar defaults, expands appliance type support to major appliances, and adds a clearly disabled appliance label-photo future placeholder. No storage, AI/photo recognition, technician dashboard changes, schema changes, or Task 147 work were added.
- Task 146.4 makes appliances the center of the customer journey. `/customer/appliances/[id]` shows appliance details and repair history, dashboard appliance cards now have `Request Repair`, and `/customer/request-repair?appliance=<id>` provides a non-persisting intake shell for Task 147. No service requests, bookings, technician selection, or appointment creation happen yet.
- Task 146.5 fixes customer re-login routing. Main `/login` now sends customer accounts to `/customer/dashboard` and prevents customer-selected logins from showing technician/company-owner dashboard diagnostics. `/dashboard` also redirects authenticated customer profiles back to the customer portal.
- Task 146.6 connects marketplace and customer portal navigation while keeping technician CRM isolated. Customer pages now have WRA header navigation, the customer avatar menu includes Marketplace plus future Community/Ask a Question placeholders, and `/` remains browsable for authenticated customers instead of auto-redirecting.
- Task 146 is now closed. Customer login/dashboard/profile/appliances/appliance detail/request-repair shell and marketplace-to-portal navigation are implemented, customer accounts stay out of the technician CRM, mobile/LAN auth issues were addressed, and the customer header nested-anchor hydration bug is fixed. Task 147 has not started; the request-repair shell still does not create bookings, service requests, technician selections, messages, AI calls, payments, or provider actions.
- Task 147 implements the first asset-to-service-request-to-appointment lifecycle. It adds `/customer/choose-technician`, `/customer/booking-confirmation`, `/api/customer/technician-windows`, `/api/customer/repair-booking`, and apply-ready migration `0037_customer_asset_booking_apply_ready.sql` plus follow-up patch `0038_customer_asset_booking_contact_window_patch_apply_ready.sql`. After both SQL files are applied, an authenticated customer can start from a saved appliance, describe the problem, select a real public technician profile, choose a window, and create a real `service_requests` row plus `appointments` row that appears in customer repairs and existing CRM job/schedule surfaces. Community, AI, Vendor Search, Inventory, Payments, SMS/calls/email, maps routing, and providers remain out of scope.
- Task 147.1 is closed. `supabase/migrations/0041_technician_marketplace_profile_readiness_view_fix_apply_ready.sql` has been applied successfully; it preserves the original `public_technician_profiles` column order and appends new marketplace readiness fields for compatibility. Manual QA passed for technician marketplace profile save/persistence and real customer booking matching. Customer booking ranking now uses real public technician fields: ZIP coverage first, appliance category, brand experience, years experience, and profile completeness. Future work should polish the duplicated marketplace profile UI sections without changing the working data flow.
- Task 148 creates the professional estimate and service intelligence foundation. Apply-ready migration `0042_professional_estimate_service_catalog_foundation_apply_ready.sql` adds service catalog categories, repair groups, repair items, estimate templates, and template lines, then extends estimate items with labor/part/material/custom/warranty line metadata, internal cost, sell price, internal names, customer-facing names, and catalog/template links. The existing estimate approval/invoice lifecycle remains compatible. Inventory, purchasing, vendor search, warehouse/truck stock, profitability dashboards, and AI estimate generation remain future phases.
- Task 148.1 rescues estimate builder usability without backend changes. The technician flow is now quick-line first: choose Labor/Part/Material/Warranty/Custom, enter customer-facing line name and sell price, add the line, then save the draft. Internal part name, internal cost, and notes stay available behind an advanced toggle, and `Send To Customer` remains on the saved draft card.
- Task 148.2 changes the estimate UX direction to AI-first without calling external AI. A local deterministic estimate draft agent converts technician diagnosis text into a professional customer summary and normal multi-line estimate rows. Manual builder remains available behind `Add Manually`; future real AI can replace the local generator through the same line architecture.
- Task 148.3 collapses estimate creation into one card: describe diagnosis, review/edit generated line prices, and send. The separate generated draft panel, estimate cart panel, customer preview panel, confidence/source display, and manual-builder screen are removed from the primary workflow. The send action still uses the existing save-draft and customer approval APIs.
- Task 148.4 improves the one-card estimate agent with editable line titles, Add Item, warranty footer display, archive terminology, structured repair scope generation, and apply-ready migration `0043_estimate_agent_intelligence_foundation_apply_ready.sql` for future estimate learning events. This only collects structured estimate decisions; it does not train AI, call providers, add inventory, or change payments/customer delivery.
- Task 148.5 adds the multilingual estimate agent foundation. Diagnosis normalization now supports deterministic English/Russian/Ukrainian/Spanish repair-intent extraction, local detected-language output, normalized English diagnosis text, and a future provider mode boundary for `local`, `cheap_ai`, and `advanced_ai`. No external AI or translation API is called by default.
- Task 148.6 connects the one-card Estimate Draft Agent to a server-only OpenAI API route. The route uses `OPENAI_API_KEY`, `ESTIMATE_AGENT_MODEL`, and a reserved `ESTIMATE_AGENT_ADVANCED_MODEL` boundary, validates strict JSON output, and falls back to the local deterministic agent on timeout/error/invalid JSON. OpenAI is called only when the technician clicks `Generate Estimate`; no client-side OpenAI calls or API key exposure were added.
- Task 148.7 makes the estimate builder API-first and field-usable. OpenAI remains the primary reasoning path when configured, the prompt now rejects generic repair lines, and the editor supports Labor/Part/Service/Other rows with title, description, quantity, unit price, taxable toggle, line total, discount/tax review, and confirmation before regenerated drafts replace technician edits. Persisted discount/tax remains a future schema task because current estimate RPCs store line-subtotal totals and tax `0`.
- Task 148.8 compacts the estimate card for field use. Default visible flow is diagnosis, Generate Estimate, compact editable lines, total, and Send Estimate. Line descriptions/quantity/taxable controls, tax/discount settings, warranty editing, and normalization diagnostics are collapsed by default. Future estimate work should preserve this technician-first density unless a later task explicitly redesigns the workflow.


## Estimate MVP Completed

- Estimate MVP is now checkpointed in `docs/ESTIMATE_MVP_CHECKPOINT.md`.
- Current lifecycle: create draft, edit/update draft, void draft, view read-only saved estimate history, and prevent accidental duplicate drafts by guiding technicians to the active draft first.
- Current UX: appliance type selection, catalog job filtering, selected estimate cart, optional custom line item, customer-facing preview, inline Saved Estimates expansion, and clear `Draft` explanation.
- Persistence path: estimate creation uses `0023`/`0024`; draft update/void uses `0025`; customer send/approve/decline uses `0026` plus the token-generation patch in `0027`.
- Task 101.1 checkpoint: migrations `0025`, `0026`, and `0027` are applied in dev/staging and end-to-end browser QA passed.
- Task 102 invoice foundation: invoice snapshots and manual invoice lifecycle actions are implemented behind migration `0028`, and Task 102.2 records browser QA passing for the implemented workflow.
- Deferred roadmap: SMS/email send, PDFs, payments, tax engine, deposits, and Stripe.

## Phase 4: AI SEO article generation

- Add manual approval flow for AI-generated content.
- Generate article drafts from completed repair cases.
- Store prompt inputs, draft outputs, review status, and publishing status.
- Keep technicians in control of final published content.
- Add AI TechAdvisor workspace for private technician troubleshooting support.
- Add AI summary generation for private discussion threads and accepted repair solutions.
- Add multilingual AI translation previews for technician collaboration.
- Add vector/RAG knowledge base indexing only after privacy, auth, and approval boundaries are implemented.

## Phase 5: Technician profiles

- Build technician profile creation and editing.
- Add service areas, specialties, certifications, profile photos, and trust details.
- Connect profiles to repair cases and published pages.

## Phase 6: Public SEO pages

- Publish repair case-derived SEO pages.
- Add city and neighborhood targeting for Houston.
- Add metadata, structured content, and internal linking.
- Build moderation and review workflows before publishing.

## Phase 7: Payments/subscriptions

- Add subscription plans only after core workflows are validated.
- Integrate payments securely.
- Add account billing status and subscription gates.
- Avoid marketplace or payout complexity until explicitly approved.
- Prepare technician subscriptions and premium expert access.
- Prepare Stripe monetization for paid leads, expert programs, and future technician payouts.

## Future marketplace: Open Job Board for Technicians

- Allow customers to submit a service request without selecting a specific technician.
- Convert unassigned customer requests into open marketplace jobs.
- Show open jobs only to technicians who match the job's ZIP/service area, specialty, workload, and availability filters.
- Allow the first qualified technician to accept an open job after passing matching checks.
- Add temporary job locking while a technician is reviewing or accepting the job, so multiple technicians cannot claim the same request at once.
- Support assignment status transitions such as open, locked, accepted, assigned, declined, expired, and converted to repair case.
- Prepare a future technician mobile workflow for reviewing open jobs, accepting work, confirming arrival windows, and updating job status from the field.
- Add live notifications for new matching jobs, accepted jobs, expiring locks, and dispatch status changes.
- Keep the marketplace workflow compatible with future Stripe payout flows, including technician eligibility, payout account status, job completion confirmation, and payout auditability.

## Future technician community

- Convert mock community discussions into authenticated private technician threads.
- Add real-time technician chat only after auth, permissions, and moderation rules are defined.
- Add accepted solution workflow, helpfulness scoring, technician reputation events, and expert verification.
- Build AI TechAdvisor prompts from private discussions with manual review and strict privacy filtering.
- Store approved knowledge cases in a private vector/RAG system for technician-only troubleshooting.
- Add multilingual AI translation after privacy review and server-side API boundaries are in place.
- Explore premium expert network access and subscription tiers after community value is validated.

## Phase 8: National expansion

- Expand beyond Houston after the local MVP is proven.
- Add multi-city support.
- Add scalable profile, content, and routing patterns.
- Introduce market-specific SEO and onboarding workflows.
