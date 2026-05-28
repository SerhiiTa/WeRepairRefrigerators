# Migration Application Readiness Checklist

## Purpose

This checklist is the final review gate before applying the review-only onboarding, audit, RLS helper, and table-policy migrations to Supabase.

Do not apply migrations from this document alone. This is planning/review only. Do not execute SQL, run Supabase push/reset, modify production data, change frontend behavior, install packages, or commit from this checklist.

## Current Known State

- `supabase/migrations/0001_profiles_roles.sql` has been manually applied in the current development Supabase project.
- `supabase/migrations/0002_real_marketplace_core_draft.sql` is review-only and should remain separate from the onboarding/audit/RLS application path.
- `supabase/migrations/0003_onboarding_foundation_draft.sql` has not been applied.
- `supabase/migrations/0004_audit_log_foundation_draft.sql` has not been applied.
- `supabase/migrations/0005_rls_helpers_draft.sql` has not been applied.
- `supabase/migrations/0006_onboarding_rls_policies_draft.sql` has not been applied.
- Dashboard and public marketplace workflows still use mock/local data.

## 1. Migration Order

Recommended order for a development/staging project only:

1. Confirm `0001_profiles_roles.sql` is already applied and verified.
2. Review and apply `0003_onboarding_foundation_draft.sql`.
3. Review and apply `0004_audit_log_foundation_draft.sql`.
4. Review and apply `0005_rls_helpers_draft.sql`.
5. Review, revise, and apply `0006_onboarding_rls_policies_draft.sql`.
6. Run seed/test fixtures and access tests before building UI or server actions on top of these tables.

Do not apply `0002_real_marketplace_core_draft.sql` as part of this onboarding sequence unless a separate marketplace persistence review is completed.

## 2. Migration Dependencies

`0003_onboarding_foundation_draft.sql` depends on:

- `public.profiles`
- `public.app_role`
- `public.current_app_role()`
- `public.set_updated_at()`

`0004_audit_log_foundation_draft.sql` depends on:

- `public.profiles`
- `public.companies`

`0005_rls_helpers_draft.sql` depends on:

- `public.profiles`
- `public.companies`
- `public.company_members`
- `public.technician_profiles`

`0006_onboarding_rls_policies_draft.sql` depends on:

- `0003` onboarding tables
- `0004` audit logs
- `0005` helper predicates
- final grant and helper recursion review

## 3. Rollback Strategy

Before application, document a rollback plan that includes:

- Target environment name and Supabase project id.
- Exact migrations applied.
- Backup/export location.
- Whether rollback will be a manual reverse migration or a fresh development project.
- Dependency order for rollback: policies first, then helpers, audit logs, onboarding tables, enums/functions last.

Avoid destructive rollback in any production-like environment unless a reviewed recovery plan exists.

## 4. Backup / Export Recommendation

Before applying beyond a disposable development project:

- Export schema.
- Export `public.profiles`.
- Export auth users if the environment contains meaningful test accounts.
- Save SQL Editor history or CLI migration output.
- Confirm backups do not contain service-role keys or secrets.

## 5. Staging vs Production Decision

Recommended:

- First application: disposable development project.
- Second application: staging project with representative test users.
- Production: no application until all go/no-go criteria pass in staging.

Do not apply these drafts directly to production.

## 6. Supabase SQL Editor vs CLI Recommendation

For first controlled review:

- SQL Editor is acceptable for development only when each migration is pasted and reviewed manually.
- Supabase CLI is preferred once project linking, migration status checks, and rollback practices are established.

Do not use CLI blindly. Confirm the linked project before any migration command.

## 7. RLS Helper Review

Before applying `0005`:

- Confirm every `SECURITY DEFINER` helper has trusted ownership.
- Confirm `search_path` is locked.
- Confirm helpers are read-only.
- Confirm helpers return booleans or sanitized ids only.
- Confirm helpers do not expose PII.
- Confirm direct execute grants are intentional.
- Confirm anonymous users receive false/empty/public visitor results.

## 8. RLS Recursion Risk

Before applying `0006`:

- Test whether helpers query tables that call those same helpers in policies.
- Test `profiles`, `company_members`, and `technician_profiles` policies with RLS enabled.
- Confirm helper functions do not accidentally create infinite policy recursion.
- Confirm admin checks do not depend on policies that require admin checks.

## 9. Service Role Safety

Required:

- Service-role key must never be used in frontend code.
- Service-role key must never be placed in `NEXT_PUBLIC_*` env vars.
- Server-only service-role usage must validate the caller's session/profile first.
- Service-role writes must be scoped, audited, and reviewed.
- Browser clients must not write `audit_logs` directly.

## 10. Seed / Test Users Needed

Create test users in development/staging:

- Anonymous visitor.
- Customer with active profile.
- Technician with pending profile.
- Technician with active profile but unverified technician profile.
- Verified technician.
- Expert technician if needed.
- Company owner with active profile.
- Company manager.
- Company dispatcher.
- Company technician member.
- Suspended company member.
- Removed company member.
- Admin.

## 11. Company / Technician Test Fixtures

Create fixtures for:

- Active company A.
- Active company B.
- Suspended company.
- Archived company.
- Active owner membership.
- Active manager membership.
- Active technician membership.
- Pending invite.
- Expired invite.
- Revoked invite.
- Pending join request.
- Approved join request.
- Rejected join request.
- Independent technician profile.
- Company-linked technician profile.
- Suspended/archived technician profile.

## 12. Positive Access Tests

Must pass:

- User selects own profile.
- Admin selects profiles.
- Active company owner views own company.
- Active company owner views own company members.
- Active company manager views join requests for own company.
- Technician creates own draft technician profile.
- Technician selects own technician profile.
- Company owner views company-linked technician profile.
- Technician creates own pending join request for technician role.
- Requester selects own join request.
- Admin reads expected support data through reviewed admin path.

## 13. Negative Access Tests

Must fail:

- Anonymous user selects onboarding tables.
- Customer selects company member rows.
- Technician self-updates `profiles.role`.
- Technician self-updates `profiles.status`.
- Technician self-updates `profiles.company_id`.
- Technician self-updates `profiles.onboarding_status`.
- Technician creates company owner membership.
- Technician requests owner/manager/dispatcher role through join request.
- Normal authenticated user selects `company_invites`.
- Normal authenticated user selects, inserts, updates, or deletes `audit_logs`.

## 14. Cross-Company Isolation Tests

Must fail:

- Company A owner selects Company B.
- Company A owner selects Company B members.
- Company A owner updates Company B.
- Company A manager reviews Company B join request.
- Company A owner views Company B technician private profile.
- Multi-company user sees only active companies where they are active members.

## 15. Expired Invite Tests

Must pass/fail as appropriate:

- Pending unexpired invite can be accepted through server action only.
- Expired invite cannot be accepted.
- Revoked invite cannot be accepted.
- Accepted invite cannot be reused.
- Raw invite token is never stored.
- `token_hash` is never returned to browser UI.
- Invite acceptance writes audit events.

## 16. Suspended Member Tests

Must fail:

- Suspended member views company.
- Suspended member views company members.
- Suspended owner manages company.
- Suspended manager reviews join requests.
- Removed/archived member retains any company access.

## 17. Audit Append-Only Tests

Must pass:

- Trusted server/admin insert path can create sanitized audit rows.
- Audit update attempts fail.
- Audit delete attempts fail.
- Normal authenticated user cannot select audit logs.
- Normal authenticated user cannot insert audit logs.
- Metadata sanitizer rejects raw invite tokens, token hashes, service credentials, customer contact details, full addresses, payment data, private notes, and full client payloads.

## 18. Mobile Auth Regression Note

Mobile auth issue was caused by Next.js dev-mode HMR websocket instability on iPhone Safari over LAN, not Supabase Auth.

For local mobile auth regression testing, use:

```bash
npm run build -- --webpack
npm run start -- -H 0.0.0.0 -p 3001
```

Then test:

- Desktop: `http://localhost:3001/login`
- Phone: `http://10.0.0.67:3001/login`

Do not rely on `next dev` for iPhone auth debugging.

## 19. Frontend Impact Checklist

Before any frontend uses these tables:

- Types are updated for newly applied tables.
- Dashboard still works in mock-safe mode during rollout.
- No public page reads raw private tables.
- No browser client can read invite token hashes.
- No browser client can write audit logs.
- Route protection plan is approved before gating dashboard routes.
- Onboarding UI does not allow public signup to create `company_owner` or `admin`.
- Server actions exist for multi-table mutations before enabling company/invite flows.

## 20. Do Not Apply Until Blockers

Do not apply `0003`-`0006` until:

- A target development/staging project is confirmed.
- Backup/export plan is complete.
- Migration order is approved.
- Rollback plan is documented.
- `0005` helper recursion and grant behavior are reviewed.
- `0006` direct grants are reviewed.
- Raw `company_invites` browser access strategy is resolved with sanitized view/RPC.
- Audit insert path and metadata sanitizer are designed.
- Server action boundaries are approved for company creation, invite acceptance, join approval, and technician verification.
- Column-protection strategy is approved for sensitive fields that RLS cannot protect by column.
- Seed/test users and fixtures are ready.
- Positive and negative access tests are written or manually scripted.
- Cross-company isolation tests are ready.
- Mobile auth regression test path is confirmed.

## Recommended First Safe Application Path

1. Use a disposable development Supabase project.
2. Confirm `0001` is applied and profile signup/login works.
3. Apply reviewed `0003`.
4. Inspect tables, constraints, indexes, triggers, and RLS enablement.
5. Apply reviewed `0004`.
6. Confirm `audit_logs` exists, RLS is enabled, and browser access is revoked.
7. Apply reviewed `0005`.
8. Test helper functions with seed users before any table policies.
9. Revise `0006` based on helper/grant results.
10. Apply reviewed `0006`.
11. Run the full access test checklist before building UI or server actions.

## Recommended Post-Application Verification

After applying in development/staging:

- Confirm all expected enums exist.
- Confirm all expected tables exist.
- Confirm all expected indexes exist.
- Confirm all expected triggers exist.
- Confirm RLS is enabled on private tables.
- Confirm grants do not expose private tables to `anon`.
- Confirm browser clients cannot read raw invites or audit logs.
- Confirm profile role/status protections still work.
- Confirm onboarding fields cannot be self-updated.
- Confirm helper functions return expected results for every seed role.
- Confirm positive, negative, cross-company, invite, suspended-member, and audit tests.
- Confirm existing frontend login/dashboard mock-safe behavior still works.

## Go / No-Go Criteria

Go only if:

- All required reviews are complete.
- Target environment is development or staging.
- Backups/exports are complete.
- Rollback plan is documented.
- Helper recursion risks are tested.
- Raw invite and audit table browser access is blocked.
- Seed/test fixture plan is ready.
- Access tests pass.
- No public/private data leakage is found.

No-go if:

- Target environment is production.
- Service-role key would be used in frontend.
- Invite token hash could be read by browser clients.
- Audit logs could be edited/deleted by normal users.
- Suspended/removed/archived members retain access.
- Company A can read Company B data.
- Public pages can read raw private tables.
- Onboarding status, role, profile status, or company assignment can be self-escalated from browser clients.
- Rollback or backup is unclear.
