-- Task: Asset Intelligence foundation for Job attachments.
--
-- Forward-only, apply-ready.
-- Scope:
--   - Reuse customer_appliances as the WRA Asset foundation.
--   - Reuse service_requests.customer_appliance_id as the Job -> Asset link.
--   - Add attachment processing state/provenance and cover-photo support.
--   - Add narrow RPCs for deterministic match/create/link and cover updates.

create extension if not exists pgcrypto with schema extensions;

alter table public.customer_appliances
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists customer_address_id uuid references public.customer_addresses(id) on delete set null,
  add column if not exists asset_status text not null default 'active',
  add column if not exists cover_photo_id uuid references public.service_request_photos(id) on delete set null,
  add column if not exists identity_source text not null default 'manual',
  add column if not exists identity_source_photo_id uuid references public.service_request_photos(id) on delete set null,
  add column if not exists identity_confidence numeric,
  add column if not exists identity_review_status text not null default 'confirmed',
  add column if not exists identity_raw_text text,
  add column if not exists identity_extraction jsonb not null default '{}'::jsonb;

alter table public.customer_appliances
  drop constraint if exists customer_appliances_asset_status_check,
  add constraint customer_appliances_asset_status_check
    check (asset_status in ('active', 'inactive', 'archived'));

alter table public.customer_appliances
  drop constraint if exists customer_appliances_identity_source_check,
  add constraint customer_appliances_identity_source_check
    check (identity_source in ('manual', 'ai_attachment', 'qa_attachment'));

alter table public.customer_appliances
  drop constraint if exists customer_appliances_identity_review_status_check,
  add constraint customer_appliances_identity_review_status_check
    check (identity_review_status in ('confirmed', 'needs_review', 'unreviewed', 'rejected'));

create index if not exists customer_appliances_company_customer_idx
  on public.customer_appliances(company_id, customer_id);

create index if not exists customer_appliances_customer_address_idx
  on public.customer_appliances(customer_address_id)
  where customer_address_id is not null;

create index if not exists customer_appliances_cover_photo_idx
  on public.customer_appliances(cover_photo_id)
  where cover_photo_id is not null;

create index if not exists customer_appliances_identity_lookup_idx
  on public.customer_appliances(
    customer_id,
    lower(btrim(coalesce(brand, ''))),
    lower(btrim(coalesce(model_number, ''))),
    lower(btrim(coalesce(serial_number, '')))
  )
  where nullif(btrim(coalesce(model_number, '')), '') is not null
    and nullif(btrim(coalesce(serial_number, '')), '') is not null;

update public.customer_appliances ca
set company_id = coalesce(ca.company_id, c.company_id)
from public.customers c
where c.id = ca.customer_id
  and ca.company_id is null
  and c.company_id is not null;

alter table public.service_request_photos
  add column if not exists asset_processing_status text not null default 'not_started',
  add column if not exists asset_processing_result jsonb not null default '{}'::jsonb,
  add column if not exists asset_processing_error text,
  add column if not exists linked_customer_appliance_id uuid references public.customer_appliances(id) on delete set null,
  add column if not exists processed_at timestamptz;

alter table public.service_request_photos
  drop constraint if exists service_request_photos_asset_processing_status_check,
  add constraint service_request_photos_asset_processing_status_check
    check (asset_processing_status in (
      'not_started',
      'pending',
      'processed',
      'needs_review',
      'no_asset',
      'failed'
    ));

create index if not exists service_request_photos_asset_processing_idx
  on public.service_request_photos(asset_processing_status, created_at desc);

create index if not exists service_request_photos_linked_customer_appliance_idx
  on public.service_request_photos(linked_customer_appliance_id)
  where linked_customer_appliance_id is not null;

create or replace function public.normalize_asset_identity_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      upper(btrim(coalesce(p_value, ''))),
      '\s+',
      '',
      'g'
    ),
    ''
  );
$$;

create or replace function public.clean_asset_identity_text(p_value text, p_max_length integer default 120)
returns text
language sql
immutable
as $$
  select nullif(left(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g'), greatest(1, p_max_length)), '');
$$;

create or replace function public.process_service_request_photo_asset_intelligence_rpc(
  p_photo_id uuid,
  p_identity jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_row public.service_request_photos;
  request_row public.service_requests;
  customer_row public.customers;
  company_id_value uuid;
  address_id_value uuid;
  brand_value text;
  appliance_type_value text;
  model_value text;
  serial_value text;
  location_value text;
  raw_text_value text;
  confidence_value numeric;
  confidence_label text;
  matched_appliance_id uuid;
  action_value text := 'none';
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into photo_row
  from public.service_request_photos
  where id = p_photo_id;

  if photo_row.id is null then
    raise exception 'Attachment was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(photo_row.service_request_id) then
    raise exception 'Service request is not accessible for this account.' using errcode = '42501';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = photo_row.service_request_id;

  if request_row.id is null or request_row.customer_id is null then
    update public.service_request_photos
    set asset_processing_status = 'no_asset',
        asset_processing_result = jsonb_build_object('reason', 'missing_customer'),
        asset_processing_error = null,
        processed_at = now()
    where id = p_photo_id;

    return jsonb_build_object('status', 'no_asset', 'action', 'none', 'reason', 'missing_customer');
  end if;

  select *
  into customer_row
  from public.customers
  where id = request_row.customer_id;

  company_id_value := coalesce(request_row.company_id, customer_row.company_id);

  select ca.id
  into address_id_value
  from public.customer_addresses ca
  where ca.customer_id = request_row.customer_id
    and (
      (request_row.place_id is not null and ca.place_id = request_row.place_id)
      or (
        lower(coalesce(ca.street_address, '')) = lower(coalesce(request_row.street_address, ''))
        and lower(coalesce(ca.city, '')) = lower(coalesce(request_row.city, ''))
        and lower(coalesce(ca.state, '')) = lower(coalesce(request_row.state, ''))
        and left(coalesce(ca.zip_code, ''), 5) = left(coalesce(request_row.zip_code, ''), 5)
      )
    )
  order by ca.is_primary desc, ca.updated_at desc
  limit 1;

  if p_identity is null or jsonb_typeof(p_identity) <> 'object' then
    update public.service_request_photos
    set asset_processing_status = 'no_asset',
        asset_processing_result = jsonb_build_object(
          'reason', 'vision_provider_not_configured',
          'message', 'Attachment saved. Asset Intelligence provider is not connected yet.'
        ),
        asset_processing_error = null,
        processed_at = now()
    where id = p_photo_id;

    return jsonb_build_object(
      'status', 'no_asset',
      'action', 'none',
      'reason', 'vision_provider_not_configured'
    );
  end if;

  brand_value := public.clean_asset_identity_text(p_identity->>'brand', 80);
  appliance_type_value := coalesce(
    public.clean_asset_identity_text(p_identity->>'applianceType', 80),
    public.clean_asset_identity_text(p_identity->>'appliance_type', 80),
    public.clean_asset_identity_text(request_row.appliance_type, 80),
    'unknown_appliance'
  );
  model_value := coalesce(
    public.clean_asset_identity_text(p_identity->>'modelNumber', 120),
    public.clean_asset_identity_text(p_identity->>'model_number', 120)
  );
  serial_value := coalesce(
    public.clean_asset_identity_text(p_identity->>'serialNumber', 120),
    public.clean_asset_identity_text(p_identity->>'serial_number', 120)
  );
  location_value := coalesce(
    public.clean_asset_identity_text(p_identity->>'location', 80),
    public.clean_asset_identity_text(p_identity->>'location_label', 80)
  );
  raw_text_value := public.clean_asset_identity_text(p_identity->>'rawText', 4000);
  confidence_label := lower(coalesce(p_identity->>'confidenceLabel', p_identity->>'confidence_label', ''));
  confidence_value := nullif(p_identity->>'confidence', '')::numeric;

  if confidence_label = '' then
    confidence_label := case
      when coalesce(confidence_value, 0) >= 0.85 then 'high'
      when coalesce(confidence_value, 0) >= 0.55 then 'medium'
      else 'low'
    end;
  end if;

  if confidence_label = 'high'
     and brand_value is not null
     and model_value is not null
     and serial_value is not null then
    select ca.id
    into matched_appliance_id
    from public.customer_appliances ca
    where ca.customer_id = request_row.customer_id
      and (company_id_value is null or ca.company_id is null or ca.company_id = company_id_value)
      and public.normalize_asset_identity_text(ca.brand) = public.normalize_asset_identity_text(brand_value)
      and public.normalize_asset_identity_text(ca.model_number) = public.normalize_asset_identity_text(model_value)
      and public.normalize_asset_identity_text(ca.serial_number) = public.normalize_asset_identity_text(serial_value)
    order by ca.updated_at desc
    limit 1;

    if matched_appliance_id is null then
      insert into public.customer_appliances (
        customer_id,
        company_id,
        customer_address_id,
        appliance_type,
        brand,
        model_number,
        serial_number,
        location_label,
        asset_status,
        identity_source,
        identity_source_photo_id,
        identity_confidence,
        identity_review_status,
        identity_raw_text,
        identity_extraction
      )
      values (
        request_row.customer_id,
        company_id_value,
        address_id_value,
        appliance_type_value,
        brand_value,
        model_value,
        serial_value,
        location_value,
        'active',
        'ai_attachment',
        p_photo_id,
        confidence_value,
        'unreviewed',
        raw_text_value,
        p_identity
      )
      returning id into matched_appliance_id;

      action_value := 'created';
    else
      update public.customer_appliances
      set
        company_id = coalesce(company_id, company_id_value),
        customer_address_id = coalesce(customer_address_id, address_id_value),
        appliance_type = coalesce(nullif(appliance_type, ''), appliance_type_value),
        location_label = coalesce(location_label, location_value),
        identity_source_photo_id = coalesce(identity_source_photo_id, p_photo_id),
        identity_confidence = greatest(coalesce(identity_confidence, 0), coalesce(confidence_value, 0)),
        identity_extraction = case
          when identity_extraction = '{}'::jsonb then p_identity
          else identity_extraction
        end
      where id = matched_appliance_id;

      action_value := 'matched';
    end if;

    update public.service_requests
    set customer_appliance_id = matched_appliance_id
    where id = request_row.id;

    update public.service_request_photos
    set asset_processing_status = 'processed',
        asset_processing_result = jsonb_build_object(
          'action', action_value,
          'customer_appliance_id', matched_appliance_id,
          'identity', p_identity
        ),
        asset_processing_error = null,
        linked_customer_appliance_id = matched_appliance_id,
        processed_at = now()
    where id = p_photo_id;

    return jsonb_build_object(
      'status', 'processed',
      'action', action_value,
      'customer_appliance_id', matched_appliance_id
    );
  end if;

  update public.service_request_photos
  set asset_processing_status = case when confidence_label = 'medium' then 'needs_review' else 'no_asset' end,
      asset_processing_result = jsonb_build_object(
        'reason', case when confidence_label = 'medium' then 'needs_review' else 'low_confidence' end,
        'identity', p_identity
      ),
      asset_processing_error = null,
      processed_at = now()
  where id = p_photo_id;

  return jsonb_build_object(
    'status', case when confidence_label = 'medium' then 'needs_review' else 'no_asset' end,
    'action', 'review_required'
  );
exception
  when others then
    update public.service_request_photos
    set asset_processing_status = 'failed',
        asset_processing_error = sqlerrm,
        processed_at = now()
    where id = p_photo_id;

    raise;
end;
$$;

comment on function public.process_service_request_photo_asset_intelligence_rpc(uuid, jsonb) is
  'Processes one service_request_photo through the Asset Intelligence foundation. Null identity records safe no-provider state; high-confidence identity matches/creates and links customer_appliances.';

revoke all on function public.process_service_request_photo_asset_intelligence_rpc(uuid, jsonb) from public;
grant execute on function public.process_service_request_photo_asset_intelligence_rpc(uuid, jsonb) to authenticated;

create or replace function public.set_customer_appliance_cover_photo_from_job_rpc(
  p_photo_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_row public.service_request_photos;
  request_row public.service_requests;
  asset_id_value uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into photo_row
  from public.service_request_photos
  where id = p_photo_id;

  if photo_row.id is null then
    raise exception 'Attachment was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(photo_row.service_request_id) then
    raise exception 'Service request is not accessible for this account.' using errcode = '42501';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = photo_row.service_request_id;

  asset_id_value := coalesce(photo_row.linked_customer_appliance_id, request_row.customer_appliance_id);

  if asset_id_value is null then
    raise exception 'Link an asset to this job before setting an asset cover photo.'
      using errcode = '22023';
  end if;

  update public.customer_appliances ca
  set cover_photo_id = p_photo_id,
      updated_at = now()
  where ca.id = asset_id_value
    and ca.customer_id = request_row.customer_id
    and (
      request_row.company_id is null
      or ca.company_id is null
      or ca.company_id = request_row.company_id
    );

  if not found then
    raise exception 'Asset is not accessible for this job.' using errcode = '42501';
  end if;

  update public.service_request_photos
  set linked_customer_appliance_id = asset_id_value
  where id = p_photo_id;

  return jsonb_build_object(
    'status', 'updated',
    'customer_appliance_id', asset_id_value,
    'cover_photo_id', p_photo_id
  );
end;
$$;

comment on function public.set_customer_appliance_cover_photo_from_job_rpc(uuid) is
  'Sets a real service-request photo as the current linked asset cover photo after checking job visibility and tenant ownership.';

revoke all on function public.set_customer_appliance_cover_photo_from_job_rpc(uuid) from public;
grant execute on function public.set_customer_appliance_cover_photo_from_job_rpc(uuid) to authenticated;
