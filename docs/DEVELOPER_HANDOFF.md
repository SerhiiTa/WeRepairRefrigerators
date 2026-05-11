# Developer Handoff

## Overview

WeRepairRefrigerators is a Houston-first refrigerator repair marketplace and SaaS MVP for customers, technicians, and service business owners. The current app is a frontend-only Next.js App Router project with a public SEO/customer marketplace, internal dashboard CRM, and private technician community mock workflows.

The app currently uses mock/static data and local UI state only. There is no authentication, Supabase integration, database, real upload handling, real dispatch, real-time chat, payment logic, AI generation, or translation API yet.

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
- RLS and permission architecture planning in `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md`.

## What to build next

Recommended next steps:

1. Use `docs/BACKEND_ARCHITECTURE_PLAN.md`, `docs/AUTH_ROLES_PLAN.md`, `docs/SUPABASE_DATA_MODEL_PLAN.md`, and `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md` to guide Supabase schema, auth, RLS, dispatch locking, community persistence, analytics, Stripe, and AI/RAG implementation.
2. Add authentication and protected dashboard routes.
3. Convert public intake and dashboard lead workflows into validated server-side mutations.
4. Add real repair case persistence, uploads, and draft/edit states.
5. Add dispatch locking for open jobs before any live technician claiming.
6. Add private technician community persistence, moderation, and permission checks.
7. Add AI/translation boundaries server-side only, with manual review before publishing or indexing.

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

## RLS planning reference

Read `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md` before writing RLS policies, server mutations, admin tools, or protected API routes. It defines:

- Deny-by-default, least-privilege, ownership, company, verification, and admin isolation principles.
- Table-by-table SELECT/INSERT/UPDATE/DELETE strategy for core private tables.
- Public marketplace, open jobs, private community, audit/admin, and future API security rules.
- Open questions for community moderation, customer portal access, open job payment gates, and retention policies.

## Important routes

- `/`
- `/find-technician`
- `/schedule-service`
- `/brands`, `/brands/[brand]`
- `/services`, `/services/[service]`
- `/locations`, `/locations/[city]`
- `/repair-cases`, `/repair-cases/[slug]`
- `/technicians`, `/technicians/[slug]`
- `/dashboard`
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

## Integration boundaries

- Public routes must not read private dashboard repair cases or community data.
- Technician community routes must remain dashboard-only and require auth before production.
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
