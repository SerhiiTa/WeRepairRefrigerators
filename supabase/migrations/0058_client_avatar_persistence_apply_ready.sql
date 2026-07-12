-- Task 165.13: Client avatar persistence foundation.
--
-- Scope:
-- - Add nullable avatar storage paths for linked permanent customers.
-- - Add nullable job-specific client avatar storage paths for unlinked jobs.
-- - Create a private client-avatar bucket used only through server-side WRA APIs.
--
-- Safety:
-- - Forward-only.
-- - No destructive changes.
-- - No public storage access.
-- - No broad customer or service_request update grants.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'client-avatars',
  'client-avatars',
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

alter table public.customers
  add column if not exists avatar_storage_path text,
  add column if not exists avatar_updated_at timestamptz;

alter table public.service_requests
  add column if not exists job_client_avatar_storage_path text,
  add column if not exists job_client_avatar_updated_at timestamptz;

comment on column public.customers.avatar_storage_path is
  'Private Storage path in client-avatars for the permanent client avatar. Served through dashboard-authenticated WRA APIs.';
comment on column public.service_requests.job_client_avatar_storage_path is
  'Private Storage path in client-avatars for job-specific client avatar when no permanent customer is linked.';

create index if not exists customers_avatar_storage_path_idx
  on public.customers(avatar_storage_path)
  where avatar_storage_path is not null;

create index if not exists service_requests_job_client_avatar_storage_path_idx
  on public.service_requests(job_client_avatar_storage_path)
  where job_client_avatar_storage_path is not null;

-- Storage access remains private. The application uploads/removes/serves signed
-- URLs server-side after verifying dashboard access to the job/customer.
