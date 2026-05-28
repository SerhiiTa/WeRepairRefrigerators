# Project State

## Project name

WeRepairRefrigerators

## Goal

Build a secure AI-powered refrigerator repair technician platform that helps repair businesses document repair cases, manage technician-facing workflows, and eventually turn completed work into local SEO content.

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
- Improved auth QA visibility for login/signup and dashboard, including session/profile status display, logout controls, login-to-dashboard redirect, and profile loading timeout messaging.
- Clean Supabase Auth QA flow for login/signup and dashboard status, with production-mode local network testing guidance for iPhone/mobile devices.
- Real onboarding flow planning in `docs/ONBOARDING_FLOW_PLAN.md` for customers, technicians, company owners, admins, companies, invites, join requests, statuses, redirects, and RLS implications.

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

## Current git workflow

- Work from the repository root: `/Users/serhiitatarenko/Desktop/WeRepairRefrigerators`
- Make scoped changes in approved folders only.
- Do not auto-commit.
- Run lint and build before reporting frontend changes.
- Report changed files at the end of each task.
- Keep `node_modules`, build output, secrets, and environment files out of commits.
