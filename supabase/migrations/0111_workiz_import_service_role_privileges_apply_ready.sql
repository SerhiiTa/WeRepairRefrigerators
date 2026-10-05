-- WORKIZ-IMPORT-03B.2
-- Minimal service_role privileges for the trusted owner-run Workiz pilot importer.
--
-- This migration does not change RLS policies and does not grant anything to
-- anon or authenticated. It only authorizes server-side service_role import
-- operations for the tables the guarded Client #1361 importer reads/writes.

grant select, insert, update on table public.customers to service_role;

grant select, insert on table public.customer_addresses to service_role;
grant select, insert on table public.service_requests to service_role;
grant select, insert on table public.appointments to service_role;
grant select, insert on table public.service_request_estimates to service_role;
grant select, insert on table public.service_request_invoices to service_role;
grant select, insert on table public.service_request_payments to service_role;
grant select, insert on table public.service_request_financial_snapshots to service_role;
