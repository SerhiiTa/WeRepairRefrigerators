# Apply-Ready Migrations Human Review - Task 70

## Purpose

Task 70 reviewed the staging apply-ready migration set before any Supabase application:

- `supabase/migrations/0007_onboarding_foundation_apply_ready.sql`
- `supabase/migrations/0008_audit_log_foundation_apply_ready.sql`
- `supabase/migrations/0009_rls_helpers_apply_ready.sql`
- `supabase/migrations/0010_onboarding_rls_policies_apply_ready.sql`

No migration was applied. No SQL was executed. No Supabase push/reset was run. No production data was modified. No frontend behavior changed.

## Review Summary

The migration set is conditionally suitable for a disposable development or staging Supabase project after `0001_profiles_roles.sql` is verified. It is not production-approved.

The set remains intentionally conservative:

- `0007` creates onboarding tables, enums, triggers, indexes, baseline RLS enablement, and narrow anonymous revokes.
- `0008` creates append-only audit log foundation and keeps audit logs inaccessible to browser roles.
- `0009` creates read-only RLS helper predicates with `SECURITY DEFINER` and explicit `search_path = public`.
- `0010` creates conservative onboarding policies, allows only selected reads and low-risk self-service inserts, blocks raw invite/audit browser access, and defers privileged mutations to server actions/RPCs.

## Findings

### Syntax And Ordering

- No obvious syntax blocker was found by static text review.
- The migrations must be applied in order: `0007`, `0008`, `0009`, `0010`.
- `0007` depends on `0001_profiles_roles.sql` objects: `public.profiles`, `public.app_role`, `public.current_app_role()`, and `public.set_updated_at()`.
- `0008` depends on `public.companies` from `0007`.
- `0009` depends on onboarding tables from `0007`.
- `0010` depends on helper functions from `0009` and audit logs from `0008`.
- No local PostgreSQL parser was available in this environment, so staging SQL execution remains required before trusting the set.

### Destructive Operations

- No `drop table`, `drop type`, `truncate`, or `delete from` statements were found.
- `drop trigger if exists` and `drop policy if exists` statements are present and scoped to expected replacement targets.
- Existing policies from earlier drafts are explicitly replaced in `0010`, which is expected but should be verified in staging if the target project contains manual policies.

### RLS And Helper Safety

- Helper functions in `0009` use `SECURITY DEFINER` with `set search_path = public`, which is the right direction for recursion-safe predicates.
- Helper ownership and RLS bypass behavior still need staging validation. Confirm the function owner, table owner, and Supabase execution context before production.
- RLS recursion risk is reduced because helpers are `SECURITY DEFINER`, but it is not proven until tested with seeded users and RLS enabled.
- Direct helper execution is granted only to `authenticated`, and helpers return scalar booleans or current-user company ids. This is acceptable for staging, but still needs review before production.

### Invite And Audit Privacy

- Raw `company_invites` browser access remains revoked in `0010`; `token_hash` should not be browser-readable.
- Raw `audit_logs` browser access remains revoked in `0010`; audit logs are append-only through the `0008` trigger.
- Audit log insertion is still deferred to trusted server actions/RPCs with metadata sanitization.
- Invite creation, acceptance, revocation, expiration, and sanitized invite listing are still deferred to server-side flows.

### Profile Escalation And Company Isolation

- `profiles.role`, `profiles.status`, `profiles.company_id`, `profiles.role_intent`, `profiles.onboarding_status`, and `profiles.onboarding_completed_at` rely on existing triggers from `0001` and `0007` for column protection.
- The `0007` onboarding profile guard uses `public.current_app_role() = 'admin'` for admin bypass because `0009` helpers do not exist yet. Before production, consider a follow-up migration that aligns trigger admin bypass behavior with active-admin status checks.
- `profiles.company_id` remains a convenience pointer only. Company access is correctly scoped through `company_members` helper predicates.
- Company/member/technician/join request policies should still be tested with active, suspended, removed, archived, and cross-company fixture users.

## Small Fixes Made

Only comment-level cleanup was made in the apply-ready files:

- Removed confusing leftover `draft UUID primary keys` wording from `0007` and `0008`.
- Reworded dependency comments in `0007`, `0008`, and `0009` to refer to the apply-ready migration path.
- Clarified that table-specific policies are supplied by `0010`.

No executable SQL behavior was changed.

## Deferred To Server Actions Or Later Migrations

- Company creation and owner membership creation.
- Company invite creation, sanitized invite listing, token validation, and acceptance.
- Join request approval/rejection/cancellation.
- Technician profile updates, verification, marketplace enablement, and public profile readiness.
- Onboarding completion.
- Audit log insertion helper, metadata sanitizer, and admin read model.
- Public technician projection/view.
- Final production RLS/access tests and rollback migrations.

## Staging Safety Decision

Staging-safe: conditional yes.

Conditions before applying:

1. Use a disposable development or staging Supabase project only.
2. Verify `0001_profiles_roles.sql` is already applied.
3. Export schema and existing `public.profiles`.
4. Confirm rollback path.
5. Confirm `pgcrypto` extension policy.
6. Apply one migration at a time and stop on first error.
7. Run seed fixtures and positive/negative/cross-company access tests.
8. Verify raw invite and audit tables are not browser-readable.
9. Verify audit logs cannot be updated or deleted through normal paths.
10. Confirm no frontend code depends on these tables until server actions and RLS tests are complete.

Production-safe: no.

## Remaining Blockers

- No live Supabase syntax execution has been performed.
- No seed fixture access tests have been run.
- No helper recursion tests have been run.
- No server actions/RPCs exist for privileged onboarding workflows.
- No trusted audit insert path or metadata sanitizer exists.
- No sanitized invite summary view/RPC exists.
- No public technician projection exists.
- No production rollback migration exists.
- Trigger admin bypass behavior should be reviewed against active-admin requirements before production.

## Verification

Task 70 verification used local-only checks:

- Blocker scan on `0007`-`0010` for review-only/pseudocode/do-not-apply terms.
- Safety scan for destructive SQL, grants, token/hash references, `SECURITY DEFINER`, `search_path`, trigger replacement, and policy replacement.
- `git diff --check`.

No Supabase connection or SQL execution was performed.
