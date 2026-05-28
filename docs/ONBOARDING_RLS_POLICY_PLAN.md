# Onboarding RLS Policy Plan

## Purpose

This document designs review-only Row Level Security policy behavior for the onboarding foundation tables drafted in `supabase/migrations/0003_onboarding_foundation_draft.sql`.

No SQL policies are implemented here. Do not apply migrations, execute SQL, create backend routes, or connect frontend behavior from this document alone.

The goal is to define access boundaries before applying onboarding tables for:

- `profiles` onboarding fields
- `companies`
- `company_members`
- `technician_profiles`
- `company_invites`
- `company_join_requests`

## Security Principles

- Deny by default.
- No anonymous access to onboarding tables.
- Public signup cannot grant `company_owner` or `admin`.
- `profiles.company_id` is a convenience pointer only; authorization must use `company_members`.
- Membership, role, status, invite, verification, and onboarding transitions must be server-side and audited.
- Raw invite tokens and token hashes must never be exposed to browser UI.
- Public technician pages must use a sanitized public projection, not raw `technician_profiles`.
- Suspended, removed, rejected, expired, and archived records must not continue granting access.

## Role Vocabulary

### unauthenticated visitor

May access public marketplace pages only. Must not select, insert, update, delete, or archive any onboarding table rows.

### customer

May read and update limited own profile fields later. Must not create companies, view company members, view technician private profiles, access invites, or submit company join requests.

### technician

May create and manage limited own technician onboarding draft fields. May request to join a company. Must not self-verify, self-enable marketplace access, self-assign company membership, or read unrelated company data.

### company_owner

May manage records scoped to companies where they are an active owner member. Must not access other companies, grant platform admin, or bypass technician verification gates.

### admin

May manage onboarding, verification, company review, membership correction, invite cleanup, and support workflows through audited admin tooling. Admin policies should be explicit and paired with audit logs.

### future internal service role / server actions

Trusted server paths may perform transactional onboarding operations that normal users cannot do directly, such as accepting invites, approving join requests, creating owner membership rows, updating `profiles.company_id`, and writing audit logs. The service role key must never be used in frontend code.

## Helper Concepts

Future policies should use reviewed helper functions rather than duplicating complex membership checks in every policy.

Recommended helpers:

- `is_admin(profile_id)` returns true for active admin profile.
- `is_active_company_owner(company_id, profile_id)` returns true for active owner membership.
- `is_active_company_manager(company_id, profile_id)` returns true for active owner or manager membership.
- `is_active_company_member(company_id, profile_id)` returns true for any active membership.
- `owns_technician_profile(technician_profile_id, profile_id)` verifies technician profile ownership.
- `is_verified_technician(profile_id)` checks active/verified technician status when marketplace/community access is added.

These helpers must be reviewed for `SECURITY DEFINER`, `search_path`, recursion risk, and cross-company leakage before implementation.

## Table Policy Plan

## 1. `profiles` Onboarding Fields

Fields covered:

- `onboarding_status`
- `onboarding_completed_at`
- `company_id`
- existing `role`, `status`, and `role_intent` interactions from `0001_profiles_roles.sql`

### SELECT

- Unauthenticated visitor: no access.
- Customer: own profile only.
- Technician: own profile only.
- Company owner: own profile and active company member profile summaries, only through scoped policy or safer view.
- Admin: all profiles.
- Server actions: as needed for audited onboarding flows.

### INSERT

- Server-side auth trigger only.
- No direct browser/client profile inserts.

### UPDATE

- Customer/technician: only safe personal fields once policy allows them. Not `role`, `status`, `company_id`, `onboarding_status`, or `onboarding_completed_at`.
- Company owner: must not update profile `role`, `status`, `company_id`, or onboarding fields directly.
- Admin/server actions: may update `role`, `status`, `company_id`, `onboarding_status`, and `onboarding_completed_at` through audited workflows.

### DELETE / Archive

- No user hard deletes.
- Admin/server-only deactivation or future soft-delete flow.

### Server-Side Only

- Role changes.
- Status changes.
- Company assignment.
- Onboarding completion.
- Linking a profile to accepted invite or approved company membership.

### Admin-Only

- Assigning `company_owner` or `admin`.
- Suspending/rejecting profiles.
- Correcting company linkage.

### Never Client-Writable

- `role`
- `status`
- `company_id`
- `onboarding_status`
- `onboarding_completed_at`
- `role_intent` after signup

## 2. `companies`

### SELECT

- Unauthenticated visitor: no access.
- Customer: no access.
- Technician: no access unless they are an active member of the company, then limited company context only.
- Company owner: companies where they have active owner membership.
- Admin: all companies.
- Server actions: as needed.

### INSERT

- Company owner: not directly from client. Use server-side company creation flow after role/status validation.
- Admin/server actions: create companies and owner membership transactionally.

### UPDATE

- Company owner: limited editable business fields for own active company after RLS and server validation.
- Company owner cannot directly set `status`, `owner_profile_id`, `reviewed_by_profile_id`, or archive fields.
- Admin/server actions: status, review, suspension, rejection, archive, owner correction.

### DELETE / Archive

- No hard delete for normal users.
- Company owner may request archive through server workflow.
- Admin/server actions perform archive with `status = archived`, `archived_at`, and audit log.

### Server-Side Only

- Creating company and owner `company_members` row together.
- Setting `profiles.company_id`.
- Status transitions.
- Ownership transfer.
- Archive/reopen workflows.

### Admin-Only

- Approving/rejecting company claims.
- Suspending companies.
- Correcting owner profile.

### Never Client-Writable

- `owner_profile_id`
- `status`
- `reviewed_by_profile_id`
- `reviewed_at`
- `archived_by_profile_id`
- `archived_at`

## 3. `company_members`

### SELECT

- Unauthenticated visitor: no access.
- Customer: no access.
- Technician: own membership rows only.
- Company owner: active members of companies where they are active owner.
- Admin: all membership rows.
- Server actions: as needed.

### INSERT

- No direct client inserts for normal users.
- Server actions insert membership after accepted invite, approved join request, or company owner creation.
- Admin can insert/correct membership through audited tooling.

### UPDATE

- Technician: cannot update membership status or role.
- Company owner: can manage non-owner members in own company through server-validated flows.
- Company owner cannot self-promote, assign platform admin, or silently transfer ownership.
- Admin/server actions: full correction/suspension/removal.

### DELETE / Archive

- No hard delete for normal users.
- Company owner can remove/suspend non-owner members through server workflow.
- Admin can archive/correct membership.

### Server-Side Only

- Activating invited members.
- Approving join requests into memberships.
- Updating `member_role`.
- Updating `member_status`.
- Creating owner membership.
- Moving technicians between companies.

### Admin-Only

- Owner transfer.
- Cross-company membership correction.
- Reinstating suspended/removed members.

### Never Client-Writable

- `member_role`
- `member_status`
- `company_id`
- `profile_id`
- `removed_by_profile_id`
- `archived_by_profile_id`
- lifecycle timestamps

## 4. `technician_profiles`

### SELECT

- Unauthenticated visitor: no access.
- Customer: no raw access. Public technician pages must read public-safe projections only.
- Technician: own technician profile.
- Company owner: technician profiles linked to their active company.
- Admin: all technician profiles.
- Server actions: as needed.

### INSERT

- Technician: may create one own draft profile if role/status allows technician onboarding.
- Company owner: should not create arbitrary technician profiles directly; use invite/member onboarding flow.
- Admin/server actions: may create/correct profiles during support.

### UPDATE

- Technician: own safe draft/onboarding fields only, such as display name, business name, experience, service summary, service ZIPs, specialties, and languages.
- Technician must not update verification, marketplace, public profile, company, affiliation, or archive fields directly.
- Company owner: limited team management fields after active membership, not verification or marketplace enablement unless explicitly approved later.
- Admin/server actions: verification, rejection, suspension, affiliation correction, marketplace enablement, public profile readiness.

### DELETE / Archive

- No hard delete for normal users.
- Technician can request archive/deactivation through server flow.
- Company owner can remove company affiliation through server flow, not erase profile history.
- Admin can archive/suspend.

### Server-Side Only

- `technician_status` transitions.
- `marketplace_enabled`.
- `public_profile_ready`.
- `company_id`.
- `affiliation_type`.
- verification timestamps/reviewer.

### Admin-Only

- Verification approval/rejection.
- Suspension.
- Marketplace eligibility overrides.
- Public profile approval until moderation rules exist.

### Never Client-Writable

- `technician_status`
- `marketplace_enabled`
- `public_profile_ready`
- `verified_by_profile_id`
- `verified_at`
- `rejected_at`
- `suspended_at`
- `archived_by_profile_id`
- `archived_at`

## 5. `company_invites`

### SELECT

- Unauthenticated visitor: no access.
- Customer: no access.
- Technician: no broad select. Invite acceptance should use a server action that validates raw token and email without exposing invite rows.
- Company owner: invites for companies where they are active owner or allowed manager.
- Admin: all invites.
- Server actions: token validation, acceptance, expiry, cleanup.

### INSERT

- Company owner/manager: create invite through server action for own company.
- Admin/server actions: create/correct invites.
- Direct browser insert should be avoided because token hash creation must be server-side.

### UPDATE

- Company owner/manager: revoke pending invites through server action.
- Technician: cannot update invite rows directly; accepting invite is a server action.
- Admin/server actions: accept, revoke, expire, decline, archive.

### DELETE / Archive

- No hard delete for normal users.
- Archive/revoke/expire through server/admin workflows.

### Server-Side Only

- Raw token generation.
- Token hashing.
- Token validation.
- Accepting invite.
- Creating active membership from accepted invite.
- Updating technician/company/profile onboarding fields after acceptance.
- Expiring stale invites.

### Admin-Only

- Inspecting all invite rows.
- Correcting invite state.
- Revoking abusive invites across companies.

### Never Client-Writable

- `token_hash`
- `token_hash_algorithm`
- `invite_status`
- `accepted_by_profile_id`
- `revoked_by_profile_id`
- `archived_by_profile_id`
- lifecycle timestamps

## 6. `company_join_requests`

### SELECT

- Unauthenticated visitor: no access.
- Customer: no access.
- Technician: own join requests only.
- Company owner/manager: join requests for their active company.
- Admin: all join requests.
- Server actions: as needed.

### INSERT

- Technician: may create one pending request per company through server-validated flow.
- Customer: no access.
- Company owner: no need to create requester rows on behalf of technicians except via admin/support tooling.
- Admin/server actions: create/correct if needed.

### UPDATE

- Technician: may cancel own pending request through server action.
- Company owner/manager: approve/reject pending requests for own company through server action.
- Admin/server actions: approve, reject, expire, archive, correct.

### DELETE / Archive

- No hard delete for normal users.
- Archive/expire through server/admin workflow.

### Server-Side Only

- Approval creates `company_members`.
- Approval updates `technician_profiles.company_id`, `technician_profiles.affiliation_type`, `profiles.company_id`, and onboarding status transactionally.
- Rejection/cancel/expire transitions and audit logs.

### Admin-Only

- Cross-company correction.
- Reopening or overriding join decisions.
- Abuse cleanup.

### Never Client-Writable

- `request_status`
- `reviewed_by_profile_id`
- `reviewed_at`
- `decision_note`
- `archived_by_profile_id`
- lifecycle timestamps except a server-mediated cancel action

## Abuse Scenarios And Required Defenses

### Customer trying to become `company_owner`

Defense:

- Public signup can store only safe role intent.
- RLS and triggers must block client writes to `profiles.role`.
- Owner promotion is admin/server-only and audited.
- Company creation requires active `company_owner` or admin approval.

### Technician trying to join company without approval

Defense:

- Technician can insert only pending join request, not membership.
- `company_members` inserts are server/admin-only.
- Approving a request must verify company owner scope and request status.

### Company member trying to view another company

Defense:

- All company table reads require active membership for the same `company_id`.
- `profiles.company_id` alone is insufficient.
- Suspended/removed members fail helper checks.

### Expired invite token use

Defense:

- Token validation server action checks `invite_status = pending`, `expires_at > now()`, matching email, and company status.
- Expired invites are marked expired and cannot create memberships.

### Raw invite token exposure

Defense:

- Raw token generated and shown/sent once by server flow only.
- Store only `token_hash`.
- Do not expose `token_hash` in browser reads.
- Invite lookup by token should happen in server action, not direct RLS select.

### Suspended member retaining access

Defense:

- Membership helper requires `member_status = active`.
- Company owner/member policies ignore invited, inactive, removed, suspended, and archived rows.
- Suspended profile/company status also blocks access.

### Independent technician vs company technician access

Defense:

- Independent technician can read own `technician_profiles` only.
- Company technician access requires active `company_members` row.
- `affiliation_type = company_member` does not grant access by itself.

### Public technician profile visibility

Defense:

- Public routes never read raw `technician_profiles`.
- Public profiles require separate sanitized projection and explicit publish approval.
- `public_profile_ready` is not a public read policy.

### Cross-company data leakage

Defense:

- Every company-scoped read/update checks active membership in the target `company_id`.
- Server mutations validate company ownership before writes.
- Tests must include two companies with similarly named members/invites.

## Recommended Test Cases

## Positive Access Tests

- User can select own `profiles` row.
- Technician can select own `technician_profiles` draft.
- Active company owner can select own `companies` row.
- Active company owner can select active members in own company.
- Technician can select own pending join request.
- Company owner can select pending join requests for own company.
- Admin can select all onboarding tables.

## Negative Access Tests

- Unauthenticated visitor cannot read onboarding tables.
- Customer cannot create company.
- Customer cannot read `company_members`.
- Technician cannot update own `profiles.role`.
- Technician cannot update `technician_status` to verified.
- Technician cannot set `marketplace_enabled`.
- Company member cannot read another company's members.
- Removed/suspended company member cannot read company data.
- Company owner cannot update another company.
- Company owner cannot promote user to platform admin.

## Onboarding Flow Tests

- Customer signup creates safe customer profile only.
- Technician signup creates pending technician-intent profile only.
- Company owner onboarding creates company, owner membership, `profiles.company_id`, and onboarding status transactionally.
- Company owner creation fails if user is not approved `company_owner`.
- Profile onboarding fields cannot be self-completed by client update.

## Invite / Join Request Tests

- Company owner creates invite only for own company through server action.
- Raw token is never stored.
- `token_hash` is never returned to browser UI.
- Accepted invite creates active membership once.
- Reusing accepted invite fails.
- Expired invite fails.
- Revoked invite fails.
- Technician can create one pending join request per company.
- Technician cannot approve own join request.
- Company owner can approve/reject own company requests only.
- Approved join request creates membership and updates technician affiliation transactionally.

## Cross-Company Isolation Tests

- Company A owner cannot read Company B details.
- Company A owner cannot read Company B invites.
- Company A owner cannot approve Company B join requests.
- Company A member cannot read Company B technician profiles.
- Technician in Company A cannot infer Company B invite emails or token state.
- Admin access works, but every sensitive admin mutation creates audit log in future implementation.

## Policy Pseudocode Notes

These are design notes, not executable policy SQL.

```text
is_active_company_member(company_id, profile_id):
  exists company_members
  where company_id = target company
  and profile_id = auth.uid()
  and member_status = active

is_active_company_owner(company_id, profile_id):
  exists company_members
  where company_id = target company
  and profile_id = auth.uid()
  and member_role = owner
  and member_status = active

is_admin(profile_id):
  profile.role = admin
  and profile.status = active
```

Before translating these into SQL, review recursion risks because policies on `company_members` may query `company_members` itself. Consider security-definer helper functions with locked `search_path`, or carefully designed non-recursive policies.

## Remaining Blockers Before Applying Onboarding Migration

- Final RLS helper function design.
- Table-specific executable policies.
- Audit log table and write strategy.
- Server action or Edge Function design for company creation, invite creation, invite acceptance, join approval, and verification.
- Rollback plan for partially applied onboarding migration.
- Seed/test data plan for at least two companies, multiple roles, expired invites, suspended users, and independent technicians.
- Decision on whether `service_zip_codes` and `specialties` stay arrays temporarily or move to normalized service-area/specialty tables before production.
