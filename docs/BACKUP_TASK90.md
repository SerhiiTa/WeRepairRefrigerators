# Backup Task 90

## Current Git Status

```text
 M docs/DEVELOPER_HANDOFF.md
 M docs/PROJECT_STATE.md
 M docs/ROADMAP.md
 M frontend/src/app/dashboard/dev/supabase-check/page.tsx
 M frontend/src/app/dashboard/leads/page.tsx
 M frontend/src/app/dashboard/page.tsx
 M frontend/src/app/login/page.tsx
 M frontend/src/app/signup/page.tsx
 M frontend/src/app/technicians/[slug]/page.tsx
 M frontend/src/app/technicians/page.tsx
 M frontend/src/components/dashboard/DashboardAuthStatus.tsx
 M frontend/src/components/dashboard/DashboardShell.tsx
 M frontend/src/components/dashboard/DashboardSidebar.tsx
 M frontend/src/components/dashboard/DashboardTopbar.tsx
 M frontend/src/components/public/AuthForm.tsx
 M frontend/src/components/public/TechnicianProfileHeader.tsx
 M frontend/src/components/public/TechnicianRepairCaseList.tsx
 M frontend/src/components/public/TechnicianServiceAreas.tsx
 M frontend/src/components/public/TechnicianTrustStats.tsx
 M frontend/src/config/dashboard-navigation.ts
 M frontend/src/lib/auth/access-decisions.ts
 M frontend/src/lib/auth/dashboard-identity.ts
 M frontend/src/lib/auth/profile.ts
 M frontend/src/lib/supabase/types.ts
?? docs/... prior task docs and supabase migration drafts
?? frontend/src/app/account-status/
?? frontend/src/app/dashboard/technician-profile/
?? frontend/src/app/onboarding/
?? frontend/src/components/dashboard/DashboardAuthGate.tsx
?? frontend/src/components/dashboard/DashboardIdentityOverview.tsx
?? frontend/src/components/dashboard/DashboardNavigationLinks.tsx
?? frontend/src/components/dashboard/TechnicianProfileEditor.tsx
?? frontend/src/components/public/AccountStatusPanel.tsx
?? frontend/src/components/public/OnboardingFlow.tsx
?? frontend/src/lib/auth/dashboard-access.ts
?? frontend/src/lib/dashboard/
?? frontend/src/lib/public-technician-profiles.ts
?? frontend/src/server/
?? supabase/migrations/0002_real_marketplace_core_draft.sql ... 0016_dev_public_ready_technician_profile_apply_ready.sql
```

## Relevant Files That May Be Changed

- `frontend/src/app/technicians/[slug]/page.tsx`
- `frontend/src/app/schedule-service/page.tsx`
- `frontend/src/components/public/ServiceRequestFlow.tsx`
- `frontend/src/components/public/ServiceRequestForm.tsx` only if form behavior needs a small adjustment
- `frontend/src/lib/public-technician-profiles.ts` only if a reusable safe loader helper is needed
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

- Revert Task 90 code changes by restoring the technician detail CTA labels/hrefs and schedule-service intake loading to the pre-Task-90 state.
- Remove any technician-context banner/props added to the intake flow if the flow regresses.
- Keep prior Task 87-89 public technician view and SQL files intact; they are unrelated to this routing/UX task.
- Do not revert unrelated existing worktree changes from earlier tasks.

## DB Migration Expectation

No DB migration is expected for Task 90. The task should use the existing sanitized `public.public_technician_profiles` view and slug query parameter only.
