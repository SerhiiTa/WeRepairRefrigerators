# Task 68 Migration Application Blockers

## Decision

Task 68 was blocked before any Supabase migration was applied.

No SQL was executed. No Supabase CLI command was run. No Supabase push/reset was run. No production or development data was modified.

## Environment Status

- Local `frontend/.env.local` exists, which indicates a Supabase-enabled frontend environment may be configured.
- No Supabase project id, staging/test project, backup/export path, or rollback target was confirmed during Task 68.
- No staging/test Supabase environment was selected for migration application.

## Why Application Was Blocked

The readiness checklist and migration files still contain explicit blockers:

- `docs/MIGRATION_APPLICATION_READINESS_CHECKLIST.md` states not to apply `0003`-`0006` until target environment, backup/export, rollback, helper recursion, grant review, invite strategy, audit insert path, server action boundaries, column protection, fixtures, and access tests are ready.
- `supabase/migrations/0003_onboarding_foundation_draft.sql` is still marked review-only and says not to apply until onboarding flows, table-specific RLS policies, invite token validation, audit logging, and company ownership rules are reviewed and tested.
- `supabase/migrations/0004_audit_log_foundation_draft.sql` is still marked review-only and says not to apply until audit insertion paths, RLS policies, admin access rules, retention policy, and metadata redaction are reviewed.
- `supabase/migrations/0005_rls_helpers_draft.sql` is still marked review-only and says not to apply until helper ownership, grants, RLS recursion, search path behavior, table-specific policies, and test fixtures are reviewed.
- `supabase/migrations/0006_onboarding_rls_policies_draft.sql` is still marked review-only and says not to apply until onboarding tables, audit logs, helper functions, grants, RLS recursion behavior, invite token flows, server actions, and test fixtures are reviewed together.

## Required Cleanup Before Applying

Before any future migration application task:

1. Confirm the target Supabase project and environment is disposable development or staging, not production.
2. Document backup/export location for schema, `public.profiles`, and meaningful auth/test data.
3. Document rollback strategy for `0003`, `0004`, `0005`, and `0006`.
4. Review and revise `0003` so it is no longer merely review-only and all onboarding schema blockers are resolved.
5. Review and revise `0004` with a trusted audit insert path, metadata sanitizer, admin read strategy, and retention decision.
6. Review and revise `0005` for helper ownership, direct execute grants, `SECURITY DEFINER`, `search_path`, and recursion risk.
7. Review and revise `0006` for final grants, helper recursion, invite/audit browser access, column-protection strategy, and server-only mutation boundaries.
8. Decide whether company invite summaries require a sanitized view or RPC before any invite UI exists.
9. Define server actions/RPC boundaries for company creation, invite creation, invite acceptance, join request approval/rejection, technician profile verification, and onboarding completion.
10. Prepare seed users and fixtures for customer, technician, verified technician, company owner, manager, dispatcher, suspended/removed member, admin, multi-company, expired invite, revoked invite, and cross-company tests.
11. Prepare positive, negative, cross-company isolation, expired invite, suspended member, and audit append-only test scripts or manual SQL procedures.
12. Confirm mobile auth regression testing uses production-mode local start, not `next dev`.

## Recommended Next Task

Create a migration hardening task that converts `0003`-`0006` from review-only drafts into an executable development/staging migration set, with:

- final comments replacing blocking review-only language,
- reviewed grants,
- helper recursion test notes,
- sanitized invite view/RPC plan,
- audit insert function/server-action plan,
- column-protection strategy,
- seed fixture plan,
- manual verification SQL,
- rollback notes.

Only after that hardening task should a new migration application task attempt Supabase SQL execution.
