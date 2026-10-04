-- COMM-09B.4.5: allow the trusted server-side Telnyx recording reprocess path
-- to refresh an existing transcript row with structured dual-channel speaker
-- segments. The browser remains authenticated/user-scoped; only the server-side
-- service_role path receives this write capability.

grant update (
  conversation_id,
  source_type,
  transcript_text,
  speaker_segments,
  recording_reference,
  started_at,
  ended_at
) on table public.communication_transcripts to service_role;
