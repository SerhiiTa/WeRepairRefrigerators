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
- Improved auth QA visibility for login/signup and dashboard, including session/profile status display, logout controls, login-to-dashboard redirect, and profile loading timeout messaging.
- Clean Supabase Auth QA flow for login/signup and dashboard status, with production-mode local network testing guidance for iPhone/mobile devices.

## Current in-progress feature

The product is transitioning from frontend-first mock workflows into reviewed backend planning. Supabase Auth and `public.profiles` exist for local development after the manually applied first migration, but marketplace CRM, technician community, AI workflow, and public SEO systems still use static/local UI data only. No real leads, jobs, repair cases, dispatch, notification, AI, translation, or payment persistence is connected.

## Current Supabase persistence status

- `supabase/migrations/0001_profiles_roles.sql` has been applied manually for the current development project.
- The real database should be treated as containing only the profiles/auth foundation right now.
- `supabase/migrations/0002_real_marketplace_core_draft.sql` is a Task 55 review-only draft for `service_requests`, `leads`, `jobs`, and `repair_cases`.
- Task 55 did not apply SQL, connect to Supabase, create real tables, or change frontend behavior.
- Task 55A improves auth visibility only. It does not apply migrations, change Supabase database schema, or enforce route protection.
- Task 55B-55G investigated mobile auth diagnostics only. They did not apply migrations, change Supabase database schema, or enforce route protection.
- Task 58 cleaned temporary mobile auth debugging code after confirming the local iPhone issue was caused by Next.js dev-mode HMR websocket behavior, not Supabase Auth.
- The next backend task should review the draft schema and design table-specific RLS policies before any database application.

## What is not built yet

- Full dashboard route protection
- Real marketplace database schema beyond `public.profiles`
- Server actions or API routes
- Real repair case persistence
- Real photo uploads
- Technician profile CRUD
- Real AI SEO article generation
- Real AI TechAdvisor assistant
- Real multilingual AI translation
- Real vector/RAG knowledge base
- Real-time technician chat or WebSocket messaging
- Live dispatch, job locking, notifications, or technician mobile workflow
- Real analytics tracking
- Real lead persistence or conversion into database repair cases
- Public publishing workflow for AI-generated pages
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

## Current git workflow

- Work from the repository root: `/Users/serhiitatarenko/Desktop/WeRepairRefrigerators`
- Make scoped changes in approved folders only.
- Do not auto-commit.
- Run lint and build before reporting frontend changes.
- Report changed files at the end of each task.
- Keep `node_modules`, build output, secrets, and environment files out of commits.
