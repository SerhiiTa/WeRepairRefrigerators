-- Task 165.15: Service-role grants for Job Workspace client avatar
-- persistence and saved-base-address distance resolution.
--
-- Why this migration exists:
-- - 0058 added avatar columns and the private client-avatars bucket.
-- - 0059 added company/technician base-address columns and trusted RPCs.
-- - Runtime QA found the server-side service-role client still receives
--   PostgreSQL 42501 on service_requests reads in the avatar/client-card
--   routes because table privileges were not granted to the service_role role.
--
-- Scope:
-- - Grant only the privileges used by:
--   /api/service-requests/[id]/client-avatar
--   /api/service-requests/[id]/client-card
-- - Do not weaken anon/authenticated policies.
-- - Do not disable RLS.
-- - Do not make storage public.

grant select on public.service_requests to service_role;
grant update (
  job_client_avatar_storage_path,
  job_client_avatar_updated_at
) on public.service_requests to service_role;

grant select on public.customers to service_role;
grant update (
  avatar_storage_path,
  avatar_updated_at
) on public.customers to service_role;

grant select on public.technician_profiles to service_role;
grant select on public.company_members to service_role;
grant select on public.companies to service_role;

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
    'customers',
    'technician_profiles',
    'company_members',
    'companies'
  )
order by table_name, privilege_type;
