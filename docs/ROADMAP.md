# Roadmap

## Phase 1: Frontend MVP

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
- Use the existing `frontend/src/lib/supabase` helpers as the starting point for future client/server Supabase access. They are intentionally inert when public env vars are missing.
- Use the existing `frontend/src/lib/auth` helpers as the starting point for future role-aware UI and route protection, but do not treat frontend permission helpers as the production security boundary.
- Use `/login` and `/signup` as the future auth UI starting point. Role intent remains UI-only until profile persistence exists.
- Use dashboard auth-awareness as a temporary visibility layer only. Real access control still requires profiles, server checks, middleware or route protection, and RLS.
- Review `supabase/migrations/0001_profiles_roles.sql` before applying the first profiles/roles migration.
- Follow `docs/SUPABASE_SETUP_GUIDE.md` before connecting a Supabase project or manually applying the first profiles/roles migration.
- Use `frontend/src/lib/auth/profile.ts` as the future profile role/status sync starting point after migration `0001_profiles_roles.sql` is reviewed and applied. It currently falls back safely when Supabase, sessions, or the profiles table are unavailable.
- Use `/dashboard/dev/supabase-check` only as a local verification helper after configuring Supabase env vars and manually applying the reviewed profiles migration. Do not expose it as production admin tooling.
- Dashboard role/status display can read from `public.profiles` when available, but it is still UX-only. Do not treat it as route protection or authorization.
- Add Supabase authentication.
- Create database tables for users, technician profiles, repair cases, parts, photos, and article drafts.
- Add tables for marketplace leads, open jobs, technician availability, technician community discussions, messages, accepted solutions, knowledge cases, and reputation events.
- Add Row Level Security policies.
- Add server-side data access patterns.
- Protect all dashboard and technician community routes behind authentication before production.

Recommended backend implementation order:

1. Supabase project, profiles, auth roles, protected dashboard routes, baseline RLS, and audit logging.
2. Marketplace lead persistence and validated dashboard lead status updates.
3. Open jobs, job claims, dispatch eligibility, and transactional claiming/locking.
4. Private technician community persistence, moderation, accepted answers, and permissions.
5. Reputation events, badges, and leaderboard views.
6. Privacy-safe analytics events and aggregate dashboard views.
7. Stripe subscriptions, paid leads, premium placement, and payout-compatible audit records.
8. Server-side AI, translation, and RAG for approved private knowledge and reviewed public SEO drafts.

Auth planning order:

1. Create profiles, roles, statuses, and basic dashboard protection.
2. Add technician onboarding and verification status.
3. Gate open jobs and private community routes to verified technicians or higher.
4. Add company-owner team scoping.
5. Add admin verification, moderation, and audit tooling.

Supabase data model order:

1. `profiles`, roles, auth status, and audit foundations.
2. `service_requests` and `leads`.
3. `jobs` and `open_jobs` with assignment/claiming rules.
4. `repair_cases` and `repair_case_photos`.
5. `technician_profiles`, `companies`, `company_members`, and `public_profiles`.
6. `community_posts`, `community_replies`, and `accepted_solutions`.
7. `reputation_events` and `technician_badges`.
8. Payments/subscriptions after marketplace workflows are stable.

RLS planning order:

1. Enable deny-by-default RLS on private tables.
2. Add owner-only policies for profiles/customer records.
3. Add company-scoped policies for leads, jobs, repair cases, and team records.
4. Add verified-technician policies for open jobs and private community.
5. Add admin-only policies for audit logs, role changes, verification, and moderation.
6. Add tests for cross-user, cross-company, and public/private leakage before production.

API/backend service order:

1. Start with thin server-side validation around public intake and profile/bootstrap workflows.
2. Add protected mutations for leads, jobs, repair cases, and open job claiming.
3. Add signed upload flows and private storage policies.
4. Add webhook processing for Stripe only when billing is approved.
5. Add realtime, queue, AI, and dedicated services only after core persistence and permissions are stable.

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
