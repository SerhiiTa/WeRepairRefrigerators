-- WeRepairRefrigerators Task 69 apply-ready staging migration.
--
-- APPLY-READY SCOPE:
-- - Intended for a disposable development or staging Supabase project after onboarding and audit tables exist.
-- - Creates reusable read-only RLS predicate helpers for profile role, admin checks, company membership, company management, technician profile access, and public technician visibility.
-- - Helpers do not perform writes and do not replace server-side validation, audit logging, or business workflow checks.
--
-- Dependency expectations:
-- - public.profiles, public.app_role, and public.profile_status from 0001.
-- - public.companies, public.company_members, and public.technician_profiles
--   from 0003.
-- - public.audit_logs from 0008 may use these helpers later, but this migration
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
  'Task 65 apply-ready staging helper. Thin wrapper around auth.uid() for RLS predicate readability.';

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
  'Task 65 apply-ready staging helper. Returns active current profile role or public_visitor. Review SECURITY DEFINER ownership/search_path before applying.';

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
  'Task 65 apply-ready staging helper. True only for active admin profiles. Admin mutations still require server checks and audit logging.';

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
  'Task 65 apply-ready staging helper. Checks active owner membership for a target company. Does not grant platform admin and must be paired with table-specific policies.';

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
  'Task 65 apply-ready staging helper. Checks active membership for a target company and excludes inactive, removed, suspended, archived, and inactive-profile users.';

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
  'Task 65 apply-ready staging helper. Returns active company memberships for current user; avoids relying on profiles.company_id shortcut.';

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
  'Task 65 apply-ready staging helper. Company management predicate for active owner or active admin. Status/archive transitions still require server-side validation and audit logging.';

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
  'Task 65 apply-ready staging helper. Company view predicate for active members or active admins. Public company pages should use sanitized projections, not raw companies.';

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
  'Task 65 apply-ready staging helper. Company membership management predicate for active owners/managers or active admins. Owner transfer and last-owner removal still need server transaction checks.';

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
  'Task 65 apply-ready staging helper. Raw/private technician profile view predicate for owner, active company scope, or admin. Public pages must use sanitized projections.';

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
  'Task 65 apply-ready staging helper. Safe-field technician profile management predicate. Verification, marketplace, public profile, affiliation, suspension, and archive fields remain server/admin controlled.';

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
  'Task 65 apply-ready staging helper. Visibility predicate for sanitized public technician projections only. It does not sanitize raw technician profile fields.';

-- ---------------------------------------------------------------------------
-- Execute grants:
-- Helpers are used by table policies in 0010. They return scalar booleans or ids only.
-- Anonymous users should not need direct helper execution. Authenticated execution is granted so RLS policies can evaluate consistently.

revoke all on function public.auth_user_id() from public;
revoke all on function public.current_profile_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_company_owner(uuid) from public;
revoke all on function public.is_active_company_member(uuid) from public;
revoke all on function public.current_company_ids() from public;
revoke all on function public.can_manage_company(uuid) from public;
revoke all on function public.can_view_company(uuid) from public;
revoke all on function public.can_manage_company_members(uuid) from public;
revoke all on function public.can_view_technician_profile(uuid) from public;
revoke all on function public.can_manage_technician_profile(uuid) from public;
revoke all on function public.can_view_public_technician_profile(uuid) from public;

grant execute on function public.auth_user_id() to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_company_owner(uuid) to authenticated;
grant execute on function public.is_active_company_member(uuid) to authenticated;
grant execute on function public.current_company_ids() to authenticated;
grant execute on function public.can_manage_company(uuid) to authenticated;
grant execute on function public.can_view_company(uuid) to authenticated;
grant execute on function public.can_manage_company_members(uuid) to authenticated;
grant execute on function public.can_view_technician_profile(uuid) to authenticated;
grant execute on function public.can_manage_technician_profile(uuid) to authenticated;
grant execute on function public.can_view_public_technician_profile(uuid) to authenticated;
