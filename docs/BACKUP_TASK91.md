# Backup Task 91

## Current Git Status

```text
 M docs/DEVELOPER_HANDOFF.md
 M docs/PROJECT_STATE.md
 M docs/ROADMAP.md
 M frontend/src/app/dashboard/dev/supabase-check/page.tsx
 M frontend/src/app/dashboard/leads/page.tsx
 M frontend/src/app/dashboard/page.tsx
 M frontend/src/app/login/page.tsx
 M frontend/src/app/schedule-service/page.tsx
 M frontend/src/app/signup/page.tsx
 M frontend/src/app/technicians/[slug]/page.tsx
 M frontend/src/app/technicians/page.tsx
 M frontend/src/components/dashboard/DashboardAuthStatus.tsx
 M frontend/src/components/dashboard/DashboardShell.tsx
 M frontend/src/components/dashboard/DashboardSidebar.tsx
 M frontend/src/components/dashboard/DashboardTopbar.tsx
 M frontend/src/components/public/AuthForm.tsx
 M frontend/src/components/public/ServiceRequestFlow.tsx
 M frontend/src/components/public/TechnicianProfileHeader.tsx
 M frontend/src/components/public/TechnicianRepairCaseList.tsx
 M frontend/src/components/public/TechnicianServiceAreas.tsx
 M frontend/src/components/public/TechnicianTrustStats.tsx
 M frontend/src/config/dashboard-navigation.ts
 M frontend/src/lib/auth/access-decisions.ts
 M frontend/src/lib/auth/dashboard-identity.ts
 M frontend/src/lib/auth/profile.ts
 M frontend/src/lib/supabase/types.ts
?? docs/... prior task docs and migration notes
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

## Relevant Files Likely To Change

- `supabase/migrations/0017_service_requests_foundation_apply_ready.sql`
- `frontend/src/app/schedule-service/page.tsx`
- `frontend/src/components/public/ServiceRequestFlow.tsx`
- `frontend/src/components/public/ServiceRequestForm.tsx`
- `frontend/src/components/public/ServiceRequestSuccess.tsx`
- `frontend/src/lib/service-requests.ts` or equivalent submit helper
- `frontend/src/lib/supabase/types.ts`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

- Revert the service request submit helper and any form submit-state wiring to restore the preview-only intake.
- Keep Task 90 technician slug routing intact unless the regression is specifically in technician context handling.
- If the migration is not applied, the UI should keep reporting a clear save error rather than pretending persistence succeeded.
- Do not revert unrelated existing worktree changes from earlier tasks.

## DB Migration Expectation

A DB migration is expected for Task 91 unless a compatible `public.service_requests` table already exists in the dev/staging Supabase project. The expected migration should be apply-ready but not automatically applied by Codex if SQL Editor/manual application is required.
