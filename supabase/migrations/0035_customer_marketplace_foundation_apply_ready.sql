-- 0035_customer_marketplace_foundation_apply_ready.sql
-- Task 145: Customer marketplace + customer account foundation.
-- Apply manually in Supabase SQL Editor after review.
-- This migration does not weaken technician dashboard RLS and does not use service_role.

create extension if not exists pgcrypto;

do $$ begin
  create type public.customer_status as enum ('active', 'inactive', 'blocked');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.customer_contact_method as enum ('phone', 'email', 'sms');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  full_name text not null default '',
  phone text,
  email text,
  preferred_contact_method public.customer_contact_method not null default 'phone',
  customer_status public.customer_status not null default 'active',
  notes text
);

create unique index if not exists customers_phone_unique_not_null
  on public.customers (lower(phone))
  where phone is not null and length(trim(phone)) > 0;

create unique index if not exists customers_email_unique_not_null
  on public.customers (lower(email))
  where email is not null and length(trim(email)) > 0;

create index if not exists customers_auth_user_id_idx on public.customers(auth_user_id);
create index if not exists customers_status_idx on public.customers(customer_status);

create table if not exists public.customer_appliances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  appliance_type text not null,
  brand text,
  model_number text,
  serial_number text,
  purchase_year integer,
  location_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_appliances_customer_id_idx
  on public.customer_appliances(customer_id);

alter table public.service_requests
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists customer_appliance_id uuid references public.customer_appliances(id) on delete set null;

create index if not exists service_requests_customer_id_idx
  on public.service_requests(customer_id);

create index if not exists service_requests_customer_appliance_id_idx
  on public.service_requests(customer_appliance_id);

create or replace function public.set_customer_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_customer_updated_at();

drop trigger if exists customer_appliances_set_updated_at on public.customer_appliances;
create trigger customer_appliances_set_updated_at
before update on public.customer_appliances
for each row execute function public.set_customer_updated_at();

create or replace function public.find_or_create_customer_for_request_rpc(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_phone text := nullif(trim(p_phone), '');
  v_email text := nullif(lower(trim(p_email)), '');
  v_first_name text := coalesce(nullif(trim(p_first_name), ''), 'Customer');
  v_last_name text := coalesce(nullif(trim(p_last_name), ''), '');
  v_full_name text := trim(v_first_name || ' ' || v_last_name);
begin
  if v_phone is not null then
    select id into v_customer_id
    from public.customers
    where lower(phone) = lower(v_phone)
    limit 1;
  end if;

  if v_customer_id is null and v_email is not null then
    select id into v_customer_id
    from public.customers
    where lower(email) = v_email
    limit 1;
  end if;

  if v_customer_id is not null then
    update public.customers
    set
      first_name = case when first_name = '' then v_first_name else first_name end,
      last_name = case when last_name = '' then v_last_name else last_name end,
      full_name = case when full_name = '' then v_full_name else full_name end,
      phone = coalesce(phone, v_phone),
      email = coalesce(email, v_email)
    where id = v_customer_id;

    return v_customer_id;
  end if;

  insert into public.customers (
    first_name,
    last_name,
    full_name,
    phone,
    email,
    preferred_contact_method,
    customer_status
  )
  values (
    v_first_name,
    v_last_name,
    v_full_name,
    v_phone,
    v_email,
    case when v_email is not null and v_phone is null then 'email'::public.customer_contact_method else 'phone'::public.customer_contact_method end,
    'active'
  )
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

create or replace function public.create_service_request_with_customer_rpc(
  p_customer_first_name text,
  p_customer_last_name text,
  p_customer_phone text,
  p_customer_email text,
  p_appliance_type text,
  p_appliance_brand text,
  p_appliance_model text,
  p_issue_description text,
  p_zip_code text,
  p_city text,
  p_state text,
  p_preferred_time_window text,
  p_selected_technician_slug text,
  p_selected_technician_business_name text,
  p_request_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_request_id uuid := gen_random_uuid();
begin
  v_customer_id := public.find_or_create_customer_for_request_rpc(
    p_customer_first_name,
    p_customer_last_name,
    p_customer_phone,
    p_customer_email
  );

  insert into public.service_requests (
    id,
    customer_id,
    customer_name,
    customer_phone,
    customer_email,
    appliance_type,
    appliance_brand,
    appliance_model,
    issue_description,
    zip_code,
    city,
    state,
    preferred_time_window,
    selected_technician_slug,
    selected_technician_business_name,
    request_source,
    status
  )
  values (
    v_request_id,
    v_customer_id,
    trim(coalesce(p_customer_first_name, '') || ' ' || coalesce(p_customer_last_name, '')),
    nullif(trim(p_customer_phone), ''),
    nullif(lower(trim(p_customer_email)), ''),
    trim(p_appliance_type),
    nullif(trim(p_appliance_brand), ''),
    nullif(trim(p_appliance_model), ''),
    trim(p_issue_description),
    trim(p_zip_code),
    nullif(trim(p_city), ''),
    coalesce(nullif(trim(p_state), ''), 'TX'),
    nullif(trim(p_preferred_time_window), ''),
    nullif(trim(p_selected_technician_slug), ''),
    nullif(trim(p_selected_technician_business_name), ''),
    coalesce(nullif(trim(p_request_source), ''), 'customer_marketplace'),
    'new'
  );

  return jsonb_build_object(
    'ok', true,
    'customer_id', v_customer_id,
    'service_request_id', v_request_id
  );
end;
$$;

create or replace function public.link_current_customer_account_rpc(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_existing_auth_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  v_customer_id := public.find_or_create_customer_for_request_rpc(
    p_first_name,
    p_last_name,
    p_phone,
    p_email
  );

  select auth_user_id
  into v_existing_auth_user_id
  from public.customers
  where id = v_customer_id
  for update;

  if v_existing_auth_user_id is not null and v_existing_auth_user_id <> auth.uid() then
    raise exception 'Customer record is already linked to another account.'
      using errcode = '42501';
  end if;

  update public.customers
  set
    auth_user_id = auth.uid(),
    email = coalesce(nullif(lower(trim(p_email)), ''), email),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    first_name = case when first_name = '' then coalesce(nullif(trim(p_first_name), ''), 'Customer') else first_name end,
    last_name = case when last_name = '' then coalesce(nullif(trim(p_last_name), ''), '') else last_name end,
    full_name = case
      when full_name = '' then trim(coalesce(nullif(trim(p_first_name), ''), 'Customer') || ' ' || coalesce(nullif(trim(p_last_name), ''), ''))
      else full_name
    end
  where id = v_customer_id;

  return jsonb_build_object(
    'ok', true,
    'customer_id', v_customer_id
  );
end;
$$;

create or replace function public.can_view_customer(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and c.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.service_requests sr
    where sr.customer_id = target_customer_id
      and public.can_view_service_request(sr.id)
  );
$$;

create or replace function public.can_view_customer_appliance(target_customer_appliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_appliances ca
    where ca.id = target_customer_appliance_id
      and public.can_view_customer(ca.customer_id)
  );
$$;

alter table public.customers enable row level security;
alter table public.customer_appliances enable row level security;

drop policy if exists "customers self read" on public.customers;
create policy "customers self read"
on public.customers
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "customers dashboard read by visible jobs" on public.customers;
create policy "customers dashboard read by visible jobs"
on public.customers
for select
to authenticated
using (public.can_view_customer(id));

drop policy if exists "customers self update limited" on public.customers;
create policy "customers self update limited"
on public.customers
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists "customer appliances self read" on public.customer_appliances;
create policy "customer appliances self read"
on public.customer_appliances
for select
to authenticated
using (
  public.can_view_customer(customer_id)
);

drop policy if exists "customer appliances self insert" on public.customer_appliances;
create policy "customer appliances self insert"
on public.customer_appliances
for insert
to authenticated
with check (
  exists (
    select 1
    from public.customers c
    where c.id = customer_appliances.customer_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "customer appliances self update" on public.customer_appliances;
create policy "customer appliances self update"
on public.customer_appliances
for update
to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = customer_appliances.customer_id
      and c.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.customers c
    where c.id = customer_appliances.customer_id
      and c.auth_user_id = auth.uid()
  )
);

grant usage on schema public to anon, authenticated;
grant select, update on public.customers to authenticated;
grant select, insert, update on public.customer_appliances to authenticated;

revoke execute on function public.find_or_create_customer_for_request_rpc(text, text, text, text) from public;
grant execute on function public.find_or_create_customer_for_request_rpc(text, text, text, text) to anon, authenticated;

revoke execute on function public.create_service_request_with_customer_rpc(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_service_request_with_customer_rpc(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

revoke execute on function public.link_current_customer_account_rpc(text, text, text, text) from public;
grant execute on function public.link_current_customer_account_rpc(text, text, text, text) to authenticated;

revoke execute on function public.can_view_customer(uuid) from public;
grant execute on function public.can_view_customer(uuid) to authenticated;

revoke execute on function public.can_view_customer_appliance(uuid) from public;
grant execute on function public.can_view_customer_appliance(uuid) to authenticated;
