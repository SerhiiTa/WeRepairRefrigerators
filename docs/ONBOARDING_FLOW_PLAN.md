# Onboarding Flow Plan

## Purpose

This document plans the real onboarding system for WeRepairRefrigerators before implementation. It is documentation-only. Do not implement UI, apply migrations, change Supabase, write applied SQL, or commit from this plan alone.

The onboarding system should turn the current Supabase Auth/profile foundation into safe account setup for customers, technicians, company owners, and admins while preserving public/dashboard separation and privacy boundaries.

## 1. Current Auth / Profile State

Current implemented state:

- Supabase Auth is connected for local development through `frontend/.env.local`.
- `public.profiles` exists in the development Supabase project after manual application of `0001_profiles_roles.sql`.
- Login/signup UI exists at `/login` and `/signup`.
- Dashboard auth display can read `public.profiles.role` and `public.profiles.status`.
- Dashboard access remains non-blocking and mock-safe.
- No onboarding UI exists yet.
- No company tables, technician profile tables, invites, join requests, service request persistence, or real route protection exist yet.

Current profile limitations:

- Signup role intent is advisory only.
- `company_owner` and `admin` must not be granted through public signup.
- The real database should still be treated as profiles-only until future migrations are reviewed and applied.
- Frontend role/profile display is UX only. Production authorization must come from server checks and Supabase RLS.

## 2. Target Onboarding Goals

Primary goals:

- Guide each authenticated user into the correct setup path after signup/login.
- Separate customer, technician, company owner, and admin onboarding.
- Prevent public signup from granting privileged roles.
- Support independent technicians and company-managed teams.
- Support quick customer requests without forcing account creation.
- Prepare future dashboard route protection and role-aware navigation.
- Keep customer PII, company data, technician verification data, and private community access behind correct boundaries.

The MVP onboarding system should answer:

- Who is this user?
- What account type are they setting up?
- Are they active, pending, rejected, suspended, or incomplete?
- Are they linked to a company?
- Are they an owner, technician, or invited member?
- What route should they see next?

## 3. Account Types

### customer

Customers browse public pages and submit service requests. Account creation should be optional at first.

Allowed early behavior:

- Submit public `/schedule-service` intake.
- Create an optional customer account after request submission.
- Later view own service request/customer portal records.

Must not access:

- Internal dashboard CRM.
- Open jobs.
- Technician community.
- Company analytics.
- Private repair cases beyond customer-safe status views.

### technician

Technicians can sign up publicly or join by company invitation, but they start in onboarding/pending status.

Allowed early behavior:

- Complete technician profile setup.
- Add service areas and specialties.
- Request verification.
- Accept or request company membership.

Must not access before verification:

- Open jobs claiming.
- Private technician community.
- Reputation participation.
- Company-wide CRM data unless invited and authorized.

### company_owner

Company owners manage a service company/team. This role should be assigned only through an approved manual/admin path until owner onboarding is secure.

Allowed behavior after role/status approval:

- Create or claim a company profile.
- Link their profile as company owner.
- Invite technicians.
- Review join requests.
- Manage company-scoped leads, jobs, repair cases, coverage, analytics, and billing later.

Must not access:

- Other companies' data.
- Platform admin role assignment.
- Private technician community data unless separately verified/allowed.

### admin

Admins are platform operators. Admin assignment must remain manual and audited.

Allowed behavior later:

- Verify technicians.
- Approve/reject company claims.
- Moderate private community.
- Review audit logs.
- Support owner/admin promotion flows.

Must not happen:

- Admin role through public signup.
- Admin controls exposed in public routes.
- Admin changes without audit logging.

## 4. Signup / Profile Creation Flow

Recommended signup behavior:

1. User signs up through Supabase Auth.
2. `public.profiles` row is created by trigger.
3. `role_intent` may be stored from signup metadata, but only as intent.
4. Server-side onboarding logic maps safe role/status defaults.
5. User lands on an onboarding router page after login/signup.
6. Router reads profile role/status and required onboarding records.
7. User is redirected to the next incomplete onboarding step.

Recommended default outcomes:

- Customer intent: `role = customer`, `status = active`, `onboarding_status = complete` or `service_request_pending` depending on whether they arrived from intake.
- Technician intent: `role = technician`, `status = pending`, `onboarding_status = technician_profile_required`.
- Company owner: no public signup grant. Start as `technician` or pending profile until manually promoted or approved through a future owner application flow.
- Admin: manual assignment only.

Do not let the frontend update authoritative role/status fields. Use server-side mutations and audited admin policies for privileged transitions.

## 5. Company Owner Onboarding

### Create company

Company owner onboarding should create a `companies` row only after the user has an approved `company_owner` role or an approved owner application flow.

Recommended company fields:

- Company name.
- Slug.
- Primary service city/state.
- Business phone/email.
- Status: pending, active, suspended, rejected.
- Owner profile id.

### Link owner to company

After company creation:

1. Create `companies` row.
2. Link `profiles.company_id` to the company if the profile schema keeps this shortcut.
3. Create `company_members` row with `member_role = owner` and `member_status = active`.
4. Create audit log event for company creation and owner link.

### Owner permissions

Company owners should be allowed to:

- Read/update their company profile.
- Invite technicians.
- Approve/reject join requests.
- Manage team membership statuses.
- View company-scoped leads/jobs/repair cases after persistence exists.
- Configure company service areas and pricing later.

Company owners should not be allowed to:

- Grant platform admin.
- Change their own role to admin.
- Read another company's data.
- Bypass technician verification or community gates without explicit policies.

## 6. Technician Onboarding

### Independent technician

Recommended flow:

1. Technician signs up with technician intent.
2. Profile defaults to `role = technician`, `status = pending`.
3. User completes `technician_profiles` setup:
   - Display name.
   - Business name if applicable.
   - Years experience.
   - Appliance/service specialties.
   - Service ZIPs/cities.
   - Public profile readiness fields later.
4. Technician submits for verification.
5. Admin or approved verification workflow sets `technician_status = verified` and profile `status = active` when approved.

Independent technicians may remain `company_id = null` until they create/join a company or until single-technician company records are modeled.

### Join company by invite

Recommended flow:

1. Company owner creates `company_invites` for technician email.
2. Invite stores company id, invited email, invited role, token hash, expiry, and status.
3. Technician signs up or logs in with matching email.
4. Server validates invite and creates `company_members` row.
5. Technician profile is linked to company if accepted.
6. Invite status becomes accepted.
7. Audit log records invite acceptance.

Invite acceptance should not automatically verify marketplace/community access unless the invite explicitly includes a reviewed verification path.

### Request to join company

Recommended flow:

1. Technician searches or enters company invite code/domain later.
2. Technician creates `company_join_requests` row.
3. Company owner reviews request.
4. If approved, server creates `company_members` row.
5. If rejected, request is closed with safe reason/status.

Join requests should be rate-limited and should not expose private company data before approval.

## 7. Customer Onboarding

Customers should be able to create a request quickly without an account.

Recommended flow:

1. Customer submits `/schedule-service` intake.
2. Server creates `service_requests` and possibly `leads` later.
3. Customer sees confirmation and optional account creation.
4. If customer creates account, link existing request by secure token/email verification, not by trusting client-submitted ids.
5. Customer portal can later show limited own request status.

Customer onboarding should collect only needed data:

- First name.
- Phone or email.
- ZIP/city and service address only when needed for dispatch.
- Appliance/brand/problem.
- Preferred service window.

Customer data must never flow into public SEO pages, open job previews beyond city/ZIP/service summary, or private technician community content.

## 8. Required Tables

### profiles

Purpose: base authenticated identity, role, profile status, and onboarding status.

Recommended additions/fields:

- `id` references auth user.
- `email`.
- `full_name` nullable.
- `role`.
- `status`.
- `onboarding_status`.
- `company_id` nullable shortcut.
- `created_at`, `updated_at`.

### companies

Purpose: company/team account and CRM scope.

Key fields:

- `id`.
- `owner_profile_id`.
- `name`.
- `slug`.
- `status`.
- `default_city`, `default_state`.
- `phone`, `email`.
- `created_at`, `updated_at`.

### company_members

Purpose: membership and permissions within a company.

Key fields:

- `id`.
- `company_id`.
- `profile_id`.
- `member_role`.
- `member_status`.
- `invited_by_profile_id` nullable.
- `joined_at`.
- `created_at`, `updated_at`.

### technician_profiles

Purpose: technician-specific onboarding, verification, service areas, public profile readiness, and marketplace eligibility.

Key fields:

- `id`.
- `profile_id`.
- `company_id` nullable.
- `technician_status`.
- `display_name`.
- `business_name`.
- `years_experience`.
- `service_summary_public`.
- `marketplace_enabled`.
- `created_at`, `updated_at`.

Service areas and specialties can start as related tables or constrained JSON only after the schema strategy is chosen.

### company_invites

Purpose: owner-created invitation to join a company.

Key fields:

- `id`.
- `company_id`.
- `email`.
- `invited_role`.
- `invite_status`.
- `token_hash`.
- `expires_at`.
- `invited_by_profile_id`.
- `accepted_by_profile_id` nullable.
- `accepted_at` nullable.
- `created_at`, `updated_at`.

Never store raw invite tokens. Store token hashes only.

### company_join_requests

Purpose: technician-initiated request to join a company.

Key fields:

- `id`.
- `company_id`.
- `requesting_profile_id`.
- `message` nullable.
- `request_status`.
- `reviewed_by_profile_id` nullable.
- `reviewed_at` nullable.
- `created_at`, `updated_at`.

Join requests should be visible only to the requesting technician, company owner, and admins.

## 9. Required Statuses

### onboarding_status

Recommended values:

- `not_started`
- `profile_required`
- `customer_ready`
- `technician_profile_required`
- `technician_verification_pending`
- `company_required`
- `company_pending_review`
- `company_ready`
- `complete`

Purpose: drives post-login redirect and onboarding UI.

### member_status

Recommended values:

- `invited`
- `active`
- `inactive`
- `removed`
- `suspended`

Purpose: controls company membership access.

### invite_status

Recommended values:

- `pending`
- `accepted`
- `expired`
- `revoked`
- `declined`

Purpose: controls company invite lifecycle.

### technician_status

Recommended values:

- `draft`
- `pending_verification`
- `verified`
- `rejected`
- `suspended`

Purpose: controls technician marketplace/community access.

Also keep `profiles.status` for broad account access:

- `pending`
- `active`
- `verified`
- `rejected`
- `suspended`

Use clear mapping between profile status and technician status. Avoid allowing inconsistent states such as `profile.status = active` while `technician_status = suspended` for marketplace access.

## 10. RLS Implications

Global RLS expectations:

- Deny by default on every private onboarding table.
- Public visitors cannot read private onboarding records.
- Users can read their own profile and onboarding records.
- Users cannot update their own authoritative role/status/company fields.
- Company owners can read/manage company records and memberships only for companies they own.
- Invites are visible only to company owners/admins and to the accepting authenticated user through a token validation path.
- Join requests are visible to the requesting user, company owners for the target company, and admins.
- Admins can manage all onboarding data through audited tools.

Table-specific implications:

- `profiles`: user can update safe personal fields; role/status/company changes are admin/server only.
- `companies`: owner can update own company; members can read limited company context; admins can manage all.
- `company_members`: owner can manage memberships for own company; users can read own memberships; admins can manage all.
- `technician_profiles`: technician can update own onboarding fields; company owner can manage team fields; admin controls verification.
- `company_invites`: owner can create/revoke for own company; accepting user can validate only the token intended for their email; admins can manage all.
- `company_join_requests`: technician can create/read own request; company owner can review target company requests; admins can manage all.

RLS should be paired with server-side validation for:

- Invite creation and acceptance.
- Company creation.
- Company owner linking.
- Technician verification.
- Role/status transitions.
- Join request approval.

## 11. Redirect Rules After Login / Signup

Recommended redirect router:

1. If logged out: `/login?next=<path>` once route protection begins.
2. If profile missing: `/dashboard/dev/supabase-check` in development, future `/account/setup` in production.
3. If profile suspended/rejected: future `/account/suspended` or `/account/rejected`.
4. If customer with no active request context: public homepage or future customer portal.
5. If customer after request submission: request confirmation/customer portal.
6. If technician with no technician profile: `/onboarding/technician`.
7. If technician profile incomplete: `/onboarding/technician` at next incomplete step.
8. If technician pending verification: `/dashboard/settings` or future `/dashboard/onboarding/status`.
9. If verified technician: `/dashboard` or requested `next` route if authorized.
10. If company_owner with no company: `/onboarding/company`.
11. If company_owner with pending company: `/dashboard/settings` or future `/dashboard/onboarding/status`.
12. If company_owner with active company: `/dashboard` or requested `next` route if authorized.
13. If admin: `/dashboard` or future admin route.

Redirects must avoid loops and must not run before a route is safely classified as public vs protected.

## 12. MVP Implementation Phases

### Phase 1: Planning and schema draft

- Create this onboarding plan.
- Draft migration for onboarding enums/tables.
- Review with RLS policy design before applying.

### Phase 2: Onboarding data model

- Add reviewed enums/status constraints.
- Add `companies`, `company_members`, `technician_profiles`, `company_invites`, and `company_join_requests`.
- Add RLS policies and indexes.
- Add audit events for privileged transitions.

### Phase 3: Onboarding router

- Add post-login onboarding decision helper.
- Add non-destructive route that explains current onboarding state.
- Keep existing dashboard non-blocking until route protection is enabled.

### Phase 4: Technician onboarding UI

- Add technician profile setup form.
- Add service area and specialty capture.
- Add verification pending state.
- Keep open jobs/community gated until verification policies exist.

### Phase 5: Company owner onboarding UI

- Add create company flow for approved company owners.
- Add owner-company link.
- Add invite technician flow.
- Add join request review flow.

### Phase 6: Customer request linking

- Keep public intake fast.
- Add optional customer account creation after intake.
- Link request to customer account only through secure verification/token flow.

### Phase 7: Route protection enforcement

- Use middleware/server guards after onboarding routes and redirects exist.
- Gate dashboard, company routes, open jobs, and community according to role/status.
- Keep public marketplace pages crawlable.

## 13. Risks / Security Notes

### Fake company claims

Risk: a user claims a real company they do not own.

Mitigation:

- Do not allow automatic owner verification from public signup.
- Require manual/admin approval or trusted verification before activating company ownership.
- Audit owner-company links.

### Invite abuse

Risk: owners or attackers spam invitations or brute-force invite tokens.

Mitigation:

- Store token hashes only.
- Expire invites.
- Rate limit invite creation and acceptance.
- Require email match.
- Audit invite events.

### Role escalation

Risk: user edits role/status/company fields from the client.

Mitigation:

- Block client updates to authoritative role/status/company fields.
- Use server-side role transitions.
- Use RLS and audited admin functions.
- Keep service-role keys server-only.

### Exposing customer data

Risk: onboarding/company membership incorrectly grants access to private customer data.

Mitigation:

- Company membership alone should not expose customer PII unless the company owns the relevant lead/job/request.
- Open job previews should show only city/ZIP/appliance/summary/preferred window/value.
- Full address/contact unlocks only after assignment and policy checks.

### Pending technician over-access

Risk: unverified technicians reach open jobs or private community.

Mitigation:

- Gate open jobs/community by `technician_status = verified` or equivalent role/status combination.
- Keep pending technicians in onboarding/status routes.

### Company data leakage

Risk: company owners or members see other companies' records.

Mitigation:

- Use `company_id` scoping everywhere.
- Require active `company_members` rows for team access.
- Test cross-company access before production.

## 14. Recommended Next Implementation Task

Recommended next task: draft a review-only onboarding schema migration.

Scope:

- Add planned status enums or safe CHECK constraints.
- Add `companies`, `company_members`, `technician_profiles`, `company_invites`, and `company_join_requests`.
- Add indexes and RLS enablement comments.
- Do not apply migration.
- Do not wire UI.
- Include RLS TODOs for table-specific policy review.

After that, design table-specific RLS policies before any production onboarding UI or route protection is enforced.
