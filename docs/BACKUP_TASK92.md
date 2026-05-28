# Backup Task 92

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
 M frontend/src/components/public/ServiceRequestForm.tsx
 M frontend/src/components/public/ServiceRequestSuccess.tsx
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
?? frontend/src/app/api/
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
?? frontend/src/lib/service-requests.ts
?? frontend/src/server/
?? supabase/migrations/0002_real_marketplace_core_draft.sql ... 0017_service_requests_foundation_apply_ready.sql
```

## Relevant Files Likely To Change

- `supabase/migrations/0018_service_requests_dashboard_read_policies_apply_ready.sql`
- `frontend/src/app/dashboard/leads/page.tsx`
- `frontend/src/app/dashboard/leads/[id]/page.tsx`
- `frontend/src/components/dashboard/ServiceRequestsInbox.tsx`
- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/types.ts`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

- Revert `/dashboard/leads` to the previous `LeadInbox` mock data import if the real RLS-backed loader regresses.
- Remove the `/dashboard/leads/[id]` detail route if detail loading causes routing issues.
- Keep Task 91 public insert migration and `/api/service-requests` submit route intact; this task should only add dashboard read capability.
- Do not revert unrelated existing worktree changes from earlier tasks.

## DB Migration Expectation

A DB migration is expected. `0017` intentionally created public insert without public read, so Task 92 needs a narrow authenticated dashboard read policy for `public.service_requests`.
