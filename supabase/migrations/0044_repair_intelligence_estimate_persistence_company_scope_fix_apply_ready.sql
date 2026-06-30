-- Task 148.14: Repair Intelligence estimate persistence company-scope fix.
--
-- DEV/STAGING APPLY-READY.
--
-- Purpose:
--   Repair Intelligence estimate persistence currently depends on the Task 148
--   professional estimate RPCs, which expect service_requests.company_id and
--   public.user_can_access_company(...). Some dev/staging databases have the
--   Task 148 code/RPCs without the durable service request company scope column,
--   causing estimate creation to fail at runtime.
--
-- Scope:
--   - Adds service_requests.company_id if missing.
--   - Adds a conservative company access helper if missing/replaces it safely.
--   - Extends service request dashboard read access so active company members
--     can see company-owned service requests while preserving the existing
--     selected-technician-slug access path.
--   - Keeps anonymous users blocked from private CRM data.
--   - Does not create estimates, appointments, sends, invoices, providers,
--     inventory, vendor search, payments, or Task 149 behavior.

alter table public.service_requests
  add column if not exists company_id uuid
    references public.companies(id)
    on delete set null;

comment on column public.service_requests.company_id is
  'Company owner scope for CRM/estimate/invoice/appointment workflows. Added by Task 148.14 forward fix for professional estimate persistence.';

create index if not exists service_requests_company_created_at_idx
  on public.service_requests (company_id, created_at desc)
  where company_id is not null;

create or replace function public.user_can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_company_id is not null
    and (
      public.is_admin()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.company_id = target_company_id
          and p.status in ('active', 'verified')
          and p.role in (
            'technician',
            'verified_technician',
            'expert_technician',
            'company_owner',
            'admin'
          )
      )
      or exists (
        select 1
        from public.company_members cm
        join public.profiles p on p.id = cm.profile_id
        where cm.company_id = target_company_id
          and cm.profile_id = auth.uid()
          and cm.member_status = 'active'
          and cm.archived_at is null
          and p.status in ('active', 'verified')
          and p.role in (
            'technician',
            'verified_technician',
            'expert_technician',
            'company_owner',
            'admin'
          )
      )
    );
$$;

comment on function public.user_can_access_company(uuid) is
  'Task 148.14 helper. Returns true when the authenticated dashboard user can access the target company through active profile/company membership. Used by estimate learning and professional estimate RPCs.';

revoke all on function public.user_can_access_company(uuid) from public;
grant execute on function public.user_can_access_company(uuid) to authenticated;

create or replace function public.can_view_service_request(target_service_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.service_requests sr
    where sr.id = target_service_request_id
      and (
        public.is_admin()
        or (
          sr.company_id is not null
          and public.user_can_access_company(sr.company_id)
        )
        or (
          public.current_profile_role() in (
            'technician',
            'verified_technician',
            'expert_technician',
            'company_owner'
          )
          and sr.selected_technician_slug is not null
          and sr.selected_technician_slug = public.public_technician_profile_slug_for_profile(auth.uid())
        )
      )
  );
$$;

comment on function public.can_view_service_request(uuid) is
  'Task 148.14 update. Admins can view all service requests; active company users can view company-owned requests; eligible dashboard roles can also view requests selected for their own public technician slug.';

revoke all on function public.can_view_service_request(uuid) from public;
grant execute on function public.can_view_service_request(uuid) to authenticated;

-- Optional dev/staging backfill for service requests selected for company
-- technician profiles. Independent technician rows with null company_id remain
-- intentionally unassigned until a fixture or reviewed company workflow sets
-- the owning company.
update public.service_requests sr
set company_id = tp.company_id,
    updated_at = now()
from public.technician_profiles tp
where sr.company_id is null
  and tp.company_id is not null
  and sr.selected_technician_slug = public.public_technician_profile_slug_for_profile(tp.profile_id);
