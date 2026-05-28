# Task 87 Safety Backup

## Current Working Auth and Onboarding State

- Supabase Auth is connected in the current dev/staging project.
- `public.profiles` is the source of truth for dashboard role/status decisions.
- `DashboardAuthGate` protects normal `/dashboard/*` routes through `evaluateDashboardAccess()`.
- `/dashboard/dev/*` remains directly reachable for local verification.
- `/onboarding` supports customer, independent technician, and company owner setup paths through server actions.
- Technician accounts can be dashboard-ready with `onboarding_status = complete` or `technician_verification_pending` when the role is technician-capable.

## Applied Migration Assumptions

Current development/staging state assumes these migrations are applied:

- `0007_onboarding_foundation_apply_ready.sql`
- `0008_audit_log_foundation_apply_ready.sql`
- `0009_rls_helpers_apply_ready.sql`
- `0010_onboarding_rls_policies_apply_ready.sql`
- `0011_patch_company_members_rls_visibility.sql`
- `0012_onboarding_trusted_rpc.sql`
- `0013_technician_profile_safe_update_rpc_apply_ready.sql`
- `0014_technician_onboarding_upsert_rpc_apply_ready.sql`

Supporting auth/profile foundation:

- `0001_profiles_roles.sql`

## Current Dashboard Flow

- Logged-out normal dashboard routes redirect to `/login?next=...`.
- Missing profile redirects to `/account-status?reason=profile-missing`.
- Pending/suspended/rejected profiles redirect to `/account-status`.
- Incomplete onboarding redirects to `/onboarding?next=...`.
- Dashboard-eligible roles are technician, verified technician, expert technician, company owner, and admin.
- Dashboard diagnostics and `/dashboard/dev/supabase-check` use the same dashboard access helper as the protected shell.

## Current Technician Profile Behavior

- `/dashboard/technician-profile` reads the authenticated user's own `technician_profiles` row through Supabase/RLS.
- Editable private dashboard fields include display name, business name, years experience, public service summary, private bio, primary city/state, service ZIP codes, specialties, and languages.
- Protected/system fields are not editable from the dashboard form.
- Existing profile updates depend on `update_own_technician_profile_rpc` / `upsert_own_technician_profile_rpc`.

## Current RPC Dependencies

- `create_company_and_owner_membership_rpc`
- `complete_onboarding_rpc`
- `update_own_technician_profile_rpc`
- `upsert_own_technician_profile_rpc`

## Current Known-Good Routes

- `/login`
- `/signup`
- `/onboarding`
- `/dashboard`
- `/dashboard/dev/supabase-check`
- `/dashboard/technician-profile`
- Existing mock public marketplace routes, including `/technicians` and `/technicians/[slug]`

## Rollback Notes

If Task 87 introduces regressions:

1. Revert only Task 87 public technician changes first.
2. Keep Task 86 auth/dashboard diagnostics intact unless the regression is directly traced to them.
3. Do not change RLS or apply SQL without a separate reviewed migration task.
4. Confirm `/dashboard/dev/supabase-check`, `/dashboard`, and `/dashboard/technician-profile` still agree on profile-backed dashboard access.
5. Confirm public pages never expose `bio_private`, profile ids, company ids, private notes, verification internals, archived/suspension/rejection details, emails, or admin/audit data.
