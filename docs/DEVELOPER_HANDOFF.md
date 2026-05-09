# Developer Handoff

## Overview

WeRepairRefrigerators is a Houston-first SaaS MVP for refrigerator repair technicians and service business owners. The current app is a frontend-only Next.js App Router project with a public homepage, dashboard shell, and repair case creation UI.

The app currently uses mock data only. There is no authentication, Supabase integration, database, real upload handling, or AI generation yet.

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

- Public dark SaaS homepage
- Dashboard shell at `/dashboard`
- Sidebar, topbar, and content area
- Placeholder dashboard metrics and repair case table
- Repair case creation form at `/dashboard/repair-cases/new`
- Reusable form components
- Mock photo upload placeholders
- Mock SEO metadata preview

## What to build next

Recommended next steps:

1. Add `/dashboard/repair-cases` list route.
2. Add `/dashboard/repair-cases/[id]` preview route.
3. Add client-side or server-side validation strategy for repair case creation.
4. Add mock state transitions for draft, reviewed, repaired, and article draft.
5. Plan Supabase schema before implementing persistence.

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

## Current caution

Some existing files may be uncommitted from prior tasks. Check `git status` before starting, preserve unrelated work, and only modify files required for the current task.
