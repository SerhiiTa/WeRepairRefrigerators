# Task 81 — Real Dashboard Role-Aware Navigation

## Summary

Task 81 made dashboard navigation respond to the authenticated user's real Supabase profile role/status/onboarding state loaded through the Task 80 dashboard identity layer.

This is UI visibility, not a data security boundary. Protected route gating still comes from `DashboardAuthGate`, and private data access still depends on Supabase RLS and server-side mutations.

## Implemented

- Extended centralized dashboard navigation config with:
  - allowed roles
  - allowed profile statuses
  - completed-onboarding requirements
  - real/mock/coming-soon/dev-only visibility flags
  - navigation grouping metadata
- Added role-aware navigation rendering for:
  - desktop sidebar
  - mobile dashboard navigation
- Added visibility grouping:
  - Real account
  - Mock operations
  - Mock community
  - Development
- Added a role-specific dashboard overview card:
  - technicians see technician workspace context
  - company owners see company owner workspace context
  - admins see an admin-capable placeholder context
  - invalid/customer states should be redirected before dashboard content renders

## Role Behavior

- `technician`
  - Sees technician-oriented dashboard items such as overview, repair cases, AI article workflow, and settings.
  - Does not see company owner operations such as leads, coverage, analytics, or technicians.
  - Does not see verified-technician community/open-job links until role is upgraded.
- `verified_technician` and `expert_technician`
  - See technician items plus verified technician/community/open job previews.
- `company_owner`
  - Sees company operations previews such as leads, coverage, analytics, technicians, repair cases, AI articles, and verified-technician/open-job/community items where appropriate.
- `admin`
  - Sees admin-capable placeholder access through the same config.
- `customer`, missing profile, pending, suspended, rejected, or incomplete onboarding
  - Should not render normal dashboard content because `DashboardAuthGate` redirects those states before the sidebar/home content appears.
- `/dashboard/dev/*`
  - Remains reachable for local verification and can show development-only navigation.

## Files

- `frontend/src/config/dashboard-navigation.ts`
- `frontend/src/components/dashboard/DashboardNavigationLinks.tsx`
- `frontend/src/components/dashboard/DashboardSidebar.tsx`
- `frontend/src/components/dashboard/DashboardTopbar.tsx`
- `frontend/src/components/dashboard/DashboardIdentityOverview.tsx`

## Still Mock

The navigation marks mock/demo sections instead of removing them:

- repair cases
- leads
- open jobs
- coverage
- analytics
- community
- reputation
- AI articles
- technicians placeholder

These remain preview surfaces until real persistence, RLS policies, and server-side mutations exist.

## Limitations

- Navigation filtering is client-side UX. It must not be treated as authorization.
- The current dashboard identity/navigation load happens client-side and may briefly show a loading state.
- Future middleware/SSR enforcement can reuse the same role/status/onboarding concepts, but should not rely on this client nav alone.
- Seeded authenticated testing is still needed for every role/status combination.
