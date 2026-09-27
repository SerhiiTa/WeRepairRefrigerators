-- COMM-08B: Telnyx SMS transport service-role grants.
--
-- Purpose:
-- - Allow server-side SMS transport and Telnyx delivery callbacks to update
--   delivery state on existing communication_messages rows.
--
-- Safety:
-- - No anon/authenticated grants.
-- - No RLS changes.
-- - No source-account data creation.
-- - No Telnyx account configuration.

grant update (
  delivery_status,
  provider_message_id,
  sent_at,
  delivered_at,
  failed_at,
  failure_reason
) on public.communication_messages to service_role;
