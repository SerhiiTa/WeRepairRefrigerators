-- WeRepairRefrigerators Task 69 apply-ready staging migration.
--
-- APPLY-READY SCOPE:
-- - Intended for a disposable development or staging Supabase project after 0007, 0008, and 0009.
-- - Creates conservative table-specific RLS policies for onboarding foundation reads and low-risk self-service inserts.
-- - Keeps browser access blocked for raw company invites and audit logs.
-- - Leaves privileged lifecycle mutations to future audited server actions or RPCs.

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

grant select, update on public.profiles to authenticated;
grant select on public.companies to authenticated;
grant select on public.company_members to authenticated;
grant select, insert on public.technician_profiles to authenticated;
grant select, insert on public.company_join_requests to authenticated;
revoke all on public.company_invites from authenticated;
revoke all on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- public.profiles
-- ---------------------------------------------------------------------------

drop policy if exists "Users can select own profile" on public.profiles;
drop policy if exists "Users can update limited own profile fields" on public.profiles;
drop policy if exists "Admins can select all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Profiles can select own row" on public.profiles;
drop policy if exists "Admins can select profiles" on public.profiles;
drop policy if exists "Profiles can update own safe fields" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;

create policy "Profiles can select own row"
on public.profiles
for select
to authenticated
using (id = public.auth_user_id());

create policy "Admins can select profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "Profiles can update own safe fields"
on public.profiles
for update
to authenticated
using (id = public.auth_user_id())
with check (id = public.auth_user_id());

create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Profile inserts continue to come from the auth.users trigger in 0001.
-- Profile hard deletes are not granted to browser roles.
-- Role, status, company_id, role_intent, onboarding_status, and onboarding_completed_at
-- remain protected by triggers from 0001 and 0007.

-- ---------------------------------------------------------------------------
-- public.companies
-- ---------------------------------------------------------------------------

drop policy if exists "Company members can select their companies" on public.companies;
drop policy if exists "Company managers can update companies" on public.companies;

create policy "Company members can select their companies"
on public.companies
for select
to authenticated
using (public.can_view_company(id));

-- Company insert/update/archive workflows are server-side only at this stage.
-- This file intentionally grants no browser INSERT, UPDATE, or DELETE on companies.

-- ---------------------------------------------------------------------------
-- public.company_members
-- ---------------------------------------------------------------------------

drop policy if exists "Users can select own company memberships" on public.company_members;
drop policy if exists "Company managers can select memberships" on public.company_members;
drop policy if exists "Company managers can update memberships" on public.company_members;

create policy "Users can select own company memberships"
on public.company_members
for select
to authenticated
using (
  profile_id = public.auth_user_id()
  and archived_at is null
);

create policy "Company managers can select memberships"
on public.company_members
for select
to authenticated
using (public.can_manage_company_members(company_id));

-- Membership creation, activation, suspension, removal, owner transfer, and archive
-- workflows are server-side only at this stage.
-- This file intentionally grants no browser INSERT, UPDATE, or DELETE on company_members.

-- ---------------------------------------------------------------------------
-- public.technician_profiles
-- ---------------------------------------------------------------------------

drop policy if exists "Technician profiles can be selected by allowed viewers" on public.technician_profiles;
drop policy if exists "Technicians can insert own draft profile" on public.technician_profiles;
drop policy if exists "Technician profiles can be updated by allowed managers" on public.technician_profiles;

create policy "Technician profiles can be selected by allowed viewers"
on public.technician_profiles
for select
to authenticated
using (public.can_view_technician_profile(id));

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

-- Technician profile updates are deferred until column-safe server actions or
-- additional protection triggers exist. Verification, marketplace, public profile,
-- company affiliation, suspension, rejection, and archive fields are server/admin controlled.
-- Public technician pages must use sanitized projections rather than this raw table.

-- ---------------------------------------------------------------------------
-- public.company_invites
-- ---------------------------------------------------------------------------

-- Raw company_invites contains private invited_email and token_hash fields.
-- RLS cannot hide individual columns, so this migration keeps direct browser access revoked.
-- Future invite list UI should use a sanitized view or RPC that excludes token_hash.
-- Invite creation, acceptance, revocation, expiration, and archive are server-side only.

-- ---------------------------------------------------------------------------
-- public.company_join_requests
-- ---------------------------------------------------------------------------

drop policy if exists "Join requesters can select own requests" on public.company_join_requests;
drop policy if exists "Company managers can select join requests" on public.company_join_requests;
drop policy if exists "Technicians can insert own pending join request" on public.company_join_requests;
drop policy if exists "Requesters can cancel own pending join requests" on public.company_join_requests;
drop policy if exists "Company managers can review join requests" on public.company_join_requests;

create policy "Join requesters can select own requests"
on public.company_join_requests
for select
to authenticated
using (requesting_profile_id = public.auth_user_id());

create policy "Company managers can select join requests"
on public.company_join_requests
for select
to authenticated
using (public.can_manage_company_members(company_id));

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

-- Join request cancellation, approval, rejection, expiration, archive, and membership
-- creation remain server-side workflows so they can be audited and handled transactionally.

-- ---------------------------------------------------------------------------
-- public.audit_logs
-- ---------------------------------------------------------------------------

-- Raw audit_logs stays server/admin only at this stage.
-- This migration keeps browser access revoked and creates no direct audit policies.
-- 0008's append-only trigger rejects normal update/delete attempts.

-- ---------------------------------------------------------------------------
-- Deferred items for future migrations/server code
-- ---------------------------------------------------------------------------

-- - Sanitized company invite summary view or RPC.
-- - Trusted audit insert function or server action with metadata sanitizer.
-- - Server actions/RPCs for company creation, invite acceptance, join request review,
--   technician verification, onboarding completion, and membership archive.
-- - Column-safe technician profile update workflow.
-- - Optional admin read path for raw audit logs.
