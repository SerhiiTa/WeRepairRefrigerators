-- Task 92: Dashboard read access for service_requests.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Let authenticated dashboard users read only service requests they are
--   allowed to see while preserving the Task 91 public insert/no-public-read
--   posture.
--
-- Current safe matching model:
--   - admins can read all service_requests.
--   - technicians / verified technicians / expert technicians / company owners
--     can read service_requests where selected_technician_slug matches the
--     sanitized public slug generated from their own public-ready technician
--     profile.
--   - unselected/generic requests are admin-only until company/team assignment
--     tables are wired to service_requests in a later task.
--
-- This migration does not grant anonymous SELECT and does not change the
-- existing public insert policy.

create or replace function public.public_technician_profile_slug_for_profile(target_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select (
    trim(
      both '-' from lower(
        regexp_replace(
          coalesce(nullif(tp.business_name, ''), nullif(tp.display_name, ''), 'houston-refrigeration-technician'),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        )
      )
    )
    || '-'
    || substring(md5(tp.id::text) from 1 for 8)
  )
  from public.technician_profiles tp
  join public.profiles p on p.id = tp.profile_id
  where tp.profile_id = target_profile_id
    and tp.public_profile_ready = true
    and tp.marketplace_enabled = true
    and tp.technician_status = 'verified'
    and tp.archived_at is null
    and tp.rejected_at is null
    and tp.suspended_at is null
    and p.status in ('active', 'verified')
  order by tp.created_at desc
  limit 1;
$$;

comment on function public.public_technician_profile_slug_for_profile(uuid) is
  'Task 92 helper. Returns the sanitized public technician slug for a profile when the technician profile is verified/public-ready. Used for service_requests RLS matching.';

revoke all on function public.public_technician_profile_slug_for_profile(uuid) from public;
grant execute on function public.public_technician_profile_slug_for_profile(uuid) to authenticated;

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
  'Task 92 helper. Admins can view all service requests; eligible dashboard roles can view requests selected for their own public technician slug.';

revoke all on function public.can_view_service_request(uuid) from public;
grant execute on function public.can_view_service_request(uuid) to authenticated;

alter table public.service_requests enable row level security;

grant select on public.service_requests to authenticated;
revoke select on public.service_requests from anon;

drop policy if exists "service_requests_dashboard_select" on public.service_requests;
create policy "service_requests_dashboard_select"
on public.service_requests
for select
to authenticated
using (public.can_view_service_request(id));

-- Status updates remain intentionally deferred. Without column-level RLS,
-- a broad UPDATE policy could allow unsafe contact/detail edits.
