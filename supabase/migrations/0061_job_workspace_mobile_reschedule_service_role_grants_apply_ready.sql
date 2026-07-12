-- Task 165.16: Minimal service-role grants for mobile Job Workspace
-- appointment rescheduling.
--
-- Why this migration exists:
-- - The existing appointment booking flow uses
--   book_service_request_appointment_rpc for first-time appointment creation.
-- - Task 165.16 adds a narrow server-side PATCH path for rescheduling the
--   already-linked active appointment from the mobile Job Workspace.
-- - The server route must verify the linked appointment, availability rules,
--   and overlapping appointments, then update the existing appointment row and
--   mirror the scheduled fields back to service_requests.
--
-- Scope:
-- - Grant only the service_role table privileges used by:
--   PATCH /api/service-requests/[id]/appointments
-- - Do not weaken anon/authenticated policies.
-- - Do not disable RLS.
-- - Do not grant browser users direct appointment writes.

grant select on public.service_requests to service_role;
grant update (
  appointment_id,
  assigned_technician_profile_id,
  scheduled_date,
  scheduled_window_start_time,
  scheduled_window_end_time,
  updated_at
) on public.service_requests to service_role;

grant select on public.appointments to service_role;
grant update (
  appointment_date,
  window_start_time,
  window_end_time
) on public.appointments to service_role;

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
    'technician_availability_rules'
  )
order by table_name, privilege_type;
