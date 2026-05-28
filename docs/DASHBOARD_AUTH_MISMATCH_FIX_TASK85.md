# Task 85 — Dashboard Auth Mismatch Fix

## Summary

Task 85 fixes a mismatch between `/dashboard/dev/supabase-check` and real dashboard routing.

The dev checker showed the current account as allowed:

- role: `technician`
- status: `active`
- technician profile: draft/readable
- auth guard: allowed

But normal dashboard routes redirected to:

```text
/account-status?reason=dashboard-role
```

## Root Cause

`getCurrentUserProfile()` loaded the correct `public.profiles` row, but returned the original Supabase Auth session snapshot.

That original session snapshot derives role/status from auth metadata:

- `app_metadata.role`
- `user_metadata.role`

For the affected account, metadata did not reflect the database profile role, so the session role could remain `public_visitor` even while `public.profiles.role = technician`.

Real dashboard routing then checked:

```ts
canAccessDashboard(session.user)
```

Because `session.user.role` came from stale/missing auth metadata, the route guard redirected with `dashboard-role`.

The dev checker displayed the profile row directly, so it showed `Role: Technician` and appeared to disagree with the real dashboard guard.

## Fix

`getCurrentUserProfile()` now returns a profile-backed session snapshot when a profile row is found.

The profile-backed session uses:

- `profile.id`
- `profile.email`
- `profile.role`
- `profile.status`
- `profile.company_id`

This makes `DashboardAuthGate`, role-aware navigation, dashboard identity, and dev diagnostics agree on the same source of truth.

## SQL

No SQL was needed.

No migrations were applied.

## Security Notes

- No `service_role` key was used.
- No RLS policy was bypassed.
- The dashboard still requires a real authenticated session and readable profile row.
- `public.profiles` remains the role/status source for dashboard UX and route decisions.
- Supabase RLS remains the data authorization boundary.

## Manual Test

With the affected account logged in:

1. Open `/dashboard/dev/supabase-check`.
2. Confirm role/status/profile are allowed.
3. Open `/dashboard`.
4. Expected: dashboard renders.
5. Open `/dashboard/technician-profile`.
6. Expected: technician profile page renders.

If redirected again, clear browser session/cache or log out and log back in so the client re-runs the profile-backed session load.
