-- WeRepairRefrigerators Task 45 draft migration.
--
-- REVIEW BEFORE APPLYING:
-- - This file is a planning draft and has not been applied to any Supabase project.
-- - Review role defaults, RLS policies, grants, trigger ownership, and auth metadata
--   handling before running this against a real database.
-- - This migration intentionally does not protect Next.js routes or wire frontend
--   mock flows to the database.
-- - Do not expose this raw profiles table publicly. Public profile data should use a
--   separate sanitized projection/table later.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'public_visitor',
      'customer',
      'technician',
      'verified_technician',
      'expert_technician',
      'company_owner',
      'admin'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type public.profile_status as enum (
      'pending',
      'active',
      'verified',
      'rejected',
      'suspended'
    );
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'customer',
  status public.profile_status not null default 'active',
  role_intent text check (role_intent is null or role_intent in ('customer', 'technician')),
  company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Draft auth-linked private profile table. Not public-safe. Review before applying.';
comment on column public.profiles.role_intent is
  'Optional signup intent copied from auth metadata when value is customer or technician. Not authoritative for permissions.';
comment on column public.profiles.company_id is
  'Nullable placeholder for future company/team scoping. Add FK after companies table exists.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'public_visitor'::public.app_role
  );
$$;

comment on function public.current_app_role() is
  'Draft helper for RLS policies. Review SECURITY DEFINER ownership/search_path before applying.';

create or replace function public.prevent_unsafe_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() = 'admin' then
    return new;
  end if;

  if old.id <> new.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if old.role is distinct from new.role then
    raise exception 'Profile role changes require admin review';
  end if;

  if old.status is distinct from new.status then
    raise exception 'Profile status changes require admin review';
  end if;

  if old.company_id is distinct from new.company_id then
    raise exception 'Company assignment changes require admin review';
  end if;

  if old.role_intent is distinct from new.role_intent then
    raise exception 'Role intent changes require admin review';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_unsafe_profile_updates on public.profiles;
create trigger prevent_unsafe_profile_updates
before update on public.profiles
for each row
execute function public.prevent_unsafe_profile_updates();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role_intent text;
  safe_role public.app_role;
  safe_status public.profile_status;
begin
  requested_role_intent := case
    when new.raw_user_meta_data ->> 'role_intent' in ('customer', 'technician')
      then new.raw_user_meta_data ->> 'role_intent'
    else null
  end;

  safe_role := case requested_role_intent
    when 'technician' then 'technician'::public.app_role
    else 'customer'::public.app_role
  end;

  safe_status := case requested_role_intent
    when 'technician' then 'pending'::public.profile_status
    else 'active'::public.profile_status
  end;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    status,
    role_intent
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    safe_role,
    safe_status,
    requested_role_intent
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user_profile() is
  'Draft auth.users insert trigger. Role intent is advisory only until reviewed profiles/RLS flow exists.';

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;

-- Baseline grants for authenticated users. RLS policies and triggers below are
-- still required; public/anon access is intentionally not granted.
revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;

drop policy if exists "Users can select own profile" on public.profiles;
create policy "Users can select own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "Users can update limited own profile fields" on public.profiles;
create policy "Users can update limited own profile fields"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Admins can select all profiles" on public.profiles;
create policy "Admins can select all profiles"
on public.profiles
for select
to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- Direct profile inserts are intentionally not granted to anon/authenticated.
-- The auth.users trigger creates profile rows. Future server-side admin tools may
-- add controlled insert/update paths with audit logging.
