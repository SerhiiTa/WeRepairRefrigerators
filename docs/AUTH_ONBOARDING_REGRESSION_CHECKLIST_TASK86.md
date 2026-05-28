# Task 86 Auth and Onboarding Regression Checklist

## Purpose

Lock the real Supabase auth, onboarding, and protected dashboard lifecycle so future work does not reintroduce redirect loops, stale role checks, or mismatched diagnostics.

## Dev/Staging Assumptions

- Supabase project is the current dev/staging project only.
- `public.profiles` is applied and readable through the authenticated anon client.
- Onboarding/audit/RLS migrations `0007`, `0008`, `0009`, `0010`, `0011`, `0012`, `0013`, and `0014` are assumed applied in dev/staging based on prior task/user status.
- Current technician test account expectation:
  - email: `info@refrigeratorhoustonrepair.com`
  - role: `technician`
  - status: `active`
  - onboarding status: `complete` or `technician_verification_pending`
  - technician profile row exists and is readable
- No service-role key is used by frontend code.
- Marketplace, repair case, open job, community, and analytics data remain mock/static unless explicitly documented otherwise.

## Regression Areas Checked

| Flow | Expected Result | Task 86 Status |
| --- | --- | --- |
| Logged-out `/dashboard` | Redirects to `/login?next=%2Fdashboard` | Passed in browser on `localhost:3002` |
| Logged-out `/dashboard/technician-profile` | Redirects to `/login?next=%2Fdashboard%2Ftechnician-profile` | Passed in browser on `localhost:3002` |
| `/dashboard/dev/supabase-check` | Remains directly reachable and reports real route guard decisions separately from dev bypass | Passed in browser on `localhost:3002` |
| Dashboard auth diagnostic panel | Mirrors `evaluateDashboardAccess()` instead of a separate dry-run helper | Updated and build-verified |
| Dev Supabase checker | Shows profile onboarding fields and the real `/dashboard` + `/dashboard/technician-profile` gate decisions | Updated and browser-verified while logged out |
| Profile-backed role resolution | `getCurrentUserProfile()` remains the canonical role/status source for route enforcement | Static review passed |
| Technician onboarding readiness | `complete` and technician `technician_verification_pending` remain dashboard-ready states | Static review passed |
| Technician profile create/update RPC wiring | `updateTechnicianProfile()` still calls `upsert_own_technician_profile_rpc` and surfaces honest RPC/RLS errors | Static review passed |
| Refresh persistence | Requires authenticated browser session to verify manually | Pending seeded-session QA |
| Logout/login persistence | Requires authenticated browser session and known password to verify manually | Pending seeded-session QA |
| Wrong-role redirects | Customer/pending/suspended/rejected seeded accounts still needed | Pending seeded-account QA |
| Account-status handling | Existing reasons remain `profile-missing`, `pending`, `suspended`, `rejected`, and `dashboard-role` | Static review passed |

## Root Causes Addressed

1. The dashboard topbar diagnostic used `frontend/src/lib/auth/access-decisions.ts`, while the enforced route gate used `frontend/src/lib/auth/dashboard-access.ts`. This allowed the UI to display a different answer than the guard that actually redirects.
2. The dev Supabase checker only reported session/profile presence and did not show the real `/dashboard` or `/dashboard/technician-profile` guard decision, which made dev-route bypass results easy to confuse with normal dashboard access.

Task 86 now makes the dashboard auth panel and dev check route report the same `evaluateDashboardAccess()` outcome used by `DashboardAuthGate`.

## Manual QA Steps

Use production-mode local testing for mobile or LAN auth QA:

```bash
cd frontend
npm run build -- --webpack
npm run start -- -H 0.0.0.0 -p 3002
```

Desktop:

- `http://localhost:3002/login`
- `http://localhost:3002/dashboard`
- `http://localhost:3002/dashboard/dev/supabase-check`
- `http://localhost:3002/dashboard/technician-profile`

Phone/LAN:

- `http://10.0.0.67:3002/login`
- `http://10.0.0.67:3002/dashboard`
- `http://10.0.0.67:3002/dashboard/dev/supabase-check`
- `http://10.0.0.67:3002/dashboard/technician-profile`

Do not rely on `next dev` for iPhone LAN auth debugging because the HMR websocket can make hydration appear stuck.

## Authenticated Technician QA

With the known dev technician account:

1. Visit `/login?next=/dashboard`.
2. Log in.
3. Confirm redirect reaches `/dashboard` or `/onboarding` only when the profile is genuinely not dashboard-ready.
4. Refresh `/dashboard`.
5. Open `/dashboard/dev/supabase-check` and confirm `/dashboard` and `/dashboard/technician-profile` are both `Allowed`.
6. Open `/dashboard/technician-profile`.
7. Edit allowed fields:
   - display name
   - business name
   - years experience
   - public service summary
   - private bio
   - primary city/state
   - service ZIP codes
   - specialties
   - languages
8. Save and refresh.
9. Confirm saved values persist.
10. Log out from the dashboard auth panel.
11. Re-open `/dashboard` and confirm redirect to `/login?next=%2Fdashboard`.
12. Log back in and confirm dashboard access returns.

## Remaining Known Limitations

- This task did not create new SQL or apply migrations.
- Authenticated browser verification could not be completed in the Codex in-app browser without a logged-in session or test password.
- Seeded customer, pending, suspended, rejected, missing-profile, multi-company, and admin account tests remain required before production.
- `/dashboard/dev/*` intentionally bypasses the normal dashboard gate and must not be linked as production admin tooling.
- Middleware/SSR enforcement remains future work; current protection is client runtime/dashboard-shell based.
- Real marketplace data persistence is still not connected.

## Future Risk Areas

- Keep `DashboardAuthGate`, `DashboardAuthStatus`, `/dashboard/dev/supabase-check`, and role-aware navigation aligned on `evaluateDashboardAccess()` and profile-backed session data.
- Do not reintroduce auth metadata role checks for dashboard access; use `public.profiles`.
- Do not let dev-route bypass results stand in for normal dashboard route decisions.
- Keep technician onboarding dashboard readiness synchronized with `complete_onboarding_rpc` and `isDashboardOnboardingStatusSatisfied()`.
- Keep technician profile create/update paths routed through the reviewed RPCs and RLS.
