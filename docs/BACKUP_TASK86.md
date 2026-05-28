# Task 86 Safety Backup

## Purpose

This is a lightweight documentation backup before Task 86 auth/onboarding stabilization changes. It does not include code archives, database exports, secrets, or git commits.

## Current Working Auth / Onboarding Flow

- Supabase Auth is connected in the local/dev environment through public anon configuration.
- Login/signup pages exist at `/login` and `/signup`.
- `public.profiles` is the intended source of truth for dashboard role/status once readable.
- Normal dashboard routes render through `DashboardAuthGate`.
- `/dashboard/dev/*` remains directly reachable for local verification.
- `/onboarding` uses client-side auth session access tokens and server actions for profile/onboarding writes.
- Technician onboarding currently depends on:
  - `public.profiles.role`
  - `public.profiles.status`
  - `public.profiles.onboarding_status`
  - a readable `technician_profiles` row
  - RPC-backed technician profile creation/update paths

## Currently Applied Migration Assumptions

The current dev/staging project is assumed to have these migrations applied:

- `0007_onboarding_foundation_apply_ready.sql`
- `0008_audit_log_foundation_apply_ready.sql`
- `0009_rls_helpers_apply_ready.sql`
- `0010_onboarding_rls_policies_apply_ready.sql`
- `0013_technician_profile_safe_update_rpc_apply_ready.sql`
- `0014_technician_onboarding_upsert_rpc_apply_ready.sql`

Previously applied supporting migrations/patches are also part of the local dev/staging context:

- `0001_profiles_roles.sql`
- `0011_patch_company_members_rls_visibility.sql`
- `0012_onboarding_trusted_rpc.sql`

## Current Known-Good Routes

- `/login`
- `/signup`
- `/onboarding`
- `/account-status`
- `/dashboard/dev/supabase-check`
- `/dashboard`
- `/dashboard/technician-profile`

## Current Dev Test Account Assumptions

Known dev/staging test account:

- email: `info@refrigeratorhoustonrepair.com`
- `public.profiles.role = technician`
- `public.profiles.status = active`
- `public.profiles.full_name = SERGIO`
- a `technician_profiles` row exists and is readable
- the technician profile may be in `draft` status
- dashboard access should be allowed after profile-backed role resolution and dashboard-ready onboarding status checks pass

## Current Dashboard Auth Behavior

- Logged-out normal dashboard routes redirect to `/login?next=...`.
- Missing profile rows redirect to `/account-status?reason=profile-missing`.
- Inactive, suspended, or rejected profiles redirect to `/account-status`.
- Customer role should redirect to `/account-status?reason=dashboard-role`.
- Technician-capable roles are eligible for dashboard access when profile status and onboarding readiness pass.
- `technician_verification_pending` is dashboard-ready for technician roles, while verified-only features remain role-gated.
- Dashboard decisions should use `public.profiles.role/status`, not stale Supabase Auth metadata.

## Current Onboarding Behavior

- `/onboarding` loads the current profile through `getCurrentUserProfile()`.
- Existing technician profile fields are preloaded when readable.
- Submit updates basic profile data first.
- Technician path calls `updateTechnicianProfile()`, which is expected to use `upsert_own_technician_profile_rpc`.
- Submit then calls `completeOnboarding()`.
- The UI should not show success unless the returned onboarding status is dashboard-ready.

## Current RPC Dependencies

- `create_company_and_owner_membership_rpc`
- `complete_onboarding_rpc`
- `update_own_technician_profile_rpc`
- `upsert_own_technician_profile_rpc`

These RPCs must be callable only through authenticated user-scoped access. Frontend code must not use `service_role`.

## Files Involved In Auth / Onboarding

- `frontend/src/lib/auth/profile.ts`
- `frontend/src/lib/auth/session.ts`
- `frontend/src/lib/auth/permissions.ts`
- `frontend/src/lib/auth/dashboard-access.ts`
- `frontend/src/lib/auth/access-decisions.ts`
- `frontend/src/lib/dashboard/identity.ts`
- `frontend/src/components/dashboard/DashboardAuthGate.tsx`
- `frontend/src/components/dashboard/DashboardAuthStatus.tsx`
- `frontend/src/components/dashboard/DashboardNavigationLinks.tsx`
- `frontend/src/components/public/AuthForm.tsx`
- `frontend/src/components/public/OnboardingFlow.tsx`
- `frontend/src/components/dashboard/TechnicianProfileEditor.tsx`
- `frontend/src/server/onboarding/actions.ts`
- `frontend/src/server/onboarding/supabase.ts`
- `frontend/src/server/onboarding/types.ts`
- `frontend/src/server/onboarding/validation.ts`
- `frontend/src/lib/supabase/client.ts`
- `frontend/src/lib/supabase/server.ts`
- `frontend/src/lib/supabase/types.ts`
- `frontend/src/app/dashboard/dev/supabase-check/page.tsx`
- `frontend/src/app/dashboard/technician-profile/page.tsx`
- `frontend/src/app/onboarding/page.tsx`
- `frontend/src/app/account-status/page.tsx`

## Rollback Notes

If Task 86 introduces regressions:

1. Revert only Task 86 code/doc changes.
2. Keep applied Supabase migrations untouched unless a separate reviewed rollback is created.
3. Restore `getCurrentUserProfile()` to the last known profile-backed behavior from Task 85 if any new role/session mapping changes cause redirects.
4. Confirm `/dashboard/dev/supabase-check` and `/dashboard` agree for the technician test account before proceeding.
5. Do not remove the Task 83/84 RPC migrations from the repository unless replacing them with a stricter reviewed migration.
