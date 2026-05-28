-- WeRepairRefrigerators Task 65 draft migration.
--
-- REVIEW-ONLY DRAFT:
-- - Do not apply this file until helper ownership, grants, RLS recursion,
--   search_path behavior, table-specific policies, and test fixtures are
--   reviewed.
-- - This migration has not been applied to any Supabase project by Codex.
-- - This migration intentionally does not create final RLS policies, wire
--   frontend flows to the database, run Supabase commands, or use service-role
--   access in frontend code.
-- - Helpers are policy predicates only. They must not be treated as complete
--   authorization, input validation, audit logging, or business workflow logic.
--
-- Dependency expectations:
-- - public.profiles, public.app_role, and public.profile_status from 0001.
-- - public.companies, public.company_members, and public.technician_profiles
--   from 0003.
-- - public.audit_logs from 0004 may use these helpers later, but this draft
--   does not create audit policies.

-- ---------------------------------------------------------------------------
-- Current user/profile helpers
-- ---------------------------------------------------------------------------

create or replace function public.auth_user_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid();
$$;

comment on function public.auth_user_id() is
  'Task 65 review-only helper. Thin wrapper around auth.uid() for RLS predicate readability.';

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role
      from public.profiles p
      where p.id = auth.uid()
        and p.status in ('active', 'verified')
      limit 1
    ),
    'public_visitor'::public.app_role
  );
$$;

comment on function public.current_profile_role() is
  'Task 65 review-only helper. Returns active current profile role or public_visitor. Review SECURITY DEFINER ownership/search_path before applying.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

comment on function public.is_admin() is
  'Task 65 review-only helper. True only for active admin profiles. Admin mutations still require server checks and audit logging.';

-- ---------------------------------------------------------------------------
-- Company membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    join public.profiles p on p.id = cm.profile_id
    where cm.company_id = target_company_id
      and cm.profile_id = auth.uid()
      and cm.member_role = 'owner'
      and cm.member_status = 'active'
      and cm.archived_at is null
      and c.status = 'active'
      and c.archived_at is null
      and p.status = 'active'
  );
$$;

comment on function public.is_company_owner(uuid) is
  'Task 65 review-only helper. Checks active owner membership for a target company. Does not grant platform admin and must be paired with table-specific policies.';

create or replace function public.is_active_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    join public.profiles p on p.id = cm.profile_id
    where cm.company_id = target_company_id
      and cm.profile_id = auth.uid()
      and cm.member_status = 'active'
      and cm.archived_at is null
      and c.status = 'active'
      and c.archived_at is null
      and p.status = 'active'
  );
$$;

comment on function public.is_active_company_member(uuid) is
  'Task 65 review-only helper. Checks active membership for a target company and excludes inactive, removed, suspended, archived, and inactive-profile users.';

create or replace function public.current_company_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(cm.company_id order by cm.company_id), '{}'::uuid[])
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  join public.profiles p on p.id = cm.profile_id
  where cm.profile_id = auth.uid()
    and cm.member_status = 'active'
    and cm.archived_at is null
    and c.status = 'active'
    and c.archived_at is null
    and p.status = 'active';
$$;

comment on function public.current_company_ids() is
  'Task 65 review-only helper. Returns active company memberships for current user; avoids relying on profiles.company_id shortcut.';

create or replace function public.can_manage_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.is_company_owner(target_company_id);
$$;

comment on function public.can_manage_company(uuid) is
  'Task 65 review-only helper. Company management predicate for active owner or active admin. Status/archive transitions still require server-side validation and audit logging.';

create or replace function public.can_view_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.is_active_company_member(target_company_id);
$$;

comment on function public.can_view_company(uuid) is
  'Task 65 review-only helper. Company view predicate for active members or active admins. Public company pages should use sanitized projections, not raw companies.';

create or replace function public.can_manage_company_members(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.company_members cm
      join public.companies c on c.id = cm.company_id
      join public.profiles p on p.id = cm.profile_id
      where cm.company_id = target_company_id
        and cm.profile_id = auth.uid()
        and cm.member_role in ('owner', 'manager')
        and cm.member_status = 'active'
        and cm.archived_at is null
        and c.status = 'active'
        and c.archived_at is null
        and p.status = 'active'
    );
$$;

comment on function public.can_manage_company_members(uuid) is
  'Task 65 review-only helper. Company membership management predicate for active owners/managers or active admins. Owner transfer and last-owner removal still need server transaction checks.';

-- ---------------------------------------------------------------------------
-- Technician profile helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_view_technician_profile(target_technician_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.technician_profiles tp
    join public.profiles owner_profile on owner_profile.id = tp.profile_id
    where tp.id = target_technician_profile_id
      and tp.archived_at is null
      and (
        public.is_admin()
        or tp.profile_id = auth.uid()
        or (
          tp.company_id is not null
          and public.can_view_company(tp.company_id)
        )
      )
      and owner_profile.status in ('pending', 'active', 'verified')
  );
$$;

comment on function public.can_view_technician_profile(uuid) is
  'Task 65 review-only helper. Raw/private technician profile view predicate for owner, active company scope, or admin. Public pages must use sanitized projections.';

create or replace function public.can_manage_technician_profile(target_technician_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.technician_profiles tp
    join public.profiles owner_profile on owner_profile.id = tp.profile_id
    where tp.id = target_technician_profile_id
      and tp.archived_at is null
      and (
        public.is_admin()
        or tp.profile_id = auth.uid()
        or (
          tp.company_id is not null
          and public.can_manage_company_members(tp.company_id)
        )
      )
      and owner_profile.status in ('pending', 'active', 'verified')
  );
$$;

comment on function public.can_manage_technician_profile(uuid) is
  'Task 65 review-only helper. Safe-field technician profile management predicate. Verification, marketplace, public profile, affiliation, suspension, and archive fields remain server/admin controlled.';

create or replace function public.can_view_public_technician_profile(target_technician_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.technician_profiles tp
    join public.profiles p on p.id = tp.profile_id
    where tp.id = target_technician_profile_id
      and tp.technician_status = 'verified'
      and tp.marketplace_enabled = true
      and tp.public_profile_ready = true
      and tp.archived_at is null
      and p.status in ('active', 'verified')
  );
$$;

comment on function public.can_view_public_technician_profile(uuid) is
  'Task 65 review-only helper. Visibility predicate for sanitized public technician projections only. It does not sanitize raw technician profile fields.';

-- ---------------------------------------------------------------------------
-- Grant/RLS TODOs
-- ---------------------------------------------------------------------------

-- This draft intentionally does not create final RLS policies.
--
-- Review before applying:
-- - SECURITY DEFINER owner must be a trusted database owner, not an app user.
-- - search_path is locked to public, but function bodies still need review for
--   recursion and unintended table access.
-- - Direct EXECUTE grants should be reviewed. In Supabase, functions may be
--   executable by authenticated users unless revoked/granted explicitly.
-- - Consider revoking execute on sensitive helpers from anon/authenticated and
--   granting only if policies/server RPCs require direct execution.
-- - Test anonymous, customer, technician, verified technician, company owner,
--   admin, suspended member, removed member, archived company, and multi-company
--   scenarios before using these helpers in production policies.
--
-- Example grant hardening, to be reviewed before use:
-- revoke all on function public.is_admin() from anon, authenticated;
-- revoke all on function public.is_company_owner(uuid) from anon, authenticated;
-- grant execute on function public.auth_user_id() to authenticated;
