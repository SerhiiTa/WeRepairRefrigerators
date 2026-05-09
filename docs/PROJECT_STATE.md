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
- Supabase planned later for authentication and database
- AI article generation planned later

## Current completed features

- Modern dark SaaS homepage for WeRepairRefrigerators
- `/dashboard` route with reusable dashboard shell
- Dashboard sidebar, topbar, and content area
- Dashboard placeholders for overview, repair cases, AI articles, technicians, and settings
- Placeholder repair cases table
- `/dashboard/repair-cases/new` route
- Multi-section repair case creation form UI
- Reusable form components for labels, sections, inputs, text areas, selects, and radio groups
- Mock photo upload placeholders
- Mock SEO metadata preview

## Current in-progress feature

Repair case workflow UI. The creation form exists, but it does not yet save data, validate submissions, upload photos, or generate previews from real case data.

## What is not built yet

- Authentication
- Supabase project integration
- Database schema
- Server actions or API routes
- Real repair case persistence
- Real photo uploads
- Technician profile CRUD
- AI SEO article generation
- Public SEO repair pages
- Payments or subscriptions
- Production deployment

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
    │   │   │   ├── page.tsx
    │   │   │   └── repair-cases/
    │   │   │       └── new/
    │   │   │           └── page.tsx
    │   │   ├── globals.css
    │   │   ├── layout.tsx
    │   │   └── page.tsx
    │   └── components/
    │       ├── dashboard/
    │       ├── FormField.tsx
    │       ├── FormSection.tsx
    │       ├── MetricCard.tsx
    │       ├── RadioCardGroup.tsx
    │       ├── SelectField.tsx
    │       ├── StatusBadge.tsx
    │       ├── TextArea.tsx
    │       └── TextInput.tsx
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
```

Use the webpack build command for verification because it has been the stable build path in the current environment.

## Current git workflow

- Work from the repository root: `/Users/serhiitatarenko/Desktop/WeRepairRefrigerators`
- Make scoped changes in approved folders only.
- Do not auto-commit.
- Run lint and build before reporting frontend changes.
- Report changed files at the end of each task.
- Keep `node_modules`, build output, secrets, and environment files out of commits.
