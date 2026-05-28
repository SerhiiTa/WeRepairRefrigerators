# Developer Handoff

## Overview

WeRepairRefrigerators is a Houston-first refrigerator repair marketplace and SaaS MVP for customers, technicians, and service business owners. The current app is a frontend-only Next.js App Router project with a public SEO/customer marketplace, internal dashboard CRM, and private technician community mock workflows.

The app still uses mock/static marketplace, CRM, and community data. Supabase Auth and the `public.profiles` foundation are connected for local development, but there is no real marketplace persistence, upload handling, dispatch, real-time chat, payment logic, AI generation, or translation API yet.

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
