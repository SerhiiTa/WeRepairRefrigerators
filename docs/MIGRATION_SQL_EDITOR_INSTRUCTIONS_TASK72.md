# Migration SQL Editor Instructions - Task 72

## Purpose

Task 72 pre-checks passed for the current user-confirmed dev/staging Supabase project, but local automated application is not available because the Supabase CLI is not installed or linked in this shell.

No migration was applied by Codex. No SQL was executed by Codex. No Supabase project was modified by Codex.

Use these instructions to apply the migrations manually in the Supabase SQL Editor, one file at a time.

## Confirmed Target

- Environment: user-confirmed dev/staging only
- Supabase project ref from `frontend/.env.local`: `hejpgyzorrxpfcyvmypb`
- Production status: not production; no real production customers/data

## Pre-Checks Completed

- `git status --short` was checked.
- `frontend/.env.local` points to `https://hejpgyzorrxpfcyvmypb.supabase.co`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is present.
- No service-role key was printed or used.
- Project files were scanned for service-role exposure; only documentation warnings were found.
- `0007`-`0010` were scanned for blocker phrases:
  - `REVIEW-ONLY`
  - `review-only`
  - `do-not-apply`
  - `Do not apply`
  - `pseudocode`
  - `PSEUDOCODE`
- `0007`-`0010` were scanned for destructive operations:
  - `DROP TABLE`
  - `DROP TYPE`
  - `TRUNCATE`
  - `DELETE FROM`
- No blocker phrases or destructive operations were found.

## Application Method

Use Supabase SQL Editor manually.

Do not install Supabase CLI for this task.
Do not use service-role keys in frontend code.
Run one migration at a time and stop immediately on any error.

## Migration 1 - Apply `0007`

1. Open Supabase Dashboard.
2. Open project `hejpgyzorrxpfcyvmypb`.
3. Open SQL Editor.
4. Create a new query named:

```text
Task 72 - 0007 onboarding foundation
```

5. Paste the full contents of:

```text
supabase/migrations/0007_onboarding_foundation_apply_ready.sql
```

6. Run the query.
7. Stop immediately if any error appears.
8. If successful, save/copy the SQL Editor result text for the Task 72 follow-up.

Expected objects:

- `onboarding_status`
- `company_status`
- `company_member_role`
- `company_member_status`
- `technician_status`
- `technician_affiliation_type`
- `company_invite_status`
- `company_join_request_status`
- `companies`
- `company_members`
- `technician_profiles`
- `company_invites`
- `company_join_requests`

## Migration 2 - Apply `0008`

Run only after `0007` succeeds.

1. Create a new SQL Editor query named:

```text
Task 72 - 0008 audit log foundation
```

2. Paste the full contents of:

```text
supabase/migrations/0008_audit_log_foundation_apply_ready.sql
```

3. Run the query.
4. Stop immediately if any error appears.
5. If successful, save/copy the SQL Editor result text for the Task 72 follow-up.

Expected objects:

- `audit_event_type`
- `audit_logs`
- `prevent_audit_log_update_delete()`
- `prevent_audit_log_update` trigger
- `prevent_audit_log_delete` trigger

## Migration 3 - Apply `0009`

Run only after `0008` succeeds.

1. Create a new SQL Editor query named:

```text
Task 72 - 0009 RLS helpers
```

2. Paste the full contents of:

```text
supabase/migrations/0009_rls_helpers_apply_ready.sql
```

3. Run the query.
4. Stop immediately if any error appears.
5. If successful, save/copy the SQL Editor result text for the Task 72 follow-up.

Expected helper functions:

- `auth_user_id()`
- `current_profile_role()`
- `is_admin()`
- `is_company_owner(uuid)`
- `is_active_company_member(uuid)`
- `current_company_ids()`
- `can_manage_company(uuid)`
- `can_view_company(uuid)`
- `can_manage_company_members(uuid)`
- `can_view_technician_profile(uuid)`
- `can_manage_technician_profile(uuid)`
- `can_view_public_technician_profile(uuid)`

## Migration 4 - Apply `0010`

Run only after `0009` succeeds.

1. Create a new SQL Editor query named:

```text
Task 72 - 0010 onboarding RLS policies
```

2. Paste the full contents of:

```text
supabase/migrations/0010_onboarding_rls_policies_apply_ready.sql
```

3. Run the query.
4. Stop immediately if any error appears.
5. If successful, save/copy the SQL Editor result text for the Task 72 follow-up.

Expected policy posture:

- Own profile select/update policies exist.
- Admin profile select/update policies exist.
- Company select policy exists.
- Company member select policies exist.
- Technician profile select and own draft insert policies exist.
- Join request select and own pending insert policies exist.
- Raw `company_invites` browser access remains revoked.
- Raw `audit_logs` browser access remains revoked.

## Post-Apply Verification Query

After all four migrations succeed, run this SQL Editor query and paste the results back into the Codex thread.

```sql
select
  'table_exists' as check_type,
  table_schema || '.' || table_name as object_name,
  null::text as extra
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'companies',
    'company_members',
    'technician_profiles',
    'company_invites',
    'company_join_requests',
    'audit_logs'
  )

union all

select
  'enum_exists' as check_type,
  'public.' || t.typname as object_name,
  null::text as extra
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in (
    'onboarding_status',
    'company_status',
    'company_member_role',
    'company_member_status',
    'technician_status',
    'technician_affiliation_type',
    'company_invite_status',
    'company_join_request_status',
    'audit_event_type'
  )

union all

select
  'function_exists' as check_type,
  n.nspname || '.' || p.proname as object_name,
  pg_get_function_identity_arguments(p.oid) as extra
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'auth_user_id',
    'current_profile_role',
    'is_admin',
    'is_company_owner',
    'is_active_company_member',
    'current_company_ids',
    'can_manage_company',
    'can_view_company',
    'can_manage_company_members',
    'can_view_technician_profile',
    'can_manage_technician_profile',
    'can_view_public_technician_profile',
    'prevent_audit_log_update_delete'
  )

union all

select
  'rls_enabled' as check_type,
  schemaname || '.' || tablename as object_name,
  rowsecurity::text as extra
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'companies',
    'company_members',
    'technician_profiles',
    'company_invites',
    'company_join_requests',
    'audit_logs'
  )
order by check_type, object_name;
```

## Policy Verification Query

Run this after the post-apply verification query.

```sql
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'companies',
    'company_members',
    'technician_profiles',
    'company_invites',
    'company_join_requests',
    'audit_logs'
  )
order by tablename, policyname;
```

## Browser Privacy Checks

After applying and running verification SQL, use the app only after confirming:

- `company_invites` cannot be selected directly by a normal browser/authenticated user.
- `audit_logs` cannot be selected, inserted, updated, or deleted by a normal browser/authenticated user.
- `profiles.role`, `profiles.status`, `profiles.company_id`, `profiles.onboarding_status`, and `profiles.onboarding_completed_at` cannot be self-updated by non-admin users.

These checks may require a follow-up task with test users and browser/client queries.

## Paste Back To Codex

After applying, paste:

1. Whether `0007` succeeded.
2. Whether `0008` succeeded.
3. Whether `0009` succeeded.
4. Whether `0010` succeeded.
5. Any SQL Editor warning/error text.
6. Results from the post-apply verification query.
7. Results from the policy verification query.

Codex can then update `docs/MIGRATION_APPLICATION_RESULT_TASK72.md` and run follow-up verification.
