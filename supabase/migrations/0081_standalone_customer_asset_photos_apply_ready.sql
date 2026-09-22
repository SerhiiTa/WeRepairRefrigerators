-- Task: Standalone Customer Asset photo-assisted creation.
--
-- Forward-only, apply-ready.
-- Purpose:
--   Add private photos that can belong directly to customer_appliances so the
--   Customer -> Assets -> Scan / Photo Assisted flow does not need a fake Job.

create extension if not exists pgcrypto with schema extensions;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'customer-appliance-photos',
  'customer-appliance-photos',
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

create table if not exists public.customer_appliance_photos (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  customer_appliance_id uuid references public.customer_appliances(id) on delete cascade,
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  storage_path text not null unique,
  original_filename text,
  photo_type text not null default 'asset_label'
    check (photo_type in ('asset_label', 'asset_photo')),
  processing_status text not null default 'not_started'
    check (processing_status in ('not_started', 'pending', 'processed', 'needs_review', 'no_asset', 'failed')),
  processing_result jsonb not null default '{}'::jsonb,
  processing_error text,
  is_cover boolean not null default true,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_appliance_photos_storage_path_format_check
    check (
      storage_path ~ '^customers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/assets/'
    ),
  constraint customer_appliance_photos_original_filename_length_check
    check (original_filename is null or char_length(original_filename) <= 180)
);

comment on table public.customer_appliance_photos is
  'Private photo metadata for customer-owned Assets that are not necessarily attached to a service_request.';

create index if not exists customer_appliance_photos_customer_created_idx
  on public.customer_appliance_photos(customer_id, created_at desc);

create index if not exists customer_appliance_photos_asset_cover_idx
  on public.customer_appliance_photos(customer_appliance_id, is_cover, created_at desc)
  where customer_appliance_id is not null;

alter table public.customer_appliance_photos enable row level security;

revoke all on public.customer_appliance_photos from public;
grant select on public.customer_appliance_photos to authenticated;
grant all on public.customer_appliance_photos to service_role;

drop policy if exists "customer_appliance_photos_dashboard_select" on public.customer_appliance_photos;
create policy "customer_appliance_photos_dashboard_select"
on public.customer_appliance_photos
for select
to authenticated
using (public.can_view_customer(customer_id));

drop policy if exists "customer_appliance_photos_dashboard_read_objects" on storage.objects;
create policy "customer_appliance_photos_dashboard_read_objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-appliance-photos'
  and split_part(name, '/', 1) = 'customers'
  and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and case
    when split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_view_customer(split_part(name, '/', 2)::uuid)
    else false
  end
);

create or replace function public.upsert_customer_appliance_rpc(
  p_customer_id uuid,
  p_appliance_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appliance_id_value uuid;
  appliance_type_value text := public.clean_customer_crm_text(p_payload->>'appliance_type');
  brand_value text := public.clean_customer_crm_text(p_payload->>'brand');
  company_id_value uuid;
  customer_address_id_value uuid := nullif(p_payload->>'customer_address_id', '')::uuid;
  cover_photo_id_value uuid := nullif(p_payload->>'cover_photo_id', '')::uuid;
  asset_photo_id_value uuid := nullif(p_payload->>'asset_photo_id', '')::uuid;
  matched_appliance_id uuid;
begin
  if not public.can_manage_customer_crm(p_customer_id) then
    raise exception 'Customer is not accessible.' using errcode = '42501';
  end if;

  if p_appliance_id is null and appliance_type_value is null then
    raise exception 'Appliance type is required.' using errcode = '22023';
  end if;

  if p_appliance_id is null and brand_value is null then
    raise exception 'Brand is required.' using errcode = '22023';
  end if;

  select c.company_id
  into company_id_value
  from public.customers c
  where c.id = p_customer_id;

  if customer_address_id_value is null then
    select ca.id
    into customer_address_id_value
    from public.customer_addresses ca
    where ca.customer_id = p_customer_id
    order by ca.is_primary desc, ca.updated_at desc
    limit 1;
  else
    perform 1
    from public.customer_addresses ca
    where ca.id = customer_address_id_value
      and ca.customer_id = p_customer_id;

    if not found then
      raise exception 'Address is not accessible.' using errcode = '42501';
    end if;
  end if;

  if cover_photo_id_value is not null then
    perform 1
    from public.service_request_photos srp
    join public.service_requests sr on sr.id = srp.service_request_id
    where srp.id = cover_photo_id_value
      and sr.customer_id = p_customer_id
      and public.can_view_service_request(sr.id);

    if not found then
      raise exception 'Cover photo is not accessible.' using errcode = '42501';
    end if;
  end if;

  if asset_photo_id_value is not null then
    perform 1
    from public.customer_appliance_photos cap
    where cap.id = asset_photo_id_value
      and cap.customer_id = p_customer_id
      and (cap.customer_appliance_id is null or cap.customer_appliance_id = p_appliance_id);

    if not found then
      raise exception 'Asset photo is not accessible.' using errcode = '42501';
    end if;
  end if;

  if p_appliance_id is not null then
    update public.customer_appliances
    set
      company_id = coalesce(company_id, company_id_value),
      customer_address_id = coalesce(customer_address_id_value, customer_address_id),
      appliance_type = coalesce(appliance_type_value, appliance_type),
      brand = brand_value,
      model_number = public.clean_customer_crm_text(p_payload->>'model_number'),
      serial_number = public.clean_customer_crm_text(p_payload->>'serial_number'),
      purchase_year = nullif(p_payload->>'purchase_year', '')::integer,
      location_label = public.clean_customer_crm_text(p_payload->>'location_label'),
      notes = public.clean_customer_crm_text(p_payload->>'notes', 1000),
      cover_photo_id = coalesce(cover_photo_id_value, cover_photo_id),
      identity_review_status = case
        when identity_source in ('ai_attachment', 'qa_attachment') then 'confirmed'
        else identity_review_status
      end
    where id = p_appliance_id
      and customer_id = p_customer_id
    returning id into appliance_id_value;

    if appliance_id_value is null then
      raise exception 'Appliance is not accessible.' using errcode = '42501';
    end if;
  else
    select ca.id
    into matched_appliance_id
    from public.customer_appliances ca
    where ca.customer_id = p_customer_id
      and (company_id_value is null or ca.company_id is null or ca.company_id = company_id_value)
      and public.normalize_asset_identity_text(ca.brand) = public.normalize_asset_identity_text(brand_value)
      and public.normalize_asset_identity_text(ca.model_number) = public.normalize_asset_identity_text(public.clean_customer_crm_text(p_payload->>'model_number'))
      and public.normalize_asset_identity_text(ca.serial_number) = public.normalize_asset_identity_text(public.clean_customer_crm_text(p_payload->>'serial_number'))
      and public.clean_customer_crm_text(p_payload->>'model_number') is not null
      and public.clean_customer_crm_text(p_payload->>'serial_number') is not null
    order by ca.updated_at desc
    limit 1;

    if matched_appliance_id is not null then
      update public.customer_appliances
      set
        company_id = coalesce(company_id, company_id_value),
        customer_address_id = coalesce(customer_address_id, customer_address_id_value),
        appliance_type = coalesce(nullif(appliance_type, ''), appliance_type_value),
        brand = coalesce(brand, brand_value),
        cover_photo_id = coalesce(cover_photo_id, cover_photo_id_value),
        identity_review_status = case
          when identity_review_status = 'needs_review' then 'confirmed'
          else identity_review_status
        end
      where id = matched_appliance_id
      returning id into appliance_id_value;
    else
      insert into public.customer_appliances (
        customer_id,
        company_id,
        customer_address_id,
        appliance_type,
        brand,
        model_number,
        serial_number,
        purchase_year,
        location_label,
        notes,
        cover_photo_id,
        asset_status,
        identity_source,
        identity_review_status
      )
      values (
        p_customer_id,
        company_id_value,
        customer_address_id_value,
        appliance_type_value,
        brand_value,
        public.clean_customer_crm_text(p_payload->>'model_number'),
        public.clean_customer_crm_text(p_payload->>'serial_number'),
        nullif(p_payload->>'purchase_year', '')::integer,
        public.clean_customer_crm_text(p_payload->>'location_label'),
        public.clean_customer_crm_text(p_payload->>'notes', 1000),
        cover_photo_id_value,
        'active',
        case when asset_photo_id_value is not null then 'ai_attachment' else 'manual' end,
        case when asset_photo_id_value is not null then 'unreviewed' else 'confirmed' end
      )
      returning id into appliance_id_value;
    end if;
  end if;

  if asset_photo_id_value is not null then
    update public.customer_appliance_photos
    set
      customer_appliance_id = appliance_id_value,
      is_cover = true,
      updated_at = now()
    where id = asset_photo_id_value
      and customer_id = p_customer_id;
  end if;

  return jsonb_build_object('appliance_id', appliance_id_value);
end;
$$;

comment on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) is
  'Creates or updates a customer appliance/asset while preserving dashboard authorization, selected customer address location, service-request cover photos, standalone asset photos, and duplicate identity matching.';

revoke execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) to authenticated;
