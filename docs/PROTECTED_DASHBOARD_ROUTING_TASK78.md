# Protected Dashboard Routing - Task 78

## Purpose

Task 78 replaces remaining mock dashboard access with real Supabase Auth/profile/onboarding enforcement for dashboard routes.

This is frontend/runtime enforcement only. It does not apply SQL, add middleware, use service-role credentials, replace mock datasets, or change public marketplace routing.

## Files Added

- `frontend/src/lib/auth/dashboard-access.ts`
- `frontend/src/server/auth/session.ts`
- `frontend/src/components/dashboard/DashboardAuthGate.tsx`
- `frontend/src/app/account-status/page.tsx`
- `frontend/src/components/public/AccountStatusPanel.tsx`

## Files Updated

- `frontend/src/components/dashboard/DashboardShell.tsx`
- `frontend/src/components/dashboard/DashboardAuthStatus.tsx`
- `frontend/src/components/public/AuthForm.tsx`
- `frontend/src/components/public/OnboardingFlow.tsx`
- `frontend/src/lib/auth/access-decisions.ts`
- `frontend/src/lib/auth/dashboard-identity.ts`

## Protected Routes

`DashboardAuthGate` wraps `DashboardShell`, so normal dashboard routes under `/dashboard/*` are protected before page content renders. This includes:

- `/dashboard`
- `/dashboard/leads`
- `/dashboard/open-jobs`
- `/dashboard/community`
- `/dashboard/analytics`
- `/dashboard/coverage`
- `/dashboard/ai-articles`
- repair case, technician, settings, reputation, and related dashboard subroutes

`/dashboard/dev/*` remains directly reachable for local development verification helpers.

## Redirect Behavior

- Logged out: `/login?next=<dashboard-path>`
- Supabase unavailable: `/login?next=<dashboard-path>`
- Profile missing: `/account-status?reason=profile-missing`
- Profile `pending`, `suspended`, or `rejected`: `/account-status?reason=<status>`
- Onboarding incomplete: `/onboarding?next=<dashboard-path>`
- Role not allowed for dashboard: `/account-status?reason=dashboard-role`
- Active/verified profile with completed onboarding and dashboard role: allow dashboard

Dashboard roles are currently technician, verified technician, expert technician, company owner, and admin. Customer accounts remain routed to public/customer-facing flows.

## Auth Runtime Notes

- The dashboard gate uses the browser Supabase session because the current app does not yet use Supabase SSR cookie middleware.
- The shared decision logic is centralized in `frontend/src/lib/auth/dashboard-access.ts`.
- `frontend/src/server/auth/session.ts` provides user-scoped server-side profile loading helpers for future server actions and route handlers.
- The gate withholds dashboard content while checking session/profile state to avoid hydration flicker.
- The gate has an 8 second timeout fallback so dashboard access does not hang forever on local network/auth failures.

## Security Notes

- No service-role key is used or exposed.
- No frontend route grants admin privileges.
- Profile role/status/onboarding values are read through the authenticated anon client and existing RLS.
- Route enforcement is a UX/runtime boundary only; Supabase RLS and server actions remain the data security boundary.
- `/account-status` is intentionally public-safe and does not expose private dashboard data.

## Remaining Limitations

- No middleware redirect enforcement yet.
- No SSR cookie session integration yet.
- Role-aware dashboard navigation hiding is not implemented yet.
- Seeded end-to-end tests are still needed for customer, technician, company owner, suspended, rejected, missing-profile, and incomplete-onboarding accounts.
