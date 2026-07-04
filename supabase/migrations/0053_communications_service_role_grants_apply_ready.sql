-- Task 152.5: Communications Hub service-role grants for phone ingestion.
--
-- APPLY-READY.
-- Purpose:
--   Production Retell call_analyzed payloads reached WRA successfully, but the
--   server-side phone ingestion workflow failed on the first source lookup with:
--
--     code: 42501
--     message: permission denied for table communication_source_accounts
--
--   The route uses the server-side Supabase service-role client, but the new
--   Communications Hub tables created in 0051/0052 did not explicitly grant the
--   PostgreSQL service_role role the table privileges used by ingestion.
--
-- Safety model:
--   - This does not disable RLS.
--   - This does not modify anon/authenticated policies.
--   - This does not modify authentication, Auth settings, or environment keys.
--   - This does not create phone calls, SMS, emails, jobs, or appointments.
--   - This grants only the table operations used by the server-side phone
--     ingestion workflow.

grant select on table public.communication_source_accounts
  to service_role;

grant select, insert, update on table public.communication_conversations
  to service_role;

grant select, insert on table public.communication_transcripts
  to service_role;

grant select, insert on table public.communication_messages
  to service_role;

grant select, insert on table public.communication_timeline_events
  to service_role;

grant insert on table public.intake_requests
  to service_role;

grant select on table public.customers
  to service_role;

comment on table public.communication_source_accounts is
  'Task 152 source ownership map for provider-originated communications. Task 152.5 grants server-side service_role SELECT for phone ingestion source matching.';
