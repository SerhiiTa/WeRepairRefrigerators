# RLS Helper Functions Plan

## Purpose

This document plans reusable Row Level Security helper functions and policy predicates for the future Supabase backend.

This is planning/review only. Do not apply migrations, execute SQL, create final policies, change frontend behavior, or treat this document as production enforcement by itself.

The goal is to reduce duplicated policy logic while preserving strict public/private boundaries for profiles, companies, company members, technician profiles, public technician projections, onboarding, and future marketplace data.

## Current State

- `public.profiles` exists in development from `0001_profiles_roles.sql`.
- `0003_onboarding_foundation_draft.sql` drafts companies, company members, technician profiles, company invites, and company join requests, but it has not been applied.
- `0004_audit_log_foundation_draft.sql` drafts append-only audit logs, but it has not been applied.
- No final onboarding RLS policies, helper functions, or server-side onboarding actions are live yet.
- Task 65 adds `supabase/migrations/0005_rls_helpers_draft.sql` as a review-only helper draft.

## Global Helper Design Principles

- Prefer simple boolean helpers that answer one access question.
- Avoid helpers that perform writes.
- Avoid helpers that hide broad service-role behavior.
- Avoid returning private records or PII from helpers.
- Use `auth.uid()` as the current user source.
- Return safe defaults for anonymous users, usually `false` or empty arrays.
- Keep public technician visibility separate from private technician profile access.
- Treat `profiles.company_id` as a convenience pointer only; company authorization must use `company_members`.
- Suspended, removed, inactive, archived, rejected, and expired records must not grant access.
- Final policies must still be reviewed table by table. Helper functions are not a substitute for policy review.

## Security Definer Guidance

Some helpers need to query RLS-protected tables from inside RLS policies. Those helpers may need `SECURITY DEFINER` to avoid recursive policy failures.

If `SECURITY DEFINER` is used:

- Lock `search_path` to `public`.
- Keep the helper read-only.
- Return only scalar booleans or sanitized ids.
- Do not expose raw table rows.
- Do not use dynamic SQL.
- Review owner/permissions before applying.
- Revoke direct execute grants if the helper should only be used by policies/server code.

Prefer `SECURITY INVOKER` for helpers that do not need to bypass RLS. Avoid `SECURITY DEFINER` for convenience alone.

## Planned Helpers

## `auth_user_id()`

- Purpose: Provide a small stable wrapper around `auth.uid()` for predicate readability.
- Security recommendation: `SECURITY INVOKER`.
- Search path: lock to `public` for consistency even though it only calls `auth.uid()`.
- Return type: `uuid`.
- Used by: all policy families that compare current user/profile ids.
- Prevents: inconsistent use of current user id helpers in policies.
- Limitations: does not prove a profile exists or is active.

## `current_profile_role()`

- Purpose: Return the current profile role, falling back to `public_visitor` when no active profile role is available.
- Security recommendation: likely `SECURITY DEFINER` because policies may need this while selecting from `profiles` and other protected tables.
- Search path: locked to `public`.
- Return type: `public.app_role`.
- Used by: admin checks, dashboard route backing policies, future role-aware policies.
- Prevents: direct role lookups repeated across policies, anonymous users accidentally receiving privileged role.
- Limitations: role alone is not enough; use status and table-specific ownership checks.

## `is_admin()`

- Purpose: Return true only for current user with `role = admin` and `status = active`.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: admin read/manage policies, audit log access, verification/support tooling.
- Prevents: pending/suspended/rejected admin-profile rows retaining admin power.
- Limitations: must be paired with audit logging for admin mutations.

## `is_company_owner(company_id)`

- Purpose: Return true only when the current user has an active owner membership for the target company and the company is active.
- Security recommendation: likely `SECURITY DEFINER` to avoid recursive `company_members` policies.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: `companies`, `company_members`, `company_invites`, `company_join_requests`, future leads/jobs/repair cases.
- Prevents: cross-company access, removed/suspended owner access, `profiles.company_id` shortcut abuse.
- Limitations: does not grant platform admin; does not prove the owner can perform every mutation.

## `is_active_company_member(company_id)`

- Purpose: Return true only when current user has any active membership for the target company and the company is active.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: company-scoped select policies, future team dashboards, limited company context reads.
- Prevents: inactive/removed/suspended members retaining access and cross-company reads.
- Limitations: member role still matters for management actions; use management helpers for writes.

## `current_company_ids()`

- Purpose: Return active company ids for current user.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `uuid[]`.
- Used by: policies that need membership over multiple companies, future multi-company owner/member support.
- Prevents: relying on a single `profiles.company_id` value for multi-company access.
- Limitations: should return an empty array for anonymous users; do not include inactive/suspended/archived company memberships.

## `can_manage_company(company_id)`

- Purpose: Return true when current user can manage company-level settings/status through reviewed server flows.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: `companies` update policies, future company settings, owner/admin server action prechecks.
- Prevents: non-owner members managing company settings, cross-company updates.
- Limitations: should not be the only check for status/archive/admin-only changes.

## `can_view_company(company_id)`

- Purpose: Return true when current user can view company context.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: company profile reads, membership summaries, future team dashboards.
- Prevents: unauthenticated/customer access to private company records and cross-company leakage.
- Limitations: public company profile pages should use separate sanitized public projections, not raw `companies`.

## `can_manage_company_members(company_id)`

- Purpose: Return true when current user can manage membership rows for a company.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: `company_members`, `company_invites`, join request review policies, future team management.
- Prevents: technicians/managers without permission self-promoting or modifying members in another company.
- Limitations: owner transfer, last-owner removal, and platform admin role changes still need server-side transaction checks.

## `can_view_technician_profile(technician_profile_id)`

- Purpose: Return true when the current user can view a raw private technician profile.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: `technician_profiles` select policies.
- Prevents: customer/public reads of raw technician data and cross-company technician profile leakage.
- Limitations: public technician pages must not use this helper; they need sanitized public projections.

## `can_manage_technician_profile(technician_profile_id)`

- Purpose: Return true when current user can update safe technician profile fields.
- Security recommendation: likely `SECURITY DEFINER`.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: safe `technician_profiles` update policies and server action prechecks.
- Prevents: one technician editing another technician profile, cross-company edits.
- Limitations: verification, marketplace, public profile readiness, company affiliation, archive, and suspension fields remain admin/server-only.

## `can_view_public_technician_profile(technician_profile_id)`

- Purpose: Return true when a technician profile is verified, marketplace-enabled, public-profile-ready, and not archived/suspended.
- Security recommendation: preferably `SECURITY DEFINER` only if used by policies on sanitized public projections; otherwise use a public projection/table that does not need raw access.
- Search path: locked to `public`.
- Return type: `boolean`.
- Used by: future sanitized `public_profiles` or public technician projection policies.
- Prevents: publishing raw/private technician profile rows or unverified/suspended technicians.
- Limitations: this does not sanitize fields by itself. Public pages must read a sanitized table/view.

## Draft SQL Strategy

`0005_rls_helpers_draft.sql` intentionally drafts helpers before final policies. It should not be applied until:

- `0003_onboarding_foundation_draft.sql` is reviewed.
- RLS recursion behavior is tested.
- Function owners and grants are reviewed.
- Final policies are written and tested against multi-company scenarios.
- Audit logging exists for privileged mutations.

The draft SQL may use simple `exists` predicates and does not create final RLS policies.

## Policy Usage Map

`profiles`:

- `auth_user_id()`
- `current_profile_role()`
- `is_admin()`

`companies`:

- `can_view_company(company_id)`
- `can_manage_company(company_id)`
- `is_admin()`

`company_members`:

- `auth_user_id()`
- `is_company_owner(company_id)`
- `can_manage_company_members(company_id)`
- `is_admin()`

`technician_profiles`:

- `can_view_technician_profile(id)`
- `can_manage_technician_profile(id)`
- `can_view_public_technician_profile(id)` for sanitized projection decisions only
- `is_admin()`

`company_invites`:

- `can_manage_company_members(company_id)`
- `is_admin()`

`company_join_requests`:

- `auth_user_id()`
- `can_manage_company_members(company_id)`
- `is_admin()`

`audit_logs`:

- `is_admin()` for future admin read policy
- no client insert helper by default

Future marketplace tables:

- `current_company_ids()`
- `is_active_company_member(company_id)`
- `can_manage_company(company_id)`
- future technician/job eligibility helpers

## Abuse Cases Prevented

- Public visitor reading onboarding tables.
- Customer or technician self-escalating to `company_owner` or `admin`.
- Technician joining a company by editing `profiles.company_id`.
- Removed/suspended member retaining company access.
- Company owner reading another company's records.
- Company owner changing another company's members.
- Company member managing owner/admin-level membership changes.
- Raw technician profile fields leaking to public pages.
- Suspended/archived technician appearing in public marketplace.
- Anonymous user receiving non-empty company ids or role predicates.

## Limitations

- Helpers do not replace table-specific RLS policies.
- Helpers do not validate mutation payloads.
- Helpers do not enforce transactional business rules such as last-owner removal, invite reuse, or job claim locking.
- Helpers do not sanitize public fields.
- Helpers do not write audit logs.
- Helpers must be paired with server-side validation and tests.

## Test Matrix

## Positive Cases

- Active admin returns true from `is_admin()`.
- Active company owner returns true from `is_company_owner(company_id)` for own company.
- Active owner returns true from `can_manage_company(company_id)` for own company.
- Active technician member returns true from `is_active_company_member(company_id)` for own company.
- Active multi-company member receives all active company ids from `current_company_ids()`.
- Technician can view/manage own technician profile safe fields.
- Company owner can view technician profiles linked to own active company.
- Verified, marketplace-enabled, public-profile-ready technician can pass public visibility predicate.

## Negative Cases

- Anonymous user receives `public_visitor`, false booleans, and empty company id array.
- Customer cannot view company member rows.
- Technician cannot pass company owner predicates.
- Technician cannot manage another technician profile.
- Company owner cannot pass predicates for another company.
- Removed member cannot view company.
- Suspended member cannot view company.
- Inactive member cannot view company.
- Archived technician profile does not pass public visibility.
- Suspended/rejected technician profile does not pass public visibility.
- Pending technician does not pass public visibility.

## Multi-Company Cases

- User with active memberships in Company A and Company B receives both ids.
- User with active Company A membership and suspended Company B membership receives only Company A.
- Owner of Company A cannot manage Company B without active owner membership.
- Manager/member helper behavior remains distinct from owner helper behavior.

## Admin Override Cases

- Active admin can pass admin predicates regardless of company membership.
- Suspended admin profile returns false.
- Rejected admin profile returns false.
- Admin access remains audited in server mutations.

## Anonymous Cases

- `auth_user_id()` returns null.
- `current_profile_role()` returns `public_visitor`.
- All company and technician management helpers return false.
- `current_company_ids()` returns empty array.

## Remaining Blockers

- Decide exact `SECURITY DEFINER` owner and grant strategy.
- Test helper recursion with RLS enabled.
- Write final table policies.
- Add metadata/audit insertion helpers for sensitive mutations.
- Add server-side validation for protected fields.
- Add seed/test fixtures for anonymous, customer, technician, verified technician, company owner, admin, suspended member, removed member, and multi-company user cases.
