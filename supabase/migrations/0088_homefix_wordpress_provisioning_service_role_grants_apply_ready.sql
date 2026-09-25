-- COM-07D.7: temporary HomeFix WordPress provisioning service_role grants.
--
-- APPLY-READY.
-- Purpose:
--   Allow the temporary fixed-purpose HomeFix WordPress provisioning endpoint
--   to create/update the intended inbound source and create one server-to-server
--   credential using the existing WRA service-role pattern.
--
-- Safety:
--   - Does not grant anon or authenticated access.
--   - Does not change RLS or policies.
--   - Does not create sources, credentials, secrets, or provider records.
--   - Grants only the table privileges required by the temporary endpoint's
--     PostgREST upsert(...).select(...) and insert(...).select(...) calls.

grant insert, update on table public.inbound_sources to service_role;

grant insert on table public.inbound_source_credentials to service_role;
