-- Task 96: Service request photo uploads foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add private Supabase Storage + metadata for customer and technician photos
--   attached to service_requests.
--
-- Security model:
--   - Storage bucket is private.
--   - Anonymous users may upload customer photos only under a known
--     service_request_id path after public intake creates the request.
--   - Anonymous users cannot list/read photo metadata or storage objects.
--   - Authenticated dashboard users can read photo metadata/storage objects
--     only when public.can_view_service_request(service_request_id) allows the
--     parent request.
--   - Technician/dashboard metadata writes go through a narrow RPC that checks
--     authenticated request visibility and writes only safe photo fields.

create extension if not exists pgcrypto with schema extensions;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'service-request-photos',
  'service-request-photos',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.service_request_photos (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  uploaded_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  storage_path text not null unique,
  original_filename text,
  photo_type text not null
    check (photo_type in (
      'customer_upload',
      'technician_upload',
      'diagnostic',
      'completed_repair'
    )),
  created_at timestamptz not null default now(),

  constraint service_request_photos_storage_path_format_check
    check (
      storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(customer|technician)/'
    ),
  constraint service_request_photos_original_filename_length_check
    check (original_filename is null or char_length(original_filename) <= 180)
);

comment on table public.service_request_photos is
  'Task 96 private photo metadata for service requests. Raw customer photos are not public.';
comment on column public.service_request_photos.uploaded_by_profile_id is
  'Authenticated profile that uploaded the photo when available. Customer intake uploads are anonymous and store null.';
comment on column public.service_request_photos.storage_path is
  'Private Storage object path inside service-request-photos bucket. Do not expose publicly.';
comment on column public.service_request_photos.photo_type is
  'Lightweight operational photo type for service request timeline/gallery use.';

create index if not exists service_request_photos_request_created_at_idx
  on public.service_request_photos (service_request_id, created_at desc);
create index if not exists service_request_photos_type_created_at_idx
  on public.service_request_photos (photo_type, created_at desc);
create index if not exists service_request_photos_uploaded_by_idx
  on public.service_request_photos (uploaded_by_profile_id)
  where uploaded_by_profile_id is not null;

create or replace function public.service_request_exists_for_photo_upload(
  target_service_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.service_requests sr
    where sr.id = target_service_request_id
  );
$$;

comment on function public.service_request_exists_for_photo_upload(uuid) is
  'Task 96 helper. Lets insert/storage policies verify a parent service request UUID without granting public SELECT on service_requests.';

revoke all on function public.service_request_exists_for_photo_upload(uuid) from public;
grant execute on function public.service_request_exists_for_photo_upload(uuid) to anon, authenticated;

alter table public.service_request_photos enable row level security;

revoke all on public.service_request_photos from public;
grant select, insert on public.service_request_photos to anon, authenticated;

drop policy if exists "service_request_photos_customer_insert" on public.service_request_photos;
create policy "service_request_photos_customer_insert"
on public.service_request_photos
for insert
to anon, authenticated
with check (
  photo_type = 'customer_upload'
  and uploaded_by_profile_id is null
  and split_part(storage_path, '/', 1) = service_request_id::text
  and split_part(storage_path, '/', 2) = 'customer'
  and public.service_request_exists_for_photo_upload(service_request_id)
);

drop policy if exists "service_request_photos_dashboard_select" on public.service_request_photos;
create policy "service_request_photos_dashboard_select"
on public.service_request_photos
for select
to authenticated
using (public.can_view_service_request(service_request_id));

create or replace function public.add_service_request_photo_rpc(
  p_request_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_photo_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_photo public.service_request_photos;
  cleaned_filename text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if p_photo_type not in (
    'technician_upload',
    'diagnostic',
    'completed_repair'
  ) then
    raise exception 'Invalid service request photo type.'
      using errcode = '22023';
  end if;

  if not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  if coalesce(p_storage_path, '') !~ (
    '^' || p_request_id::text || '/technician/'
  ) then
    raise exception 'Invalid technician photo storage path.'
      using errcode = '22023';
  end if;

  cleaned_filename := nullif(left(btrim(coalesce(p_original_filename, '')), 180), '');

  insert into public.service_request_photos (
    service_request_id,
    uploaded_by_profile_id,
    storage_path,
    original_filename,
    photo_type
  )
  values (
    p_request_id,
    auth.uid(),
    p_storage_path,
    cleaned_filename,
    p_photo_type
  )
  returning * into inserted_photo;

  return jsonb_build_object(
    'id', inserted_photo.id,
    'service_request_id', inserted_photo.service_request_id,
    'uploaded_by_profile_id', inserted_photo.uploaded_by_profile_id,
    'storage_path', inserted_photo.storage_path,
    'original_filename', inserted_photo.original_filename,
    'photo_type', inserted_photo.photo_type,
    'created_at', inserted_photo.created_at
  );
end;
$$;

comment on function public.add_service_request_photo_rpc(uuid, text, text, text) is
  'Task 96 RPC. Adds authenticated dashboard photo metadata for an accessible service request.';

revoke all on function public.add_service_request_photo_rpc(uuid, text, text, text) from public;
grant execute on function public.add_service_request_photo_rpc(uuid, text, text, text) to authenticated;

drop policy if exists "service_request_photos_customer_upload_objects" on storage.objects;
create policy "service_request_photos_customer_upload_objects"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'service-request-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) = 'customer'
  and case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.service_request_exists_for_photo_upload(split_part(name, '/', 1)::uuid)
    else false
  end
);

drop policy if exists "service_request_photos_dashboard_upload_objects" on storage.objects;
create policy "service_request_photos_dashboard_upload_objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-request-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) = 'technician'
  and case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_view_service_request(split_part(name, '/', 1)::uuid)
    else false
  end
);

drop policy if exists "service_request_photos_dashboard_read_objects" on storage.objects;
create policy "service_request_photos_dashboard_read_objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-request-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_view_service_request(split_part(name, '/', 1)::uuid)
    else false
  end
);

-- No public SELECT policy is added for service_request_photos or storage.objects.
-- Customers upload photos into private storage and cannot list/read raw objects.
-- Dashboard clients should use signed URLs only after RLS allows metadata reads.
