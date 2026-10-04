-- COMM-09B.4.11: publish call history and transcript changes to the
-- Communications live detail view.
--
-- This only adds existing tables to the Supabase Realtime publication when
-- they are not already present. RLS, policies, and grants are unchanged.

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'communication_calls'
  ) then
    alter publication supabase_realtime
      add table public.communication_calls;
  end if;

  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'communication_transcripts'
  ) then
    alter publication supabase_realtime
      add table public.communication_transcripts;
  end if;
end;
$$;
