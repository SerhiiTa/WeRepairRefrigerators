# Onboarding Server Actions Plan

## Purpose

This document plans future server-side onboarding actions for WeRepairRefrigerators before implementation.

This is planning/review only. Do not create code, apply migrations, execute SQL, run Supabase commands, change frontend behavior, install packages, or commit from this document alone.

The actions below assume the reviewed profiles foundation from `0001_profiles_roles.sql`, the review-only onboarding draft in `0003_onboarding_foundation_draft.sql`, and the access boundaries in `docs/ONBOARDING_RLS_POLICY_PLAN.md`.

## Implementation Philosophy

- Keep privileged onboarding mutations server-side.
- Treat frontend role checks as UX only.
- Use user-scoped Supabase clients for normal authenticated reads/writes whenever possible.
- Use elevated/server-only access only for tightly scoped transactional operations that normal RLS must not allow directly.
- Never expose service-role keys, invite token hashes, or privileged mutation details to browser code.
- Write audit logs for every role, company, membership, invite, join request, verification, and onboarding status transition before production use.
- Prefer transactional database functions/RPC or server-side route handlers for multi-table writes that must succeed or fail together.

## Recommended Future File Structure

```text
frontend/src/
├── app/
│   └── actions/
│       └── onboarding/
│           ├── company.ts
│           ├── invites.ts
│           ├── join-requests.ts
│           ├── technicians.ts
│           └── onboarding.ts
├── lib/
│   ├── auth/
│   │   ├── require-session.ts
│   │   └── require-role.ts
│   ├── onboarding/
│   │   ├── validation.ts
│   │   ├── invite-tokens.ts
│   │   ├── audit-events.ts
│   │   └── errors.ts
│   └── supabase/
│       ├── client.ts
│       ├── server.ts
│       └── admin.ts
```

Notes:

- `admin.ts` must be server-only and must never be imported by Client Components.
- Validation helpers should be plain TypeScript until a validation library is explicitly approved.
- If actions become public HTTP endpoints, route handlers should live under `frontend/src/app/api/onboarding/...`.

## Service Role Rules

- The service-role key must never be placed in `frontend/.env.local` with `NEXT_PUBLIC_` prefix.
- The service-role key must never be imported into Client Components.
- Use service-role only for server-only code paths that need to bypass RLS for controlled writes.
- Prefer database RPC with authenticated user context where possible.
- Every service-role write should validate the caller's authenticated profile and intended authorization first.
- Every sensitive service-role write should create an audit event.

## Invite Token Hashing Approach

Recommended flow:

1. Generate a high-entropy random token server-side.
2. Store only a SHA-256 or stronger hash in `company_invites.token_hash`.
3. Store a `token_hash_algorithm` label for future rotation.
4. Send or display the raw token only once.
5. On acceptance, hash the submitted token server-side and compare to stored hash.
6. Check invite status, expiry, company status, email match, and existing membership before accepting.
7. Never return `token_hash` or raw token through browser-facing reads.

## Action Plans

## 1. `createCompanyAndOwnerMembership`

### Purpose

Create a company record for an approved owner and create the owner membership row in the same workflow.

### Caller Role

- `company_owner` with active profile.
- `admin` for support/manual setup.

### Required Auth / Session Checks

- Authenticated session required.
- Profile row must exist.
- Profile status must be `active`.
- Profile role must be `company_owner` or `admin`.
- Caller must not already have a conflicting active company unless multi-company ownership is explicitly approved.

### Input Validation

- Company name required.
- Slug required, normalized, and must match the migration slug format.
- Primary city/state optional but state should default to `TX` for Houston MVP.
- Business email/phone optional but must pass basic shape checks if provided.
- Reject reserved slugs and duplicates.

### Database Writes

- Insert `companies`.
- Insert `company_members` row with `member_role = owner`, `member_status = active`, `joined_at = now()`.
- Update `profiles.company_id`.
- Update `profiles.onboarding_status`.
- Optionally set `profiles.onboarding_completed_at` if owner setup is complete.

### Audit Logging Needs

- Company created.
- Owner membership created.
- Profile company assignment changed.
- Onboarding status changed.

### Transaction Requirements

Required. Company, owner membership, profile company pointer, and onboarding status must commit or roll back together.

### Error States

- Not authenticated.
- Profile missing.
- Unauthorized role.
- Profile not active.
- Duplicate slug.
- Existing active company conflict.
- Company insert failed.
- Owner membership insert failed.
- Profile update failed.

### Abuse Prevention

- Public signup cannot create company owner access.
- Prevent customer/technician role escalation.
- Rate limit company creation.
- Audit every owner/company creation.

### RLS Expectations

- Direct client insert into `companies` should not be allowed.
- Direct client insert into owner `company_members` should not be allowed.
- Use server action or RPC after caller validation.

### Recommended Runtime Shape

Next.js Server Action for first implementation. Consider API route if called from non-React clients later.

## 2. `createCompanyInvite`

### Purpose

Allow an active company owner/manager to invite a technician to join their company.

### Caller Role

- Active `company_owner` for the target company.
- Future active company manager if policy allows.
- `admin`.

### Required Auth / Session Checks

- Authenticated session required.
- Active profile required.
- Caller must be active owner/allowed manager for target company, or admin.
- Target company must be active.

### Input Validation

- Target company id required.
- Email required and normalized.
- Invited role must be company-scoped only: `technician`, `dispatcher`, or `manager` if allowed.
- `owner` invites should be admin-only until owner transfer flow exists.
- Expiry must be bounded.

### Database Writes

- Generate raw token server-side.
- Hash token and insert `company_invites`.
- Store `invited_email`, `invited_role`, `token_hash`, `token_hash_algorithm`, `expires_at`, and `invited_by_profile_id`.
- Do not store raw token.

### Audit Logging Needs

- Invite created.
- Invited role.
- Company id.
- Expiry timestamp.
- Actor profile id.

### Transaction Requirements

Recommended. Invite creation and audit log should commit together.

### Error States

- Not authenticated.
- Not active company owner/manager.
- Company inactive/suspended.
- Duplicate pending invite for email.
- Email belongs to existing active member.
- Invalid invited role.
- Token generation/hash failure.

### Abuse Prevention

- Rate limit invite creation.
- Limit invites per company/time period.
- Do not reveal whether an email has an account beyond safe messaging.
- Never expose token hash.

### RLS Expectations

- Company owners can read own company invite summaries but not token hashes.
- Invite insert should be server-side because token hashing must be trusted.

### Recommended Runtime Shape

Next.js Server Action for dashboard UI. API route later if mobile/native clients need invite creation.

## 3. `acceptCompanyInvite`

### Purpose

Accept a valid company invite and create/link company membership for the authenticated invitee.

### Caller Role

- Authenticated technician or user completing onboarding.
- Admin support path if needed.

### Required Auth / Session Checks

- Authenticated session required.
- Profile row must exist.
- Profile email must match invite email unless admin override is used.
- Profile must not be suspended/rejected.

### Input Validation

- Raw invite token required.
- Token is never logged.
- Hash token server-side.
- Invite must be pending and unexpired.
- Company must be active.
- Invited email must match authenticated profile email after normalization.

### Database Writes

- Update invite to accepted with `accepted_by_profile_id` and `accepted_at`.
- Insert or activate `company_members` row.
- Create or update `technician_profiles.company_id` and `affiliation_type`.
- Update `profiles.company_id`.
- Update onboarding status.

### Audit Logging Needs

- Invite accepted.
- Membership created/activated.
- Technician profile company affiliation changed.
- Profile company pointer changed.
- Onboarding status changed.

### Transaction Requirements

Required. Invite status, membership, technician profile, profile pointer, onboarding status, and audit log must commit or roll back together.

### Error States

- Not authenticated.
- Profile missing.
- Invite not found.
- Invite expired.
- Invite revoked/declined/accepted.
- Email mismatch.
- Company inactive.
- Existing conflicting membership.
- Transaction conflict.

### Abuse Prevention

- Never expose raw token or hash.
- Prevent invite reuse.
- Prevent accepting someone else's invite.
- Rate limit failed invite attempts.
- Avoid leaking invite existence in error messages.

### RLS Expectations

- Normal users should not directly select invite rows by token hash.
- Acceptance should happen through server action/RPC with controlled writes.

### Recommended Runtime Shape

API route or Server Action. API route may be better if the invite link lands from email and needs a clean HTTP boundary.

## 4. `requestToJoinCompany`

### Purpose

Allow a technician to request membership in a company when they do not have an invite.

### Caller Role

- Authenticated technician in onboarding.
- Possibly verified technician if joining a team later.

### Required Auth / Session Checks

- Authenticated session required.
- Profile row exists.
- Profile role must be technician-like or admin support path.
- Profile must not be suspended/rejected.

### Input Validation

- Company id required.
- Company must be active or pending-public-join if such status is allowed.
- Message optional and length-limited.
- Requested role should default to `technician`.
- Prevent duplicate pending request.

### Database Writes

- Insert `company_join_requests` with `request_status = pending`.
- Optionally update `technician_profiles.affiliation_type = company_pending`.

### Audit Logging Needs

- Join request created.
- Requested company and role.
- Optional status update.

### Transaction Requirements

Recommended if updating technician profile affiliation. Required once audit logging is added.

### Error States

- Not authenticated.
- Profile missing.
- Unauthorized role.
- Company not found or not joinable.
- Duplicate pending request.
- Existing active company membership.
- Message too long.

### Abuse Prevention

- Rate limit requests.
- Do not expose private company data before approval.
- Limit duplicate/cycling requests.

### RLS Expectations

- Technician may insert own pending request only if policy allows, but server action is safer for validation and rate limiting.
- Requester can read own request.
- Company owner can read requests for own company.

### Recommended Runtime Shape

Next.js Server Action for dashboard onboarding UI.

## 5. `approveJoinRequest`

### Purpose

Allow a company owner/admin to approve a pending technician join request and create company membership.

### Caller Role

- Active company owner/allowed manager for target company.
- Admin.

### Required Auth / Session Checks

- Authenticated session required.
- Active profile required.
- Caller must be active owner/allowed manager for request company, or admin.
- Target company must be active.

### Input Validation

- Join request id required.
- Request must be pending.
- Requested role must be allowed.
- Requesting profile must not be suspended/rejected.
- Existing membership conflicts must be checked.

### Database Writes

- Update request to approved with reviewer metadata.
- Insert or activate `company_members`.
- Update `technician_profiles.company_id`.
- Update `technician_profiles.affiliation_type = company_member`.
- Update `profiles.company_id`.
- Update onboarding status.

### Audit Logging Needs

- Join request approved.
- Membership created/activated.
- Technician affiliation changed.
- Profile company pointer changed.
- Onboarding status changed.

### Transaction Requirements

Required. Approval and all related membership/profile writes must be atomic.

### Error States

- Not authenticated.
- Unauthorized company owner/manager.
- Request not found.
- Request not pending.
- Company inactive.
- Requesting profile inactive/suspended.
- Existing conflicting membership.
- Transaction conflict.

### Abuse Prevention

- Company owner cannot approve requests for other companies.
- Company owner cannot assign platform role.
- Membership role must be company-scoped.
- Audit every approval.

### RLS Expectations

- Direct update of request status should be server-side.
- Membership creation should be server-side.

### Recommended Runtime Shape

Next.js Server Action first. Consider database RPC for atomicity once schema is applied.

## 6. `rejectJoinRequest`

### Purpose

Allow company owner/admin to reject a pending join request.

### Caller Role

- Active company owner/allowed manager for target company.
- Admin.

### Required Auth / Session Checks

- Authenticated session required.
- Active profile required.
- Caller must be active owner/allowed manager for request company, or admin.

### Input Validation

- Join request id required.
- Request must be pending.
- Optional decision note length-limited and private.

### Database Writes

- Update request to rejected with `reviewed_by_profile_id`, `reviewed_at`, and optional decision note.
- Optionally reset `technician_profiles.affiliation_type` if it was only pending for this company.

### Audit Logging Needs

- Join request rejected.
- Reviewer profile id.
- Company id.

### Transaction Requirements

Recommended. Required if technician profile affiliation is updated.

### Error States

- Not authenticated.
- Unauthorized company owner/manager.
- Request not found.
- Request not pending.
- Decision note too long.

### Abuse Prevention

- Do not expose private reviewer notes to public UI.
- Rate limit repeated request/reject cycles if abused.

### RLS Expectations

- Direct status update should be server-side.
- Requester can later read safe status but not internal decision notes unless explicitly approved.

### Recommended Runtime Shape

Next.js Server Action.

## 7. `updateTechnicianProfile`

### Purpose

Allow a technician to update safe onboarding fields on their own profile.

### Caller Role

- Technician-like authenticated user.
- Company owner/admin support may update limited fields for team/support workflows.

### Required Auth / Session Checks

- Authenticated session required.
- Profile exists.
- Technician profile belongs to caller, or caller is authorized company owner/admin.
- Profile not suspended/rejected unless only limited correction is allowed.

### Input Validation

- Display name length.
- Business name length.
- Years experience non-negative.
- Service summary length.
- Service ZIP code format.
- Specialties/languages allowed values.
- Private bio length.

### Database Writes

- Update safe technician profile fields only.
- Do not update verification, marketplace, public profile, company, affiliation, or archive fields.
- Optionally update onboarding status to verification-ready through server-controlled logic only.

### Audit Logging Needs

- Major profile update event.
- Service area/specialty changes if used for marketplace eligibility.

### Transaction Requirements

Not always required for simple safe-field update. Required if also changing onboarding status or audit rows.

### Error States

- Not authenticated.
- Technician profile missing.
- Unauthorized profile owner.
- Invalid ZIP/specialty/language.
- Attempt to write protected field.

### Abuse Prevention

- Use allowlist updates, not client-provided object spread.
- Reject protected fields even if submitted.
- Rate limit repeated profile updates if needed.

### RLS Expectations

- RLS may allow own safe-field update eventually.
- Server action should still validate allowlist before passing writes.

### Recommended Runtime Shape

Next.js Server Action.

## 8. `verifyTechnicianProfile`

### Purpose

Allow admin to approve, reject, or suspend a technician profile for marketplace/public/community eligibility.

### Caller Role

- Admin only at first.
- Future verified reviewer role only if explicitly designed.

### Required Auth / Session Checks

- Authenticated session required.
- Caller profile active.
- Caller role admin.

### Input Validation

- Technician profile id required.
- Decision must be `verified`, `rejected`, or `suspended`.
- Optional reason length-limited.
- Required profile fields must be present before verification.

### Database Writes

- Update `technician_profiles.technician_status`.
- Set `verified_at` and `verified_by_profile_id` for approval.
- Set rejection/suspension timestamps for those decisions.
- Optionally update `profiles.status`.
- Optionally update onboarding status.
- Optionally set `marketplace_enabled` and `public_profile_ready` only if decision allows.

### Audit Logging Needs

- Technician verification decision.
- Reviewer.
- Previous and new status.
- Marketplace/public profile flags.
- Reason summary.

### Transaction Requirements

Required. Verification status, profile status, onboarding status, and audit log must commit together.

### Error States

- Not authenticated.
- Not admin.
- Technician profile missing.
- Required fields incomplete.
- Invalid decision.
- Conflicting archived/suspended state.

### Abuse Prevention

- Never let technician self-verify.
- Never let company owner verify marketplace/community eligibility unless a future policy explicitly allows it.
- Audit all decisions.

### RLS Expectations

- Verification fields are admin/server-only.
- Public profile publication remains separate from raw technician profile read policy.

### Recommended Runtime Shape

Next.js Server Action for admin dashboard initially. API route or Edge Function later if admin tools are separated.

## 9. `completeOnboarding`

### Purpose

Mark a user's onboarding as complete after required records and statuses exist.

### Caller Role

- Server action after validating completion requirements.
- Admin support path.

### Required Auth / Session Checks

- Authenticated session required.
- Profile exists.
- Profile status appropriate for the requested completion type.

### Input Validation

- Determine completion path by profile role.
- Customer completion: basic profile/request state exists.
- Technician completion: technician profile exists and required fields submitted; verification may still be pending depending on phase.
- Company owner completion: company exists, active owner membership exists, profile company pointer matches, company status valid.

### Database Writes

- Update `profiles.onboarding_status`.
- Set `profiles.onboarding_completed_at` when complete.
- Optionally update related company/technician onboarding status.

### Audit Logging Needs

- Onboarding status changed.
- Completion timestamp.
- Role/path used.

### Transaction Requirements

Recommended. Required if multiple records update.

### Error States

- Not authenticated.
- Profile missing.
- Required records missing.
- Profile/company/member/technician status does not allow completion.
- Attempt to complete privileged onboarding from client-only state.

### Abuse Prevention

- Do not trust client-provided checklist state.
- Read required records server-side.
- Do not use onboarding completion as authorization by itself.

### RLS Expectations

- Direct writes to onboarding status remain blocked.
- Server/admin flow updates status after validation.

### Recommended Runtime Shape

Next.js Server Action.

## 10. `archiveCompanyMember`

### Purpose

Remove or archive a company member while preserving membership history.

### Caller Role

- Active company owner for own company.
- Admin.

### Required Auth / Session Checks

- Authenticated session required.
- Active profile required.
- Caller must be active owner for company, or admin.
- Caller cannot remove the last active owner without a replacement/transfer flow.

### Input Validation

- Membership id required.
- Membership belongs to caller's company unless admin.
- Target member not already removed/archived.
- Removal reason optional and length-limited.

### Database Writes

- Update `company_members.member_status = removed` or `inactive`.
- Set `removed_by_profile_id`, `removed_at`, and possibly `archived_at`.
- If target technician belongs to the company, update `technician_profiles.affiliation_type` and `company_id` as appropriate.
- If target profile points to company, clear or update `profiles.company_id` if no other active membership remains.

### Audit Logging Needs

- Member archived/removed.
- Actor.
- Company.
- Previous role/status.
- Reason summary.

### Transaction Requirements

Required if updating membership, technician profile, profile company pointer, and audit log together.

### Error States

- Not authenticated.
- Unauthorized company.
- Membership not found.
- Last owner removal blocked.
- Target already removed.
- Conflicting company/technician state.

### Abuse Prevention

- Prevent self-removal if it would orphan company.
- Prevent non-owner members from removing others.
- Preserve history; avoid hard delete.
- Audit all removals.

### RLS Expectations

- Direct client membership status updates should be blocked.
- Server action performs scoped checks and writes.

### Recommended Runtime Shape

Next.js Server Action first. Consider API route if mobile technician/company admin tooling is added.

## Cross-Company Isolation Notes

- Every action accepting `company_id` must verify caller has active membership in that exact company.
- `profiles.company_id` must not be used as the only authorization source.
- Company owner permissions do not apply to other companies.
- Users with multiple future memberships need explicit active company context.
- Suspended, removed, inactive, invited, and archived membership rows do not grant access.

## Transaction Strategy

Use transactions for actions that touch more than one table:

- `createCompanyAndOwnerMembership`
- `acceptCompanyInvite`
- `approveJoinRequest`
- `verifyTechnicianProfile`
- `completeOnboarding` when multiple rows change
- `archiveCompanyMember`

Potential implementation choices:

- Database RPC with validated inputs and RLS-aware checks.
- Server Action that calls a reviewed RPC for atomic mutations.
- API route wrapping an RPC when non-React clients need access.

Avoid partial writes where a company exists without owner membership, invite is accepted without membership, or onboarding status changes without the underlying required record.

## Testing Checklist

### Auth And Role Tests

- Logged-out user cannot call onboarding actions.
- Customer cannot create company.
- Technician cannot create company unless manually promoted.
- Company owner can manage own company only.
- Admin can perform support actions.
- Suspended/rejected profile cannot complete privileged onboarding.

### Company Tests

- Company creation creates company, owner membership, profile pointer, and audit log atomically.
- Duplicate slug fails.
- Last owner removal is blocked.
- Company owner cannot affect another company.

### Invite Tests

- Invite creation stores only token hash.
- Raw token is returned/displayed only once.
- Accepted invite creates active membership once.
- Expired, revoked, declined, and already accepted invites fail.
- Email mismatch fails without leaking invite details.
- Token hash never appears in browser payloads.

### Join Request Tests

- Technician can create one pending request per company.
- Technician cannot approve own request.
- Company owner can approve/reject own company requests only.
- Approved request creates membership and updates profile/technician affiliation atomically.
- Rejected/cancelled/expired requests cannot be approved later without a new request.

### Technician Profile Tests

- Technician can update own safe fields.
- Technician cannot self-verify.
- Technician cannot set marketplace enabled.
- Company owner cannot verify technician marketplace eligibility unless future policy explicitly allows it.
- Public profile readiness does not make raw technician profile public.

### Cross-Company Tests

- Company A owner cannot read or mutate Company B invites.
- Company A owner cannot approve Company B join requests.
- Removed/suspended member loses access immediately.
- Independent technician cannot read company member lists.

## Remaining Blockers Before Implementation

- Apply/review onboarding migration only after explicit approval.
- Add executable RLS helper functions and policies.
- Create audit log schema and audit write conventions.
- Decide Server Action vs RPC boundaries for each transaction.
- Decide if invite links use API route callback, Server Action form post, or both.
- Add validation strategy.
- Add rate limiting strategy.
- Add rollback plan and seed test data for multiple companies/roles.
