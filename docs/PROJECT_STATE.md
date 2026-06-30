# Project State

## Project name

WeRepairRefrigerators

## Goal

Build a secure AI-powered refrigerator repair technician platform that helps repair businesses document repair cases, manage technician-facing workflows, and eventually turn completed work into local SEO content.

## Platform Bible Documentation

The primary project context and permanent source of truth now lives in `docs/platform-bible/`.

Read `docs/platform-bible/README.md` first, then use `docs/platform-bible/WRA_00_ROADMAP_MASTER.docx`, `docs/platform-bible/WRA_09_IMPLEMENTATION_HISTORY_AND_PROJECT_STATE.docx`, and `docs/platform-bible/WRA_10_EXECUTION_ROADMAP_AND_DEVELOPMENT_PLAN.docx` as the main roadmap, implementation-state, and execution-plan references before starting future major work.

## Houston MVP scope

The MVP is focused on Houston only and refrigerator repair only. The first product surface is a dark SaaS frontend for technicians and service business owners, with dashboard placeholders and a repair case creation UI.

## Current stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- React
- Supabase client/auth foundation with `public.profiles` applied in development
- AI article generation planned later

## Current completed features

- P0 auth recovery: Owner account passwords were restored using a temporary password outside git; no password value is stored in repository files.

- Task 148.10 Repair Intelligence Engine foundation: estimate generation now has a provider-free repair-planning layer under `frontend/src/lib/repair-intelligence/`. The estimate agent flow can normalize diagnosis/intents, create a structured `RepairPlan`, map that plan through centralized pricing policy, and return estimate draft lines grounded in operations/parts/materials instead of raw text alone. Initial knowledge packs cover refrigeration, laundry, dishwasher, and cooking repair patterns. No schema, inventory, vendor search, payments, community, dashboard redesign, or estimate UI expansion was added.

- Task 148.11 Repair Intelligence QA + technician review loop: the Job Workspace estimate card now receives the repair intelligence response, inserts generated repair-plan estimate lines into the existing builder, and shows a compact technician-only Repair Plan summary with repair type, appliance category, operation/part/material counts, confidence, and pricing warnings. Estimate save payloads now include the repair plan summary in the existing estimate learning context. Static verification confirms the required LG sealed-system, LG evaporator ice/heater/fan, double oven bake element, washer door boot leak, and dishwasher drain pump patterns are represented. Full authenticated browser save/reopen QA still requires an active dashboard session.

- Task 148.12 authenticated persistence QA attempt: Codex opened `/dashboard/leads` on `localhost:3002`, but DashboardAuthGate reported `logged_out` and redirected to `/login?next=%2Fdashboard%2Fleads`. No dashboard technician/company-owner password or active browser session is stored in the repository. To complete the real save/reopen QA, use a confirmed dashboard account with role `technician`, `verified_technician`, `expert_technician`, `company_owner`, or `admin`, active status, completed onboarding, access to at least one service request, and the applied estimate/repair-intelligence migrations. Do not claim full persistence QA passed until a generated estimate is saved, the job is reopened, and the saved lines/total are verified in the authenticated browser.

- Task 148.13 authenticated QA access foundation: added `docs/REPAIR_INTELLIGENCE_ESTIMATE_QA_ACCESS_TASK148_13.md` and `supabase/fixtures/repair_intelligence_estimate_qa_fixture.sql`. The fixture is dev/staging-only and prepares a confirmed Auth user email `qa-estimate-tech@example.test` after the user creates/confirms the Auth account and stores the temporary password outside git. It sets an active `verified_technician` profile, active company membership, public-ready technician profile, and one visible `QA Estimate Persistence` service request selected for that technician. Codex did not create the password, apply the fixture, or complete authenticated browser persistence QA; final save/reopen verification remains pending until the manual Supabase Auth and fixture steps are complete.

- Task 148.14 automatic QA provisioning attempt: after `SUPABASE_SERVICE_ROLE_KEY` was added, Codex created/reused QA Auth users with Supabase Admin API and established an authenticated dashboard session using the existing `qa-booking-tech@example.test` account. Browser QA generated a real OpenAI Repair Intelligence estimate in the Job Workspace with a sealed-system/compressor plan and `$4,476.91` total. Saving failed because the live database is missing `service_requests.company_id` while the Task 148 professional estimate RPC references it. A forward fix migration was created at `supabase/migrations/0044_repair_intelligence_estimate_persistence_company_scope_fix_apply_ready.sql`, and the estimate API now reports this DB mismatch in development instead of a generic error. Automatic SQL application is still unavailable: no database URL, no Supabase CLI/local config, no SQL execution RPC, and Supabase Management SQL rejects the service-role key. Apply `0044` and then `supabase/fixtures/repair_intelligence_estimate_qa_fixture.sql` manually before rerunning save/reopen QA.

- Task 148.15 final live verification attempt: after the user applied `0044`, the previous `sr.company_id` column error was resolved and the authenticated QA dashboard session still reached `/dashboard/leads`. The Repair Intelligence API route was verified live with OpenAI (`source: openai`) for an LG refrigerator no-cooling/sealed-system case, returning a structured repair plan, customer summary, warranty text, pricing policy output, and 11 estimate lines. Estimate save still failed on the available QA jobs with `Service request not found` because those legacy dev/staging service requests are visible through `selected_technician_slug` but still have `company_id = null`, and the dedicated `qa-estimate-tech@example.com` fixture has not been applied. A new forward-only compatibility migration was created at `supabase/migrations/0045_repair_intelligence_independent_technician_estimate_compat_apply_ready.sql`; it preserves company-owned estimate behavior while allowing already-authorized independent-technician legacy jobs to create estimates and persist learning events. Apply `0045` in Supabase, then rerun the save/reopen QA before marking Task 148 fully complete.

- Task 138 Technician Dashboard Professionalization Phase 1: `/dashboard` now opens directly into a compact technician command center with alert strip cards, 70/30 schedule and sales focus row, dense AI/parts/manual widgets, compact calls/messages/community/inventory cards, and refined sidebar visual states. Backend behavior, schema, APIs, estimates, invoices, appointments, and scheduling logic were unchanged.

- Task 137 Technician Dashboard Brain v1: `/dashboard` is now the technician working center with Need Attention cards, Upcoming Work, Money Snapshot, AI Technician Advisor UI, Parts Quick Search UI, Manuals Library UI, Recent Calls/Transcripts UI, Community Preview, and Recent Activity. Dashboard data queries now fail closed to safe empty states instead of showing raw database relationship errors.

- Task 136 CRM UI alignment: dashboard home, Jobs Inbox, and Job Workspace were tightened toward the approved field-technician mockup with operational metrics, compact job cards, immediate-save status dropdown, compact START/ETA/PAY/NOTE/ATTACH actions, and reduced developer-facing language. Backend workflows and schema were unchanged.

- Task 135.1 dashboard contrast hotfix: normal dashboard CRM surfaces now keep dark readable text on light cards, the main dashboard no longer renders the auth/debug status panel, and operational cards remain first on `/dashboard`.

- Task 135 Technician Jobs Inbox transformation: `/dashboard/leads` now presents a Workiz-style job board with light summary cards, technician-first search/status/technician/schedule filters, operational job cards, and no developer-facing Supabase copy in the primary UI.

- Task 134 Workiz-style Job Workspace finish: remaining dark developer panels in the real job detail workspace were converted to light CRM cards for address editing, dispatcher preview, appointments, estimates, invoices, notes, photos, and timeline while preserving existing backend workflows.

- Public customer-facing marketplace homepage with light refrigerator service branding.
- Public SEO route foundation for brands, services, locations, public repair cases, technicians, ZIP-based technician discovery, and unified `/schedule-service` intake.
- Reusable public SEO metadata utilities, internal linking helpers, public content data, and refrigeration visual identity components.
- `/dashboard` route with reusable dashboard shell, route-level dashboard layout, sidebar, topbar, and centralized dashboard navigation.
- Repair case list, creation, and detail/preview flows with shared mock repair case types/data.
- Privacy-first repair case creation form with optional private/admin-only fields, appliance label extraction mock, photo placeholders, and SEO preview.
- Dashboard AI workflow mock showing repair case selection, privacy transform, SEO article draft preview, image prompts, Telegram intake mock, voice-note mock, and review/publish status steps.
- Marketplace lead inbox at `/dashboard/leads`, mock conversion preview, and `/dashboard/leads/preview` bridge from public intake to dashboard lead preview.
- Mock technician coverage/availability board at `/dashboard/coverage`.
- Marketplace analytics dashboard at `/dashboard/analytics` with static lead source, ZIP, brand, appliance, technician, and conversion metrics.
- Open Job Board at `/dashboard/open-jobs` for mock unassigned marketplace jobs, client-side accept behavior, and assigned/open status preview.
- Private technician community dashboard at `/dashboard/community` with repair discussions, multilingual preview data, AI summary previews, and private knowledge case previews.
- Repair help request creation mock at `/dashboard/community/new` with live discussion preview and AI-ready structured summary preview.
- Technician discussion detail route at `/dashboard/community/[discussionId]` with message thread, accepted answer, translated previews, AI summary panel, and local-only reply mock.
- Technician reputation and expert badge mock at `/dashboard/community/reputation` with leaderboard filters, expert levels, badge rarity, and private trust metrics.
- Shared dashboard components for lead cards, conversion preview, analytics boards, open job cards/filters/stats, community cards/filters, discussion detail panels, and reputation/leaderboard UI.
- Mock datasets and shared types for leads, analytics, open jobs, technician availability, community discussions, and technician reputation.
- Review-only Supabase migration draft for first real marketplace tables: `supabase/migrations/0002_real_marketplace_core_draft.sql`.
- Review-only Supabase onboarding foundation migration draft: `supabase/migrations/0003_onboarding_foundation_draft.sql`, hardened in Task 61 but still not applied.
- Review-only onboarding RLS policy plan: `docs/ONBOARDING_RLS_POLICY_PLAN.md`.
- Review-only onboarding server actions plan: `docs/ONBOARDING_SERVER_ACTIONS_PLAN.md`.
- Review-only audit logging plan and migration draft: `docs/AUDIT_LOG_PLAN.md` and `supabase/migrations/0004_audit_log_foundation_draft.sql`.
- Review-only RLS helper function plan and migration draft: `docs/RLS_HELPER_FUNCTIONS_PLAN.md` and `supabase/migrations/0005_rls_helpers_draft.sql`.
- Review-only table-specific onboarding RLS policy draft: `supabase/migrations/0006_onboarding_rls_policies_draft.sql`.
- Review-only migration application readiness checklist: `docs/MIGRATION_APPLICATION_READINESS_CHECKLIST.md`.
- Staging apply-ready onboarding/audit/RLS migration copies: `supabase/migrations/0007_onboarding_foundation_apply_ready.sql`, `0008_audit_log_foundation_apply_ready.sql`, `0009_rls_helpers_apply_ready.sql`, and `0010_onboarding_rls_policies_apply_ready.sql`.
- Human review of the staging apply-ready migration copies: `docs/APPLY_READY_MIGRATIONS_HUMAN_REVIEW_TASK70.md`.
- Task 71 migration application blocker report: `docs/MIGRATION_APPLICATION_BLOCKERS_TASK71.md`.
- Task 72 SQL Editor application instructions: `docs/MIGRATION_SQL_EDITOR_INSTRUCTIONS_TASK72.md`.
- Task 72 migration application result: `docs/MIGRATION_APPLICATION_RESULT_TASK72.md`.
- Task 73 onboarding RLS test plan/results: `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md`.
- Task 74 company member RLS visibility patch migration: `supabase/migrations/0011_patch_company_members_rls_visibility.sql`.
- Task 74 company member self-status view plan: `docs/COMPANY_MEMBER_SELF_STATUS_VIEW_PLAN.md`.
- Task 74 RLS patch result/manual application instructions: `docs/RLS_PATCH_RESULT_TASK74.md`.
- Task 75 first onboarding server action foundation: `frontend/src/server/onboarding/actions.ts`, with authenticated session/profile validation, safe technician draft creation, and explicit trusted-mutation blockers for company creation and onboarding completion.
- Task 75 implementation notes: `docs/ONBOARDING_SERVER_ACTIONS_IMPLEMENTATION_TASK75.md`.
- Task 76 trusted onboarding RPC migration: `supabase/migrations/0012_onboarding_trusted_rpc.sql`, plus server action updates so company creation and onboarding completion call the new RPCs.
- Task 76 implementation notes and SQL Editor instructions: `docs/ONBOARDING_TRUSTED_RPC_TASK76.md`.
- Task 77 real onboarding UI route at `/onboarding`, backed by Task 75/76 server actions for customer completion, technician draft profile creation, company owner company/membership creation, and onboarding completion.
- Task 77 implementation notes: `docs/ONBOARDING_UI_IMPLEMENTATION_TASK77.md`.
- Task 78 protected dashboard routing: `DashboardAuthGate` now enforces Supabase session, profile status, completed onboarding, and dashboard role checks before rendering normal `/dashboard/*` pages. Logged-out users go to `/login?next=...`, incomplete onboarding goes to `/onboarding?next=...`, inactive/missing/unauthorized profiles go to `/account-status`, and `/dashboard/dev/*` remains directly reachable for local verification.
- Task 78 implementation notes: `docs/PROTECTED_DASHBOARD_ROUTING_TASK78.md`.
- Task 79 runtime testing notes: `docs/AUTH_ONBOARDING_RUNTIME_TEST_TASK79.md`. Logged-out `/dashboard` and `/dashboard/open-jobs` redirects passed on `localhost:3002`, `/dashboard/dev/supabase-check` remained reachable, unsafe external `next` URLs stayed inside the app, and `10.0.0.67:3002/login` returned HTTP 200. Seeded account tests for completed/incomplete/customer/pending/suspended/rejected profiles remain pending.
- Task 80 real dashboard identity loading: `docs/REAL_DASHBOARD_IDENTITY_TASK80.md`. `/dashboard` now shows real Supabase profile, onboarding, linked company, membership visibility, and technician profile context while keeping marketplace operations as mock/demo data.
- Task 81 role-aware dashboard navigation: `docs/ROLE_AWARE_DASHBOARD_NAV_TASK81.md`. Dashboard sidebar/mobile navigation now filters by real profile role/status/onboarding state and labels real, mock, coming-soon, and dev-only sections.
- Task 82 real technician profile route: `docs/REAL_TECHNICIAN_PROFILE_TASK82.md`. `/dashboard/technician-profile` reads the authenticated user's `technician_profiles` row, can create a draft profile when none exists and current RLS allows it, and documents that existing profile updates remain blocked until a reviewed update policy or trusted RPC exists.
- Task 83 technician profile safe update path: `docs/TECHNICIAN_PROFILE_UPDATE_TASK83.md`. A narrow apply-ready RPC migration, `supabase/migrations/0013_technician_profile_safe_update_rpc_apply_ready.sql`, was created for self-owned technician profile edits, and the server action now calls that RPC for existing profile updates. The migration has not been applied by Codex; existing profile saves require manual dev/staging application of `0013`.
- Task 84 technician onboarding loop fix: `docs/ONBOARDING_LOOP_FIX_TASK84.md`. Dashboard readiness now accepts `technician_verification_pending` for technician roles, `/onboarding` no longer reports success when completion still blocks dashboard access, and a new apply-ready RPC migration, `supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql`, was created for safe self-owned technician profile draft creation/update. The migration has not been applied by Codex.
- Task 85 dashboard auth mismatch fix: `docs/DASHBOARD_AUTH_MISMATCH_FIX_TASK85.md`. `getCurrentUserProfile()` now returns a profile-backed session snapshot when `public.profiles` is readable, so real dashboard routing uses the same `profiles.role/status` source as the dev Supabase checker.
- Task 86 auth/onboarding regression lock: `docs/BACKUP_TASK86.md` and `docs/AUTH_ONBOARDING_REGRESSION_CHECKLIST_TASK86.md`. Dashboard auth diagnostics and `/dashboard/dev/supabase-check` now report the same `evaluateDashboardAccess()` decisions used by the enforced dashboard shell, including real `/dashboard` and `/dashboard/technician-profile` outcomes. Logged-out dashboard redirects were browser-verified on `localhost:3002`; authenticated seeded-session QA remains documented as a manual follow-up.
- Task 87 public technician profile foundation: `docs/BACKUP_TASK87.md` and `docs/PUBLIC_TECHNICIAN_PROFILE_FOUNDATION_TASK87.md`. Public technician listing/detail routes now load through a public-safe Supabase view mapper when available, fall back to existing mock public technician previews when the view is absent/empty, and never expose raw `technician_profiles` private fields. A review/apply-ready sanitized view migration was created at `supabase/migrations/0015_public_technician_profiles_view_apply_ready.sql` but was not applied by Codex.
- Task 88/89 public technician profile application check: `docs/PUBLIC_TECHNICIAN_PROFILE_APPLICATION_TASK88.md`. The user manually applied `0015` and `0016`; `public.public_technician_profiles` is reachable and now returns the dev public technician row, while raw `public.technician_profiles` remains anonymous-protected (`42501 permission denied`).
- Task 89 dev public-ready technician profile seed: `supabase/migrations/0016_dev_public_ready_technician_profile_apply_ready.sql` creates or updates one safe dev/staging technician profile for `info@refrigeratorhoustonrepair.com`; the user manually applied it and the generated real slug is `refrigerator-houston-repair-8166b185`.
- Task 90 technician profile request service flow: public technician detail pages now route customers into `/schedule-service?technician=<slug>`, and the intake page loads the matching sanitized public technician profile to show selected-technician context without exposing internal IDs.
- Task 91 service request persistence foundation: `supabase/migrations/0017_service_requests_foundation_apply_ready.sql` adds a narrow public-insert/private-read `service_requests` table, and `/schedule-service` now submits through `/api/service-requests`. Codex did not apply SQL; real saves require manual dev/staging application of `0017`.
- Task 92 real service requests dashboard inbox: `supabase/migrations/0018_service_requests_dashboard_read_policies_apply_ready.sql` adds a narrow authenticated read policy for admins and requests selected for the user's public technician slug. `/dashboard/leads` and `/dashboard/leads/[id]` now load real `service_requests` through browser Supabase/RLS. Codex did not apply SQL.
- Task 93 dashboard CRM navigation integration: dashboard sidebar/mobile navigation now treats Leads as a real CRM section for technician-capable dashboard roles, removes mock labeling from Leads and Technician Profile, keeps incomplete operations clearly marked as previews, and points the topbar primary action to `/dashboard/leads`.
- Task 94 service request status updates: `supabase/migrations/0019_service_request_status_update_policies_apply_ready.sql` adds a narrow authenticated RPC for CRM status transitions (`new`, `contacted`, `scheduled`, `completed`, `canceled`). `/dashboard/leads/[id]` now has status controls that call a server route and update only `status`/`updated_at` after RLS visibility checks. Codex did not apply SQL.
- Task 95 internal notes/timeline foundation: `supabase/migrations/0020_service_request_notes_foundation_apply_ready.sql` adds dashboard-only `service_request_notes`, a narrow add-note RPC, and status-change timeline entries. `/dashboard/leads/[id]` now includes quick internal notes and a chronological service timeline. Codex did not apply SQL.
- Task 96 service request photo uploads foundation: `supabase/migrations/0021_service_request_photos_foundation_apply_ready.sql` adds private Storage bucket setup, `service_request_photos` metadata, customer upload policies, dashboard read policies, and a narrow technician photo RPC. `/schedule-service` now accepts up to 5 customer images after request creation, and `/dashboard/leads/[id]` has technician photo upload/gallery/timeline UI. Codex did not apply SQL or create the storage bucket remotely.
- Task 96B verification found customer photo upload works after manual `0021` application, but anonymous `service_request_photos` SELECT returned an empty RLS result instead of a hard permission denial. `supabase/migrations/0022_patch_service_request_photos_anon_select_revoke_apply_ready.sql` revokes anon SELECT while preserving anon INSERT for customer uploads. Codex did not apply SQL.
- Task 97 estimate/pricing catalog foundation: `supabase/migrations/0023_pricing_catalog_and_estimates_foundation_apply_ready.sql` adds reusable pricing catalog items, service request estimates, estimate line items, an estimate creation RPC, seed catalog data, estimate timeline notes, and automatic new-to-contacted status transition on first estimate creation. `/dashboard/leads/[id]` now has a pricing-catalog estimate panel and saved estimate display. Codex did not apply SQL.
- Task 98 estimate UX v2: `supabase/migrations/0024_estimate_ux_v2_fields_apply_ready.sql` adds customer price, internal technician cost, taxability, warranty/disclaimer, sort order, estimate numbers, and customer preview text fields. `/dashboard/leads/[id]` now filters catalog jobs by appliance type and shows a customer-facing draft estimate preview that hides internal technician cost. Codex did not apply SQL.
- Task 101 customer estimate approval flow: `supabase/migrations/0026_estimate_customer_approval_flow_apply_ready.sql` adds hashed public approval tokens, sent/responded timestamps, sent/approved/declined statuses, and token-specific public read/respond RPCs. `supabase/migrations/0027_estimate_token_generation_fix_apply_ready.sql` patches token generation for the current Supabase project. The user manually applied `0025`, `0026`, and `0027`, and end-to-end browser QA passed for draft creation, edit draft, send-to-customer, approval link generation, public approve/decline, refresh persistence, and read-only approved estimates.
- Task 100 estimate lifecycle refactor: `supabase/migrations/0025_estimate_lifecycle_rpc_apply_ready.sql` adds draft-only update and void RPCs. `/dashboard/leads/[id]` now distinguishes create mode from editing an existing draft, guides technicians to edit an active draft before creating another version, shows read-only estimate view details, and keeps non-draft/void estimates read-only. Codex did not apply SQL.
- Task 102 invoice foundation: `supabase/migrations/0028_invoice_foundation_apply_ready.sql` adds invoice and invoice line item snapshots plus narrow RPCs for creating invoices from approved estimates, manually marking invoices sent/paid/void, and completing the service request when paid. `/dashboard/leads/[id]` now shows Create Invoice on approved estimates and an Invoices section with View Invoice, Send Invoice, Mark Paid, and Void Invoice actions. Task 102.2 checkpoints that the invoice foundation is implemented and browser QA passed in dev/staging.
- Task 103 address intelligence foundation: `supabase/migrations/0029_service_request_address_intelligence_apply_ready.sql` adds structured service request address fields and a narrow authenticated address-update RPC. `/dashboard/leads/[id]` now has a compact Service Address card, manual address edit mode, Google Maps and Apple Maps links, and an address autocomplete adapter foundation for future providers. Codex did not apply SQL.
- Task 103.2 Google Places address autocomplete: the Service Address editor now uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with the provider-neutral address adapter to show Google Places suggestions, fill structured address fields, capture coordinates/place ID, and fall back to manual entry when Google is unavailable. No schema changes were required.
- Task 104 integration layer architecture: `docs/INTEGRATION_LAYER_ARCHITECTURE.md` defines provider-neutral Calendar, Communication, Maps, Analytics, and Payment provider boundaries, future integration tables, sync/webhook/error patterns, and AI Dispatcher integration points. Documentation only; no schema, API, UI, provider, package, or Supabase changes.
- Task 105 integration layer code skeleton: `frontend/src/lib/integrations/` now contains provider-neutral TypeScript contracts, noop providers, and a registry/factory that always returns noop adapters. No real external providers, env vars, schemas, APIs, UI, packages, or Supabase changes were added.
- Task 106 calendar availability domain model: `frontend/src/lib/integrations/scheduling/` now contains pure TypeScript scheduling types and utilities for normalizing time blocks, detecting overlaps, merging busy ranges, subtracting busy blocks from workdays, and generating availability slots. No Google Calendar/provider integration, Supabase schema, API, UI, package, or env changes were added.
- Task 107 global availability engine: `frontend/src/lib/integrations/scheduling/availability-engine.ts` now evaluates multiple technicians, filters by requested ZIP code, generates provider-free availability candidates, and ranks options by earliest slot, conflict count, and stable technician ordering. No provider, maps, AI ranking, schema, API, UI, package, env, or Supabase changes were added.
- Task 108 scheduling engine dev diagnostics: `/dashboard/dev/scheduling-engine` uses static mock technicians to visualize provider-free multi-technician availability by ZIP scenario, including supported technicians, ranked candidates, slot times, and empty states. No Supabase schema, provider integration, CRM integration, API behavior, customer-facing UI, package, or env changes were added.
- Task 109 company scheduling configuration domain: `frontend/src/lib/integrations/scheduling/company-config.ts` now defines provider-neutral company scheduling rules for business hours, service areas, appointment defaults, same-day/next-day rules, emergency rules, and validation/default helpers. No Supabase schema, API, UI, provider, package, env, or runtime behavior changes were added.
- Task 110 company-config-driven availability: `frontend/src/lib/integrations/scheduling/company-availability.ts` now converts provider-neutral company scheduling policies into availability engine requests, applies service-area ZIP rules, checks same-day/next-day/horizon/working-day rules, and returns validation-aware empty responses instead of throwing. No Supabase schema, API, UI, provider, package, env, or runtime behavior changes were added.
- Task 111 company scheduling config diagnostics: `/dashboard/dev/scheduling-engine` now includes a company-policy diagnostics section with static configs for normal supported ZIP, same-day cutoff blocked, unsupported ZIP, and weekend blocked scenarios. It displays business hours, defaults, same-day/date/service-area results, validation errors, and ranked provider-free candidates. No Supabase schema, API, customer-facing UI, provider, package, env, or runtime behavior changes were added.
- Task 112 dispatcher recommendation engine: `frontend/src/lib/integrations/scheduling/dispatcher-recommendations.ts` now converts provider-free availability candidates into customer-friendly dispatcher recommendations with service-window labels, best/backup priorities, and deterministic reason codes. `/dashboard/dev/scheduling-engine` includes an internal recommendation preview. No Supabase schema, API, customer-facing UI, provider, Google Calendar/Maps, AI call, package, env, or runtime behavior changes were added.
- Task 113 dispatcher recommendation dev scenarios: `/dashboard/dev/scheduling-engine` now includes static dispatcher recommendation scenarios for same-day, next-day, morning preference, afternoon preference, emergency, unsupported ZIP, and no available slots. Scenario data lives in `frontend/src/lib/integrations/scheduling/dev-scenarios.ts`. No Supabase schema, API, customer-facing UI, provider, Google Calendar/Maps, AI call, package, env, or runtime behavior changes were added.
- Task 114 dispatcher conversation response builder: `frontend/src/lib/integrations/scheduling/dispatcher-response-builder.ts` now converts dispatcher recommendations into safe customer-facing message drafts, backup text, no-availability text, internal summaries, and reason codes. `/dashboard/dev/scheduling-engine` shows an internal response preview. No Supabase schema, API, customer-facing UI, provider, Google Calendar/Maps, AI call, SMS/call sending, package, env, or runtime behavior changes were added.
- Task 115 scheduling request intake model: `frontend/src/lib/integrations/scheduling/scheduling-intake.ts` now normalizes and validates provider-free customer scheduling intake before availability, recommendation, and response-builder steps. `/dashboard/dev/scheduling-engine` includes a static intake normalization preview. No Supabase schema, API, customer-facing UI, provider, Google Calendar/Maps, AI call, SMS/call sending, package, env, or runtime behavior changes were added.
- Task 116 scheduling orchestrator pipeline: `frontend/src/lib/integrations/scheduling/scheduling-orchestrator.ts` now connects intake normalization, intake/config validation, company availability, dispatcher recommendations, and safe response draft generation into one provider-free pipeline. `/dashboard/dev/scheduling-engine` includes a static orchestrator preview. No Supabase schema, API, customer-facing UI, provider, Google Calendar/Maps, AI call, SMS/call sending, package, env, or runtime behavior changes were added.
- Task 117 scheduling orchestrator dev scenarios: `frontend/src/lib/integrations/scheduling/dev-scenarios.ts` now includes static end-to-end orchestrator scenarios for same-day, next-day, preferred-window, emergency, unsupported ZIP, missing ZIP, missing service info, no-slot, and weekend-rule outcomes. `/dashboard/dev/scheduling-engine` can switch between them and inspect normalized intake, steps, errors/warnings, recommendations, and safe response drafts. No Supabase schema, API, customer-facing UI, provider, Google Calendar/Maps, AI call, SMS/call sending, package, env, or runtime behavior changes were added.
- Task 118 scheduling pipeline stabilization audit: static scheduling diagnostics scenario data was consolidated into `frontend/src/lib/integrations/scheduling/dev-scenarios.ts`, the provider-free scheduling exports and validation/error patterns were reviewed, and `docs/SCHEDULING_PIPELINE_FOUNDATION.md` now documents the current pipeline, boundaries, modules, diagnostics coverage, intentionally missing work, and next safe steps. No Supabase schema, API, customer-facing UI, provider, Google Calendar/Maps, AI call, SMS/call sending, package, env, or runtime behavior changes were added.
- Task 119 read-only CRM dispatcher preview: `/dashboard/leads/[id]` now includes an internal dispatcher scheduling preview that maps the existing service request into provider-free scheduling intake, runs `runSchedulingOrchestrator()` with static company rules/technician profiles, and displays normalized ZIP/service data, status, best/backup options, safe response draft, and validation warnings/errors. `frontend/src/lib/integrations/scheduling/service-request-adapter.ts` keeps the temporary adapter isolated. No Supabase schema, API behavior, booking, appointment creation, provider, Google Calendar/Maps, AI call, SMS/call sending, package, env, or public/customer-facing UI changes were added.
- Improved auth QA visibility for login/signup and dashboard, including session/profile status display, logout controls, login-to-dashboard redirect, and profile loading timeout messaging.
- Clean Supabase Auth QA flow for login/signup and dashboard status, with production-mode local network testing guidance for iPhone/mobile devices.
- Real onboarding flow planning in `docs/ONBOARDING_FLOW_PLAN.md` for customers, technicians, company owners, admins, companies, invites, join requests, statuses, redirects, and RLS implications.


## Estimate MVP Completed

The first real estimate system is complete at the MVP level. `/dashboard/leads/[id]` supports appliance-category pricing catalog selection, selected job cart, optional custom line item, customer-facing preview, saved estimate history, active draft guidance, draft editing, and draft voiding. Saved Estimates is the single source of truth: viewing expands a saved estimate inline, editing loads the draft into the builder, updating preserves the same estimate number, and voided drafts remain read-only history.

Persistence for the draft/edit/void MVP depends on the estimate migration chain through `supabase/migrations/0025_estimate_lifecycle_rpc_apply_ready.sql`. Task 101 extends that checkpoint with tokenized send/approve/decline support in `supabase/migrations/0026_estimate_customer_approval_flow_apply_ready.sql`, and Task 101.1 confirms the forward token-generation patch in `supabase/migrations/0027_estimate_token_generation_fix_apply_ready.sql` is applied. PDF, invoice, payment, SMS/email delivery, and Stripe workflows are intentionally not implemented yet.

Task 102 adds the first invoice foundation behind `supabase/migrations/0028_invoice_foundation_apply_ready.sql`. Invoices are separate business documents copied from approved estimates, so future estimate changes do not alter invoice history. The MVP supports manual invoice statuses only (`draft`, `sent`, `paid`, `void`) and does not include Stripe, payment processing, SMS, email, or PDF generation. Task 102.2 confirms browser QA passed for invoice creation from an approved estimate, invoice viewing, manual send/paid/void actions, refresh persistence, and the financial document list cleanup.

## Current in-progress feature

The product is transitioning from frontend-first mock workflows into a real dev/staging backend foundation. Supabase Auth, `public.profiles`, onboarding/company tables, audit logs, RLS helpers, and conservative onboarding RLS policies exist in the current dev/staging Supabase project, but marketplace CRM, technician community, AI workflow, and public SEO systems still use static/local UI data only. No real leads, jobs, repair cases, dispatch, notification, AI, translation, or payment persistence is connected.

## Current Supabase persistence status

- `supabase/migrations/0001_profiles_roles.sql` has been applied manually for the current development project.
- The real database should be treated as containing only the profiles/auth foundation right now.
- `supabase/migrations/0002_real_marketplace_core_draft.sql` is a Task 55 review-only draft for broader `service_requests`, `leads`, `jobs`, and `repair_cases`.
- `supabase/migrations/0017_service_requests_foundation_apply_ready.sql` is a Task 91 apply-ready dev/staging migration for the first narrow public service request persistence table. The user manually applied it in dev/staging; Codex did not apply SQL.
- `supabase/migrations/0018_service_requests_dashboard_read_policies_apply_ready.sql` is a Task 92 apply-ready dev/staging migration for authenticated dashboard reads of `service_requests`. The user manually applied it in dev/staging; Codex did not apply SQL.
- `supabase/migrations/0019_service_request_status_update_policies_apply_ready.sql` is a Task 94 apply-ready dev/staging migration for status-only `service_requests` updates through `update_service_request_status_rpc`. It has not been applied by Codex.
- `supabase/migrations/0020_service_request_notes_foundation_apply_ready.sql` is a Task 95 apply-ready dev/staging migration for internal notes and timeline entries on `service_requests`. It has not been applied by Codex.
- `supabase/migrations/0021_service_request_photos_foundation_apply_ready.sql` is a Task 96 apply-ready dev/staging migration for private service request photo storage and metadata. It has not been applied by Codex.
- `supabase/migrations/0022_patch_service_request_photos_anon_select_revoke_apply_ready.sql` is a Task 96B apply-ready dev/staging security patch to hard-block anonymous photo metadata reads. It has not been applied by Codex.
- `supabase/migrations/0023_pricing_catalog_and_estimates_foundation_apply_ready.sql` is a Task 97 apply-ready dev/staging migration for the first pricing catalog and estimate workflow. It has not been applied by Codex.
- `supabase/migrations/0024_estimate_ux_v2_fields_apply_ready.sql` is a Task 98 apply-ready dev/staging migration for richer estimate/customer-preview fields. It has not been applied by Codex.
- `supabase/migrations/0025_estimate_lifecycle_rpc_apply_ready.sql` is a Task 100 apply-ready dev/staging migration for updating and voiding draft estimates without broad browser write policies. The user manually applied it in dev/staging; Codex did not apply SQL.
- `supabase/migrations/0026_estimate_customer_approval_flow_apply_ready.sql` is a Task 101 apply-ready dev/staging migration for tokenized send/approve/decline estimate flows. The user manually applied it in dev/staging; Codex did not apply SQL.
- `supabase/migrations/0027_estimate_token_generation_fix_apply_ready.sql` is a Task 101 follow-up patch for Supabase-compatible approval token generation. The user manually applied it in dev/staging; Codex did not apply SQL.
- `supabase/migrations/0028_invoice_foundation_apply_ready.sql` is the Task 102 dev/staging migration for invoice snapshots and manual invoice lifecycle RPCs. Task 102.2 documents the implemented invoice foundation and browser QA pass; Codex did not apply SQL.
- `supabase/migrations/0029_service_request_address_intelligence_apply_ready.sql` is the Task 103 dev/staging migration for structured service request addresses, navigation coordinates, provider place IDs, and a narrow address-update RPC. It has not been applied by Codex.
- `supabase/migrations/0003_onboarding_foundation_draft.sql` is a Task 60/61 review-only draft for `companies`, `company_members`, `technician_profiles`, `company_invites`, `company_join_requests`, and `profiles.onboarding_status`.
- `supabase/migrations/0004_audit_log_foundation_draft.sql` is a Task 64 review-only draft for append-only `audit_logs`.
- `supabase/migrations/0005_rls_helpers_draft.sql` is a Task 65 review-only draft for reusable RLS helper predicates.
- `supabase/migrations/0006_onboarding_rls_policies_draft.sql` is a Task 66 review-only draft for table-specific onboarding RLS policies using the Task 65 helper predicates.
- `supabase/migrations/0007_onboarding_foundation_apply_ready.sql` through `0010_onboarding_rls_policies_apply_ready.sql` were manually applied by the user through Supabase SQL Editor to the confirmed dev/staging project `hejpgyzorrxpfcyvmypb`.
- `docs/APPLY_READY_MIGRATIONS_HUMAN_REVIEW_TASK70.md` records the Task 70 human review of `0007`-`0010`. The set is conditionally staging-safe only and remains not production-approved.
- `docs/MIGRATION_APPLICATION_BLOCKERS_TASK71.md` records that Task 71 blocked before SQL execution because the Supabase target could not be independently confirmed as staging/test from local repo or CLI metadata.
- `docs/MIGRATION_SQL_EDITOR_INSTRUCTIONS_TASK72.md` records the manual SQL Editor application path for the user-confirmed dev/staging project `hejpgyzorrxpfcyvmypb`.
- `docs/MIGRATION_APPLICATION_RESULT_TASK72.md` records that the user manually applied `0007`-`0010` successfully and Codex performed non-mutating anon REST/privacy checks.
- `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md` records anonymous RLS probe results, dev-only fixture SQL, authenticated test plans, and a suspended-member policy finding.
- `supabase/migrations/0011_patch_company_members_rls_visibility.sql` removes raw `company_members` self-row select access for non-manager members so private membership notes are not exposed to suspended/removed users or active non-manager members. The user manually applied it through the SQL Editor for the confirmed dev/staging project `hejpgyzorrxpfcyvmypb` with `Success. No rows returned.` Codex performed static verification and an anonymous REST probe; seeded authenticated tests are still recommended.
- `docs/COMPANY_MEMBER_SELF_STATUS_VIEW_PLAN.md` documents the future sanitized status view/RPC option for members without exposing private membership notes.
- `docs/RLS_PATCH_RESULT_TASK74.md` documents the patch, manual SQL Editor instructions, and post-apply verification queries.
- `frontend/src/server/onboarding/actions.ts` implements the first real onboarding server-action contracts. It uses user-scoped authenticated Supabase sessions only, respects RLS, creates safe draft technician profiles where the current RLS allows it, and returns typed `trusted_mutation_required` errors for company creation/onboarding completion until reviewed RPC/server-only transaction paths exist.
- `docs/ONBOARDING_SERVER_ACTIONS_IMPLEMENTATION_TASK75.md` documents the Task 75 implementation, security protections, and remaining backend gaps.
- `supabase/migrations/0012_onboarding_trusted_rpc.sql` defines reviewed dev/staging RPCs for company creation/owner membership and onboarding completion. The user manually applied it through Supabase SQL Editor with `Success. No rows returned.`
- `frontend/src/server/onboarding/actions.ts` now calls `create_company_and_owner_membership_rpc` and `complete_onboarding_rpc`. Codex verified local source wiring and anon-key REST probes confirmed both RPCs deny anonymous execution with `42501 permission denied`.
- `/onboarding` now provides the first real dev/staging onboarding UI. Normal dashboard routes now require a real authenticated profile with active/verified status, completed onboarding, and a dashboard-eligible role; `/dashboard/dev/*` remains directly reachable for local verification.
- Dashboard navigation now uses centralized role-aware rules in `frontend/src/config/dashboard-navigation.ts`. This is client-side UX filtering only; route protection remains `DashboardAuthGate`, and data access remains governed by RLS/server actions.
- `/dashboard/technician-profile` is the first real technician profile workflow. It uses user-scoped authenticated Supabase access only, supports fields already present on `technician_profiles`, and does not use service-role access or new migrations.
- Task 83 adds the next review/apply-ready migration for technician profile updates: `supabase/migrations/0013_technician_profile_safe_update_rpc_apply_ready.sql`. It defines `public.update_own_technician_profile_rpc(...)`, which only updates approved self-editable profile fields and leaves system/verification/marketplace/company fields protected. This SQL has not been applied by Codex.
- Task 84 adds `supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql` for the onboarding path. It defines `public.upsert_own_technician_profile_rpc(...)`, which can create a safe independent draft technician profile or update approved self-editable fields for the authenticated caller. This SQL has not been applied by Codex.
- Task 87 adds `supabase/migrations/0015_public_technician_profiles_view_apply_ready.sql` for a sanitized public technician profile projection. It was manually applied by the user in dev/staging; raw `technician_profiles` must remain private.
- Task 55 did not apply SQL, connect to Supabase, create real tables, or change frontend behavior.
- Task 55A improves auth visibility only. It does not apply migrations, change Supabase database schema, or enforce route protection.
- Task 55B-55G investigated mobile auth diagnostics only. They did not apply migrations, change Supabase database schema, or enforce route protection.
- Task 58 cleaned temporary mobile auth debugging code after confirming the local iPhone issue was caused by Next.js dev-mode HMR websocket behavior, not Supabase Auth.
- Task 59 added onboarding flow planning only. It did not create UI, SQL, migrations, Supabase changes, packages, or commits.
- Task 60 created an onboarding foundation migration draft only. It did not apply SQL, connect to Supabase, create real tables, install packages, or change frontend behavior.
- Task 61 hardened the onboarding migration draft for enum consistency, lifecycle constraints, safer foreign keys, invite token handling, independent/company technician modeling, and clearer future RLS notes. It did not apply SQL, connect to Supabase, create real tables, install packages, or change frontend behavior.
- Task 62 created a review-only onboarding RLS policy plan covering profiles onboarding fields, companies, company members, technician profiles, company invites, company join requests, abuse scenarios, and test cases. It did not write executable policies, apply SQL, connect to Supabase, or change frontend behavior.
- Task 63 created a review-only server-side onboarding actions plan for company creation, invites, invite acceptance, join requests, technician profile updates, verification, onboarding completion, and member archival. It did not create code, execute SQL, apply migrations, connect to Supabase, or change frontend behavior.
- Task 64 created a review-only audit log plan and migration draft for sensitive onboarding, company, membership, invite, join request, technician verification, onboarding completion, and admin override events. It did not apply SQL, connect to Supabase, create real tables, install packages, or change frontend behavior.
- Task 65 created a review-only RLS helper function plan and SQL draft for reusable predicates such as admin checks, active company membership, company management, technician profile access, and public technician visibility. It did not apply SQL, connect to Supabase, create real functions, install packages, or change frontend behavior.
- Task 66 created a review-only table-specific onboarding RLS policy draft for profiles onboarding fields, companies, company members, technician profiles, company invites, company join requests, and audit logs. It did not apply SQL, connect to Supabase, create real policies, install packages, or change frontend behavior.
- Task 67 created a review-only migration application readiness checklist covering order, dependencies, rollback, staging, RLS helper recursion, seed fixtures, access tests, invite privacy, audit append-only behavior, mobile auth regression, frontend impact, and go/no-go criteria. It did not apply SQL, connect to Supabase, create real policies, install packages, or change frontend behavior.
- Task 68 evaluated applying `0003`-`0006` and blocked before any Supabase command because the readiness checklist and SQL files still contain review-only/do-not-apply blockers. The blocker report is documented in `docs/MIGRATION_APPLICATION_BLOCKERS_TASK68.md`.
- Task 69 created staging apply-ready copies `0007`-`0010` from the onboarding, audit, helper, and policy drafts. It narrowed unsafe browser mutation policies, kept raw invite/audit access blocked, documented deferred server-side work in `docs/APPLY_READY_MIGRATIONS_REVIEW_TASK69.md`, and did not apply SQL, connect to Supabase, install packages, or change frontend behavior.
- Task 70 reviewed the apply-ready copies `0007`-`0010`, made comment-only cleanup in `0007`/`0008`/`0009`, documented findings in `docs/APPLY_READY_MIGRATIONS_HUMAN_REVIEW_TASK70.md`, and did not apply SQL, connect to Supabase, install packages, or change frontend behavior.
- Task 71 attempted the staging application gate for `0007`-`0010` and blocked safely before SQL execution because the local Supabase URL/project ref could not prove staging/test status, no Supabase CLI link metadata was present, and the Supabase CLI was not available. It did not apply SQL, connect to Supabase, install packages, or change frontend behavior.
- Task 72 received user confirmation that project ref `hejpgyzorrxpfcyvmypb` is dev/staging only. Pre-checks passed, but local automated application was not available because the Supabase CLI is not installed/linked in this shell. Codex created `docs/MIGRATION_SQL_EDITOR_INSTRUCTIONS_TASK72.md` with one-at-a-time SQL Editor steps and verification queries. No SQL was executed by Codex, no migrations were applied by Codex, no packages were installed, and no frontend behavior changed.
- The user manually applied `0007`-`0010` through Supabase SQL Editor in order, and all four completed with `Success. No rows returned.`
- Codex created `docs/MIGRATION_APPLICATION_RESULT_TASK72.md` and verified via anon REST probes that the private onboarding/audit tables and selected helper RPCs deny anonymous browser access with `42501 permission denied`. Catalog-level enum/policy/RLS verification and seeded authenticated access tests remain follow-up work.
- Task 73 created `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md`, re-ran non-mutating anon REST probes, documented dev-only fixture SQL and cleanup SQL, and found that the current `company_members` own-row select policy may let suspended members read their own membership row/private notes while `archived_at` is null. RLS is not yet safe enough for onboarding server actions.

## What is not built yet

- Middleware/SSR dashboard route protection. Client runtime dashboard protection is active through `DashboardAuthGate`.
- Real marketplace database schema beyond `public.profiles` and the onboarding/audit foundation
- Seeded authenticated verification of `supabase/migrations/0012_onboarding_trusted_rpc.sql`
- Seeded authenticated browser testing for Task 79 completed/incomplete onboarding, customer role blocking, and pending/suspended/rejected account status redirects
- Invite/join/admin verification onboarding UI beyond the first customer, independent technician, and company owner setup paths
- Audit insert helpers or admin audit viewer
- Seeded RLS/access tests for the applied onboarding foundation
- Seeded authenticated verification of the Task 74 `company_members` own-row visibility patch
- Real repair case persistence
- Real photo uploads
- Full technician profile CRUD beyond draft creation and RLS-limited edit attempts
- Seeded/manual application and verification of `supabase/migrations/0013_technician_profile_safe_update_rpc_apply_ready.sql` so existing technician profile edits can save
- Seeded/manual application and verification of `supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql` so technician onboarding can create draft profile rows when browser-scoped insert RLS blocks the direct insert path
- Real AI SEO article generation
- Real AI TechAdvisor assistant
- Real multilingual AI translation
- Real vector/RAG knowledge base
- Real-time technician chat or WebSocket messaging
- Live dispatch, job locking, notifications, or technician mobile workflow
- Real analytics tracking
- Real dashboard lead persistence or conversion into database repair cases
- Public publishing workflow for AI-generated pages
- Dedicated public technician slug reservation/moderation workflow
- Payments or subscriptions
- Stripe monetization, paid leads, subscriptions, or technician payouts
- Production deployment

## Implemented mock marketplace systems

The following marketplace systems are implemented as frontend-only mock UI:

- Public technician discovery and `/schedule-service` intake.
- Mock marketplace lead inbox and lead conversion preview.
- Mock dashboard lead preview bridge from public intake.
- Mock technician availability and coverage board.
- Mock marketplace analytics dashboard.
- Mock Open Job Board where open jobs can be accepted in local state only.

## Planned future marketplace backend behavior

Open Job Board for Technicians is planned as a production marketplace workflow:

1. A customer submits a request without selecting a technician.
2. The request becomes an open marketplace job.
3. Matching technicians can see the job based on ZIP/service-area coverage, specialty, workload, and availability.
4. The first qualified technician may accept the job.
5. Accepted jobs become assigned and can later convert into repair cases.

Future implementation considerations:

- ZIP and service-area matching.
- Specialty filtering for appliance type, brand, and repair category.
- Workload and availability filtering.
- Temporary job locking while a technician reviews or accepts an open job.
- Assigned status transitions for open, locked, accepted, assigned, declined, expired, and converted jobs.
- Future technician mobile workflow for accepting and managing open jobs in the field.
- Future Stripe payout compatibility for accepted/completed marketplace jobs.

## Current folder structure

```text
WeRepairRefrigerators/
├── docs/
│   ├── PROJECT_STATE.md
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── DEVELOPER_HANDOFF.md
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── dashboard/
    │   │   │   ├── analytics/
    │   │   │   ├── community/
    │   │   │   ├── coverage/
    │   │   │   ├── leads/
    │   │   │   ├── open-jobs/
    │   │   │   ├── repair-cases/
    │   │   │   └── page.tsx
    │   │   ├── brands/
    │   │   ├── find-technician/
    │   │   ├── globals.css
    │   │   ├── layout.tsx
    │   │   ├── locations/
    │   │   ├── repair-cases/
    │   │   ├── schedule-service/
    │   │   ├── services/
    │   │   ├── technicians/
    │   │   └── page.tsx
    │   └── components/
    │       ├── dashboard/
    │       ├── public/
    │       ├── ui/
    │       ├── FormField.tsx
    │       ├── FormSection.tsx
    │       ├── MetricCard.tsx
    │       ├── RadioCardGroup.tsx
    │       ├── SelectField.tsx
    │       ├── StatusBadge.tsx
    │       ├── TextArea.tsx
    │       └── TextInput.tsx
    │   ├── config/
    │   ├── data/
    │   ├── lib/
    │   └── types/
    ├── package.json
    └── AGENTS.md
```

## Local setup commands

Run commands from `frontend/`:

```bash
npm install
npm run dev
npm run lint
npm run build -- --webpack
npm run start -- -H 0.0.0.0 -p 3001
```

Use the webpack build command for verification because it has been the stable build path in the current environment. For iPhone/mobile LAN auth testing, prefer production mode with `npm run build -- --webpack` followed by `npm run start -- -H 0.0.0.0 -p 3001`; `next dev` can produce misleading auth/debug symptoms when its HMR websocket fails on iPhone Safari.

## Task 80 dashboard identity status

- The dashboard now loads real Supabase-authenticated account context through `frontend/src/lib/dashboard/identity.ts`.
- `/dashboard` shows real profile role/status/onboarding context, linked company data when readable, RLS-limited company membership state, and technician profile state.
- `DashboardAuthStatus` now surfaces real account context in the dashboard shell/topbar while keeping logout and route-guard diagnostics.
- Marketplace operations, repair cases, analytics, jobs, coverage, community, and AI workflows remain mock/demo datasets and are visually separated from real account data.
- No new migrations were applied for this task, no service-role key was used, and frontend reads still use the authenticated anon Supabase client with RLS.

## Task 120 dispatcher snapshot status

- The service request detail dispatcher preview remains internal/read-only operationally, but now has an authenticated "Save dispatcher preview" action.
- New migration draft: `supabase/migrations/0030_dispatcher_preview_snapshots_apply_ready.sql`.
- New internal API route: `/api/service-requests/[id]/dispatcher-preview` for loading/saving the latest snapshot through narrow RPCs.
- The snapshot path stores normalized request context, orchestrator status, best/backup recommendation payloads, safe response draft text, and validation warnings/errors.
- Migration `0030` must be manually applied in dev/staging before dashboard snapshot save/load works against Supabase.
- No booking, appointment creation, service request mutation, SMS/call/email, provider, Google Calendar, Google Maps, or AI behavior was introduced.

## Task 121 real technician matching status

- Dispatcher Preview now loads real `technician_profiles` rows through the authenticated Supabase client and RLS.
- Static preview technicians are no longer used for CRM dispatcher recommendations.
- Matching requires verified, marketplace-enabled, non-suspended/non-rejected/non-archived technician profiles that cover the requested ZIP.
- Ranking weights ZIP coverage highest, appliance specialty high, brand experience and years experience medium, and profile completeness low.
- The preview displays recommended technician name, business name, years experience, match reasons, confidence, and the provider-free service window.
- Saved dispatcher snapshots now include recommended technician profile ID when available plus technician name, ranking score, confidence, and match reasons inside `recommendation_summary`.
- No appointment assignment, service request mutation, provider call, customer message, or technician phone exposure was added.

## Task 122 technician availability status

- New apply-ready migration: `supabase/migrations/0031_technician_availability_rules_apply_ready.sql`.
- The migration adds `technician_availability_rules` for simple recurring technician work windows by day of week and start/end time.
- Dispatcher Preview now loads availability rules through the authenticated Supabase client and RLS, then converts matched technicians into provider-free work blocks for the scheduling engine.
- If a matched technician has no configured availability rules, the preview shows an internal warning and does not pretend there is a real available window.
- Snapshot payloads now include availability configuration flags, matching windows for the requested date, and configured day/window summaries in `recommendation_summary`.
- Migration `0031` must be manually applied in dev/staging before real availability windows can be loaded.
- Still no appointment creation, assignment, hold, customer notification, provider call, Google Calendar, Google Maps, or AI behavior.

## M3 rollback milestone

- Local git tag created: `milestone-m3-task122`.
- Rollback notes created: `docs/MILESTONE_M3_ROLLBACK.md`.
- M3 covers Task 101 through Task 122, including estimate approval, invoices, dispatcher preview, dispatcher snapshots, real technician matching, and availability rules.
- The tag marks committed `HEAD`; the current project still has uncommitted task files, so use the rollback doc and `git diff` before reverting later appointment-booking changes.
- Do not use destructive git reset or database cleanup unless explicitly approved.

## Task 123 appointment booking foundation

- New apply-ready migration: `supabase/migrations/0032_appointments_apply_ready.sql`.
- The migration adds `appointments`, service request assignment/scheduled fields, RLS for authenticated appointment reads, and `book_service_request_appointment_rpc(...)`.
- `/dashboard/leads/[id]` can now show a Book Appointment action from the internal Dispatcher Preview when a real technician match and real availability window exist.
- Booking is intentionally internal only: it creates an appointment record and updates the service request assignment/scheduled fields through the RPC, but does not send SMS, email, phone calls, calendar invites, Google Calendar/Maps calls, AI calls, or provider requests.
- New dashboard route: `/dashboard/technician-schedule`, with real appointment cards and disabled "Call via Platform" / "Message via Platform" placeholders. The schedule does not expose customer phone numbers.
- Migration `0032` must be manually applied in dev/staging before booking or schedule reads work against Supabase.

## Task 125 authenticated booking QA access

- New dev/staging QA guide: `docs/APPOINTMENT_BOOKING_QA_ACCESS_TASK125.md`.
- New fixture SQL: `supabase/fixtures/booking_qa_dev_fixture.sql`.
- The fixture assumes a Supabase Auth user created manually with a password stored outside git, then prepares a dashboard-ready technician profile, Monday availability, and two private QA service requests without real phone numbers.
- Codex did not create passwords, apply SQL, use service-role credentials, or weaken production authentication.
- Authenticated browser booking QA remains pending until the QA Auth user exists and the fixture is manually applied in dev/staging.

## Task 127 jobs-first dashboard refactor

- Dashboard primary navigation now uses a jobs-first CRM structure: Dashboard, Jobs, Calendar, Customers, Technicians, Reports, and Settings.
- Jobs still routes to the existing `/dashboard/leads` implementation and `service_requests` storage; this task did not rename database tables, API routes, or Supabase policies.
- Calendar routes to `/dashboard/technician-schedule`, which remains the existing appointment schedule surface.
- Developer diagnostics and older mock/demo routes remain accessible by direct URL, but they are no longer primary navigation items.
- `/dashboard` now emphasizes operational job cards: Jobs Today, Upcoming Appointments, New Jobs, Estimates Waiting, Parts / Follow-up, and Recent Activity.
- `/dashboard/leads/[id]` now presents the detail surface as a Job page with customer, address, appliance, status, technician assignment, and appointment summary at the top while preserving Dispatcher Preview, booking, estimates, invoices, notes, photos, and address workflows.
- No schema changes, API behavior changes, external provider integrations, service-role usage, commits, or Supabase changes were introduced.

## Task 129 pre-integration rollback milestone

- Local git tag created: `milestone-m3-job-workspace-before-integrations`.
- Rollback documentation created: `docs/MILESTONE_M3_JOB_WORKSPACE_ROLLBACK.md`.
- Verification passed before and after documentation updates: `npm run lint`, `npm run build -- --webpack`, and `git diff --check`.
- This milestone protects the committed pre-integration baseline before Google Calendar, SMS, calls, maps routing, AI, payments, or provider integrations begin.
- Important caveat: the repository still has many uncommitted task files/edits, so the tag points to committed `HEAD` and does not by itself capture uncommitted working-tree files.

## Task 130 Google Calendar appointment sync foundation

- New apply-ready migration: `supabase/migrations/0033_google_calendar_appointment_sync_apply_ready.sql`.
- New documentation: `docs/GOOGLE_CALENDAR_INTEGRATION_TASK130.md`.
- Booking still succeeds without Google credentials and reports Calendar Sync as Not configured.
- When server-side Google Calendar env vars are configured, the appointment booking route attempts to create a Google Calendar event after the database appointment is booked.
- Calendar sync metadata is stored through a narrow authenticated RPC after migration `0033` is manually applied.
- Technician Schedule cards and the Job Workspace Appointment tab now show calendar sync state without exposing credentials or phone numbers.
- No SMS, email, phone call, AI, maps routing, payment, provider webhook, customer notification, service-role frontend usage, or Supabase SQL application was added.

## Task 131 internal CRM dispatch board

- `/dashboard/technician-schedule` now behaves as an internal Dispatch Board rather than a flat appointment list.
- The page includes Today, Previous day, Next day, date picker, technician filter, daily grouped technician appointment cards, and mobile-friendly "My Jobs Today" list behavior.
- Appointment cards show job status, appointment window, appliance/brand, city/ZIP, calendar sync state, and a quick link back to the Job Workspace.
- Customer phone numbers remain hidden; Call via Platform and Message via Platform remain disabled placeholders.
- The architecture note is explicit: CRM `appointments` is the source of truth; Google Calendar is optional outbound sync only and never the primary technician calendar.

## Task 132 appliance repair job lifecycle

- New apply-ready migration: `supabase/migrations/0034_job_status_lifecycle_and_estimate_transitions_apply_ready.sql`.
- The Job Workspace keeps the compact status dropdown but now supports the appliance repair lifecycle: New, Contacted, Scheduled, Diagnosed, Estimate Sent, Estimate Approved, Parts Needed, Parts Ordered, Parts Received, Return Visit Scheduled, Completed, Closed, Waiting Customer, and Canceled.
- Shared status labels/tones now drive the Job Workspace, Jobs list, dashboard overview, Dispatch Board job badges, and timeline/status wording.
- Sending an estimate will move the job to `estimate_sent`; customer approval moves it to `estimate_approved`; customer decline moves it to `waiting_customer`. Manual dispatcher/company-owner overrides remain allowed.
- Migration `0034` must be manually applied in dev/staging before the expanded status RPC and estimate auto-transitions persist in Supabase.

## Task 139 technician command dashboard rebuild

- `/dashboard` now presents a technician command center instead of a generic widget collection.
- The page starts with a personal workday header, current day, active jobs, estimates waiting, callbacks, and scheduled revenue.
- Today's Schedule is the dominant block and shows real appointment-backed jobs when available, with realistic operational demo cards only when no appointments are returned.
- Need Attention, Sales Snapshot, Recent Calls, Recent Messages, AI Technician Advisor, Community Feed, Manuals Library, Parts Quick Search, and Inventory Snapshot are styled as compact production CRM widgets.
- Main CRM navigation no longer shows preview/soon/dev badges in the primary sidebar, while existing routes and behavior remain unchanged.
- This task is UI-only: no database changes, APIs, RPC changes, scheduling logic, estimate logic, invoice logic, authentication changes, provider integrations, or Supabase changes were introduced.

## Task 140 dashboard density hotfix

- `/dashboard` was tightened after the previous density pass left the Today's Schedule area too large when real appointments were sparse.
- Today's Schedule now uses fixed-height compact job cards with an explicit max-height cap, so it cannot become a giant empty white block.
- The desktop dashboard is reorganized into a denser command-center grid: greeting/search row, alert cards plus Sales Snapshot, compact schedule plus Need Attention, then Manuals/Calls/AI/Parts and Messages/Community/Inventory/Vendors rows.
- Real money/job counts still use available CRM data or zero values; communication, AI, manuals, parts, community, inventory, and vendor widgets remain static UI preview rows until integrations exist.
- No backend behavior, database schema, APIs, RPCs, auth, scheduling logic, estimate logic, invoice logic, or appointment logic changed.

## Task 141 premium technician dashboard pass

- `/dashboard` received a premium SaaS visual pass while preserving the same data loaders and CRM behavior.
- The top dashboard header now has a richer technician greeting, global search, calls/messages/alerts icon buttons, and a compact technician profile/status control.
- KPI cards, Sales Snapshot, Today's Schedule, AI Technician Advisor, Community Feed, Parts Quick Search, Vendor Search, and supporting widgets were restyled with stronger hierarchy, icons, hover states, and denser information.
- Sidebar/navigation now uses inline SVG icons instead of letter placeholders, a compact technician profile block, and the requested premium item set mapped to existing safe routes.
- This remains UI-only: no database, Supabase schema, API, RPC, auth, lead, estimate, invoice, scheduling, or appointment behavior changed.

## Task 142 dashboard scale and density correction

- `/dashboard` was scaled down after the premium pass made the interface feel too zoomed-in.
- Header height, greeting size, search/profile controls, KPI cards, schedule cards, Sales Snapshot rows, and lower widget padding were reduced.
- KPI helper text was shortened to avoid awkward truncation: Action items, Scheduled, Estimates, and Parts.
- Today's Schedule keeps compact fixed-height cards and a capped grid so status badges and labels do not spill into surrounding content.
- This remains UI-only with no backend, database, schema, API, RPC, auth, lead, estimate, invoice, scheduling, or appointment changes.

## Task 143 technician action center dashboard

- `/dashboard` now uses the final action-first command center architecture instead of a widget-first dashboard.
- Next Actions is the primary first section and surfaces customer callbacks, estimate follow-ups, return visits, and parts-related actions from available CRM data, with safe static action rows only when no live action data is available.
- The former KPI strip is reduced to a compact summary row inside Next Actions: Today's Jobs, Pending Estimates, Parts Waiting, and Callbacks.
- Today's Schedule remains directly below Next Actions as the daily route view.
- Recent Calls, Recent Messages, and AI Technician Advisor now sit immediately below the schedule as the communication/action support center.
- Parts Search, Inventory, and Vendor Search are combined into one Parts & Vendors operational area.
- Manuals, Community, and Sales Snapshot are compact secondary sections; Sales Snapshot now shows only Revenue This Week, Revenue This Month, and Jobs Completed.
- This is UI-only and does not change database, schema, APIs, RPCs, auth, lead, estimate, invoice, scheduling, or appointment behavior.

## Task 145 customer marketplace foundation

- New documentation: `docs/CUSTOMER_MARKETPLACE_FOUNDATION_TASK145.md`.
- New apply-ready migration: `supabase/migrations/0035_customer_marketplace_foundation_apply_ready.sql`.
- Customer-facing routes now exist for `/customer`, `/customer/diagnosis-preview`, `/customer/pros`, `/customer/price-prediction`, `/customer/login`, `/customer/register`, and `/customer/dashboard`.
- Technician CRM customer routes now exist at `/dashboard/customers` and `/dashboard/customers/[id]`.
- The customer foundation introduces `customers`, `customer_appliances`, customer-linked service requests, and trusted RPCs for customer-aware request creation after migration `0035` is manually applied.
- Public customer pages are mobile-first and account-gate booking next steps; they do not create appointments, payments, AI calls, vendor searches, messages, or live customer community activity.
- `/customer/pros` reads only public-safe technician profile rows and does not use mock technician fallback.
- The existing service request API tries the customer-aware RPC first and falls back to the prior public insert path while migration `0035` is not present.
- No SQL was applied automatically, and no service-role frontend usage was added.

## Task 146 customer foundation SQL/QA attempt

- Migration `0035` was re-reviewed before apply and corrected to support real end-to-end QA:
  - dashboard-safe customer/customer appliance reads through visible service requests
  - customer account linking through `link_current_customer_account_rpc(...)`
  - helper RPCs `can_view_customer(...)` and `can_view_customer_appliance(...)`
- Codex could not apply remote SQL from the local environment because no Supabase CLI, `psql`, database URL, or access token is available.
- The configured dev Supabase is reachable with the public anon client, and customer tables appear reachable, but the corrected helper RPCs are not present in the schema cache. Apply the current `0035` SQL manually in Supabase SQL Editor before declaring Task 146 database QA complete.
- Verification completed locally: lint, production build, `git diff --check`, and frontend service-role scan.

## Task 146 continued customer foundation QA

- User confirmed `0035` was applied successfully in Supabase.
- Real database QA confirmed customer-aware request creation and customer dedupe by repeated phone/email through `create_service_request_with_customer_rpc(...)`.
- Real app server QA confirmed `/api/service-requests` saves successfully after the customer-aware RPC path.
- Browser QA confirmed logged-out customer dashboard redirects to `/customer/login?next=/customer/dashboard`, and logged-out dashboard customer CRM routes redirect to `/login?next=...`.
- Browser QA confirmed `/customer` preview form routes into `/customer/diagnosis-preview` without booking or creating an appointment.
- Authenticated customer dashboard QA is still blocked by Supabase email confirmation: generated signup users are created but cannot log in until confirmed. The UI now shows a confirmation-required message instead of redirecting.
- New follow-up apply-ready migration: `supabase/migrations/0036_customer_service_request_self_read_apply_ready.sql`. It adds customer self-read for linked service requests and patches the customer-aware request RPC to normalize unsupported request sources to `schedule_service`.
- Apply `0036` before treating customer dashboard service request history as complete.

## Task 146 final customer foundation QA after 0036

- User confirmed `0036` was applied successfully in Supabase.
- Real database QA confirmed source normalization, anonymous SELECT blocking, anonymous helper blocking, customer-linked service request creation, and duplicate customer reuse.
- Browser QA confirmed logged-out redirects for customer dashboard and dashboard customer CRM routes, plus public customer route rendering without horizontal overflow in the available in-app browser viewport.
- Full authenticated customer dashboard and dashboard customer CRM data QA still requires confirmed credentials:
  - generated customer signup users require email confirmation before login;
  - no confirmed customer/dashboard test password is stored in the repository;
  - no service-role/admin credential is available to Codex for confirming Auth users.

## Task 146.1 confirmed QA account setup

- New dev/staging fixture: `supabase/fixtures/customer_marketplace_qa_accounts_task146.sql`.
- QA account emails:
  - `qa-customer-marketplace@example.test`
  - `qa-customer-dashboard@example.test`
- Passwords are intentionally not stored in the repository or documentation.
- The fixture requires both Auth users to be created and confirmed in the Supabase dashboard first, then it links customer, appliance, service request, and dashboard technician data for final browser QA.
- Codex could not create/confirm Auth users directly because only the public anon key is available locally; no dashboard/admin/service-role credential is present.

## Task 146 customer dashboard account usability blocker

- Customer home routing now recognizes authenticated customer accounts through customer role intent or the real `customers.auth_user_id` link, so logged-in customers visiting `/` are sent to `/customer/dashboard` instead of the technician dashboard path.
- `/customer/dashboard` now has an editable customer profile card for first name, last name, phone, and preferred contact method. Updates write to the real `customers` row through existing self-update RLS and persist after refresh.
- Customer greetings now prefer usable customer names and avoid treating email-shaped values as first/full names.
- Local verification passed lint, production build, `git diff --check`, and frontend service-role scan. Final authenticated mobile QA still requires the confirmed customer password/session held outside the repository.

## Task 146.2 customer dashboard UX completion

- Customer profile editing moved off the dashboard into `/customer/profile`.
- Customer dashboard now focuses on repairs, appliances, estimates, and invoices, with no always-visible profile form.
- Customer screens now include a mobile-first avatar account menu with Profile and Logout actions; Addresses and Notifications are retained as disabled future account items.
- Dashboard greeting now uses browser-local time: Good Morning, Good Afternoon, or Good Evening, followed by the customer first name when available.
- Profile updates continue to use the existing `customers` self-update RLS path; no schema, API, technician dashboard, or Task 147 work was added.

## Task 146.3 final customer portal fixes

- `/customer/profile` profile saves now verify the active customer session, require the `customers.auth_user_id` link to match the signed-in user, update by both customer id and auth user id, then re-read the saved row for refresh persistence.
- Customer avatar default styling now uses soft deterministic account colors instead of a black circle.
- Customer appliance selection now supports major appliances for WeRepairAppliances: refrigerator, freezer, ice maker, wine cooler, dishwasher, washer, dryer, range, oven, cooktop, microwave, vent hood, and garbage compactor.
- Appliance label photo UX is represented as a clearly disabled future feature only; no photo storage, AI recognition, or fake model extraction was added.

## Task 146.4 appliance-centric customer experience

- New appliance detail route: `/customer/appliances/[id]`.
- Customer dashboard appliance cards now show an appliance icon, appliance type, brand/title, location/model context, a detail link, and a primary `Request Repair` action.
- New repair-intake shell route: `/customer/request-repair?appliance=<id>`. It displays the selected appliance, a problem description field, and Continue, but intentionally creates no service request until Task 147.
- Appliance detail includes a `Repair History` section with a true empty state: `No repair history yet.`
- Customer appliance label-photo UX remains a disabled future placeholder only; no OCR, AI extraction, upload storage, or fake recognition was added.

## Task 146.5 customer login routing bug

- Main `/login` now routes successful customer sign-ins to `/customer/dashboard` when customer intent, auth metadata, profile role, or a linked `customers.auth_user_id` row indicates a customer account.
- Customer role intent no longer shows the technical dashboard auth status panel or technician/company-owner dashboard messaging on the main login form.
- If an authenticated customer profile reaches `/dashboard`, `DashboardAuthGate` redirects to `/customer/dashboard` instead of showing technician access-denied messaging.
- Technician/company dashboard routing remains available for technician/company role intent and dashboard accounts.

## Task 146.6 marketplace and customer portal navigation

- Customer portal pages now include a WRA header with marketplace/home access, portal access, and the customer account menu.
- Customer account menu now includes Marketplace, Profile, disabled future Addresses/Notifications/Community/Ask a Question placeholders, and Logout.
- The public marketplace root `/` no longer forces authenticated customers into `/customer/dashboard`; logged-in customers can browse marketplace pages and return to the portal without losing session.
- Public header now shows a customer portal/account action for authenticated customers, keeps technician dashboard access only for non-customer dashboard users, and shows login for guests.
- Customer navigation still does not expose technician CRM routes such as jobs, calendar, customers, reports, or settings.

## Task 146 final closeout

- Task 146 is closed after the customer foundation QA and UX completion pass.
- Confirmed foundation status: customer login, customer dashboard, customer profile, customer appliances, appliance detail, request-repair shell, and marketplace/customer portal navigation are implemented and build cleanly.
- Customer accounts remain separated from the technician CRM: customer login routes to `/customer/dashboard`, customer portal navigation does not expose `/dashboard` routes, and `DashboardAuthGate` redirects customer profiles away from technician dashboard access.
- Mobile/LAN customer auth and portal navigation were fixed during Task 146, and the customer portal header nested-anchor hydration error was fixed by letting `BrandLogo` own the single marketplace-home link.
- No Task 147 booking behavior was started: `/customer/request-repair?appliance=<id>` remains a non-persisting intake shell, with no technician selection, appointment booking, service request creation, SMS, AI, payment, provider call, or customer notification.
- Final local verification passed lint, production build, `git diff --check`, and frontend service-role scan.

## Task 147 asset-to-service-request-to-appointment workflow

- Task 147 starts the first real Home Service OS lifecycle from customer asset to CRM job.
- New apply-ready migration: `supabase/migrations/0037_customer_asset_booking_apply_ready.sql`.
- Follow-up apply-ready patch: `supabase/migrations/0038_customer_asset_booking_contact_window_patch_apply_ready.sql`. Apply it after `0037`; it keeps the same booking RPC but stores customer contact preference on `customers.preferred_contact_method` and the selected appointment window on `service_requests.preferred_time_window`.
- New trusted RPCs:
  - `get_public_technician_booking_windows_rpc(...)` resolves public technician slugs and returns availability-rule windows or controlled fallback windows.
  - `create_customer_asset_booking_rpc(...)` verifies the authenticated customer owns the appliance, resolves the selected public technician slug internally, validates ZIP coverage, prevents duplicate active appliance appointments and overlapping technician windows, creates the `service_requests` row linked to `customer_id` and `customer_appliance_id`, creates the `appointments` row, and updates scheduling/assignment fields on the request.
- New customer routes:
  - `/customer/choose-technician`
  - `/customer/booking-confirmation`
- New customer API routes:
  - `/api/customer/technician-windows`
  - `/api/customer/repair-booking`
- `/customer/request-repair?appliance=<id>` now captures the appliance-specific problem, service ZIP/city/state, preferred contact method, and optional notes, then continues to technician and appointment selection. Records are created only after the customer clicks `Book Appointment`.
- `/customer/dashboard` now shows linked repair rows with status, selected technician, appointment window, and created date so customer-created bookings are visible after refresh.
- CRM visibility uses existing real job surfaces: customer-created requests are normal `service_requests`, so `/dashboard/leads`, `/dashboard/leads/[id]`, `/dashboard/technician-schedule`, and `/dashboard/customers/[id]` can show them after the Task 147 SQL is applied and RLS allows the relevant dashboard account.
- Task 147 did not add Community, AI agents, Vendor Search, Inventory, Payments, SMS, email, calls, maps routing, or provider integrations.
- Codex did not apply SQL remotely. Apply `0037_customer_asset_booking_apply_ready.sql` and then `0038_customer_asset_booking_contact_window_patch_apply_ready.sql` in dev/staging before expecting customer booking persistence to work end-to-end.

## Task 147.1 technician marketplace profile readiness

- New apply-ready migrations: `supabase/migrations/0040_technician_marketplace_profile_readiness_apply_ready.sql` and compatibility fix `supabase/migrations/0041_technician_marketplace_profile_readiness_view_fix_apply_ready.sql`.
- The migration extends the existing `technician_profiles` table with marketplace matching fields: service cities, appliance categories, brands serviced, avatar color, and a safe marketplace visibility toggle through the existing self-owned technician profile RPC.
- `/dashboard/technician-profile` is now the marketplace settings workspace for technicians/company owners. It edits display name, business name, service cities, service ZIP codes, appliance categories, brands, years experience, public bio, avatar placeholder color, and marketplace visibility using the existing authenticated server action/RPC pattern.
- Dashboard navigation and topbar now expose a clear `Marketplace Profile` path while keeping logout visible.
- `/customer/choose-technician` now ranks real public technician profiles by ZIP coverage, appliance category, brand experience, years experience, and profile completeness. Disabled marketplace profiles remain hidden by the public technician view.
- `0041_technician_marketplace_profile_readiness_view_fix_apply_ready.sql` has been applied successfully in Supabase. Manual technician QA passed: profile fields save and persist, and marketplace matching works with real `public_technician_profiles` rows.
- Known UX debt: `/dashboard/technician-profile` is functional but has repeated/duplicated sections and should receive a future visual polish pass. Do not treat that polish as a blocker for Task 147.1 functionality.

## Task 148 professional estimate and service intelligence foundation

- New apply-ready migration: `supabase/migrations/0042_professional_estimate_service_catalog_foundation_apply_ready.sql`.
- The migration adds a reusable service catalog foundation: service categories, repair groups, repair items, estimate templates, and template lines for labor, part, material, custom, and warranty rows.
- Existing estimate tables are extended forward-only with professional line metadata: line type, internal name, customer-facing name, public description, internal cost, sell price, service catalog repair item link, and template-line link.
- Existing estimate creation/update RPC names are preserved and enhanced to accept richer custom line payloads while still returning the same estimate summary shape used by the current CRM UI.
- The Job Workspace estimate builder now supports a multi-line custom cart with labor/part/material/custom/warranty line types, internal cost versus customer sell price, and customer-facing line names that hide internal part numbers from the preview.
- Existing approval, invoice, estimate history, and CRM job flows are preserved. Public customer estimate pages continue to render normal saved estimate line totals and must not show technician/internal cost data.
- This task does not implement inventory tracking, purchasing, vendor integrations, warehouse management, truck stock, profitability dashboards, AI estimate generation, payments, SMS, calls, or provider integrations.
- Codex did not apply SQL remotely. Apply `0042_professional_estimate_service_catalog_foundation_apply_ready.sql` in dev/staging before expecting the new catalog tables and line metadata columns to exist in Supabase.

## Task 148.1 estimate builder usability rescue

- The Job Workspace estimate tab now defaults to a fast technician workflow: choose Labor/Part/Material/Warranty/Custom, enter the customer-facing line name, enter the sell price, click `Add Line`, then `Save Draft`.
- Internal part names, internal cost, and notes are still supported but hidden behind `Show Details` so normal estimate entry is not blocked or confused by cost-tracking fields.
- The estimate cart now emphasizes saved line count and draft total, while customer preview still hides internal cost and internal part names.
- `Send To Customer` remains attached to saved draft estimate cards, preserving the existing approval flow and avoiding schema/API changes.

## Task 148.2 AI-first estimate drafting workflow

- The estimate tab now starts with a local deterministic `Estimate Draft Agent`: technicians describe the diagnosis in plain language, then generate a professional draft with customer-facing summary, labor/part/warranty/custom lines, suggested prices, and source/confidence context.
- New local module: `frontend/src/lib/estimate-draft-agent.ts`. It is rule/template based and makes no external AI API calls.
- Generated lines use the existing Task 148 multi-line estimate architecture and save through the existing estimate draft API; no second estimate system, schema change, provider call, SMS, payment, or customer notification was added.
- Manual catalog/line entry remains available behind `Add Manually`, but it is no longer the default estimate workflow.
- Customer preview uses generated customer-facing wording and hides internal part names/internal cost by default.

## Task 148.3 one-screen estimate generation

- The Job Workspace estimate tab now uses one estimate card instead of separate generated draft, cart, customer preview, and manual builder panels.
- The target technician flow is three actions maximum: describe diagnosis, review/edit generated line prices, send estimate.
- `Send Estimate` saves the current generated/edited lines as a draft and immediately sends the customer approval link through the existing estimate send API.
- Confidence/source blocks, customer preview blocks, and manual-builder screens were removed from the primary workflow.
- The local deterministic estimate draft agent remains the generator; no external AI API, provider, payment, SMS, call, inventory, purchasing, or schema work was added.

## Task 148.4 estimate agent intelligence improvements

- New apply-ready migration: `supabase/migrations/0043_estimate_agent_intelligence_foundation_apply_ready.sql`.
- The estimate card now supports editable generated line titles and an `Add Item` action for adding another editable estimate row without opening a separate manual-builder screen.
- Warranty is displayed in the estimate card footer instead of as a normal line item in the technician review table. Warranty rows still travel through the existing estimate payload so saved customer estimates keep warranty text.
- Draft removal is now presented as `Archive Draft` instead of delete/void. The new archive RPC stores archive metadata while preserving the existing `estimate_status = 'void'` compatibility model.
- The local estimate agent now emits a structured repair scope object with service category, repair group, repair item, and customer summary. This is still deterministic and local; no external AI or model training was added.
- The API can record non-blocking structured estimate learning events once `0043` is applied. Events capture diagnosis text, generated repair scope, line decisions, totals, estimate ids, request ids, and company ownership for a future Estimate Learning Engine. No AI training, vector indexing, provider calls, inventory, purchasing, payments, SMS, calls, or customer notification behavior was added.

## Task 148.5 multilingual estimate agent foundation

- The estimate draft agent now has a local diagnosis normalization layer for English, Russian, Ukrainian, and Spanish technician diagnosis text.
- `frontend/src/lib/estimate-draft-agent.ts` exports the provider-shaped normalization boundary: `normalizeDiagnosis(...)`, `getEstimateDiagnosisNormalizer(...)`, `DiagnosisNormalizerProvider`, and provider modes `local`, `cheap_ai`, and `advanced_ai`.
- Default mode is local deterministic rules only. `cheap_ai` and `advanced_ai` are interface placeholders for future server-side providers; no real AI API, translation API, model call, provider key, or paid service was added.
- Normalization returns detected language, normalized English diagnosis, repair intents, confidence, and matched terms. The estimate agent now generates from repair intents instead of raw keyword matching only.
- Supported initial repair intents include cooling failure, evaporator fan failure, condenser fan failure, evaporator iced over, manual defrost required, drain restriction, drain pump failure, door boot leak, heating element failure, control board failure, start relay failure, and ice maker failure.
- If evaporator fan failure plus iced-over evaporator is detected, the generated estimate includes diagnostic/repair labor, evaporator fan motor assembly, manual evaporator defrost service, and the standard warranty footer.
- The Job Workspace estimate card shows a compact `Smart draft normalization` hint with detected language, intents, and normalized English text. It does not claim external AI analysis.

## Task 148.6 OpenAI estimate agent API integration

- New server-only route: `/api/estimate-agent/draft`.
- The route accepts authenticated dashboard requests with appliance/job context and technician diagnosis text, calls the OpenAI Responses API only from the server, validates strict JSON, and maps the result into the existing one-card estimate draft shape.
- Required server env: `OPENAI_API_KEY`. Optional model controls: `ESTIMATE_AGENT_MODEL` for the cheap/default model and `ESTIMATE_AGENT_ADVANCED_MODEL` reserved for later escalation logic.
- The browser never receives or stores OpenAI credentials and does not call OpenAI directly.
- Cost control: the API is called only when the technician clicks `Generate Estimate`; it is not called on typing or every keystroke.
- Failure behavior: missing key, timeout, invalid JSON, OpenAI error, or network failure falls back to the local deterministic estimate agent so technicians can still generate and send estimates.
- The local fallback now recognizes sealed-system/compressor symptoms such as Russian LG linear-compressor no-cooling language and produces refrigeration-specific intents/lines instead of generic labor only.
- The estimate UI remains a single technician card: diagnosis, Generate Estimate, editable lines, total, and Send Estimate. It shows a neutral “Smart draft generated. Please review before sending.” note and does not expose raw AI/debug JSON.

## Task 148.7 API-first estimate builder cleanup

- The estimate agent route remains API-first: when `OPENAI_API_KEY` is configured, `/api/estimate-agent/draft` calls OpenAI before using the local deterministic generator. Local generation is fallback-only for missing key, timeout, OpenAI request failure, or invalid/unsafe JSON.
- The OpenAI prompt now positions the model as an experienced appliance repair estimate assistant, supports English/Russian/Ukrainian/Spanish/mixed diagnosis text, and explicitly rejects generic placeholder lines such as `Diagnostic and repair labor` or `Repair materials or replacement component` when a real repair scope is described.
- The strict JSON schema now asks for line description, quantity, and taxable state in addition to type, title, internal name, price, cost, warranty text, confidence, and warnings.
- The one-card estimate builder now has explicit quick actions: `Add Labor`, `Add Part`, `Add Service`, and `Add Other`. Service maps to the existing `material` estimate line type and Other maps to `custom`, preserving the current schema.
- Editable estimate rows now include line type, title, optional customer-facing description, quantity, unit price, taxable toggle, line total, and remove.
- Totals now show subtotal, discount controls, taxable subtotal, tax rate/tax, and grand total. The current estimate RPC still stores persisted estimate tax as 0 and has no first-class discount columns, so discount/tax values are captured in estimate decision context for the future Estimate Learning Engine rather than persisted as accounting-grade estimate totals.
- Regenerating an estimate when lines already exist now asks for confirmation before replacing technician edits.
- No OpenAI key is exposed to the browser, no client-side OpenAI calls were added, and no schema migration was introduced.

## Task 148.7A estimate agent source proof patch

- `ServiceRequestDetail.tsx` no longer calls the local deterministic estimate generator from the Generate Estimate button. Generation goes through `/api/estimate-agent/draft`; local fallback is server-side only.
- `/api/estimate-agent/draft` now returns explicit `source: "openai"` or `source: "fallback"` and a safe fallback reason when applicable.
- The technician UI now displays `Generated with AI` only for OpenAI source and `Generated locally` only for fallback source.
- Dev-only server logs include whether an OpenAI key exists, the selected model, and the final source. The API key value is never logged.
- The OpenAI prompt now explicitly requires every separate repair action from the diagnosis, including the required case: evaporator fan replacement, manual evaporator defrost/ice removal, and water inlet valve replacement.

## Task 148.8 compact estimate UI rescue

- The estimate card is now technician-first and compact: diagnosis, Generate Estimate, compact lines, compact totals, warranty footer, and send actions remain the primary visible workflow.
- Estimate line rows show type, editable title, unit price, line total, remove, and a small Details toggle. Description, quantity, and taxable controls are hidden by default and expand per line only when needed.
- Tax/discount controls are hidden by default behind `Adjust tax / discount`; the visible summary shows subtotal, discount, tax, and total. Default review tax rate is 8.25%.
- Warranty is a compact footer with default text: `90 days labor and installed parts unless otherwise specified on the estimate.` Editing is hidden behind `Edit warranty`.
- Smart draft diagnostics were reduced to a compact source/status message, with normalization/intents only behind a dev-only details disclosure.
- OpenAI prompt guidance now requires complete repair scope: named parts should include labor/testing coverage, evaporator ice should include manual defrost service, and sealed-system/compressor symptoms should produce proper sealed-system scope rather than vague material filler.

## Current git workflow

- Work from the repository root: `/Users/serhiitatarenko/Desktop/WeRepairRefrigerators`
- Make scoped changes in approved folders only.
- Do not auto-commit.
- Run lint and build before reporting frontend changes.
- Report changed files at the end of each task.
- Keep `node_modules`, build output, secrets, and environment files out of commits.
