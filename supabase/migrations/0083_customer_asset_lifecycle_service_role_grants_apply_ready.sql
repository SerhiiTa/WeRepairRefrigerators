-- 0083_customer_asset_lifecycle_service_role_grants_apply_ready.sql
-- Purpose:
--   Allow the authenticated dashboard Asset lifecycle API to perform its
--   server-side, post-authorization service-role operations on customer assets.
--
-- Scope:
--   - Read customer_appliances to verify asset ownership/access.
--   - Update only asset_status for archive/restore.
--   - Delete customer_appliances only for the zero-linked-job permanent delete path.
--   Existing service_role grants already cover service_requests SELECT and
--   customer_appliance_photos access used by the current lifecycle route.

grant select on table public.customer_appliances to service_role;

grant update (asset_status) on table public.customer_appliances to service_role;

grant delete on table public.customer_appliances to service_role;
