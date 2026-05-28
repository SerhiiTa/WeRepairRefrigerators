# RLS Patch Result - Task 74

## Purpose

Task 74 addresses the Task 73 static RLS finding that suspended company members could read their own raw `company_members` row while `archived_at` was null.

The risk was that raw `company_members` includes private/internal fields such as `notes`, so suspended or removed members should not retain broad self-read access to that table.

## Environment

- Environment: current user-confirmed dev/staging Supabase project
- Project ref: `hejpgyzorrxpfcyvmypb`
- Production customers/data: none
- Frontend behavior changed: no

## Files Created

- `supabase/migrations/0011_patch_company_members_rls_visibility.sql`
- `docs/COMPANY_MEMBER_SELF_STATUS_VIEW_PLAN.md`

## Patch Summary

The patch migration removes the old own-row select policy:

```sql
profile_id = public.auth_user_id()
and archived_at is null
```

It does not create a replacement raw self-select policy, because `company_members` contains private/admin fields such as `notes`.

The existing manager/admin policy remains unchanged:

```sql
public.can_manage_company_members(company_id)
```

That means active company managers, owners, and admins can still review membership rows as intended, while non-manager members, including suspended/removed/inactive users, no longer get raw self-row visibility.

If active or inactive users need to see their own membership status later, add a sanitized view/RPC that returns only safe fields and excludes private notes.

## Application Status

The user manually applied `supabase/migrations/0011_patch_company_members_rls_visibility.sql` through the Supabase SQL Editor for the confirmed dev/staging project `hejpgyzorrxpfcyvmypb`.

Reported result:

- `Success. No rows returned.`

Codex did not execute SQL, did not use the Supabase CLI, and did not use or expose a service-role key.

## Verification Performed

Codex performed non-mutating verification only:

- Reviewed `0011_patch_company_members_rls_visibility.sql`.
- Confirmed the migration drops the old unsafe self-row policy:
  - `Users can select own company memberships`
- Confirmed the migration does not create a replacement raw self-select policy.
- Confirmed the existing manager/admin policy from `0010` remains unchanged:
  - `Company managers can select memberships`
  - `public.can_manage_company_members(company_id)`
- Ran an anonymous REST probe against `company_members` using only the public anon key.
- Ran `git diff --check`.

Anonymous REST probe result:

| Actor | Object | Operation | Result |
| --- | --- | --- | --- |
| anonymous | `company_members` | select | Pass: `401 / 42501 permission denied` |

## Verification Conclusions

Based on the successful manual SQL Editor application and static review of the applied patch:

- The old unsafe `company_members` self-row SELECT policy has been removed by `0011`.
- No replacement raw self-row policy exists for non-manager members.
- Company managers/admins should still be able to review/manage membership rows through the existing `Company managers can select memberships` policy and `public.can_manage_company_members(company_id)` helper.
- Suspended, removed, archived, and non-manager members should not have raw private `company_members` row access unless another future policy reintroduces it.
- Anonymous users still cannot read `company_members`.
- Frontend behavior did not change.

## Optional Catalog Verification Queries

Run these in Supabase SQL Editor if a direct catalog confirmation is needed.

### Confirm Policy Exists

```sql
select
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where schemaname = 'public'
  and tablename = 'company_members'
order by policyname;
```

Expected:

- `Users can select own company memberships` no longer exists.
- `Users can select own active company memberships` does not exist.
- `Company managers can select memberships` still exists.

### Confirm RLS Is Enabled

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'company_members';
```

Expected:

- `rowsecurity = true`

### Seeded Authenticated Test Still Recommended

Using the Task 73 dev-only fixtures, verify:

- Non-manager active member cannot read their own raw `company_members` row.
- Suspended member cannot read their own raw `company_members` row.
- Archived member cannot read their own raw `company_members` row.
- Active company owner/manager can still review company membership rows.

## Remaining RLS Risks

- Seeded authenticated tests are still recommended before onboarding server actions are considered safe.
- Raw `company_members` remains unsuitable as a user-facing membership-status API for any non-manager member.
- A future sanitized view/RPC should be added if suspended or removed users need to see a safe account status message.
- Server actions must still enforce input validation, transactions, audit logging, and company-scoped authorization.

## Safety Confirmation

- No frontend behavior changed.
- No packages were installed.
- No service-role key was used or exposed.
- No production data was modified.
- No commit was made.
