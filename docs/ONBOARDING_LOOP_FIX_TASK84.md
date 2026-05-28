# Task 84 — Technician Onboarding Loop Fix

## Summary

Task 84 fixes the technician onboarding/account completion loop observed after Task 83.

The loop happened because `complete_onboarding_rpc()` returns `technician_verification_pending` for a normal unverified technician after a technician profile row exists. The dashboard guard only accepted `onboarding_status = complete`, so a technician could save onboarding, receive a success message, then immediately be redirected back to `/onboarding`.

## Root Cause

The system had two separate issues:

1. **Status mismatch**
   - `complete_onboarding_rpc()` correctly leaves unverified technicians in `technician_verification_pending`.
   - `DashboardAuthGate` treated any status other than `complete` as incomplete onboarding.
   - Result: active technician accounts with a draft profile were redirected back to onboarding.

2. **Technician profile creation RLS gap**
   - The onboarding UI tried to create a draft `technician_profiles` row through browser-scoped RLS.
   - Current applied RLS can block that insert with `new row violates row-level security policy for table technician_profiles`.
   - Result: the profile row might not exist, `complete_onboarding_rpc()` returns `technician_profile_required`, and dashboard access remains blocked.

## Implemented Fixes

### Dashboard readiness

Dashboard access now treats `technician_verification_pending` as onboarding-sufficient only for technician roles:

- `technician`
- `verified_technician`
- `expert_technician`

This allows basic technician dashboard access while preserving verification gates for open jobs/community through role-aware navigation and future route policies.

### Onboarding redirect behavior

`/onboarding` now uses the same dashboard-readiness helper before redirecting.

The submit flow no longer shows a fake success if `complete_onboarding_rpc()` returns a status that still blocks dashboard access. For example, if the technician profile row was not created and completion returns `technician_profile_required`, the UI stays on onboarding and shows a clear error.

### Technician profile draft creation path

Created a new apply-ready dev/staging migration:

- `supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql`

It defines:

- `public.upsert_own_technician_profile_rpc(...)`

The existing `updateTechnicianProfile` server action now calls this RPC for both draft creation and existing profile updates.

## RPC Security Behavior

The Task 84 RPC:

- requires `auth.uid()`
- loads the caller's `public.profiles` row
- requires profile status `active` or `verified`
- allows only technician-capable roles
- does not accept caller-supplied profile id, user id, company id, status, verification, marketplace, public profile, or archive fields
- creates only an independent draft profile with safe defaults when no profile exists
- updates only approved self-editable fields when a profile exists
- rejects rejected, suspended, or archived technician profiles
- grants execute only to `authenticated`

## Manual Supabase Step

Codex did not apply SQL.

Before technician profile creation through onboarding can work reliably, manually review and apply:

```text
supabase/migrations/0014_technician_onboarding_upsert_rpc_apply_ready.sql
```

After applying, verify:

- `public.upsert_own_technician_profile_rpc(...)` exists.
- `anon` cannot execute it.
- `authenticated` can execute it only as the current user.
- A technician cannot set system fields through the RPC.
- A customer cannot call it successfully.

## Remaining Limitations

- A technician in `technician_verification_pending` can access basic dashboard tools, but should not see verified-technician open-job/community routes.
- Real verification/admin approval flows are still not implemented.
- Audit logging for technician profile edits is still future work.
- Seeded authenticated tests are still needed for profile creation, completion, dashboard access, and blocked-role cases.
