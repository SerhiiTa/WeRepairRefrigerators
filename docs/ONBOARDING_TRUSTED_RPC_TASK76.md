# Onboarding Trusted RPC Transactions - Task 76

## Purpose

Task 76 adds the first trusted database-side transaction path for onboarding mutations that normal browser-scoped RLS intentionally blocks.

This is dev/staging work only. It does not change frontend UI behavior, does not expose service-role credentials, and was applied manually by the user through the Supabase SQL Editor.

## Files Added

- `supabase/migrations/0012_onboarding_trusted_rpc.sql`

## Files Updated

- `frontend/src/server/onboarding/actions.ts`
- `frontend/src/server/onboarding/types.ts`
- `frontend/src/lib/supabase/types.ts`

## RPCs Added

### `public.create_company_and_owner_membership_rpc(...)`

Creates the company owner onboarding transaction for the authenticated caller:

- validates `auth.uid()`
- validates the caller has a `public.profiles` row
- requires profile status `active` or `verified`
- requires role `company_owner` or `admin`
- validates company name, slug, state, and optional business email
- creates a `companies` row
- creates an active owner `company_members` row
- updates protected `profiles.company_id`, `profiles.onboarding_status`, and `profiles.onboarding_completed_at`
- writes sanitized audit events for company creation, owner membership creation, and onboarding completion
- returns only minimal IDs/status values

It does not accept arbitrary target user IDs and does not allow callers to set `admin` or assign roles directly.

### `public.complete_onboarding_rpc()`

Completes or advances onboarding state for the authenticated caller:

- validates `auth.uid()`
- validates the caller has a `public.profiles` row
- requires profile status `active` or `verified`
- updates protected onboarding fields based on current role/state
- leaves technicians without verified status in `technician_verification_pending`
- leaves company owners without active owner membership in `company_required`
- writes an audit event only when onboarding transitions to `complete`
- returns only minimal profile/company/technician IDs and onboarding status

## Trusted Trigger Bypass

The migration updates the existing profile protection triggers to allow protected profile field updates only when a transaction-local setting is enabled:

```sql
set_config('app.trusted_onboarding_mutation', 'on', true)
```

Only the new authenticated `SECURITY DEFINER` RPCs set this flag. Normal browser table updates still cannot change protected profile fields.

## Server Action Changes

- `createCompanyAndOwnerMembership` now calls `create_company_and_owner_membership_rpc`.
- `completeOnboarding` now calls `complete_onboarding_rpc`.
- `updateTechnicianProfile` remains conservative and RLS-respecting.

The user manually applied `0012` to the confirmed dev/staging Supabase project and reported:

```text
Success. No rows returned.
```

## SQL Editor Application Instructions

The Supabase CLI was not available in the local shell during this task. The user applied the migration manually. Keep these instructions for future dev/staging re-application:

1. Open the confirmed dev/staging Supabase project.
2. Go to SQL Editor.
3. Paste the full contents of `supabase/migrations/0012_onboarding_trusted_rpc.sql`.
4. Run the migration once.
5. Stop immediately on any SQL error.
6. Do not run this against production.

Suggested verification queries after manual apply:

```sql
select proname
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname in (
    'create_company_and_owner_membership_rpc',
    'complete_onboarding_rpc'
  );

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_company_and_owner_membership_rpc',
    'complete_onboarding_rpc'
  );

select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'create_company_and_owner_membership_rpc',
    'complete_onboarding_rpc'
  )
order by routine_name, grantee;
```

Expected posture:

- RPCs exist in `public`.
- RPCs are `SECURITY DEFINER`.
- `authenticated` can execute the RPCs.
- broad `public` execution is revoked.

## Post-Apply Verification

Completed by Codex after the user manually applied the migration:

- Static source check confirmed `create_company_and_owner_membership_rpc` exists in `0012`.
- Static source check confirmed `complete_onboarding_rpc` exists in `0012`.
- Static source check confirmed `revoke all ... from public` and `grant execute ... to authenticated` for both RPCs.
- Static source check confirmed `createCompanyAndOwnerMembership` calls `create_company_and_owner_membership_rpc`.
- Static source check confirmed `completeOnboarding` calls `complete_onboarding_rpc`.
- An anon-key REST probe returned `42501 permission denied for function complete_onboarding_rpc`.
- An anon-key REST probe returned `42501 permission denied for function create_company_and_owner_membership_rpc`.
- Service-role exposure scan in frontend source found no matches.
- `npm run lint` passed.
- `npm run build -- --webpack` passed.
- `git diff --check` passed.

No additional SQL was applied by Codex during verification.

## Security Notes

- No service-role key is used or exposed to frontend code.
- The RPCs use `auth.uid()` and authenticated JWT context.
- Company creation does not accept a target user ID from the browser.
- Audit metadata is intentionally sanitized and excludes customer data, raw invite tokens, token hashes, payment data, and private notes.
- These RPCs are a narrow foundation for onboarding only; invite acceptance, join requests, technician verification, and admin tools remain future work.

## Remaining Blockers Before Onboarding UI

- Verify authenticated RPC behavior with seeded dev users.
- Build a small onboarding UI that passes the current user's access token to these server actions.
- Add user-facing handling for RPC errors such as duplicate slug, inactive profile, or existing active owner company.
- Add authenticated RLS tests for company creation and onboarding completion.
