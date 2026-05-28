-- WeRepairRefrigerators Task 66 draft migration.
--
-- REVIEW-ONLY DRAFT:
-- - Do not apply this file until 0003 onboarding tables, 0004 audit logs,
--   0005 helper functions, grants, RLS recursion behavior, invite token flows,
--   server actions, and test fixtures are reviewed together.
-- - This migration has not been applied to any Supabase project by Codex.
-- - This migration intentionally does not wire frontend flows to the database,
--   run Supabase commands, execute SQL, or use service-role access in frontend
--   code.
-- - These policies are table-specific policy drafts. Some mutations are marked
--   server-only because final safety requires transactions, audit logging,
--   token hashing, rate limits, and column-level validation that RLS alone
--   cannot provide.
--
-- Dependency expectations:
-- - 0001_profiles_roles.sql: public.profiles, public.app_role, status guards.
-- - 0003_onboarding_foundation_draft.sql: onboarding/company tables.
-- - 0004_audit_log_foundation_draft.sql: public.audit_logs.
-- - 0005_rls_helpers_draft.sql: reusable helper predicates.

-- ---------------------------------------------------------------------------
-- Baseline RLS enablement and grant posture
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.technician_profiles enable row level security;
alter table public.company_invites enable row level security;
alter table public.company_join_requests enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.profiles from anon;
revoke all on public.companies from anon;
revoke all on public.company_members from anon;
revoke all on public.technician_profiles from anon;
revoke all on public.company_invites from anon;
revoke all on public.company_join_requests from anon;
revoke all on public.audit_logs from anon;

-- Review before applying:
-- - Grants below are intentionally minimal draft grants so RLS can be tested.
-- - Browser-safe flows should still prefer reviewed Server Actions/RPCs when a
--   mutation needs transactions, audit logs, invite tokens, owner transfer
--   checks, protected columns, or cross-table updates.
-- - Do not grant direct browser access to company_invites or audit_logs until
--   sanitized views/RPCs and admin tooling are reviewed.

grant select, update on public.profiles to authenticated;
grant select, update on public.companies to authenticated;
grant select, update on public.company_members to authenticated;
grant select, insert, update on public.technician_profiles to authenticated;
grant select, insert, update on public.company_join_requests to authenticated;
revoke all on public.company_invites from authenticated;
revoke all on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- public.profiles onboarding fields
-- ---------------------------------------------------------------------------

-- Replace the 0001 draft policy names if this file is ever tested after 0001.
-- Review carefully before application; this is not a production policy set.
drop policy if exists "Users can select own profile" on public.profiles;
drop policy if exists "Users can update limited own profile fields" on public.profiles;
drop policy if exists "Admins can select all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

drop policy if exists "Profiles can select own row" on public.profiles;
create policy "Profiles can select own row"
on public.profiles
for select
to authenticated
using (id = public.auth_user_id());

drop policy if exists "Admins can select profiles" on public.profiles;
create policy "Admins can select profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "Profiles can update own safe fields" on public.profiles;
create policy "Profiles can update own safe fields"
on public.profiles
for update
to authenticated
using (id = public.auth_user_id())
with check (id = public.auth_user_id());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- INSERT: no browser-safe insert policy.
-- Profile rows should be created by the reviewed auth.users trigger from 0001
-- or a future audited server/admin flow.
--
-- DELETE: no browser-safe delete policy.
-- User/profile removal requires a reviewed account lifecycle process.
--
-- Important:
-- - profiles.role, profiles.status, profiles.company_id,
--   profiles.onboarding_status, and profiles.onboarding_completed_at must not be
--   client-writable. The 0001/0003 triggers currently guard these fields.
-- - Company/team profile summaries should use a sanitized view/RPC later, not
--   broad raw profile SELECT access.

-- ---------------------------------------------------------------------------
-- public.companies
-- ---------------------------------------------------------------------------

drop policy if exists "Company members can select their companies" on public.companies;
create policy "Company members can select their companies"
on public.companies
for select
to authenticated
using (public.can_view_company(id));

drop policy if exists "Company managers can update companies" on public.companies;
create policy "Company managers can update companies"
on public.companies
for update
to authenticated
using (public.can_manage_company(id))
with check (public.can_manage_company(id));

-- INSERT: server-only.
-- Company creation should use createCompanyAndOwnerMembership in a transaction
-- that creates the company, owner membership, profile company pointer,
-- onboarding status changes, and audit log together.
--
-- DELETE: no hard deletes.
-- Archive through reviewed server/admin flow using status='archived',
-- archived_at, archived_by_profile_id, and audit_logs.
--
-- Test requirements:
-- - Owners can view/manage only active owned companies.
-- - Suspended/archived company members cannot view or manage company rows.
-- - Cross-company owners cannot view or mutate unrelated companies.

-- ---------------------------------------------------------------------------
-- public.company_members
-- ---------------------------------------------------------------------------

drop policy if exists "Users can select own company memberships" on public.company_members;
create policy "Users can select own company memberships"
on public.company_members
for select
to authenticated
using (
  profile_id = public.auth_user_id()
  and archived_at is null
);

drop policy if exists "Company managers can select memberships" on public.company_members;
create policy "Company managers can select memberships"
on public.company_members
for select
to authenticated
using (public.can_manage_company_members(company_id));

drop policy if exists "Company managers can update memberships" on public.company_members;
create policy "Company managers can update memberships"
on public.company_members
for update
to authenticated
using (public.can_manage_company_members(company_id))
with check (public.can_manage_company_members(company_id));

-- INSERT: server-only.
-- Membership creation must be handled by reviewed server actions for company
-- creation, invite acceptance, join request approval, and admin overrides.
--
-- DELETE: no hard deletes.
-- Use member_status plus removed_at/suspended_at/archived_at in audited server
-- flows. Do not allow self-promotion, owner transfer, last-owner removal, or
-- suspended member reactivation from the browser.
--
-- Test requirements:
-- - Suspended/removed/archived members do not retain company access.
-- - Managers cannot create owners or remove the final owner without server
--   transaction checks.
-- - company_members remains authoritative; profiles.company_id is convenience.

-- ---------------------------------------------------------------------------
-- public.technician_profiles
-- ---------------------------------------------------------------------------

drop policy if exists "Technician profiles can be selected by allowed viewers" on public.technician_profiles;
create policy "Technician profiles can be selected by allowed viewers"
on public.technician_profiles
for select
to authenticated
using (public.can_view_technician_profile(id));

drop policy if exists "Technicians can insert own draft profile" on public.technician_profiles;
create policy "Technicians can insert own draft profile"
on public.technician_profiles
for insert
to authenticated
with check (
  profile_id = public.auth_user_id()
  and public.current_profile_role() in (
    'technician',
    'verified_technician',
    'expert_technician',
    'company_owner',
    'admin'
  )
  and technician_status = 'draft'
  and marketplace_enabled = false
  and public_profile_ready = false
  and verified_at is null
  and verified_by_profile_id is null
  and rejected_at is null
  and suspended_at is null
  and archived_at is null
);

drop policy if exists "Technician profiles can be updated by allowed managers" on public.technician_profiles;
create policy "Technician profiles can be updated by allowed managers"
on public.technician_profiles
for update
to authenticated
using (public.can_manage_technician_profile(id))
with check (public.can_manage_technician_profile(id));

-- DELETE: no hard deletes.
-- Use technician_status='archived' and archived_at through reviewed server/admin
-- flows.
--
-- Important:
-- - RLS cannot protect individual columns. Verification fields,
--   marketplace_enabled, public_profile_ready, company_id, affiliation_type,
--   suspension, rejection, and archive fields need server-side validation and
--   audit logging before broad browser updates are allowed.
-- - Public technician pages must use sanitized projections, never this raw table.
--
-- Test requirements:
-- - A technician can create only their own draft profile.
-- - A company manager can view/manage only company-scoped technicians.
-- - Public technician visibility uses can_view_public_technician_profile() only
--   through a sanitized view or API response.

-- ---------------------------------------------------------------------------
-- public.company_invites
-- ---------------------------------------------------------------------------

-- No browser-safe SELECT policy is created in this draft because the raw table
-- contains invited_email and token_hash. RLS cannot hide columns. Company invite
-- lists should use a sanitized view/RPC that excludes token_hash and redacts
-- private email where appropriate.

-- INSERT: server-only.
-- createCompanyInvite should generate the raw token server-side, store only
-- token_hash, set expiry/lifecycle fields, rate-limit invite creation, and write
-- an audit log in the same transaction.
--
-- UPDATE: server-only.
-- Accept/revoke/decline/expire flows must validate token state server-side and
-- must never expose token_hash to browser clients.
--
-- DELETE: no hard deletes.
-- Use invite_status plus revoked_at/expired_at/archived_at in audited server
-- flows.
--
-- Optional admin-only direct table policy for future reviewed tooling:
-- create policy "Admins can select raw company invites"
-- on public.company_invites
-- for select
-- to authenticated
-- using (public.is_admin());
--
-- Test requirements:
-- - Raw invite tokens and token_hash are never returned to browser UI.
-- - Expired/revoked/accepted invites cannot be reused.
-- - Cross-company owners cannot inspect unrelated invites.

-- ---------------------------------------------------------------------------
-- public.company_join_requests
-- ---------------------------------------------------------------------------

drop policy if exists "Join requesters can select own requests" on public.company_join_requests;
create policy "Join requesters can select own requests"
on public.company_join_requests
for select
to authenticated
using (requesting_profile_id = public.auth_user_id());

drop policy if exists "Company managers can select join requests" on public.company_join_requests;
create policy "Company managers can select join requests"
on public.company_join_requests
for select
to authenticated
using (public.can_manage_company_members(company_id));

drop policy if exists "Technicians can insert own pending join request" on public.company_join_requests;
create policy "Technicians can insert own pending join request"
on public.company_join_requests
for insert
to authenticated
with check (
  requesting_profile_id = public.auth_user_id()
  and request_status = 'pending'
  and requested_role = 'technician'
  and reviewed_by_profile_id is null
  and reviewed_at is null
  and decision_note is null
  and cancelled_at is null
  and expired_at is null
  and archived_at is null
);

drop policy if exists "Requesters can cancel own pending join requests" on public.company_join_requests;
create policy "Requesters can cancel own pending join requests"
on public.company_join_requests
for update
to authenticated
using (
  requesting_profile_id = public.auth_user_id()
  and request_status = 'pending'
)
with check (
  requesting_profile_id = public.auth_user_id()
  and request_status in ('pending', 'cancelled')
  and reviewed_by_profile_id is null
  and reviewed_at is null
  and decision_note is null
  and archived_at is null
);

drop policy if exists "Company managers can review join requests" on public.company_join_requests;
create policy "Company managers can review join requests"
on public.company_join_requests
for update
to authenticated
using (public.can_manage_company_members(company_id))
with check (public.can_manage_company_members(company_id));

-- DELETE: no hard deletes.
-- Use request_status and archived_at through audited server/admin flows.
--
-- Important:
-- - Approval is not just a row update. approveJoinRequest must create or update
--   company_members, update technician profile affiliation/company fields,
--   update profiles convenience/onboarding fields, and write audit_logs in one
--   transaction.
-- - Browser insert/update policies above are draft conveniences only. Production
--   should prefer server actions for rate limits, duplicate checks, and audit.
--
-- Test requirements:
-- - Technicians cannot request owner/manager/dispatcher roles directly.
-- - Requesters can cancel only their own pending request.
-- - Suspended company managers cannot review requests.
-- - Cross-company reviewers cannot see or mutate unrelated requests.

-- ---------------------------------------------------------------------------
-- public.audit_logs
-- ---------------------------------------------------------------------------

-- No browser grants or normal user policies are created for audit_logs.
-- Raw audit logs stay append-only and admin/server-only at first.

-- SELECT: server/admin tooling only.
-- A future reviewed admin path may add an admin-only policy:
-- create policy "Admins can select audit logs"
-- on public.audit_logs
-- for select
-- to authenticated
-- using (public.is_admin());
--
-- INSERT: trusted server action/API/RPC only.
-- Do not allow direct browser inserts. Every privileged onboarding mutation
-- should write sanitized audit rows transactionally with the business change.
--
-- UPDATE/DELETE: no policies.
-- 0004's append-only trigger should reject normal update/delete attempts.
--
-- Test requirements:
-- - Normal authenticated users cannot select, insert, update, or delete logs.
-- - Admin/server insert paths reject raw invite tokens, token hashes, customer
--   PII, payment data, service credentials, and full request payloads.
-- - Retention/maintenance jobs require a separately reviewed path.

-- ---------------------------------------------------------------------------
-- Remaining review checklist before applying this draft
-- ---------------------------------------------------------------------------

-- - Confirm helper functions from 0005 do not recurse through these policies.
-- - Confirm SECURITY DEFINER ownership and search_path for helper functions.
-- - Decide whether company owners need sanitized invite summary views before
--   enabling invite UI.
-- - Add column-protection triggers or server-only mutations for sensitive fields
--   that RLS cannot protect by itself.
-- - Add audit write helpers before enabling privileged membership/company flows.
-- - Add seed/test fixtures for anonymous users, customers, technicians, pending
--   technicians, verified technicians, company owners, admins, suspended members,
--   removed members, archived companies, multi-company users, and cross-company
--   access attempts.
-- - Review rollback steps before any Supabase application.
