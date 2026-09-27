-- COMM-08C: enable Supabase Realtime for the Communications live inbox.
-- This only adds the existing Communications tables to the Supabase Realtime
-- publication when they are not already present.

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
      and tablename = 'communication_conversations'
  ) then
    alter publication supabase_realtime
      add table public.communication_conversations;
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
      and tablename = 'communication_messages'
  ) then
    alter publication supabase_realtime
      add table public.communication_messages;
  end if;
end;
$$;
