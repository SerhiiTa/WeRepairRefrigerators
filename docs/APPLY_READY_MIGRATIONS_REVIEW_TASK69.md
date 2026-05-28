# Apply-Ready Migrations Review - Task 69

## Purpose

Task 69 prepares staging-oriented apply-ready migration copies from the existing onboarding, audit, RLS helper, and onboarding policy drafts.

No migration was applied. No SQL was executed. No Supabase push/reset was run. No frontend behavior changed.

## Files Created

- `supabase/migrations/0007_onboarding_foundation_apply_ready.sql`
- `supabase/migrations/0008_audit_log_foundation_apply_ready.sql`
- `supabase/migrations/0009_rls_helpers_apply_ready.sql`
- `supabase/migrations/0010_onboarding_rls_policies_apply_ready.sql`

The original draft files remain unchanged:

- `supabase/migrations/0003_onboarding_foundation_draft.sql`
- `supabase/migrations/0004_audit_log_foundation_draft.sql`
- `supabase/migrations/0005_rls_helpers_draft.sql`
- `supabase/migrations/0006_onboarding_rls_policies_draft.sql`

## What Was Copied

From `0003` into `0007`:

- onboarding enums
- `profiles.onboarding_status`
- `profiles.onboarding_completed_at`
- onboarding profile guard trigger
- `companies`
- `company_members`
- `technician_profiles`
- `company_invites`
- `company_join_requests`
- indexes, timestamp triggers, RLS enablement, and anon revokes

From `0004` into `0008`:

- `audit_event_type`
- `audit_logs`
- audit log indexes
- append-only update/delete prevention trigger
- RLS enablement and revoked browser grants

From `0005` into `0009`:

- `auth_user_id()`
- `current_profile_role()`
- `is_admin()`
- company membership and management helpers
- technician profile access helpers
- public technician visibility helper

From `0006` into `0010`:

- own-profile select/update policies
- admin profile select/update policies
- company select policies
- company member select policies
- technician profile select and own-draft insert policies
- join request select and own-pending insert policies
- direct browser block for raw invites and audit logs

## What Changed

The new files remove the blocking review-only headers and convert the comments into staging apply-ready scope notes.

`0009` adds explicit helper execute grants:

- revoked helper execution from `public`
- granted helper execution to `authenticated`

`0010` is intentionally more conservative than the Task 66 draft:

- no browser `UPDATE` grant or policy for `companies`
- no browser `UPDATE` grant or policy for `company_members`
- no browser `UPDATE` grant or policy for `technician_profiles`
- no browser `UPDATE` grant or policy for `company_join_requests`
- no browser access to `company_invites`
- no browser access to `audit_logs`

This keeps staging application safer while server actions, audit insert helpers, invite token flows, and column-safe update paths are still not implemented.

## What Was Removed Or Deferred

Deferred from apply-ready SQL:

- company creation from browser clients
- company updates from browser clients
- membership creation/update from browser clients
- technician profile update from browser clients
- join request cancellation/review update from browser clients
- raw `company_invites` browser reads
- raw `audit_logs` browser reads/writes
- audit insert helper
- metadata sanitizer
- sanitized invite summary view/RPC
- onboarding server actions
- technician verification server action
- company owner onboarding server action
- invite acceptance transaction
- join approval transaction
- public technician projection/view

These items need future server-side implementation or separate migrations.

## Suitability

Suitable for:

- disposable development Supabase project
- staging Supabase project after backup/export and rollback planning
- schema/RLS smoke testing with seeded users and fixtures

Not suitable for:

- production
- live customer data
- live technician onboarding
- public invite workflows
- real company creation
- real dispatch or marketplace persistence

## Required Manual Review Before Actual Apply

Before applying `0007`-`0010`:

1. Confirm target Supabase project is disposable development or staging.
2. Confirm `0001_profiles_roles.sql` is already applied and verified.
3. Export schema and `public.profiles`.
4. Document rollback path.
5. Confirm `pgcrypto` extension policy is acceptable.
6. Review `SECURITY DEFINER` helper ownership and `search_path`.
7. Review helper execute grants.
8. Prepare seed users and company/technician fixtures.
9. Prepare positive, negative, cross-company, expired invite, suspended member, and audit append-only tests.
10. Confirm no frontend code depends on these tables yet.
11. Confirm no service-role key is exposed to frontend.

## Verification Performed

Local checks only:

- blocker scan for `REVIEW-ONLY`, `review-only`, `do-not-apply`, `Do not apply`, and `pseudocode` in `0007`-`0010`
- lightweight static text check for balanced dollar quote markers, SQL presence, and reasonable file endings
- `git diff --check`

Unavailable locally:

- `psql`
- `pg_format`
- `sqlfluff`

No Supabase connection or SQL execution was performed.

## Recommended Next Task

Run a human review of `0007`-`0010`, then prepare a staging-only application task that:

- confirms Supabase project/environment
- confirms backup/export and rollback path
- applies one migration at a time
- stops at the first SQL error
- verifies tables, functions, policies, grants, and RLS
- runs seed/test fixture access checks
