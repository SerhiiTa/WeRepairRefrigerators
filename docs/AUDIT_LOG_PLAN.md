# Audit Log Plan

## Purpose

This document plans audit logging for sensitive onboarding, company, membership, invite, join request, technician verification, and admin override actions.

This is planning/review only. Do not apply migrations, execute SQL, create backend actions, change frontend behavior, or treat this document as production enforcement by itself.

Audit logging should make future support, abuse investigation, role review, company ownership review, and onboarding incident response possible without exposing private customer or technician data.

## Current State

- Supabase Auth and `public.profiles` exist in development.
- `supabase/migrations/0001_profiles_roles.sql` has been applied manually in development.
- `supabase/migrations/0002_real_marketplace_core_draft.sql` is review-only and has not been applied.
- `supabase/migrations/0003_onboarding_foundation_draft.sql` is review-only and has not been applied.
- No onboarding server actions, company tables, technician onboarding tables, or audit log table are live yet.
- Task 64 adds `supabase/migrations/0004_audit_log_foundation_draft.sql` as a review-only draft.

## Audit Goals

- Record who performed sensitive actions.
- Record which company, profile, invite, join request, technician profile, or onboarding record was affected.
- Capture before/after status or role changes without storing unnecessary private data.
- Support abuse investigation for role escalation, invite misuse, company membership changes, verification decisions, and admin overrides.
- Keep audit records append-only in normal application flows.
- Keep raw audit logs admin/server-only at first.

## Events To Capture

Required onboarding/company events:

- `company_created`
- `company_updated`
- `company_archived`
- `company_member_added`
- `company_member_role_changed`
- `company_member_suspended`
- `company_member_archived`
- `company_invite_created`
- `company_invite_revoked`
- `company_invite_accepted`
- `company_join_requested`
- `company_join_approved`
- `company_join_rejected`
- `technician_profile_created`
- `technician_profile_updated`
- `technician_profile_verified`
- `onboarding_completed`
- `admin_override`

Future events may include technician rejection/suspension, invite expiration, join request cancellation, owner transfer, company suspension, public profile publication, open job claiming, and repair case public publishing approval.

## Event Mapping For Planned Server Actions

`createCompanyAndOwnerMembership` should write:

- `company_created`
- `company_member_added`
- `onboarding_completed` when owner onboarding completes
- `admin_override` if an admin performs the setup for another user

`createCompanyInvite` should write:

- `company_invite_created`

`acceptCompanyInvite` should write:

- `company_invite_accepted`
- `company_member_added`
- `technician_profile_updated` if company affiliation changes

`requestToJoinCompany` should write:

- `company_join_requested`

`approveJoinRequest` should write:

- `company_join_approved`
- `company_member_added`
- `technician_profile_updated` if affiliation changes

`rejectJoinRequest` should write:

- `company_join_rejected`

`updateTechnicianProfile` should write:

- `technician_profile_updated`

`verifyTechnicianProfile` should write:

- `technician_profile_verified`
- `admin_override` if the decision is a manual correction or exception

`completeOnboarding` should write:

- `onboarding_completed`

`archiveCompanyMember` should write:

- `company_member_archived`
- `company_member_suspended` if the member is suspended rather than removed

## Proposed Audit Log Fields

The review-only migration draft uses a single append-only `public.audit_logs` table.

Core fields:

- `id`
- `event_type`
- `actor_user_id`
- `actor_profile_id`
- `target_user_id`
- `target_profile_id`
- `company_id`
- `related_table`
- `related_entity_id`
- `related_entity_label`
- `action_source`
- `severity`
- `metadata`
- `ip_address`
- `user_agent`
- `request_id`
- `created_at`

Relationship fields should point to the affected profile, company, membership, invite, join request, technician profile, or related entity when possible. `metadata` should only contain sanitized supplemental context.

## Minimum Metadata

Common safe metadata:

- `previous_status`
- `new_status`
- `previous_role`
- `new_role`
- `previous_onboarding_status`
- `new_onboarding_status`
- `actor_role`
- `reason_code`
- `source_route`
- `decision`
- `expires_at`
- `invited_role`
- `requested_role`
- `token_hash_algorithm`

Company events may include:

- `company_status_before`
- `company_status_after`
- `company_slug`
- `primary_service_area`

Membership events may include:

- `member_role_before`
- `member_role_after`
- `member_status_before`
- `member_status_after`
- `last_active_owner_check`

Invite events may include:

- `invite_status_before`
- `invite_status_after`
- `invited_role`
- `expires_at`
- `invited_email_domain`

Join request events may include:

- `request_status_before`
- `request_status_after`
- `requested_role`
- `decision`

Technician profile events may include:

- `technician_status_before`
- `technician_status_after`
- `marketplace_enabled_before`
- `marketplace_enabled_after`
- `public_profile_ready_before`
- `public_profile_ready_after`
- `changed_field_names`

## Never Store In Audit Metadata

Do not store:

- Raw invite tokens.
- Invite token hashes.
- Passwords.
- Supabase session tokens.
- Service-role keys.
- Customer phone numbers.
- Customer email addresses.
- Customer full street addresses.
- Payment card data.
- Bank/payout account details.
- Model/serial sticker photos.
- Appliance serial numbers unless a narrowly reviewed support case requires it.
- Full private technician/community messages.
- Private customer notes.
- Large request payloads copied wholesale from the client.

If an event requires context about an email address, prefer a domain, a redacted form, or a separate protected table reference. If customer PII is ever required for a support/legal audit case, it should be explicitly reviewed and retention-limited.

## Access Model

Initial production posture:

- Anonymous users: no access.
- Normal authenticated users: no direct audit log access.
- Technicians/company members: no raw audit log access.
- Company owners: no raw audit log access initially; later a redacted company audit summary view may be considered.
- Admins: read access through audited admin tooling.
- Server actions/API routes/RPC: insert-only trusted path for sensitive mutations.

Audit logs should not be client-writable. Sensitive server mutations should write audit rows in the same transaction as the business change whenever possible.

## Append-Only Model

Audit logs should be append-only for normal application flows:

- Inserts happen through trusted server-side onboarding/company/admin actions.
- Updates are blocked.
- Deletes are blocked.
- Retention/archival, if needed later, should be a separate admin/server maintenance process.

The migration draft includes a trigger concept to reject direct update/delete attempts. This still must be reviewed in a real Supabase project before application.

## IP And User Agent Handling

`ip_address` and `user_agent` are useful for abuse investigation, invite misuse, and support review. They should be treated as private operational data:

- Do not expose them to public or company dashboard UI.
- Do not duplicate them inside `metadata`.
- Define retention rules before production.
- Avoid using them as the only trust signal.

## Abuse And Support Scenarios

Audit logs should help investigate:

- A customer or technician attempting to become `company_owner`.
- Unauthorized company owner/member role changes.
- Invite creation spikes or suspicious invite acceptance attempts.
- Expired or reused invite token attempts.
- A suspended member retaining access.
- Cross-company membership or data leakage.
- Admin overrides of company, role, technician verification, or onboarding state.
- Support questions like "who invited this technician?" or "why can this user access this company?"

## RLS And Server Action Expectations

Before applying the audit table:

- Write reviewed RLS policies or keep the table inaccessible to authenticated clients.
- Add a trusted server/RPC insertion path.
- Ensure service-role access is server-only.
- Ensure admin reads are explicit and audited.
- Add tests proving normal users cannot select, update, delete, or insert audit logs directly.

Before implementing onboarding server actions:

- Add audit writes to every sensitive action.
- Commit audit writes transactionally with the mutation when possible.
- Fail closed for privileged changes if audit writing fails, unless a reviewed incident-handling exception exists.

## Recommended Tests

Positive tests:

- Server action can insert a sanitized audit row for each onboarding event.
- Admin can read audit logs through intended admin path.
- Indexes support lookup by company, actor, event type, related entity, and date.

Negative tests:

- Anonymous user cannot read audit logs.
- Normal authenticated user cannot read raw audit logs.
- Normal authenticated user cannot insert audit logs directly.
- Normal authenticated user cannot update audit logs.
- Normal authenticated user cannot delete audit logs.
- Metadata containing raw token fields is rejected by server validation before insert.

Workflow tests:

- Company creation writes company and membership audit events.
- Invite acceptance writes invite and membership audit events.
- Join approval writes join, membership, and technician affiliation audit events.
- Technician verification writes previous/new verification status.
- Admin override writes actor, target, reason code, and affected entity.

## Remaining Blockers

- Final audit RLS policies are not written.
- Server action/RPC insertion path is not implemented.
- Metadata validation and redaction helpers are not implemented.
- Retention policy is not defined.
- Admin audit viewer is not built.
- `0004_audit_log_foundation_draft.sql` has not been applied.
