# Developer Handoff

## Overview

WeRepairRefrigerators is a Houston-first refrigerator repair marketplace and SaaS MVP for customers, technicians, and service business owners. The current app is a frontend-only Next.js App Router project with a public SEO/customer marketplace, internal dashboard CRM, and private technician community mock workflows.

The app still uses mock/static marketplace, CRM, and community data. Supabase Auth and the `public.profiles` foundation are connected for local development, but there is no real marketplace persistence, upload handling, dispatch, real-time chat, payment logic, AI generation, or translation API yet.

P0 auth recovery note: Owner account passwords were restored using a temporary password outside git. Do not store troubleshooting passwords in repository files or docs.

## Platform Bible Documentation

Read `docs/platform-bible/` first before starting any new major task. The Platform Bible is the official source-of-truth documentation location for permanent WeRepairRefrigerators strategy, architecture, technician workflows, customer marketplace behavior, CRM workflow design, AI advisor scope, community, vendor/inventory, implementation history, and execution roadmap.

Start with `docs/platform-bible/README.md`, then read `docs/platform-bible/WRA_00_ROADMAP_MASTER.docx`, `docs/platform-bible/WRA_09_IMPLEMENTATION_HISTORY_AND_PROJECT_STATE.docx`, and `docs/platform-bible/WRA_10_EXECUTION_ROADMAP_AND_DEVELOPMENT_PLAN.docx` in that order.

## How to run the project

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Useful verification commands:

```bash
npm run lint
npm run build -- --webpack
```

For phone testing on the same local network, use a production build/start flow. Do not rely on `next dev` for iPhone auth QA because the webpack HMR websocket may fail on iPhone Safari and make auth/debug UI appear stuck.

```bash
npm run build -- --webpack
npm run start -- -H 0.0.0.0 -p 3001
```

Then test:

- Desktop: `http://localhost:3001/login`
- Phone: `http://10.0.0.67:3001/login`

Supabase Auth redirect URLs should include both the localhost URLs and the local network IP URLs. See `docs/SUPABASE_SETUP_GUIDE.md` for the full checklist.

## What has been built

- Task 148.10 added the Repair Intelligence Engine foundation in `frontend/src/lib/repair-intelligence/`. The OpenAI estimate route now builds a structured repair plan and then prices that plan into estimate lines, while still returning the compact `draft` shape consumed by the existing UI. The API response also includes `repair_plan`, `estimate_lines`, `customer_summary`, `warranty_text`, `pricing_warnings`, and `confidence` for future learning/analytics. No database schema, inventory, vendor, payment, community, dashboard, or estimate UI redesign work was added.

- Task 148.11 verified and tightened the technician review loop for repair-intelligence estimates. `ServiceRequestDetail.tsx` now keeps the repair-plan response as a compact technician summary, generated lines are inserted into `customEstimateLines`, and the existing estimate save payload records `repairPlanSummary` in `estimateDecisionContext`. The UI remains compact; raw repair-plan JSON is not shown to customers. Authenticated browser persistence QA still needs a logged-in dashboard session to confirm save, leave job, reopen job, and persisted total/line behavior end to end.

- Task 148.12 authenticated persistence QA was attempted against `http://localhost:3002/dashboard/leads`, but the browser had no dashboard session; DashboardAuthGate returned `logged_out` and redirected to technician login. To close this QA, sign in with a confirmed dashboard account whose `profiles.role` is `technician`, `verified_technician`, `expert_technician`, `company_owner`, or `admin`, with active status, completed onboarding, company/service-request access, and passwords stored outside git. Then verify generated estimate save/reopen behavior in the real Job Workspace before marking persistence QA passed.

- Task 148.13 added the dev/staging QA account setup guide `docs/REPAIR_INTELLIGENCE_ESTIMATE_QA_ACCESS_TASK148_13.md` and fixture `supabase/fixtures/repair_intelligence_estimate_qa_fixture.sql`. Before trying Repair Intelligence persistence QA again, manually create/confirm `qa-estimate-tech@example.test` in Supabase Auth with a temporary password stored outside git, then apply the fixture in SQL Editor. The fixture prepares an active `verified_technician`, active company membership, public-ready profile, and a `QA Estimate Persistence` service request. Codex did not create credentials or apply SQL, so live browser save/reopen QA remains pending until those steps are complete.

- Task 148.14 continued after `SUPABASE_SERVICE_ROLE_KEY` was added. Codex created `qa-estimate-tech@example.com` through Supabase Admin API, stored its generated local-only password in `/private/tmp/wra-qa-estimate-tech-example-com-password.txt`, and reused `qa-booking-tech@example.test` to establish a real dashboard browser session. The Job Workspace generated an OpenAI Repair Intelligence sealed-system/compressor estimate with `$4,476.91` total, but saving failed because the live DB lacks `service_requests.company_id`. A forward SQL fix now exists at `supabase/migrations/0044_repair_intelligence_estimate_persistence_company_scope_fix_apply_ready.sql`, and the estimate API reports the dev detail `column sr.company_id does not exist`. Automatic SQL apply is still unavailable: no DB URL, no Supabase CLI/local config, no SQL execution RPC, and Supabase Management SQL rejects the service-role key. Apply `0044`, then apply `supabase/fixtures/repair_intelligence_estimate_qa_fixture.sql`, then rerun browser save/reopen QA before Task 149.

- Task 148.15 continued after the user applied `0044`. The live API verified `OPENAI_API_KEY` server-side behavior with `source: openai`, a sealed-system/compressor repair plan, estimate lines, pricing output, customer summary, warranty text, and medium confidence. Saving still failed on the current QA jobs with `Service request not found` because those legacy requests are accessible by `selected_technician_slug` but have `service_requests.company_id = null`. A forward compatibility migration now exists at `supabase/migrations/0045_repair_intelligence_independent_technician_estimate_compat_apply_ready.sql`. Apply `0045` in Supabase before rerunning final save/reopen QA; it keeps company-owned estimate behavior intact and adds support for already-authorized independent-technician legacy jobs plus nullable-company learning events.

- Task 138 completed Technician Dashboard Professionalization Phase 1. `/dashboard` now has a compact operational alert strip, central Today's Schedule/Sales Snapshot row, denser AI advisor, parts search, manuals, recent calls/messages/community/inventory widgets, and refined sidebar styling. No database schema, APIs, RPCs, scheduling, estimates, invoices, or appointments were changed.

- Task 137 rebuilt `/dashboard` as Technician Dashboard Brain v1. The dashboard now shows real-data-backed attention counts, upcoming work, money snapshot, recent activity, and UI-only placeholders for AI advisor, parts search, manuals, calls/transcripts, and community preview. The dashboard loader uses safe empty states when dashboard reads fail, so technicians do not see raw relationship/database errors.

- Task 136 completed another CRM visual alignment pass toward the approved field-technician workspace: operational dashboard metrics/quick actions, compact dispatch-board job cards, compact Job Workspace header, immediate-save status dropdown, smaller colored quick action buttons, and cleaner production CRM wording. No backend behavior, schema, providers, or CRM logic changed.

- Task 135.1 applied a dashboard contrast hotfix: the normal CRM dashboard uses readable dark text on light Workiz-style cards, and the auth/debug status strip was removed from the regular dashboard topbar.

- Task 135 transformed `/dashboard/leads` into a technician-first Jobs Inbox with light CRM cards, operational filters, status/estimate/appointment context, and mobile-friendly Open Job actions.

- Task 134 finished the Workiz-style Job Workspace UI pass in ServiceRequestDetail.tsx, replacing remaining dark operational panels with white cards, blue actions, light document rows, and mobile-friendly notes/photos/timeline sections.

- Public customer-facing homepage.
- Public routes for brands, services, locations, public repair cases, technicians, ZIP discovery, and `/schedule-service`.
- Dashboard shell at `/dashboard` with shared sidebar/topbar and centralized navigation.
- Repair case list, creation, and detail preview flows.
- Dashboard AI workflow mock at `/dashboard/ai-articles`.
- Marketplace lead inbox, lead conversion preview, and dashboard lead preview.
- Technician coverage board and mock availability system.
- Marketplace analytics dashboard at `/dashboard/analytics`.
- Open Job Board mock at `/dashboard/open-jobs`.
- Technician Community / Knowledge Base at `/dashboard/community`.
- Repair help request creation at `/dashboard/community/new`.
- Technician discussion detail route at `/dashboard/community/[discussionId]`.
- Technician reputation and expert badge mock at `/dashboard/community/reputation`.
- Reusable form, dashboard, public, state, empty/loading/error, community, analytics, open jobs, and reputation components.
- Mock datasets in `frontend/src/data` and shared contracts in `frontend/src/types`.
- Backend architecture planning in `docs/BACKEND_ARCHITECTURE_PLAN.md`.
- Auth and role-based access planning in `docs/AUTH_ROLES_PLAN.md`.
- Supabase data model planning in `docs/SUPABASE_DATA_MODEL_PLAN.md`.
- Real marketplace/CRM data model planning in `docs/REAL_DATA_MODEL_PLAN.md` for service requests, leads, jobs, assignments, repair cases, customer addressing, pricing, open jobs, service areas, and future AI article drafts.
- Real onboarding flow planning in `docs/ONBOARDING_FLOW_PLAN.md` for customers, technicians, company owners, admins, company creation, company membership, invites, join requests, statuses, redirects, and RLS implications.
- Review-only onboarding foundation migration draft at `supabase/migrations/0003_onboarding_foundation_draft.sql` for `companies`, `company_members`, `technician_profiles`, `company_invites`, `company_join_requests`, and `profiles.onboarding_status`. It was hardened in Task 61, has not been applied, and does not contain final RLS policies.
- Review-only onboarding RLS policy plan in `docs/ONBOARDING_RLS_POLICY_PLAN.md` for onboarding table access boundaries, abuse scenarios, and recommended access tests. It is planning only and does not contain executable SQL policies.
- Review-only onboarding server actions plan in `docs/ONBOARDING_SERVER_ACTIONS_PLAN.md` for future server-side company, invite, join request, technician profile, verification, onboarding completion, and member archive mutations. It is planning only and does not contain implementation code.
- Review-only audit log plan in `docs/AUDIT_LOG_PLAN.md` and audit log migration draft at `supabase/migrations/0004_audit_log_foundation_draft.sql` for sensitive onboarding/company/admin events. They are planning/draft only and have not been applied.
- Review-only RLS helper function plan in `docs/RLS_HELPER_FUNCTIONS_PLAN.md` and migration draft at `supabase/migrations/0005_rls_helpers_draft.sql` for reusable role, company, membership, technician profile, and public technician visibility predicates. They are planning/draft only and have not been applied.
- Review-only table-specific onboarding RLS policy draft at `supabase/migrations/0006_onboarding_rls_policies_draft.sql` for profiles onboarding fields, companies, company members, technician profiles, company invites, company join requests, and audit logs. It is planning/draft only and has not been applied.
- Review-only migration application readiness checklist in `docs/MIGRATION_APPLICATION_READINESS_CHECKLIST.md` for onboarding/audit/RLS migration order, dependencies, rollback, staging, test fixtures, access tests, and go/no-go blockers. It is planning only and does not authorize applying migrations.
- Task 68 migration application blocker report in `docs/MIGRATION_APPLICATION_BLOCKERS_TASK68.md`. The attempted application review stopped before any Supabase command because `0003`-`0006` and the readiness checklist still contain explicit review-only/do-not-apply blockers.
- Task 69 staging apply-ready migration review in `docs/APPLY_READY_MIGRATIONS_REVIEW_TASK69.md` and apply-ready migration copies `supabase/migrations/0007_onboarding_foundation_apply_ready.sql` through `0010_onboarding_rls_policies_apply_ready.sql`. These have not been applied and are staging-oriented, not production-approved.
- Task 70 human review in `docs/APPLY_READY_MIGRATIONS_HUMAN_REVIEW_TASK70.md`. It found `0007`-`0010` conditionally staging-safe only, documented production blockers, and kept server-side onboarding actions, audit insert paths, invite flows, and access tests deferred.
- Task 71 migration application blocker report in `docs/MIGRATION_APPLICATION_BLOCKERS_TASK71.md`. The application gate stopped before SQL execution because the local Supabase project ref could not be independently confirmed as staging/test and no Supabase CLI link metadata was present.
- Task 72 SQL Editor instructions in `docs/MIGRATION_SQL_EDITOR_INSTRUCTIONS_TASK72.md`. The user confirmed project ref `hejpgyzorrxpfcyvmypb` is dev/staging; pre-checks passed, but Supabase CLI was unavailable, so manual SQL Editor application is the current safe path.
- Task 72 migration result in `docs/MIGRATION_APPLICATION_RESULT_TASK72.md`. The user manually applied `0007`-`0010` successfully through Supabase SQL Editor, and Codex verified anonymous browser access is denied for private onboarding/audit tables and selected helper RPCs.
- Task 73 onboarding RLS test plan/results in `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md`. Anonymous probes passed, dev-only fixture SQL was documented, and a suspended-member `company_members` own-row visibility issue was found.
- Task 74 RLS patch in `supabase/migrations/0011_patch_company_members_rls_visibility.sql`. It removes raw own-row `company_members` select access for non-manager members so private notes are not exposed. The user manually applied it through Supabase SQL Editor with `Success. No rows returned`; use `docs/RLS_PATCH_RESULT_TASK74.md` for verification notes and remaining seeded test expectations.
- Task 74 sanitized self-status planning in `docs/COMPANY_MEMBER_SELF_STATUS_VIEW_PLAN.md`. Use this before exposing inactive/suspended member status in the UI without exposing raw membership notes.
- Task 75 onboarding server action foundation in `frontend/src/server/onboarding`. It validates authenticated Supabase access tokens server-side, reads profile state through RLS, supports safe draft technician profile creation, and returns typed trusted-mutation errors for company creation and onboarding completion until reviewed RPC/server-only transaction paths exist.
- Task 75 implementation notes in `docs/ONBOARDING_SERVER_ACTIONS_IMPLEMENTATION_TASK75.md`.
- Task 76 trusted onboarding RPC notes in `docs/ONBOARDING_TRUSTED_RPC_TASK76.md`.
- Task 77 onboarding UI notes in `docs/ONBOARDING_UI_IMPLEMENTATION_TASK77.md`.
- Task 78 protected dashboard routing notes in `docs/PROTECTED_DASHBOARD_ROUTING_TASK78.md`.
- Task 79 auth/onboarding runtime test notes in `docs/AUTH_ONBOARDING_RUNTIME_TEST_TASK79.md`.
- Task 80 real dashboard identity notes in `docs/REAL_DASHBOARD_IDENTITY_TASK80.md`.
- Task 81 role-aware dashboard navigation notes in `docs/ROLE_AWARE_DASHBOARD_NAV_TASK81.md`.
- Task 82 real technician profile notes in `docs/REAL_TECHNICIAN_PROFILE_TASK82.md`.
- Task 83 technician profile update notes in `docs/TECHNICIAN_PROFILE_UPDATE_TASK83.md`.
- Task 83 apply-ready dev/staging migration `supabase/migrations/0013_technician_profile_safe_update_rpc_apply_ready.sql`, which adds `public.update_own_technician_profile_rpc(...)` for self-owned editable technician profile fields. Codex did not apply it; existing profile saves require manual dev/staging application.
- Task 84 onboarding loop fix notes in `docs/ONBOARDING_LOOP_FIX_TASK84.md`.
- Task 84 apply-ready dev/staging migration `supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql`, which adds `public.upsert_own_technician_profile_rpc(...)` for safe self-owned technician profile draft creation/update. Codex did not apply it; technician onboarding profile creation requires manual dev/staging application.
- Task 85 dashboard auth mismatch fix notes in `docs/DASHBOARD_AUTH_MISMATCH_FIX_TASK85.md`.
- Task 86 safety backup and auth/onboarding regression checklist in `docs/BACKUP_TASK86.md` and `docs/AUTH_ONBOARDING_REGRESSION_CHECKLIST_TASK86.md`. Dashboard auth diagnostics now mirror the enforced `evaluateDashboardAccess()` decision, and `/dashboard/dev/supabase-check` shows real `/dashboard` plus `/dashboard/technician-profile` guard outcomes separately from the dev-route bypass.
- Task 87 public technician profile foundation notes in `docs/BACKUP_TASK87.md` and `docs/PUBLIC_TECHNICIAN_PROFILE_FOUNDATION_TASK87.md`.
- Task 87 apply-ready dev/staging migration `supabase/migrations/0015_public_technician_profiles_view_apply_ready.sql`, which creates a sanitized anonymous-readable `public.public_technician_profiles` view. Codex did not apply it; real public Supabase-backed technician profiles require manual dev/staging application and verification.
- Task 88/89 application status in `docs/PUBLIC_TECHNICIAN_PROFILE_APPLICATION_TASK88.md`. The user manually applied `0015` and `0016`; the sanitized public view now returns the dev public technician row with slug `refrigerator-houston-repair-8166b185`, while raw `technician_profiles` remains anonymous-protected.
- Task 89 dev public-ready technician profile SQL at `supabase/migrations/0016_dev_public_ready_technician_profile_apply_ready.sql`. It was manually applied by the user in dev/staging and produced the public slug `refrigerator-houston-repair-8166b185`.
- Task 90 technician profile request service flow. `/technicians/[slug]` links to `/schedule-service?technician=<slug>`, and `/schedule-service` resolves that slug through the sanitized public technician loader before rendering selected technician context.
- Task 91 service request persistence foundation. `supabase/migrations/0017_service_requests_foundation_apply_ready.sql` creates a narrow public-insert/private-read `service_requests` table, and `/schedule-service` posts to `/api/service-requests`. Codex did not apply SQL; use Supabase SQL Editor in dev/staging before expecting real saves.
- Task 92 real service requests dashboard inbox. `supabase/migrations/0018_service_requests_dashboard_read_policies_apply_ready.sql` grants narrow authenticated reads for admins and requests selected for the user's own public technician slug. `/dashboard/leads` and `/dashboard/leads/[id]` now load real service requests through RLS after manual policy application.
- Task 93 dashboard CRM navigation integration. Use `frontend/src/config/dashboard-navigation.ts` for dashboard nav changes; Leads is now a real CRM item for technician-capable roles, Technician Profile is real account/profile management, and incomplete operations remain labeled as preview/soon.
- Task 94 service request status updates. `supabase/migrations/0019_service_request_status_update_policies_apply_ready.sql` adds the narrow `update_service_request_status_rpc` mutation, and `/dashboard/leads/[id]` calls `/api/service-requests/[id]/status` to update only `status` and `updated_at`. Apply `0019` in dev/staging before expecting status saves to work.
- Task 95 internal notes/timeline foundation. `supabase/migrations/0020_service_request_notes_foundation_apply_ready.sql` adds dashboard-only `service_request_notes`, `add_service_request_note_rpc`, and status-change timeline entries. `/dashboard/leads/[id]` includes quick notes and a service timeline after manual SQL application.
- Task 96 service request photo uploads. `supabase/migrations/0021_service_request_photos_foundation_apply_ready.sql` creates the private `service-request-photos` bucket configuration, `service_request_photos` metadata, storage/object policies, and `add_service_request_photo_rpc`. `/schedule-service` can attach customer photos after creating a request, and `/dashboard/leads/[id]` can upload technician photos and render signed URL galleries/timeline entries after manual SQL/storage application.
- Task 96B verification. Customer photo request creation/storage/metadata insert works after manual `0021` application. Apply `supabase/migrations/0022_patch_service_request_photos_anon_select_revoke_apply_ready.sql` to revoke anonymous SELECT on photo metadata while preserving anonymous INSERT for customer uploads.
- Task 97 estimate foundation. `supabase/migrations/0023_pricing_catalog_and_estimates_foundation_apply_ready.sql` creates `pricing_catalog_items`, `service_request_estimates`, `service_request_estimate_items`, seed catalog data, and `create_service_request_estimate_rpc`. `/dashboard/leads/[id]` now reads catalog/estimate data and can create draft estimates through `/api/service-requests/[id]/estimates` after manual SQL application.
- Task 98 estimate UX v2. `supabase/migrations/0024_estimate_ux_v2_fields_apply_ready.sql` extends catalog/estimate rows with customer price, internal technician cost, taxability, warranty/disclaimer text, sort order, estimate numbers, and customer preview notes. `/dashboard/leads/[id]` now filters catalog items by appliance type and renders a customer-facing preview without exposing technician cost.
- Task 101 customer estimate approval flow. `supabase/migrations/0026_estimate_customer_approval_flow_apply_ready.sql` adds hashed approval tokens and public token RPCs. `/dashboard/leads/[id]` can send draft estimates and `/estimates/[token]` supports public approve/decline responses after manual dev/staging SQL application.
- Task 101.1 customer approval checkpoint. The user manually applied `0025`, `0026`, and `0027` in dev/staging. Browser QA passed for draft estimate creation, edit draft, Send To Customer, approval link generation, public customer page, approve flow, decline flow, status persistence after refresh, and read-only approved estimates.
- Task 100 estimate lifecycle refactor. `supabase/migrations/0025_estimate_lifecycle_rpc_apply_ready.sql` adds draft-only `update_service_request_estimate_draft_rpc` and `void_service_request_estimate_draft_rpc`. `/dashboard/leads/[id]` now supports create mode, editing draft `EST-*`, read-only viewing for saved estimates, draft voiding, and active-draft duplicate prevention. The user manually applied `0025` in dev/staging and verified update/void lifecycle behavior.
- Task 102 invoice foundation. `supabase/migrations/0028_invoice_foundation_apply_ready.sql` adds `service_request_invoices`, `service_request_invoice_items`, and narrow RPCs for creating invoices from approved estimates, manually marking invoices sent/paid/void, and marking the service request completed when an invoice is paid. `/dashboard/leads/[id]` now has invoice actions, and Task 102.2 checkpoints browser QA passing for invoice creation, viewing, send/paid/void actions, refresh persistence, and the collapsed financial document list UX.
- Task 103 address intelligence foundation. `supabase/migrations/0029_service_request_address_intelligence_apply_ready.sql` adds structured service request address fields, optional coordinates, provider place ID storage, and a narrow `update_service_request_address_rpc(...)`. `/dashboard/leads/[id]` now includes a compact Service Address card, manual address editing, Google Maps and Apple Maps actions, and an address autocomplete adapter foundation. Codex did not apply SQL.
- Task 103.2 Google Places address autocomplete. `frontend/src/lib/address-autocomplete.ts` now uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for browser-safe Google Places suggestions and place details, while keeping manual entry as the fallback. `/dashboard/leads/[id]` fills street/city/state/ZIP/country plus latitude/longitude/place ID after selecting a suggestion.
- Task 104 integration layer architecture in `docs/INTEGRATION_LAYER_ARCHITECTURE.md`. It defines provider-neutral Calendar, Communication, Maps, Analytics, and Payment provider boundaries, future integration table sketches, sync/webhook/error patterns, and AI Dispatcher integration points. It is documentation only; no schema, API, UI, provider, package, Supabase, or frontend behavior changes were made.
- Task 105 integration layer code skeleton in `frontend/src/lib/integrations/`. It adds provider-neutral TypeScript contracts, noop providers, and a registry/factory that returns noop adapters only. It is safe to import but does not read env vars, connect to providers, create schemas, change APIs, or alter UI behavior.
- Task 106 calendar availability domain model in `frontend/src/lib/integrations/scheduling/`. It adds pure TypeScript types and utilities for technician work blocks, busy blocks, travel buffers, availability slot generation, overlap detection, and block merging. It does not connect to Google Calendar, provider APIs, Supabase, API routes, UI, env vars, or packages.
- Task 107 global availability engine in `frontend/src/lib/integrations/scheduling/availability-engine.ts`. It filters technician profiles by requested ZIP, generates availability slots from provider-free work/busy blocks, and ranks candidates deterministically by earliest slot, conflict count, and stable technician ID. It does not use maps, AI scoring, calendar providers, Supabase, API routes, UI, env vars, or packages.
- Task 108 scheduling engine diagnostics at `/dashboard/dev/scheduling-engine`. The page uses static mock technicians and scenarios to visualize `generateAvailabilityResponse()` results for multiple-tech, single-tech, and no-tech ZIP matching. It is internal/dev-only and does not connect to Supabase, CRM appointments, Google Calendar, Google Maps, providers, APIs, or customer-facing booking UI.
- Task 109 company scheduling configuration domain in `frontend/src/lib/integrations/scheduling/company-config.ts`. It defines provider-neutral company business hours, service areas, appointment defaults, same-day/next-day scheduling rules, emergency rules, default config helpers, and validation helpers. It does not persist settings, read Supabase, call APIs, change UI, or connect to providers.
- Task 110 company-config-driven availability in `frontend/src/lib/integrations/scheduling/company-availability.ts`. It turns provider-neutral company scheduling policy into availability engine requests, applies allowed/primary/secondary ZIP rules, checks working days, same-day cutoff, next-day permission, and maximum horizon, and returns validation errors with empty availability instead of throwing. It remains pure TypeScript with no Supabase/API/UI/provider wiring.
- Task 111 company scheduling config diagnostics on `/dashboard/dev/scheduling-engine`. The existing dev page now keeps the original provider-free engine scenarios and adds static company-policy scenarios for normal supported ZIP, same-day cutoff blocked, unsupported ZIP, and weekend blocked cases. It shows business hours, appointment defaults, same-day/date/service-area results, validation errors, and ranked availability candidates without Supabase/API/provider/customer-facing behavior.
- Task 112 dispatcher recommendation engine in `frontend/src/lib/integrations/scheduling/dispatcher-recommendations.ts`. It converts provider-free availability candidates into customer-friendly best/backup recommendations with service-window labels, technician labels, conflict counts, and deterministic reason codes. `/dashboard/dev/scheduling-engine` now includes an internal static recommendation preview. It does not call AI, maps, calendars, SMS, APIs, Supabase, or providers.
- Task 113 dispatcher recommendation dev scenarios in `frontend/src/lib/integrations/scheduling/dev-scenarios.ts` and `/dashboard/dev/scheduling-engine`. Static diagnostics now cover same-day, next-day, morning preference, afternoon preference, emergency, unsupported ZIP, and no-slot cases with best/backup recommendation display and validation/empty states. It remains internal-only and provider-free.
- Task 114 dispatcher response builder in `frontend/src/lib/integrations/scheduling/dispatcher-response-builder.ts`. It converts dispatcher recommendation responses into deterministic, customer-safe draft wording, backup wording, no-availability wording, internal summaries, and reason codes for future call/SMS/CRM usage. `/dashboard/dev/scheduling-engine` now previews the response draft from static scenarios. It does not book appointments, send messages, call AI, call providers, read Supabase, change APIs, or expose customer-facing UI.
- Task 115 scheduling request intake model in `frontend/src/lib/integrations/scheduling/scheduling-intake.ts`. It normalizes and validates provider-free customer, service, location, preference, and request-source data before availability, recommendation, and response-builder layers. `/dashboard/dev/scheduling-engine` now includes an internal static intake normalization preview. It does not store data, call providers, read Supabase, change APIs, send messages, or create bookings.
- Task 116 scheduling orchestrator pipeline in `frontend/src/lib/integrations/scheduling/scheduling-orchestrator.ts`. It runs raw intake through normalization, intake validation, company config validation, company availability, dispatcher recommendations, and safe response draft generation with status/step/error reporting. `/dashboard/dev/scheduling-engine` now includes an internal static orchestrator preview. It does not store data, call providers, read Supabase, change APIs, send messages, or create bookings.
- Task 117 scheduling orchestrator dev scenarios in `frontend/src/lib/integrations/scheduling/dev-scenarios.ts` and `/dashboard/dev/scheduling-engine`. Static full-pipeline scenarios now cover valid phone same-day intake, website next-day intake, morning/afternoon preference, emergency requests, unsupported ZIPs, missing ZIP validation failure, missing service info, no available slots, and weekend company-rule behavior. The page remains internal-only and provider-free.
- Task 118 scheduling pipeline stabilization audit. Static scheduling diagnostics data now lives in `frontend/src/lib/integrations/scheduling/dev-scenarios.ts`, the diagnostics page is mostly rendering/pipeline wiring, and `docs/SCHEDULING_PIPELINE_FOUNDATION.md` documents the module map, provider-free boundaries, status model, diagnostics coverage, intentionally missing work, and next safe steps before persistence or provider integration.
- Task 119 read-only CRM dispatcher preview. `frontend/src/lib/integrations/scheduling/service-request-adapter.ts` adapts a loaded `DashboardServiceRequest` into scheduling intake and provides temporary static company/technician scheduling inputs. `/dashboard/leads/[id]` now shows an internal dispatcher preview with normalized request data, orchestrator status, best/backup recommendation summaries, safe response draft, and warnings/errors. It does not persist output, create appointments, book slots, call providers, or send messages.
- Real onboarding UI at `/onboarding`. It calls the Task 75/76 server actions with the current Supabase session token and supports customer, independent technician, and company owner setup paths in dev/staging.
- Review-only marketplace core migration draft at `supabase/migrations/0002_real_marketplace_core_draft.sql` for `service_requests`, `leads`, `jobs`, and `repair_cases`. It has not been applied and does not contain final RLS policies.
- RLS and permission architecture planning in `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md`.
- API and backend service architecture planning in `docs/API_BACKEND_SERVICE_ARCHITECTURE_PLAN.md`.
- Supabase setup guide in `docs/SUPABASE_SETUP_GUIDE.md` for creating a project, configuring local frontend env vars, reviewing/applying the first migration safely, and checking profile row creation.
- Owner/admin promotion guide in `docs/OWNER_ADMIN_PROMOTION_GUIDE.md` for safely promoting one known owner/developer account by email in Supabase SQL Editor. Use `company_owner` with `active` status for routine development and reserve `admin` for short admin-specific testing.
- Auth middleware and safe redirect strategy planning in `docs/AUTH_MIDDLEWARE_PLAN.md`. It defines public routes, dashboard route groups, profile/status handling, redirect targets, dev helper treatment, phased enforcement, and rollback guidance.
- Supabase client foundation in `frontend/src/lib/supabase` with defensive public env handling. It supports real auth/profile reads without service-role credentials.
- Auth readiness helpers in `frontend/src/lib/auth` with roles, permission helpers, null-safe session snapshots, and centralized dashboard access decisions.
- Public auth UI at `/login` and `/signup`. These pages defensively call Supabase Auth when env vars are configured and preserve `/login?next=...` dashboard redirects.
- Dashboard auth-awareness in the dashboard topbar. Normal dashboard pages are now wrapped by `DashboardAuthGate`, so logged-out, missing-profile, inactive, incomplete-onboarding, and role-blocked states redirect before dashboard content renders.
- Auth QA visibility appears on login/signup and dashboard surfaces. Login redirects to `/dashboard` after success, logout controls are available in auth status panels, profile reads have timeout messaging, and production-mode mobile local-network testing is documented in `docs/SUPABASE_SETUP_GUIDE.md`.
- Login/signup and dashboard auth status are cleaned up for normal use. The Supabase browser client uses default browser storage when available, a complete memory storage fallback only when localStorage access fails, and login forces a fresh session check before redirecting to `/dashboard`.
- Draft Supabase profiles/roles migration at `supabase/migrations/0001_profiles_roles.sql`. It has not been applied and must be reviewed before use.
- Frontend profile role/status readiness in `frontend/src/lib/auth/profile.ts` and typed `public.profiles` placeholders in `frontend/src/lib/supabase/types.ts`. These helpers are fallback-safe and are not wired into route protection or mock workflows yet.
- Local Supabase verification helper at `/dashboard/dev/supabase-check`. It checks public env readiness, browser client initialization, auth session state, and the current user's profile row after the first migration is manually applied. It is not linked in navigation and is not production admin tooling.
- Public technician profile routes now use `frontend/src/lib/public-technician-profiles.ts`. That loader must keep reading only the sanitized `public_technician_profiles` view and must not query raw `technician_profiles` for public pages.
- Dashboard auth badge role/status display reads the authenticated user's `public.profiles` row when available and mirrors the active dashboard guard state.
- Dashboard navigation now filters sidebar/mobile links by real profile role/status/onboarding state through `frontend/src/config/dashboard-navigation.ts` and `frontend/src/components/dashboard/DashboardNavigationLinks.tsx`.
- Route protection helpers in `frontend/src/lib/auth/permissions.ts` and `frontend/src/lib/auth/dashboard-access.ts` support typed checks for authenticated sessions, profile presence, active profile status, onboarding completion, role membership, and dashboard access eligibility.
- Dashboard auth diagnostics use `frontend/src/lib/auth/dashboard-access.ts` so the visible auth panel mirrors the same decision path used by `DashboardAuthGate`. The legacy dry-run helper in `frontend/src/lib/auth/access-decisions.ts` should not be used as the source of truth for enforced dashboard routing.
- Task 79 verified logged-out `/dashboard` and `/dashboard/open-jobs` redirects, the `/dashboard/dev/supabase-check` exception, unsafe `next` URL containment, and `localhost:3002` / `10.0.0.67:3002` login route availability. Seeded account tests for completed/incomplete onboarding, customer role blocking, and pending/suspended/rejected profile states remain pending.


## Estimate MVP Completed

The estimate workflow is now a real CRM MVP and is checkpointed in `docs/ESTIMATE_MVP_CHECKPOINT.md`.

Current behavior:

- `/dashboard/leads/[id]` loads pricing catalog items and saved estimates.
- Technicians create draft estimates from appliance-specific catalog jobs plus an optional custom line item.
- The customer preview shows customer-facing line items, total, warranty, and disclaimer text while keeping technician cost internal.
- Saved Estimates is the persisted document list and single source of truth.
- `View` expands a saved estimate inline; it does not create a duplicate display panel.
- `Edit Draft` loads a draft back into the builder and saves through `Update Draft` without creating a duplicate estimate number.
- `Void Draft` marks a draft as read-only history.
- `Send To Customer` creates a tokenized approval link for a draft estimate after `0026` and `0027` are applied.
- Sent, approved, declined, and void estimates are read-only in the dashboard.
- Approved estimates can become invoice snapshots through the Task 102 invoice foundation.
- Invoices are separate documents with `draft`, `sent`, `paid`, and `void` states.
- Task 102.2 browser QA passed for invoice creation from an approved estimate, invoice viewing, manual send, mark paid, void, refresh persistence, and the cleaned estimate/invoice document list presentation.

Implementation references:

- UI: `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- API: `frontend/src/app/api/service-requests/[id]/estimates/route.ts`
- Invoice APIs: `frontend/src/app/api/estimates/[id]/invoice/route.ts` and `frontend/src/app/api/invoices/[id]/route.ts`
- Types: `frontend/src/lib/supabase/types.ts`
- Migrations: `supabase/migrations/0023_pricing_catalog_and_estimates_foundation_apply_ready.sql`, `0024_estimate_ux_v2_fields_apply_ready.sql`, `0025_estimate_lifecycle_rpc_apply_ready.sql`, and `0026_estimate_customer_approval_flow_apply_ready.sql`
- Token-generation patch: `supabase/migrations/0027_estimate_token_generation_fix_apply_ready.sql`
- Invoice migration: `supabase/migrations/0028_invoice_foundation_apply_ready.sql`

Do not start payment, PDF, SMS, or email work without preserving the draft-only estimate mutation boundary, the token-specific public approval model, and invoice snapshot immutability. The next recommended phase is customer-facing invoice delivery/approval planning or payment planning; do not add Stripe or payment collection until invoice security and customer-visible invoice boundaries are explicitly designed.

## What to build next

Recommended next steps:

1. Use `docs/BACKEND_ARCHITECTURE_PLAN.md`, `docs/AUTH_ROLES_PLAN.md`, `docs/SUPABASE_DATA_MODEL_PLAN.md`, `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md`, and `docs/API_BACKEND_SERVICE_ARCHITECTURE_PLAN.md` to guide Supabase schema, auth, RLS, dispatch locking, community persistence, analytics, Stripe, and AI/RAG implementation.
2. Follow `docs/SUPABASE_SETUP_GUIDE.md` before creating a Supabase project, configuring `frontend/.env.local`, or manually applying the first profiles/roles migration.
3. Follow `docs/OWNER_ADMIN_PROMOTION_GUIDE.md` before manually promoting the owner/developer account. Do not add owner/admin promotion to public signup.
4. Use `docs/PROTECTED_DASHBOARD_ROUTING_TASK78.md` and `docs/AUTH_MIDDLEWARE_PLAN.md` before adding middleware/SSR cookie enforcement or role-aware navigation hiding.
5. Read `docs/RLS_HELPER_FUNCTIONS_PLAN.md` and review `supabase/migrations/0005_rls_helpers_draft.sql` before writing final table policies. Test helper recursion, grants, `SECURITY DEFINER` ownership, anonymous behavior, suspended/archived membership, multi-company membership, admin override, and public/private technician visibility before applying.
6. Review `supabase/migrations/0006_onboarding_rls_policies_draft.sql` before applying onboarding table policies. Confirm grants, helper recursion, invite token privacy, audit log server-only access, column-protection strategy, and access tests before using it in a database.
7. Use `docs/MIGRATION_APPLICATION_READINESS_CHECKLIST.md` before applying any onboarding, audit, RLS helper, or table-policy migration. Confirm order, dependencies, backup/export, rollback, staging, seed fixtures, positive/negative/cross-company tests, mobile auth regression, and go/no-go criteria.
8. Read `docs/MIGRATION_APPLICATION_BLOCKERS_TASK68.md` before attempting migration application again. Harden `0003`-`0006`, resolve checklist blockers, confirm target environment/backup/rollback, and prepare test fixtures before any SQL execution.
9. Review `docs/MIGRATION_APPLICATION_RESULT_TASK72.md`, `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md`, `docs/RLS_PATCH_RESULT_TASK74.md`, `docs/ONBOARDING_SERVER_ACTIONS_IMPLEMENTATION_TASK75.md`, and `docs/PROTECTED_DASHBOARD_ROUTING_TASK78.md` before expanding onboarding server actions or UI. The dev/staging onboarding/audit/RLS foundation and Task 74 patch are applied, but seeded authenticated verification, catalog verification, and audit insert paths are still not complete.
10. Use `docs/AUTH_ONBOARDING_RUNTIME_TEST_TASK79.md` before changing dashboard route protection. It records which browser checks passed and which seeded role/status account tests still need to be run.
11. Use `docs/AUTH_ONBOARDING_REGRESSION_CHECKLIST_TASK86.md` before modifying auth, onboarding, dashboard gating, profile loading, or technician profile RPC wiring. Keep `DashboardAuthGate`, `DashboardAuthStatus`, and `/dashboard/dev/supabase-check` aligned on `evaluateDashboardAccess()`.
12. Review `docs/PUBLIC_TECHNICIAN_PROFILE_FOUNDATION_TASK87.md` and `supabase/migrations/0015_public_technician_profiles_view_apply_ready.sql` before enabling real public technician profiles from Supabase. Verify anonymous access to the sanitized view and no anonymous access to raw `technician_profiles`.
13. Use `docs/PUBLIC_TECHNICIAN_PROFILE_APPLICATION_TASK88.md` for the current public profile application state and `supabase/migrations/0016_dev_public_ready_technician_profile_apply_ready.sql` to seed one safe public-ready dev technician profile manually.
14. Apply `supabase/migrations/0017_service_requests_foundation_apply_ready.sql` in dev/staging before QA for real `/schedule-service` saves. The public API route fails with a clear storage-not-ready message until the table exists.
15. Apply `supabase/migrations/0018_service_requests_dashboard_read_policies_apply_ready.sql` in dev/staging before QA for real `/dashboard/leads` reads. The dashboard shows an access/setup message until RLS permits the current account.
16. Apply `supabase/migrations/0019_service_request_status_update_policies_apply_ready.sql` in dev/staging before QA for CRM status updates. The detail page reports that status updates are not ready until the RPC exists.
17. Apply `supabase/migrations/0020_service_request_notes_foundation_apply_ready.sql` in dev/staging before QA for internal notes and timeline history. The detail page reports that notes are not ready until the table/RPC exist.
18. Apply `supabase/migrations/0029_service_request_address_intelligence_apply_ready.sql` in dev/staging before QA for structured address edits. The detail page reports that address updates are not ready until the RPC exists.
19. Confirm `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is present in `frontend/.env.local` before QA for Google Places autocomplete. If the key is missing or blocked, address entry intentionally falls back to manual fields.
20. Read `docs/INTEGRATION_LAYER_ARCHITECTURE.md` before connecting any external provider. Keep provider adapters server-side where secrets are involved, preserve internal records as the source of truth, and do not add integration tables, webhooks, token storage, or real provider calls until a focused implementation task reviews SQL/RLS and secret handling.
21. Use `frontend/src/lib/integrations/` for future provider adapters. The current registry always returns noop providers; real Calendar, Communication, Maps, Analytics, Payment, or Automation integrations must be introduced by focused tasks with reviewed secrets, RLS, webhooks, and failure handling.
22. Use `frontend/src/lib/integrations/scheduling/` for internal availability math before adding provider sync. Future Google Calendar events, CRM appointments, and AI Dispatcher scheduling proposals should be normalized into these provider-free types before generating slots.
23. Use `generateAvailabilityResponse()` for future provider-free multi-technician appointment suggestions. It only applies ZIP service-area filtering and deterministic slot ranking today; drive-time, maps, calendar sync, capacity scoring, and AI Dispatcher ranking should be added in focused future tasks.
24. Use `/dashboard/dev/scheduling-engine` to manually inspect static scheduling scenarios when changing the provider-free availability engine. Do not expose it in public navigation or use it as a production booking surface.
25. Use `createDefaultSchedulingConfig()` and `validateSchedulingConfig()` before future tasks persist company scheduling policies or feed AI Dispatcher booking logic. The current config model is provider-neutral and not connected to Supabase or UI.
26. Use `buildAvailabilityRequestFromCompanyConfig()` or `generateCompanyAvailabilityResponse()` when future flows need company policy to drive provider-free scheduling. Invalid config should stay non-throwing and return validation errors until a reviewed UI/API decides how to display them.
27. Use the company diagnostics section on `/dashboard/dev/scheduling-engine` to verify static business-hours, same-day cutoff, service-area, weekend, and availability-candidate behavior before wiring persisted company scheduling settings.
28. Use `generateDispatcherRecommendationResponse()` to turn raw availability into rule-based dispatcher suggestions for future AI Dispatcher scripts, SMS/call wording, CRM booking, and calendar confirmation. Do not add AI scoring, maps routing, provider calls, or customer-facing booking behavior without a focused future task.
29. Use dispatcher scenarios on `/dashboard/dev/scheduling-engine` before changing recommendation ranking or copy labels. The current scenario set covers same-day, next-day, preferred morning, preferred afternoon, emergency, unsupported ZIP, and no-slot behavior.
30. Use `buildDispatcherSchedulingResponse()` when future AI Dispatcher, SMS, call, or CRM flows need customer-safe scheduling language. The current output is draft-only: it never says an appointment is booked, never confirms a technician, never promises exact arrival, and never sends messages.
31. Use `normalizeSchedulingIntake()` and `validateSchedulingIntake()` before future AI Dispatcher, phone, SMS, website, or admin scheduling inputs are passed into availability matching. The intake model is defensive, storage-free, provider-free, and returns errors/warnings instead of throwing during normal use.
32. Use `runSchedulingOrchestrator()` when a future flow needs the complete provider-free scheduling path from raw intake to availability, recommendation, and safe response draft. It reports completed/failed/skipped steps and should remain non-booking until a focused CRM/calendar task adds persistence.
33. Use the full-pipeline orchestrator scenarios on `/dashboard/dev/scheduling-engine` before changing scheduling intake, company policy, recommendation ranking, or response text. The current scenarios cover success, partial warning, no availability, and validation-failed outcomes.
34. Read `docs/SCHEDULING_PIPELINE_FOUNDATION.md` before creating scheduling tables, CRM appointments, calendar provider adapters, maps/travel logic, AI Dispatcher provider calls, SMS/call delivery, webhooks, or customer-facing booking UI.
35. Keep the dispatcher preview on `/dashboard/leads/[id]` read-only until reviewed scheduling tables and appointment semantics exist. Static fallback technicians/config in `service-request-adapter.ts` must be replaced with persisted, RLS-protected data before any real booking action is added.
14. Read `docs/AUDIT_LOG_PLAN.md` and review `supabase/migrations/0004_audit_log_foundation_draft.sql` before implementing privileged onboarding/company/admin mutations. Design the trusted insert path, metadata sanitizer, admin read model, append-only tests, and retention policy before applying.
15. Read `docs/ONBOARDING_FLOW_PLAN.md`, `docs/ONBOARDING_RLS_POLICY_PLAN.md`, and `docs/ONBOARDING_SERVER_ACTIONS_PLAN.md`, then review `supabase/migrations/0003_onboarding_foundation_draft.sql` and design executable helper functions, table-specific RLS policies, audited server mutations, invite-token validation, rollback, and migration testing before creating onboarding UI or enforcing route redirects.
16. Review `supabase/migrations/0002_real_marketplace_core_draft.sql` and design table-specific RLS policies for service requests, leads, jobs, and repair cases before applying any marketplace schema.
17. Convert public intake and dashboard lead workflows into validated server-side mutations.
18. Add real repair case persistence, uploads, and draft/edit states.
19. Add dispatch locking for open jobs before any live technician claiming.
20. Add private technician community persistence, moderation, and permission checks.
21. Add AI/translation boundaries server-side only, with manual review before publishing or indexing.

## Backend planning reference

Read `docs/BACKEND_ARCHITECTURE_PLAN.md` before starting backend work. It defines:

- Planned user roles: customer, technician, expert technician, company owner, and admin.
- Data boundaries for public SEO, customer leads, technician profiles, private CRM, technician community, AI/RAG knowledge, and billing.
- Proposed Supabase/Postgres tables and ownership/visibility models.
- RLS expectations for customers, technicians, company owners, admins, open jobs, and private community data.
- Dispatch/open job locking plan.
- Future community, analytics, Stripe, and AI/RAG implementation phases.

## Auth planning reference

Read `docs/AUTH_ROLES_PLAN.md` before starting auth work. It defines:

- Planned app roles: public visitor, customer, technician, verified technician, expert technician, company owner, and admin.
- Route/feature access expectations for public marketplace, dashboard CRM, open jobs, repair cases, analytics, and private community routes.
- Technician signup, onboarding, and verification flow.
- Route protection strategy for dashboard, community, open jobs, company/team, and admin surfaces.
- RLS role mapping and navigation visibility expectations.

## Supabase data model reference

Read `docs/SUPABASE_DATA_MODEL_PLAN.md` before creating tables, migrations, storage policies, or RLS policies. It defines:

- Core planned tables for profiles, companies, customers, service requests, leads, jobs, open jobs, repair cases, repair photos, community, reputation, public profiles, and audit logs.
- Ownership, visibility, indexes, and RLS notes for each table.
- Separation between public SEO content, private customer data, technician dashboard data, company/team data, community knowledge data, and admin/audit data.
- Phased persistence order from auth profiles through leads, jobs, repair cases, community, reputation, and payments later.

## Real marketplace data model reference

Read `docs/REAL_DATA_MODEL_PLAN.md` before creating migrations for live marketplace or CRM persistence. It defines:

- Core entities for `service_requests`, `leads`, `jobs`, `job_assignments`, `repair_cases`, `repair_case_photos`, `repair_case_notes`, `technician_profiles`, `companies`, `pricing_rules`, `service_areas`, and `ai_article_drafts`.
- Customer address handling fields and staged visibility rules before and after technician acceptance.
- Marketplace workflow from public intake to service call estimate, open job, assignment, full customer detail unlock, repair case, and AI article draft.
- Flexible service call pricing for standard appliance repair, built-in refrigeration, commercial work, emergency/after-hours, travel surcharge, and company overrides.
- Repair case fields for symptoms, diagnosis, root cause, parts, labor, private notes, customer-safe notes, AI-ready notes, voice transcription, and SEO support.
- Ownership and RLS expectations for customers, technicians, company owners, admins, and open marketplace previews.
- A phased migration rollout: Phase 1 service requests/leads/jobs/repair cases, Phase 2 assignments/pricing/companies/open jobs, Phase 3 photos/notes/voice/scheduling/AI drafts.
- Future-proofing guidance for HVAC, plumbing, electrical, smart home, locksmith, emergency dispatch, and contractor teams.

## Onboarding planning reference

Read `docs/ONBOARDING_FLOW_PLAN.md` before creating onboarding UI, onboarding migrations, company/team tables, technician verification flows, invite flows, join request flows, or post-login redirect logic. It defines:

- Current Supabase Auth/profile state and limitations.
- Target onboarding goals for customer, technician, company owner, and admin account types.
- Company owner flow for company creation, owner-company link, and owner permissions.
- Technician onboarding for independent technicians, company invites, and company join requests.
- Customer onboarding with quick request creation and optional account creation.
- Required onboarding tables: `profiles`, `companies`, `company_members`, `technician_profiles`, `company_invites`, and `company_join_requests`.
- Required statuses for onboarding, membership, invites, and technician verification.
- RLS implications, redirect rules, MVP phases, and security risks.

Review `supabase/migrations/0003_onboarding_foundation_draft.sql` before applying or replacing onboarding schema work. It currently drafts:

- `profiles.onboarding_status` and `profiles.onboarding_completed_at`.
- `companies` for owner-scoped company/team accounts.
- `company_members` for company-scoped owner/manager/dispatcher/technician membership.
- `technician_profiles` for private technician onboarding, independent/company affiliation, verification, marketplace eligibility, service ZIPs, and specialties.
- `company_invites` with hashed invite token storage only, token hash algorithm labeling, expiry/accept/revoke/decline lifecycle fields, and pending-email uniqueness.
- `company_join_requests` for technician-to-company join requests, review/cancel/expire/archive lifecycle fields, and pending-request uniqueness.
- Draft indexes, timestamps, safer foreign-key behavior, soft-archive fields, RLS enablement, and RLS TODO comments.

It is review-only and has not been applied. Add audited server-side flows, final RLS policies, token validation, rollback planning, and migration tests before using it in production.

Read `docs/ONBOARDING_RLS_POLICY_PLAN.md` before writing onboarding RLS helper functions or policies. It defines:

- Access rules for `profiles` onboarding fields, `companies`, `company_members`, `technician_profiles`, `company_invites`, and `company_join_requests`.
- Role expectations for customers, technicians, company owners, admins, unauthenticated visitors, and future server actions.
- Server-only, admin-only, and never-client-writable fields.
- Abuse scenarios for role escalation, unauthorized company joins, expired invites, raw token exposure, suspended-member access, and cross-company leakage.
- Positive, negative, onboarding, invite, join request, and cross-company isolation test cases.

It is policy planning only. Do not treat it as executable SQL.

Read `docs/ONBOARDING_SERVER_ACTIONS_PLAN.md` before implementing onboarding mutations. It defines:

- Planned actions: `createCompanyAndOwnerMembership`, `createCompanyInvite`, `acceptCompanyInvite`, `requestToJoinCompany`, `approveJoinRequest`, `rejectJoinRequest`, `updateTechnicianProfile`, `verifyTechnicianProfile`, `completeOnboarding`, and `archiveCompanyMember`.
- Required auth/session checks, input validation, database writes, transaction boundaries, audit needs, abuse prevention, and RLS expectations.
- Suggested future file/folder structure for Server Actions, API routes, validation, invite tokens, audit helpers, and server-only Supabase access.
- Service-role rules, invite token hashing approach, cross-company isolation notes, and testing checklist.

It is planning only. Do not treat it as implementation code or permission to use service-role access in browser code.

## Audit logging planning reference

Read `docs/AUDIT_LOG_PLAN.md` before implementing sensitive onboarding, company, membership, invite, join request, technician verification, onboarding completion, or admin override mutations. It defines:

- Required event types for company, membership, invite, join request, technician verification, onboarding completion, and admin override actions.
- Minimum safe metadata and fields that should never be stored in audit metadata.
- Append-only audit behavior, admin/server-only raw log access, and future redacted summary-view considerations.
- Abuse and support scenarios the audit trail should help investigate.
- Recommended tests for insert paths, read restrictions, append-only behavior, and metadata sanitization.

Review `supabase/migrations/0004_audit_log_foundation_draft.sql` before applying or replacing audit schema work. It currently drafts:

- `public.audit_event_type`.
- `public.audit_logs` with actor, target, company, related entity, action source, severity, sanitized metadata, IP/user-agent, request id, and timestamp fields.
- Indexes for actor, target, company, event type, related entity, request id, and date lookups.
- An append-only update/delete prevention trigger.
- RLS enablement and narrow baseline grants with TODO comments for final server/admin policies.

It is review-only and has not been applied. Add final RLS policies, trusted server insert helpers, metadata validation, retention rules, admin read tooling, and tests before using it in production.

## RLS helper function planning reference

Read `docs/RLS_HELPER_FUNCTIONS_PLAN.md` before writing reusable database predicates or final table policies. It defines:

- Planned helper functions for current user id, current profile role, admin status, active company ownership/membership, company management, company viewing, company member management, private technician profile access, technician profile management, and public technician visibility.
- `SECURITY DEFINER` vs `SECURITY INVOKER` recommendations, `search_path` safety notes, expected return types, policy usage, abuse cases prevented, and limitations.
- Test matrix coverage for positive/negative cases, multi-company membership, suspended/archived members, admin overrides, and anonymous users.

Review `supabase/migrations/0005_rls_helpers_draft.sql` before applying or replacing helper-function work. It currently drafts:

- `public.auth_user_id()`
- `public.current_profile_role()`
- `public.is_admin()`
- `public.is_company_owner(uuid)`
- `public.is_active_company_member(uuid)`
- `public.current_company_ids()`
- `public.can_manage_company(uuid)`
- `public.can_view_company(uuid)`
- `public.can_manage_company_members(uuid)`
- `public.can_view_technician_profile(uuid)`
- `public.can_manage_technician_profile(uuid)`
- `public.can_view_public_technician_profile(uuid)`

It is review-only and has not been applied. Add final grants, recursion tests, helper ownership review, table-specific policies, and seed/test fixtures before using it in production.

## Onboarding table RLS policy draft reference

Review `supabase/migrations/0006_onboarding_rls_policies_draft.sql` before applying or replacing onboarding table-policy work. It currently drafts:

- RLS enablement and draft grant posture for profiles, companies, company members, technician profiles, join requests, invites, and audit logs.
- Own-profile and admin profile policies while keeping role/status/company/onboarding fields protected by triggers/server flows.
- Company and company member policies scoped through Task 65 helper predicates.
- Technician profile policies for own draft insertion and allowed raw/private viewing.
- Join request policies for requester selection, company manager review visibility, own pending request creation, and local cancellation drafts.
- Explicit no-browser-direct strategy for raw `company_invites` and `audit_logs`, because invite token hashes and audit metadata require server/admin boundaries.

It is review-only and has not been applied. Add grant review, sanitized invite views/RPCs, audit insert server paths, column-protection triggers or server-only mutation constraints, helper recursion tests, and seeded access tests before using it in production.

## Migration application readiness reference

Read `docs/MIGRATION_APPLICATION_READINESS_CHECKLIST.md` before applying any onboarding, audit, RLS helper, or table-specific policy migration. It defines:

- Recommended migration order for `0003`, `0004`, `0005`, and `0006`.
- Dependencies between onboarding tables, audit logs, helper predicates, and policies.
- Rollback, backup/export, staging, and SQL Editor vs CLI guidance.
- Required seed users, company/technician fixtures, positive access tests, negative access tests, cross-company isolation tests, expired invite tests, suspended member tests, and audit append-only tests.
- Mobile auth regression notes for production-mode local network testing.
- Frontend impact checklist and exact do-not-apply blockers.
- Go/no-go criteria for development/staging application.

It is review-only and has not been used to apply anything. Do not apply migrations until its blockers are resolved.

## Migration application blocker reference

Read `docs/MIGRATION_APPLICATION_BLOCKERS_TASK68.md` before attempting to apply `0003`-`0006` again. It records that Task 68 stopped safely before any Supabase command because:

- No target development/staging Supabase project, backup/export path, or rollback target was confirmed.
- `0003`, `0004`, `0005`, and `0006` still contain review-only/do-not-apply warnings.
- Helper recursion, grants, invite token privacy, audit insert path, server action boundaries, column protection, seed fixtures, and access tests still need hardening.

The next database task should be migration hardening, not application.

## Apply-ready migration review reference

Read `docs/APPLY_READY_MIGRATIONS_REVIEW_TASK69.md` before attempting to apply `0007`-`0010`. It explains:

- what was copied from `0003`-`0006`,
- what was changed in the apply-ready copies,
- which browser mutation policies were removed or deferred,
- why raw `company_invites` and `audit_logs` remain blocked from browser access,
- why the migration set is suitable for development/staging only,
- what prerequisites remain before actual application.

The apply-ready copies are:

- `supabase/migrations/0007_onboarding_foundation_apply_ready.sql`
- `supabase/migrations/0008_audit_log_foundation_apply_ready.sql`
- `supabase/migrations/0009_rls_helpers_apply_ready.sql`
- `supabase/migrations/0010_onboarding_rls_policies_apply_ready.sql`

They have not been applied. Confirm staging environment, backup/export, rollback path, seed fixtures, and access tests first.

Read `docs/APPLY_READY_MIGRATIONS_HUMAN_REVIEW_TASK70.md` before applying `0007`-`0010`. It records:

- conditional staging-only safety,
- dependency and ordering expectations,
- `SECURITY DEFINER` helper ownership and recursion risks to test,
- invite token/hash and audit log privacy posture,
- profile escalation and company isolation findings,
- server-action/RPC work still deferred,
- production blockers.

Task 70 made comment-only cleanup in `0007`, `0008`, and `0009`; it did not change executable SQL behavior, apply migrations, execute SQL, connect to Supabase, or change frontend behavior.

Read `docs/MIGRATION_APPLICATION_BLOCKERS_TASK71.md` before attempting application again. Task 71 found:

- frontend `.env.local` points to Supabase project ref `hejpgyzorrxpfcyvmypb`,
- the anon key is present,
- no service-role key was used or exposed,
- no Supabase CLI link metadata exists under `supabase/.temp`,
- the Supabase CLI was not available from the current shell,
- the environment could not be independently confirmed as staging/test.

The next application attempt must explicitly confirm the target project name/ref is staging or disposable development before any SQL execution.

Read `docs/MIGRATION_SQL_EDITOR_INSTRUCTIONS_TASK72.md` when applying `0007`-`0010` manually. It records that:

- project ref `hejpgyzorrxpfcyvmypb` was user-confirmed as dev/staging,
- pre-checks passed for blocker phrases, destructive statements, service-role exposure, and local env ref,
- Supabase CLI was unavailable from this shell,
- SQL Editor is the current safe application path,
- each migration must be run one at a time,
- SQL Editor results and verification query output should be pasted back before documenting successful application.

Read `docs/MIGRATION_APPLICATION_RESULT_TASK72.md` for the current applied migration state. It records:

- `0007`-`0010` were manually applied by the user through Supabase SQL Editor.
- The target project was `hejpgyzorrxpfcyvmypb`.
- Codex did not execute SQL or use service-role access.
- Anon REST probes confirmed private onboarding/audit tables and selected helper RPCs deny anonymous browser access with `42501 permission denied`.
- Catalog-level enum/RLS/policy checks and seeded authenticated access tests remain follow-up work.

Read `docs/ONBOARDING_RLS_TEST_RESULTS_TASK73.md` before implementing onboarding server actions. It records:

- anonymous users cannot read private onboarding/audit tables,
- anonymous users cannot call selected helper RPCs,
- dev-only fixture setup and cleanup SQL for customer, technician, company owner, suspended member, archived member, and multi-company tests,
- authenticated test expectations for protected profile fields, invite privacy, audit privacy, cross-company isolation, and technician raw profile visibility,
- a security finding that suspended members may still read their own `company_members` row/private notes while `archived_at` is null.

The Task 74 suspended-member `company_members` visibility patch in `supabase/migrations/0011_patch_company_members_rls_visibility.sql` has been manually applied in dev/staging. Task 75 adds a conservative server-action foundation, but seeded authenticated tests are still needed before broad onboarding UI is added. If inactive users need to see their own membership status later, follow `docs/COMPANY_MEMBER_SELF_STATUS_VIEW_PLAN.md` instead of re-opening raw table access.

## Onboarding server action implementation reference

Read `docs/ONBOARDING_SERVER_ACTIONS_IMPLEMENTATION_TASK75.md` before wiring onboarding UI or adding more onboarding mutations.

Current action files:

- `frontend/src/server/onboarding/actions.ts`
- `frontend/src/server/onboarding/supabase.ts`
- `frontend/src/server/onboarding/types.ts`
- `frontend/src/server/onboarding/validation.ts`

Current behavior:

- `createCompanyAndOwnerMembership` validates auth/profile/company input and then returns `trusted_mutation_required`, because current RLS intentionally blocks direct authenticated writes to `companies`, `company_members`, protected profile onboarding fields, and `audit_logs`.
- `updateTechnicianProfile` can create a safe draft `technician_profiles` row for active/verified technician-capable profiles when no technician profile exists yet.
- `completeOnboarding` reads readiness state and then returns `trusted_mutation_required`, because protected profile completion fields and audit logs need a reviewed RPC/server-only transaction.

Next backend requirements:

- Add a trusted RPC/server-only transaction path for company creation and owner membership.
- Add a trusted profile onboarding completion path.
- Add a trusted audit insert helper.
- Revisit pending technician onboarding, because the current `current_profile_role()` helper excludes pending profiles from role-based RLS checks.
- Run seeded authenticated RLS tests before exposing onboarding UI.

## RLS planning reference

Read `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md` before writing RLS policies, server mutations, admin tools, or protected API routes. It defines:

- Deny-by-default, least-privilege, ownership, company, verification, and admin isolation principles.
- Table-by-table SELECT/INSERT/UPDATE/DELETE strategy for core private tables.
- Public marketplace, open jobs, private community, audit/admin, and future API security rules.
- Open questions for community moderation, customer portal access, open job payment gates, and retention policies.

## API/backend service planning reference

Read `docs/API_BACKEND_SERVICE_ARCHITECTURE_PLAN.md` before adding API routes, Edge Functions, upload flows, webhooks, AI endpoints, realtime channels, or background jobs. It defines:

- Thin-backend philosophy and progressive extraction strategy.
- Backend layers for Next.js, Supabase Database/Auth/Storage/Realtime, Edge Functions, AI, queues, and future services.
- API domain boundaries for auth, profiles, onboarding, requests, leads, jobs, repair cases, uploads, community, reputation, admin, payments, and AI workflows.
- Upload, AI, realtime, payments, scaling, security, monitoring, and observability planning.

## Supabase setup reference

Read `docs/SUPABASE_SETUP_GUIDE.md` before creating a Supabase project, filling `frontend/.env.local`, or applying the first profiles/roles migration. It explains where to find the project URL and anon key, why the service role key must never be used in the frontend, how to review `supabase/migrations/0001_profiles_roles.sql`, safe manual migration options, post-apply checks, signup/login testing, profile row verification, rollback caution, and production safety checks.

## Owner/admin promotion reference

Read `docs/OWNER_ADMIN_PROMOTION_GUIDE.md` before manually changing a project owner/developer role in `public.profiles`. It explains why owner/admin roles must never come from public signup, the difference between `technician`, `company_owner`, and `admin`, the recommended development role, SQL Editor promotion templates, verification queries, rollback SQL, and safety warnings.

## Auth middleware planning reference

Read `docs/AUTH_MIDDLEWARE_PLAN.md` before adding middleware, route-level guards, redirects, route protection, or role-gated dashboard navigation. It defines:

- Public routes that must stay crawlable.
- Dashboard routes that later require authentication.
- Routes that later require active profile status, verified technician status, company owner, or admin.
- Redirect targets for logged-out, missing-profile, pending, suspended/rejected, and unauthorized-role states.
- Dev helper route handling for `/dashboard/dev/supabase-check`.
- A phased rollout from soft notices to dry-run decisions to selected route protection.
- Rollback steps if middleware causes broken access or redirect loops.

## Route protection readiness

Ready now:

- `frontend/src/lib/auth/permissions.ts` exposes typed helper checks for session presence, profile presence, active profile status, role membership, and dashboard access eligibility.
- `frontend/src/lib/auth/dashboard-access.ts` exposes the enforced dashboard shell decision for session, profile, status, onboarding, and dashboard-role checks.
- `frontend/src/lib/auth/access-decisions.ts` exposes `evaluateAccessDecision()` for diagnostic route checks. The decision object includes `allowedNow`, `wouldRedirectLater`, `reason`, `recommendedRedirectTarget`, and `requiredAccessLevel`.
- `DashboardAuthGate` wraps `DashboardShell` and redirects blocked states before normal dashboard content renders.
- `DashboardAuthStatus` displays the active guard/diagnostic result for allowed authenticated dashboard sessions.
- Existing profile reads continue to use the browser anon client and user-scoped RLS policies only.

Intentionally not enforced yet:

- No middleware.
- No SSR cookie route gates.
- No role-aware navigation hiding.
- No profile creation from the frontend.

Next route-protection task:

- Add middleware or server-side route checks for `/dashboard` after Supabase SSR cookie/session strategy is approved.
- Keep `/dashboard/dev/supabase-check` reachable by direct URL for local setup verification unless a separate development-only access pattern is introduced.
- Continue treating frontend permission helpers as UX support only; Supabase RLS and server checks must enforce production access.

## Important routes

- `/`
- `/find-technician`
- `/schedule-service`
- `/login`
- `/signup`
- `/onboarding`
- `/account-status`
- `/brands`, `/brands/[brand]`
- `/services`, `/services/[service]`
- `/locations`, `/locations/[city]`
- `/repair-cases`, `/repair-cases/[slug]`
- `/technicians`, `/technicians/[slug]`
- `/dashboard`
- `/dashboard/dev/supabase-check`
- `/dashboard/repair-cases`, `/dashboard/repair-cases/new`, `/dashboard/repair-cases/[id]`
- `/dashboard/leads`, `/dashboard/leads/preview`
- `/dashboard/coverage`
- `/dashboard/analytics`
- `/dashboard/open-jobs`
- `/dashboard/ai-articles`
- `/dashboard/community`, `/dashboard/community/new`, `/dashboard/community/[discussionId]`, `/dashboard/community/reputation`
- `/dashboard/technicians`
- `/dashboard/settings`

## Important mock data and types

- `frontend/src/data/mock-leads.ts` and `frontend/src/types/lead.ts`
- `frontend/src/data/mock-analytics.ts` and `frontend/src/types/analytics.ts`
- `frontend/src/data/mock-open-jobs.ts` and `frontend/src/types/open-jobs.ts`
- `frontend/src/data/mock-technician-availability.ts` and `frontend/src/types/technician-availability.ts`
- `frontend/src/data/mock-community.ts` and `frontend/src/types/community.ts`
- `frontend/src/data/mock-reputation.ts` and `frontend/src/types/reputation.ts`
- `frontend/src/lib/mock-repair-cases.ts` and `frontend/src/types/repair-case.ts`
- `frontend/src/lib/public-seo-data.ts` and `frontend/src/types/public-seo.ts`
- `frontend/src/lib/supabase/client.ts`, `frontend/src/lib/supabase/server.ts`, `frontend/src/lib/supabase/env.ts`, and `frontend/src/lib/supabase/types.ts`
- `frontend/src/lib/auth/types.ts`, `frontend/src/lib/auth/roles.ts`, `frontend/src/lib/auth/permissions.ts`, `frontend/src/lib/auth/session.ts`, `frontend/src/lib/auth/profile.ts`, `frontend/src/lib/auth/dashboard-identity.ts`, `frontend/src/lib/auth/access-decisions.ts`, and `frontend/src/lib/auth/dashboard-access.ts`
- `frontend/src/lib/dashboard/identity.ts`
- `frontend/src/server/auth/session.ts`
- `frontend/src/server/onboarding/actions.ts`, `frontend/src/server/onboarding/supabase.ts`, `frontend/src/server/onboarding/types.ts`, and `frontend/src/server/onboarding/validation.ts`
- `frontend/src/components/public/AuthForm.tsx`
- `frontend/src/components/public/OnboardingFlow.tsx`
- `frontend/src/components/public/AccountStatusPanel.tsx`
- `frontend/src/components/dashboard/DashboardAuthStatus.tsx`
- `frontend/src/components/dashboard/DashboardAuthGate.tsx`
- `frontend/src/components/dashboard/DashboardIdentityOverview.tsx`
- `frontend/src/components/dashboard/DashboardNavigationLinks.tsx`
- `frontend/src/components/dashboard/TechnicianProfileEditor.tsx`
- `supabase/migrations/0001_profiles_roles.sql`
- `supabase/migrations/0002_real_marketplace_core_draft.sql`
- `supabase/migrations/0003_onboarding_foundation_draft.sql`
- `supabase/migrations/0004_audit_log_foundation_draft.sql`
- `supabase/migrations/0005_rls_helpers_draft.sql`
- `docs/ONBOARDING_RLS_POLICY_PLAN.md`
- `docs/ONBOARDING_SERVER_ACTIONS_PLAN.md`
- `docs/ONBOARDING_SERVER_ACTIONS_IMPLEMENTATION_TASK75.md`
- `docs/ONBOARDING_TRUSTED_RPC_TASK76.md`
- `docs/REAL_DASHBOARD_IDENTITY_TASK80.md`
- `docs/ROLE_AWARE_DASHBOARD_NAV_TASK81.md`
- `docs/REAL_TECHNICIAN_PROFILE_TASK82.md`
- `docs/TECHNICIAN_PROFILE_UPDATE_TASK83.md`
- `docs/ONBOARDING_LOOP_FIX_TASK84.md`
- `docs/DASHBOARD_AUTH_MISMATCH_FIX_TASK85.md`
- `docs/AUDIT_LOG_PLAN.md`
- `docs/RLS_HELPER_FUNCTIONS_PLAN.md`

## Integration boundaries

- Public routes must not read private dashboard repair cases or community data.
- Technician community routes must remain dashboard-only and require auth before production.
- Company membership, invite tokens, technician verification data, and onboarding status transitions must stay server/RLS controlled before production.
- Company creation and onboarding completion server actions now call the Task 76 trusted RPCs. The user manually applied `supabase/migrations/0012_onboarding_trusted_rpc.sql` in the confirmed dev/staging Supabase project; seeded authenticated success/error-path testing is still needed.
- `/onboarding` is now wired to the server actions. It is dev/staging-only and should be tested with seeded authenticated users before being treated as production onboarding.
- `DashboardAuthGate` wraps `DashboardShell` and enforces Supabase session/profile/onboarding/role checks before rendering normal dashboard content. `/dashboard/dev/*` remains directly reachable for local verification.
- `/account-status` is the public-safe blocked-access screen for missing profiles, pending/suspended/rejected profiles, and accounts without a dashboard role.
- Audit logs must be written server-side, remain append-only, and store only sanitized metadata. Do not expose raw audit logs to normal users or company members by default.
- RLS helper functions are policy predicates only. They do not replace table-specific policies, server-side validation, audit logging, payload allowlists, or transactional business rules.
- `profiles.company_id` is only a convenience pointer. Production authorization must use `company_members`, server checks, and RLS policies.
- Supabase helpers currently return `null` when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, so the mock-only app can continue building without live backend configuration.
- Auth readiness helpers are UX/plumbing only. Future route protection must still use server checks and Supabase RLS before any dashboard or community data becomes real.
- Login/signup pages are public and mock-safe. Role intent is UI-only until the profiles table and role persistence are implemented.
- Dashboard auth-awareness is now enforcement-backed for normal dashboard routes through `DashboardAuthGate`. Middleware/SSR cookie enforcement remains future work.
- Dashboard identity loading now uses `frontend/src/lib/dashboard/identity.ts` to read the authenticated profile, onboarding state, linked company, company membership state, and technician profile through the anon Supabase client and RLS. Raw `company_members` remains intentionally restricted for non-manager accounts after the Task 74 patch, so dashboard UI must treat missing membership reads as an RLS-limited state rather than fake data.
- `getCurrentUserProfile()` returns a profile-backed session snapshot whenever `public.profiles` is readable. Route guards and navigation should use that profile-backed session rather than raw Supabase Auth metadata, because auth metadata can lag behind manual role/status changes in `public.profiles`.
- Dashboard navigation rules now live in `frontend/src/config/dashboard-navigation.ts`. Use the allowed-role/status/onboarding metadata and `DashboardNavigationLinks` instead of adding ad hoc sidebar/topbar checks. This is UX filtering only; `DashboardAuthGate`, server actions, and Supabase RLS remain the security boundary.
- The dashboard topbar primary action points to `/dashboard/leads` because real `service_requests` are now the first live CRM workflow. Do not reintroduce mock lead inbox navigation; keep mock/preview labels only on areas that still use local demo data.
- Service request status updates must stay RPC/server-route based. Do not add broad client UPDATE policies on `public.service_requests`, because that table contains private customer contact and issue fields.
- Internal service request notes must stay dashboard-only. Do not expose `service_request_notes` publicly, and keep note writes behind `add_service_request_note_rpc` so users can only write notes for requests they can already access.
- Service request photos must stay in the private `service-request-photos` bucket. Do not make the bucket public; dashboard rendering should use signed URLs after RLS allows `service_request_photos` metadata reads. Customer uploads should store only request-scoped paths and no raw technician/customer internal IDs.
- Anonymous photo metadata reads should be hard-blocked with `0022`; do not rely on empty RLS result sets as the privacy boundary for public clients.
- Estimate creation must stay RPC/server-route based. Do not add broad browser INSERT/UPDATE policies on estimate tables; catalog pricing should be copied server-side through `create_service_request_estimate_rpc` so the browser cannot rewrite catalog prices or customer request ownership.
- Estimate updates/voids must stay draft-only and RPC/server-route based. Sent, approved, declined, converted-to-invoice, and void estimates are read-only from the technician builder.
- Technician cost fields are internal-only. They may appear inside the authenticated technician builder but must not be included in public/customer preview routes, outbound estimate messages, or future customer approval pages.
- `/dashboard/technician-profile` reads the current user's raw `technician_profiles` row through RLS and uses the existing onboarding server action to create a draft profile when one does not exist. Existing profile updates currently attempt a user-scoped anon update but are expected to be blocked by the applied RLS until a reviewed column-safe update policy or trusted RPC is added.
- Technician profile updates now call `update_own_technician_profile_rpc` through the existing onboarding server action. Until `supabase/migrations/0013_technician_profile_safe_update_rpc_apply_ready.sql` is manually applied in dev/staging, existing profile saves will return a clear `trusted_mutation_required` error.
- Technician onboarding now treats `technician_verification_pending` as dashboard-ready for technician roles, while verified-only sections remain role-gated. `updateTechnicianProfile` now calls `upsert_own_technician_profile_rpc`; until `supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql` is manually applied in dev/staging, technician profile draft creation may still fail with a clear RPC-required error.
- Profile role/status helpers are readiness plumbing only. Real profile reads require `supabase/migrations/0001_profiles_roles.sql` to be reviewed/applied, and dashboard access still needs server checks, middleware or route protection, and RLS.
- `/dashboard/dev/supabase-check` is a local development verification page only. It uses the browser anon client, does not use service-role keys, does not create missing profiles, does not apply migrations, and does not protect routes. Temporary mobile-auth debug pages have been removed.
- Dashboard profile role/status display uses the browser anon client and user-owned profile read policy. It must remain display-only until protected routes, server authorization, and RLS are fully implemented.
- Route protection warnings in the dashboard now reflect the active runtime guard. Logged-out, missing-profile, inactive, incomplete-onboarding, and role-blocked states redirect before dashboard page content renders.
- Auth guard diagnostics are still UX-only and must not be treated as the data security boundary. Supabase RLS and server actions remain authoritative for private data.
- Real customer address, lead, job, and repair case persistence should follow `docs/REAL_DATA_MODEL_PLAN.md`. Before technician acceptance, expose only city/ZIP/service area, appliance details, issue summary, preferred window, and estimated value; unlock full customer contact/address only after assignment.
- The Task 55 marketplace migration is review-only. The real database should still be treated as profiles-only until `0002_real_marketplace_core_draft.sql` is reviewed, RLS policies are designed/tested, and the user explicitly approves applying it.
- Owner/admin role promotion is manual documentation only. Do not add public signup paths or frontend controls that grant `company_owner` or `admin`.
- The profiles/roles SQL migration is draft-only. Do not apply it without reviewing triggers, grants, RLS policies, role defaults, and admin update paths.
- AI article, TechAdvisor, translation, and RAG features are mock-only until server-side API boundaries and privacy filters are implemented.
- Open job acceptance is local UI state only. Production claiming requires server-side lock/assignment logic.
- Lead conversion previews do not create real repair case data yet.
- Dispatcher preview snapshots are internal CRM decision records only. Task 120 adds `supabase/migrations/0030_dispatcher_preview_snapshots_apply_ready.sql`, RPCs, and `/api/service-requests/[id]/dispatcher-preview`; apply `0030` in dev/staging before expecting snapshot persistence. Do not use snapshots as bookings, appointments, assignments, outbound messages, provider calls, or customer-visible records.
- Dispatcher Preview technician matching is now real-profile based. `/dashboard/leads/[id]` queries `public.technician_profiles` with the authenticated anon Supabase client and RLS, filters to verified/marketplace-enabled/non-blocked technicians covering the request ZIP, scores appliance/brand/experience/profile completeness, and feeds those matches into the provider-free scheduling orchestrator. If RLS returns no eligible rows, the preview must show a no-match/setup state rather than falling back to static technicians.
- Technician availability is now modeled by `supabase/migrations/0031_technician_availability_rules_apply_ready.sql`. Apply `0031` in dev/staging before expecting `/dashboard/leads/[id]` to load `technician_availability_rules`. Rules are recurring day-of-week windows only; they are not appointments, holds, assignments, calendar events, provider sync, or customer-visible promises.
- M3 rollback point exists before appointment booking work: local git tag `milestone-m3-task122` and `docs/MILESTONE_M3_ROLLBACK.md`. Because the worktree contains many uncommitted task files, do not assume the tag alone restores Task 122 behavior. Use the rollback doc, scoped diffs, and explicit user approval before any destructive reset or database cleanup.
- Appointment booking is now prepared behind `supabase/migrations/0032_appointments_apply_ready.sql`. Apply `0032` in dev/staging before expecting Book Appointment or `/dashboard/technician-schedule` to work. Booking must stay RPC-based through `book_service_request_appointment_rpc(...)`; do not add broad browser writes to `appointments` or `service_requests`. The current foundation validates request visibility, technician management rights, ZIP coverage, recurring availability rules, duplicate active appointments, and overlapping technician windows. It does not call Google Calendar, Google Maps, SMS, email, phone, AI, or provider systems.
- `/dashboard/technician-schedule` is the first appointment schedule surface. It intentionally hides raw customer phone data and shows disabled "Call via Platform" / "Message via Platform" placeholders until communication proxy work is explicitly designed.
- Authenticated appointment QA now has a dev/staging setup guide in `docs/APPOINTMENT_BOOKING_QA_ACCESS_TASK125.md` and fixture SQL in `supabase/fixtures/booking_qa_dev_fixture.sql`. Do not commit passwords. Create the QA Auth user manually, store its temporary password outside git, then apply the fixture in Supabase SQL Editor. The fixture seeds no-phone booking test requests and Monday availability for the dispatcher fallback date.
- Task 127 begins the jobs-first dashboard UI refactor. Primary navigation now uses Dashboard, Jobs, Calendar, Customers, Technicians, Reports, and Settings. Jobs still points to `/dashboard/leads` and Calendar still points to `/dashboard/technician-schedule`; do not rename database/API objects unless a later migration explicitly does so. Developer diagnostics and older mock routes should remain reachable by direct URL but stay out of primary navigation.
- Task 129 created the local pre-integration rollback tag `milestone-m3-job-workspace-before-integrations` and `docs/MILESTONE_M3_JOB_WORKSPACE_ROLLBACK.md`. The tag marks committed `HEAD`, not the many uncommitted working-tree files from recent tasks. Before any destructive rollback or external provider integration work, inspect `git status --short`, preserve uncommitted work, and follow the rollback doc.
- Task 130 adds server-side Google Calendar appointment sync. Apply `supabase/migrations/0033_google_calendar_appointment_sync_apply_ready.sql` before expecting sync metadata persistence. Configure only server-side env vars listed in `docs/GOOGLE_CALENDAR_INTEGRATION_TASK130.md`; never expose Google client secrets, refresh tokens, or service-role keys to browser code. Booking must remain successful when Google is not configured.
- Task 131 upgrades `/dashboard/technician-schedule` into the internal CRM Dispatch Board. The CRM `appointments` table is the source of truth for technician scheduling; Google Calendar is optional outbound sync only and technician personal calendars are not primary. The dispatch board now supports day navigation, date selection, technician filtering, grouped daily appointment cards, mobile "My Jobs Today" behavior, calendar sync badges, disabled platform communication placeholders, and Job Workspace links while keeping customer phone numbers hidden.
- Task 132 expands the service request status lifecycle. Apply `supabase/migrations/0034_job_status_lifecycle_and_estimate_transitions_apply_ready.sql` before expecting the expanded dropdown or estimate send/approve/decline auto-transitions to persist. Status changes must remain routed through `update_service_request_status_rpc(...)`; do not add broad browser UPDATE policies on `service_requests`. Customer estimate decline now moves the job to `waiting_customer`, not automatic cancellation.
- Task 139 rebuilds `/dashboard` as the technician command center. Continue using `frontend/src/components/dashboard/DashboardJobsOverview.tsx` for the home dashboard surface; it safely falls back to empty/demo operational content when live CRM data is unavailable and does not surface raw query errors to technicians. Keep communication, AI advisor, manuals, parts, and community widgets UI-only until their real integrations are explicitly implemented.
- Task 140 tightens `DashboardJobsOverview` after the schedule panel was too tall with sparse data. The schedule uses compact fixed-height cards and a capped grid; do not reintroduce tall empty placeholders or large explanatory panels on the main dashboard. Money/job widgets should remain real-data-backed or zero-valued, while non-integrated widgets may use compact static preview rows.
- Task 141 applies a premium dashboard/sidebar visual pass. Navigation now uses inline SVG icons and an expanded premium item set mapped to existing safe routes; do not add broken links or duplicate dashboard implementations. The top dashboard header includes static notification/profile controls for visual readiness only; these are not communication integrations yet.
- Task 142 scales the premium dashboard back down for desktop density. Preserve the smaller header, compact KPI cards, shortened helper labels, capped schedule grid, and reduced widget padding; avoid adding large hero blocks or tall empty cards to `/dashboard`.
- Task 143 finalizes `/dashboard` as the technician action center. Preserve this architecture: Next Actions first, compact summary row inside that section, Today's Schedule second, Calls/Messages/AI next, combined Parts & Vendors, and compact Manuals/Community/Sales below. Treat future dashboard work as incremental or integration-backed rather than another full layout rewrite.
- Task 145 adds the first customer marketplace/account foundation. Apply `supabase/migrations/0035_customer_marketplace_foundation_apply_ready.sql` in dev/staging before expecting `customers`, `customer_appliances`, customer-linked service requests, or the new customer RPCs to persist. `/customer/*` routes are mobile-first and account-gated; do not turn the preview flow into live booking without an explicit future task. `/dashboard/customers` and `/dashboard/customers/[id]` should read real customer-linked records only and show safe empty/setup states when migration `0035` is not present.
- Task 146 corrected `0035` after review. Before QA, confirm the applied database includes `link_current_customer_account_rpc(...)`, `can_view_customer(uuid)`, and `can_view_customer_appliance(uuid)`. A reachable dev Supabase check showed those helper RPCs were missing from schema cache before manual apply, so do not report customer E2E QA as passed until the current corrected SQL is applied.
- Task 146 continued after the user applied `0035`. Real DB QA confirmed customer-aware request creation/dedupe and app API submit success. Supabase Auth email confirmation blocks Codex-created customer users from logging in until confirmed, so customer dashboard browser QA requires a manually confirmed dev customer account. Apply `supabase/migrations/0036_customer_service_request_self_read_apply_ready.sql` before testing customer dashboard service request history; it adds customer self-read for linked service requests and patches unsupported request source normalization.
- Task 146 final QA continued after the user applied `0036`. Real DB checks passed for source normalization, customer-linked request creation, duplicate customer reuse, and anonymous read blocking. Browser checks passed for logged-out customer/dashboard route gates and public customer route rendering. Authenticated customer dashboard and `/dashboard/customers` data QA still requires confirmed credentials; do not mark those flows complete from generated signup users while email confirmation is enabled.
- Task 146.1 adds confirmed-account QA fixture `supabase/fixtures/customer_marketplace_qa_accounts_task146.sql`. Before using it, create and confirm `qa-customer-marketplace@example.test` and `qa-customer-dashboard@example.test` in dev/staging Supabase Auth, with passwords stored only in a password manager. Codex cannot confirm users locally because only the public anon key is available.
- Task 146 customer dashboard blocker patch: `/` now redirects authenticated customers to `/customer/dashboard` using customer role intent or `customers.auth_user_id`, and the customer dashboard includes a real profile edit form for first name, last name, phone, and preferred contact method. The form writes only to the current customer's `customers` row through existing RLS. Retest with the confirmed customer credentials on desktop and mobile before starting Task 147.
- Task 146.2 moves the customer profile form to `/customer/profile` and removes it from `/customer/dashboard`. Customer screens now use `CustomerAccountMenu` for Profile/Logout access and a local-time greeting on the dashboard. Keep customer profile writes scoped to the existing `customers` self-update RLS; do not start Task 147 until confirmed customer mobile QA passes.
- Task 146.3 tightens `/customer/profile` saves by checking the active session and updating only the customer row whose `auth_user_id` matches the signed-in customer. Customer appliance options now cover major appliances, and the label-photo control is a disabled future UX placeholder only. Do not implement photo recognition, storage, AI, or Task 147 until the user confirms final mobile customer QA.
- Task 146.4 adds the appliance-first customer flow foundation. `/customer/appliances/[id]` and `/customer/request-repair?appliance=<id>` are customer/RLS-scoped client routes. The request-repair shell must remain non-persisting until Task 147 explicitly implements technician selection, time windows, appointment booking, service request creation, and CRM job creation.
- Task 146.5 fixes customer re-login separation. Main `/login` resolves post-login destination by customer role intent, auth metadata, profile role, or linked `customers.auth_user_id`; customer accounts go to `/customer/dashboard`. Do not reintroduce customer flows that route to `/dashboard` or show technician/company-owner access messaging.
- Task 146.6 finishes marketplace/customer portal navigation. Keep `/` browsable for logged-in customers; do not restore root auto-redirect to `/customer/dashboard`. Customer portal screens use `CustomerPortalHeader`; customer menus may link to `/` and `/customer/profile`, but must not expose technician CRM routes.
- Task 146 is closed. Customer login, dashboard, profile editing, appliance registry, appliance detail, non-persisting request-repair shell, marketplace/portal navigation, and customer-vs-technician route separation are implemented. The customer portal header must keep a single anchor around `BrandLogo` to avoid nested-link hydration errors. Do not start Task 147 behavior unless explicitly requested; `/customer/request-repair?appliance=<id>` is still a preparation shell and must not create service requests, appointments, technician selections, outbound messages, AI calls, payments, or provider actions.
- Task 147 creates the first customer asset booking workflow. Apply `supabase/migrations/0037_customer_asset_booking_apply_ready.sql`, then `supabase/migrations/0038_customer_asset_booking_contact_window_patch_apply_ready.sql`, in dev/staging before expecting persistence. The customer flow is `/customer/request-repair?appliance=<id>` -> `/customer/choose-technician` -> `/customer/booking-confirmation`. The browser stores only an in-progress draft until final `Book Appointment`; final creation goes through `/api/customer/repair-booking`, which calls `create_customer_asset_booking_rpc(...)`. Technician choices use public technician slugs from `public.public_technician_profiles`; raw technician profile ids and phone numbers are not exposed in the customer UI. Do not replace this with direct browser writes to `service_requests` or `appointments`.
- Task 147.1 is closed after `supabase/migrations/0041_technician_marketplace_profile_readiness_view_fix_apply_ready.sql` was applied successfully and manual technician/customer matching QA passed. The existing `/dashboard/technician-profile` route is now the Marketplace Profile workspace and must keep writes routed through `updateTechnicianProfile` -> `upsert_own_technician_profile_rpc(...)`. Customer booking should continue reading only `public.public_technician_profiles`; marketplace-disabled technicians must not appear, and raw technician ids/phone numbers must stay hidden from customer screens. Known UX debt: the profile screen is functional but visually repetitive and should be polished later without changing the working data flow.
- Task 148 adds professional estimate architecture behind `supabase/migrations/0042_professional_estimate_service_catalog_foundation_apply_ready.sql`. Apply it in dev/staging before relying on service catalog tables or new estimate line metadata columns. Estimate writes must continue through `/api/service-requests/[id]/estimates` and the trusted estimate RPCs; do not add direct browser writes to estimate tables. Technician/internal cost and internal part names may appear in authenticated dashboard builder surfaces only and must stay out of public estimate approval/customer routes. Inventory, vendor, purchasing, truck stock, warehouse, profitability, and AI estimate generation are intentionally not implemented yet.
- Task 148.1 is a UI-only estimate builder usability pass. Keep the default path simple for field technicians: line type, customer-facing name, sell price, Add Line, Save Draft. Internal part numbers, costs, and notes should remain optional/advanced so future cost tracking does not slow everyday estimate entry. Do not move `Send To Customer` away from saved draft estimate cards unless the approval flow is explicitly redesigned.
- Task 148.2 makes estimate drafting AI-first using a local deterministic generator in `frontend/src/lib/estimate-draft-agent.ts`. It is not a real AI/provider integration. Keep generated draft output mapped into the same normal estimate line payloads used by the existing estimate API. Manual builder should stay secondary behind `Add Manually`; do not expose internal costs/customer-hidden names in public estimate routes.
- Task 148.3 intentionally replaces the prior multi-panel estimate builder with a one-card flow. Keep estimate creation inside one card: diagnosis text, generated/editable line prices, total, and `Send Estimate`. Do not reintroduce separate generated draft, cart, customer preview, confidence/source, or manual-builder screens unless a future task explicitly reverses this direction.
- Task 148.4 adds estimate intelligence foundation only. Apply `supabase/migrations/0043_estimate_agent_intelligence_foundation_apply_ready.sql` before expecting archive metadata or `estimate_learning_events` to persist. The learning events table is for future Estimate Learning Engine inputs only; do not add model training, embeddings, provider calls, inventory, purchasing, or automated price optimization without a separate reviewed task.
- Task 148.5 adds multilingual diagnosis normalization to `frontend/src/lib/estimate-draft-agent.ts`. The estimate agent must consume repair intents from `normalizeDiagnosis(...)`, not raw text alone. The default provider mode is `local`; `cheap_ai` and `advanced_ai` are future boundaries only. Do not add paid AI/translation calls, model-specific code, or customer-facing AI claims without a separate server-side provider task.
- Task 148.6 adds the first real server-side AI boundary for estimates at `/api/estimate-agent/draft`. The route requires an authenticated dashboard bearer token, reads `OPENAI_API_KEY` only on the server, uses `ESTIMATE_AGENT_MODEL` as the cheap/default model, and reserves `ESTIMATE_AGENT_ADVANCED_MODEL` for future escalation. The client must never import OpenAI SDKs, call `api.openai.com`, or reference `OPENAI_API_KEY`. If OpenAI is unavailable, slow, or returns invalid JSON, keep falling back to `generateEstimateDraft(...)` so the one-card estimate workflow remains usable.
- Task 148.7 keeps OpenAI API-first when configured and treats the local deterministic generator as fallback-only. The estimate builder now uses technician-facing line labels Labor, Part, Service, and Other; Service is still stored as the existing `material` line type and Other as `custom` to avoid a schema change. Do not silently overwrite technician edits on regeneration. The UI shows discount/tax review totals, but the current trusted estimate RPC persists tax as `0` and has no discount columns, so do not promise accounting-grade persisted discounts until a future migration adds those fields.
- Task 148.7A tightens source proof. `Generate Estimate` must call `/api/estimate-agent/draft`; do not reintroduce client-side `generateEstimateDraft(...)` fallback in `ServiceRequestDetail.tsx`. The route returns `source: "openai"` only after successful OpenAI JSON validation and `source: "fallback"` for missing key, timeout, request failure, or invalid JSON. The UI must display `Generated with AI` only for `source: "openai"` and `Generated locally` only for fallback. Dev logs intentionally show `hasOpenAiKey`, selected model, and final source without printing secrets.
- Task 148.8 makes the estimate card compact by default. Keep tax/discount controls behind `Adjust tax / discount`, warranty text behind `Edit warranty`, and line descriptions/quantity/taxable controls behind each line's `Details` toggle. Do not restore a large accounting-style settings block on the main estimate screen. OpenAI should produce complete repair scope; prompt changes require labor/testing coverage for named parts, manual defrost service for iced evaporators, and proper sealed-system scope for compressor/no-cooling symptoms.

## Customer marketplace foundation

- Read `docs/CUSTOMER_MARKETPLACE_FOUNDATION_TASK145.md` before changing customer marketplace, customer auth, customer dashboard, customer appliance registry, or customer CRM routes.
- Customer routes must not expose technician private data, customer internal notes, service-role keys, or dashboard diagnostics.
- Public technician options for customers must read `public.public_technician_profiles` only.
- Customer asset booking now exists behind Task 147 migration `0037`. Payments, AI diagnosis, vendor search, SMS/calls, email, and customer community backend remain future work.

## Rules for contributing

- Follow `frontend/AGENTS.md`.
- Use TypeScript.
- Use semantic HTML.
- Use Tailwind CSS only unless a new dependency is explicitly approved.
- Keep components small and reusable.
- Keep dashboard-specific components in `src/components/dashboard`.
- Do not add API keys or secrets to the repository.
- Do not create `.env` files with secrets.
- Do not auto-commit.
- Work only in approved folders.
- Do not access folders outside the project scope.
- Do not run global commands without approval.
- Run lint and build before reporting frontend changes.
- Report all changed files at the end of each task.
- Keep public marketplace, dashboard CRM, and private technician community concerns separated.
- Clearly label mock/demo-only workflows and avoid implying live dispatch, persistence, AI, translation, or payments.

## Current caution

Some existing files may be uncommitted from prior tasks. Check `git status` before starting, preserve unrelated work, and only modify files required for the current task.
