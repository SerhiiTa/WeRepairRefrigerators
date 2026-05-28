-- WeRepairRefrigerators Task 60/61 draft migration.
--
-- REVIEW-ONLY DRAFT:
-- - Do not apply this file until onboarding flows, table-specific RLS policies,
--   invite token validation, audit logging, and company ownership rules are
--   reviewed and tested.
-- - This migration has not been applied to any Supabase project by Codex.
-- - This migration intentionally does not wire frontend flows to the database,
--   protect routes, create API endpoints, or use service-role access.
-- - The real development database should currently contain only the reviewed
--   profiles foundation from 0001_profiles_roles.sql.
--
-- Onboarding privacy model:
-- - Public signup may request customer or technician intent only.
-- - company_owner and admin roles must remain manual/admin-assigned.
-- - Company membership, invite tokens, technician verification data, and private
--   profile fields are dashboard-only and must not be exposed publicly.
-- - Raw invite tokens must never be stored; store only server-generated hashes.
-- - profiles.company_id is a convenience pointer only. The authoritative company
--   relationship is company_members plus final RLS/server checks.

-- Uses gen_random_uuid() for draft UUID primary keys. Confirm extension policy
-- in the target Supabase project before applying.
create extension if not exists pgcrypto with schema extensions;

-- This draft assumes public.profiles, public.app_role, public.current_app_role(),
-- and public.set_updated_at() exist from 0001_profiles_roles.sql.
-- Review/apply 0001 before considering this draft.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'onboarding_status') then
    create type public.onboarding_status as enum (
      'not_started',
      'profile_required',
      'customer_ready',
      'technician_profile_required',
      'technician_verification_pending',
      'company_required',
      'company_pending_review',
      'company_ready',
      'complete'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_status') then
    create type public.company_status as enum (
      'pending',
      'active',
      'suspended',
      'rejected',
      'archived'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_member_role') then
    create type public.company_member_role as enum (
      'owner',
      'manager',
      'dispatcher',
      'technician'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_member_status') then
    create type public.company_member_status as enum (
      'invited',
      'active',
      'inactive',
      'removed',
      'suspended'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'technician_status') then
    create type public.technician_status as enum (
      'draft',
      'pending_verification',
      'verified',
      'rejected',
      'suspended',
      'archived'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'technician_affiliation_type') then
    create type public.technician_affiliation_type as enum (
      'independent',
      'company_pending',
      'company_member'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_invite_status') then
    create type public.company_invite_status as enum (
      'pending',
      'accepted',
      'expired',
      'revoked',
      'declined',
      'archived'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_join_request_status') then
    create type public.company_join_request_status as enum (
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'expired',
      'archived'
    );
  end if;
end
$$;

alter table public.profiles
  add column if not exists onboarding_status public.onboarding_status not null default 'not_started',
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_status is
  'Task 60/61 review-only draft addition. Tracks the next onboarding state; frontend must not treat this as authorization.';
comment on column public.profiles.onboarding_completed_at is
  'Timestamp for completed onboarding. Set only through reviewed server/admin flows.';
comment on column public.profiles.company_id is
  'Nullable convenience pointer for active company context. Authoritative membership must use company_members and final RLS/server checks.';

create index if not exists profiles_onboarding_status_idx
  on public.profiles (onboarding_status);
create index if not exists profiles_company_id_idx
  on public.profiles (company_id);

create or replace function public.prevent_unsafe_onboarding_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 0001 protects role/status/company_id. This companion trigger protects
  -- onboarding-specific fields until reviewed server/admin flows exist.
  if public.current_app_role() = 'admin' then
    return new;
  end if;

  if old.onboarding_status is distinct from new.onboarding_status then
    raise exception 'Onboarding status changes require reviewed server/admin flow';
  end if;

  if old.onboarding_completed_at is distinct from new.onboarding_completed_at then
    raise exception 'Onboarding completion changes require reviewed server/admin flow';
  end if;

  return new;
end;
$$;

comment on function public.prevent_unsafe_onboarding_profile_updates() is
  'Task 60/61 draft guard. Review trigger ownership and admin bypass behavior before applying.';

drop trigger if exists prevent_unsafe_onboarding_profile_updates on public.profiles;
create trigger prevent_unsafe_onboarding_profile_updates
before update on public.profiles
for each row
execute function public.prevent_unsafe_onboarding_profile_updates();

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  slug text not null,
  primary_city text,
  primary_state text not null default 'TX',
  business_phone text,
  business_email text,
  website_url text,
  status public.company_status not null default 'pending',
  onboarding_status public.onboarding_status not null default 'company_pending_review',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  archived_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint companies_review_status_check check (
    status not in ('active', 'suspended', 'rejected')
    or (reviewed_by_profile_id is not null and reviewed_at is not null)
  ),
  constraint companies_archive_status_check check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  )
);

comment on table public.companies is
  'Task 60/61 review-only draft. Company/team account for owner-scoped CRM, onboarding, dispatch, and billing later.';
comment on column public.companies.owner_profile_id is
  'Owning company_owner profile. Must be assigned through reviewed admin/server flow, never public signup.';
comment on column public.companies.slug is
  'Human-readable company slug. Keep private/admin review before public profile use.';
comment on column public.companies.status is
  'Company lifecycle status. active/suspended/rejected require reviewer metadata in this draft.';
comment on column public.companies.archived_at is
  'Soft-archive timestamp. Prefer status/archive fields over hard deletes for auditability.';

create unique index if not exists companies_slug_unique_idx
  on public.companies (slug);
create index if not exists companies_owner_profile_id_idx
  on public.companies (owner_profile_id);
create index if not exists companies_status_idx
  on public.companies (status);
create index if not exists companies_primary_area_idx
  on public.companies (primary_state, primary_city);
create index if not exists companies_active_owner_idx
  on public.companies (owner_profile_id, status)
  where status = 'active';

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_company_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_company_id_fkey
      foreign key (company_id)
      references public.companies(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  member_role public.company_member_role not null default 'technician',
  member_status public.company_member_status not null default 'invited',
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  removed_by_profile_id uuid references public.profiles(id) on delete set null,
  archived_by_profile_id uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  removed_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_members_company_profile_unique unique (company_id, profile_id),
  constraint company_members_owner_must_be_active check (
    member_role <> 'owner'
    or member_status = 'active'
  ),
  constraint company_members_status_timestamps_check check (
    (member_status <> 'invited' or invited_at is not null)
    and (member_status <> 'active' or joined_at is not null)
    and (member_status <> 'removed' or removed_at is not null)
    and (member_status <> 'suspended' or suspended_at is not null)
  ),
  constraint company_members_archive_status_check check (
    archived_at is null
    or member_status in ('inactive', 'removed', 'suspended')
  )
);

comment on table public.company_members is
  'Task 60/61 review-only draft. Authoritative company/team membership scope for owners, managers, dispatchers, and technicians.';
comment on column public.company_members.member_role is
  'Company-scoped role only. Do not confuse with platform app_role values in public.profiles.';
comment on column public.company_members.member_status is
  'Membership lifecycle status. Only active members should receive company-scoped access later.';
comment on column public.company_members.notes is
  'Private company/admin notes. Do not expose publicly.';
comment on column public.company_members.archived_at is
  'Soft-archive timestamp for membership history and auditability.';

create index if not exists company_members_profile_id_idx
  on public.company_members (profile_id);
create index if not exists company_members_company_status_idx
  on public.company_members (company_id, member_status);
create index if not exists company_members_company_role_idx
  on public.company_members (company_id, member_role);
create index if not exists company_members_active_company_role_idx
  on public.company_members (company_id, member_role)
  where member_status = 'active';

drop trigger if exists set_company_members_updated_at on public.company_members;
create trigger set_company_members_updated_at
before update on public.company_members
for each row
execute function public.set_updated_at();

create table if not exists public.technician_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  company_id uuid references public.companies(id) on delete restrict,
  affiliation_type public.technician_affiliation_type not null default 'independent',
  display_name text,
  business_name text,
  years_experience integer check (years_experience is null or years_experience >= 0),
  service_summary_public text,
  bio_private text,
  primary_city text,
  primary_state text not null default 'TX',
  service_zip_codes text[] not null default '{}',
  specialties text[] not null default '{}',
  languages text[] not null default '{}',
  technician_status public.technician_status not null default 'draft',
  marketplace_enabled boolean not null default false,
  public_profile_ready boolean not null default false,
  verification_submitted_at timestamptz,
  verified_at timestamptz,
  verified_by_profile_id uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  suspended_at timestamptz,
  archived_by_profile_id uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint technician_profiles_affiliation_company_check check (
    (affiliation_type = 'independent' and company_id is null)
    or (affiliation_type = 'company_pending')
    or (affiliation_type = 'company_member' and company_id is not null)
  ),
  constraint technician_profiles_status_timestamps_check check (
    (technician_status <> 'pending_verification' or verification_submitted_at is not null)
    and (technician_status <> 'verified' or (verified_at is not null and verified_by_profile_id is not null))
    and (technician_status <> 'rejected' or rejected_at is not null)
    and (technician_status <> 'suspended' or suspended_at is not null)
    and (technician_status <> 'archived' or archived_at is not null)
  ),
  constraint technician_profiles_marketplace_requires_verified check (
    marketplace_enabled = false
    or technician_status = 'verified'
  ),
  constraint technician_profiles_public_profile_requires_verified check (
    public_profile_ready = false
    or technician_status = 'verified'
  )
);

comment on table public.technician_profiles is
  'Task 60/61 review-only draft. Private technician onboarding, verification, matching, and marketplace eligibility record.';
comment on column public.technician_profiles.affiliation_type is
  'Distinguishes independent technicians, pending company joins, and active company technicians.';
comment on column public.technician_profiles.bio_private is
  'Private technician profile notes/details. Public pages should read only approved public-safe fields later.';
comment on column public.technician_profiles.service_zip_codes is
  'Draft service coverage ZIPs for future matching. Review normalization into service_areas before production scale.';
comment on column public.technician_profiles.specialties is
  'Draft specialties for onboarding/matching. May be normalized later.';
comment on column public.technician_profiles.marketplace_enabled is
  'Must remain false until technician verification and marketplace eligibility rules are approved.';
comment on column public.technician_profiles.public_profile_ready is
  'Public profile readiness flag. Does not by itself publish private technician data.';
comment on column public.technician_profiles.archived_at is
  'Soft-archive timestamp. Preserve history for verification/audit review.';

create index if not exists technician_profiles_company_id_idx
  on public.technician_profiles (company_id);
create index if not exists technician_profiles_status_idx
  on public.technician_profiles (technician_status);
create index if not exists technician_profiles_affiliation_idx
  on public.technician_profiles (affiliation_type);
create index if not exists technician_profiles_marketplace_enabled_idx
  on public.technician_profiles (marketplace_enabled)
  where marketplace_enabled = true;
create index if not exists technician_profiles_public_ready_idx
  on public.technician_profiles (public_profile_ready)
  where public_profile_ready = true;
create index if not exists technician_profiles_primary_area_idx
  on public.technician_profiles (primary_state, primary_city);
create index if not exists technician_profiles_zip_codes_gin_idx
  on public.technician_profiles using gin (service_zip_codes);
create index if not exists technician_profiles_specialties_gin_idx
  on public.technician_profiles using gin (specialties);

drop trigger if exists set_technician_profiles_updated_at on public.technician_profiles;
create trigger set_technician_profiles_updated_at
before update on public.technician_profiles
for each row
execute function public.set_updated_at();

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invited_email text not null,
  invited_role public.company_member_role not null default 'technician',
  invite_status public.company_invite_status not null default 'pending',
  token_hash text not null,
  token_hash_algorithm text not null default 'sha256',
  invited_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  accepted_by_profile_id uuid references public.profiles(id) on delete set null,
  revoked_by_profile_id uuid references public.profiles(id) on delete set null,
  archived_by_profile_id uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  declined_at timestamptz,
  expired_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_invites_email_shape_check check (position('@' in invited_email) > 1),
  constraint company_invites_expiry_check check (expires_at > created_at),
  constraint company_invites_status_timestamps_check check (
    (invite_status <> 'accepted' or (accepted_by_profile_id is not null and accepted_at is not null))
    and (invite_status <> 'revoked' or (revoked_by_profile_id is not null and revoked_at is not null))
    and (invite_status <> 'declined' or declined_at is not null)
    and (invite_status <> 'expired' or expired_at is not null)
    and (invite_status <> 'archived' or archived_at is not null)
  )
);

comment on table public.company_invites is
  'Task 60/61 review-only draft. Company invitation records. Store only token hashes; raw invite tokens must never be persisted.';
comment on column public.company_invites.token_hash is
  'Server-generated hash of invite token. Never expose raw token or token_hash to public/client UI.';
comment on column public.company_invites.token_hash_algorithm is
  'Hash algorithm label for future token rotation/migration. Do not use weak hashes.';
comment on column public.company_invites.invited_email is
  'Private invited email used for matching. Do not expose in public surfaces.';
comment on column public.company_invites.invited_role is
  'Company-scoped invited role, not a platform admin role.';
comment on column public.company_invites.expires_at is
  'Invite expiration for abuse control and stale invitation cleanup.';
comment on column public.company_invites.expired_at is
  'Timestamp set by a reviewed cleanup/server flow when a pending invite is marked expired.';

create unique index if not exists company_invites_token_hash_unique_idx
  on public.company_invites (token_hash);
create index if not exists company_invites_company_status_idx
  on public.company_invites (company_id, invite_status);
create index if not exists company_invites_invited_email_idx
  on public.company_invites (lower(btrim(invited_email)));
create index if not exists company_invites_expires_at_idx
  on public.company_invites (expires_at);
create unique index if not exists company_invites_pending_email_unique_idx
  on public.company_invites (company_id, lower(btrim(invited_email)))
  where invite_status = 'pending';

drop trigger if exists set_company_invites_updated_at on public.company_invites;
create trigger set_company_invites_updated_at
before update on public.company_invites
for each row
execute function public.set_updated_at();

create table if not exists public.company_join_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  requesting_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_status public.company_join_request_status not null default 'pending',
  requested_role public.company_member_role not null default 'technician',
  message text,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  archived_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  expires_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_join_requests_status_timestamps_check check (
    (request_status <> 'approved' or (reviewed_by_profile_id is not null and reviewed_at is not null))
    and (request_status <> 'rejected' or (reviewed_by_profile_id is not null and reviewed_at is not null))
    and (request_status <> 'cancelled' or cancelled_at is not null)
    and (request_status <> 'expired' or expired_at is not null)
    and (request_status <> 'archived' or archived_at is not null)
  ),
  constraint company_join_requests_expiry_order_check check (
    expires_at is null or expires_at > created_at
  )
);

comment on table public.company_join_requests is
  'Task 60/61 review-only draft. Technician-to-company join request workflow for owner review.';
comment on column public.company_join_requests.message is
  'Requester-provided message. Keep private to the requester, target company owners/managers, and admins.';
comment on column public.company_join_requests.decision_note is
  'Private reviewer note. Do not expose publicly.';
comment on column public.company_join_requests.requested_role is
  'Company-scoped requested role. Server/admin review required before creating membership.';
comment on column public.company_join_requests.expires_at is
  'Optional deadline for pending join request cleanup and abuse control.';

create index if not exists company_join_requests_company_status_idx
  on public.company_join_requests (company_id, request_status);
create index if not exists company_join_requests_requesting_profile_idx
  on public.company_join_requests (requesting_profile_id);
create index if not exists company_join_requests_expires_at_idx
  on public.company_join_requests (expires_at);
create unique index if not exists company_join_requests_pending_unique_idx
  on public.company_join_requests (company_id, requesting_profile_id)
  where request_status = 'pending';

drop trigger if exists set_company_join_requests_updated_at on public.company_join_requests;
create trigger set_company_join_requests_updated_at
before update on public.company_join_requests
for each row
execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.technician_profiles enable row level security;
alter table public.company_invites enable row level security;
alter table public.company_join_requests enable row level security;

-- Baseline grants remain intentionally narrow. RLS policies must be reviewed
-- before frontend/server features start reading or mutating these tables.
revoke all on public.companies from anon;
revoke all on public.company_members from anon;
revoke all on public.technician_profiles from anon;
revoke all on public.company_invites from anon;
revoke all on public.company_join_requests from anon;

-- No final policies are created in this draft. If applied as-is, authenticated
-- users still need reviewed grants/policies before these tables are usable.

-- RLS TODOs before applying/using this draft:
--
-- public.profiles onboarding additions
-- - SELECT continues to use the reviewed 0001 policies.
-- - UPDATE for onboarding_status, onboarding_completed_at, and company_id must
--   be server/admin controlled. Do not allow frontend self-completion of
--   privileged onboarding steps.
--
-- public.companies
-- - SELECT: active company members can read their company; admins can read all.
-- - INSERT: approved company_owner/admin server flow only.
-- - UPDATE: company owner/admin only; status changes should be audited.
-- - DELETE: avoid hard delete; use status='archived' plus archived_at.
--
-- public.company_members
-- - SELECT: own membership rows, active company owners/managers for their company,
--   and admins.
-- - INSERT: company owner/admin server flow only after invite/join request review.
-- - UPDATE: company owner/admin for team management; users may not self-promote,
--   self-activate, or change company ownership.
-- - DELETE: avoid hard delete; use member_status/archived_at.
--
-- public.technician_profiles
-- - SELECT: owner can read own row; company owners can read company technicians;
--   admins can read all; future public profiles must use sanitized projection.
-- - INSERT: authenticated technician onboarding for own profile only.
-- - UPDATE: own non-sensitive fields only while draft/pending; verification,
--   marketplace_enabled, company_id, affiliation_type, and public_profile_ready
--   need reviewed server/admin policies.
-- - DELETE: avoid hard delete; use technician_status='archived' plus archived_at.
--
-- public.company_invites
-- - SELECT: company owner/manager/admin only; invite acceptance should validate
--   token_hash server-side without exposing token_hash to client UI.
-- - INSERT: company owner/manager/admin for their company only.
-- - UPDATE: revoke/expire/accept through reviewed server/admin flows.
-- - DELETE: avoid hard delete; use invite_status/archived_at.
--
-- public.company_join_requests
-- - SELECT: requesting user, target company owners/managers, and admins.
-- - INSERT: authenticated technician can request to join a company, with rate
--   limiting and duplicate-pending prevention.
-- - UPDATE: requester can cancel pending request; company owner/admin can approve
--   or reject; membership creation must happen in a transactional server flow.
-- - DELETE: avoid hard delete; use request_status/archived_at.
--
-- Onboarding flow TODOs:
-- - Public signup may only set safe role intent; company_owner/admin roles require
--   manual/admin review and audit logging.
-- - Accepted invites and approved join requests should update company_members,
--   technician_profiles.company_id, technician_profiles.affiliation_type,
--   profiles.company_id, and onboarding_status in a transaction.
-- - Company owner onboarding should create companies, owner company_members row,
--   profiles.company_id, and onboarding status updates in one audited server flow.
-- - Token validation, invite acceptance, owner approval, and verification status
--   changes should be server-side only and rate-limited.
-- - Add audit_logs before production role/status/company assignment workflows.
-- - Add tests for cross-company reads, pending/suspended member access, invite
--   reuse, expired token handling, and profile self-escalation attempts.
