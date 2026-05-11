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

## Phase 2: Repair case workflow

- Expand the repair case creation form.
- Add validation.
- Add repair case preview pages.
- Add edit states and draft states.
- Keep data local or mocked until the backend is approved.

## Phase 3: Supabase auth/database

- Use `docs/BACKEND_ARCHITECTURE_PLAN.md` as the implementation planning reference before creating backend code.
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
