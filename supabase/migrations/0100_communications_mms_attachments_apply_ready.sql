-- COMM-08D: MMS image attachments for Communications.
--
-- Forward-only.
-- - Adds private Supabase Storage for Communications media.
-- - Adds provider-neutral message attachment metadata.
-- - Preserves existing Communications RLS and service-role server ingestion.

create extension if not exists pgcrypto with schema extensions;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'communications-media',
  'communications-media',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.communication_message_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  communication_message_id uuid not null references public.communication_messages(id) on delete cascade,
  attachment_type text not null default 'image'
    check (attachment_type in ('image')),
  media_type text not null default 'mms'
    check (media_type in ('mms')),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  storage_bucket text not null default 'communications-media',
  storage_path text not null unique,
  original_provider_url text,
  original_filename text,
  size_bytes integer
    check (size_bytes is null or (size_bytes > 0 and size_bytes <= 5242880)),
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint communication_message_attachments_bucket_check
    check (storage_bucket = 'communications-media'),
  constraint communication_message_attachments_storage_path_check
    check (
      storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/messages/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    ),
  constraint communication_message_attachments_original_filename_length_check
    check (original_filename is null or char_length(original_filename) <= 180)
);

comment on table public.communication_message_attachments is
  'Private image attachment metadata for customer-facing Communications messages. Binary media lives in private Supabase Storage.';
comment on column public.communication_message_attachments.storage_path is
  'Private object path inside the communications-media bucket. Do not expose publicly.';
comment on column public.communication_message_attachments.original_provider_url is
  'Original provider media URL, stored for traceability only. Dashboard rendering must use private storage signed URLs.';

create index if not exists communication_message_attachments_message_created_idx
  on public.communication_message_attachments(communication_message_id, created_at asc);

create index if not exists communication_message_attachments_company_created_idx
  on public.communication_message_attachments(company_id, created_at desc);

alter table public.communication_message_attachments enable row level security;

revoke all on public.communication_message_attachments from public;
revoke all on public.communication_message_attachments from anon;
grant select on public.communication_message_attachments to authenticated;
grant select, insert on public.communication_message_attachments to service_role;

drop policy if exists "communication_message_attachments_dashboard_select"
  on public.communication_message_attachments;
create policy "communication_message_attachments_dashboard_select"
on public.communication_message_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.communication_messages message
    where message.id = communication_message_attachments.communication_message_id
      and public.can_access_communication_conversation(message.conversation_id)
  )
);

drop policy if exists "communication_media_dashboard_read_objects" on storage.objects;
create policy "communication_media_dashboard_read_objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'communications-media'
  and exists (
    select 1
    from public.communication_message_attachments attachment
    join public.communication_messages message
      on message.id = attachment.communication_message_id
    where attachment.storage_bucket = bucket_id
      and attachment.storage_path = name
      and public.can_access_communication_conversation(message.conversation_id)
  )
);
