-- COM-06.4: Website inbound communication message idempotency.
--
-- APPLY-READY.
-- Purpose:
--   Prevent duplicate communication_messages rows when a trusted website,
--   booking widget, or lead-generator submission is retried with the same
--   stable event identity.
--
-- Safety model:
--   - Does not change Intake, Conversation, Timeline, Job, Appointment,
--     credential, or gateway behavior.
--   - Deduplication is scoped to the existing conversation and a non-null
--     external_message_id derived server-side from stable provider identity.
--   - Rows without an external_message_id remain unaffected.

create unique index if not exists communication_messages_conversation_external_message_unique_idx
  on public.communication_messages (conversation_id, external_message_id)
  where external_message_id is not null;
