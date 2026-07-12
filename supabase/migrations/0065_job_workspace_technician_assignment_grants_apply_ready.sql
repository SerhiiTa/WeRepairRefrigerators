-- Task 165.26: Service-role grants for mobile Job Workspace technician assignment.
--
-- Scope:
-- - The browser still uses an authenticated dashboard session.
-- - The server route verifies dashboard access, technician management access,
--   ZIP coverage, availability, and appointment overlaps before writing.
-- - service_role needs only the table privileges used by that trusted server
--   route to update the canonical primary technician and existing appointment.
--
-- This migration does not disable RLS, does not weaken anon/authenticated
-- policies, and does not grant direct browser writes.

grant select on public.service_requests to service_role;
grant update (
  appointment_id,
  assigned_technician_profile_id,
  updated_at
) on public.service_requests to service_role;

grant select on public.appointments to service_role;
grant update (
  technician_profile_id,
  updated_at
) on public.appointments to service_role;

grant select on public.technician_profiles to service_role;
grant select on public.technician_availability_rules to service_role;

-- Verification query for Supabase SQL Editor after applying.
-- It should return rows for the grants above.
select
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where grantee = 'service_role'
  and table_schema = 'public'
  and table_name in (
    'service_requests',
    'appointments',
    'technician_profiles',
    'technician_availability_rules'
  )
order by table_name, privilege_type;
