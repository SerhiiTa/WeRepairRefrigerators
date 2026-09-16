-- Task: Customer Asset lifecycle location and manual address selection.
--
-- Forward-only, apply-ready.
-- Purpose:
--   - Let manual Customer Asset creation/edit persist the selected physical
--     customer_address_id instead of always falling back to the primary address.
--   - Ensure Job-originated Asset Intelligence links assets to the originating
--     Job service address by reusing/creating the matching customer_addresses row.

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
  customer_address_id_value uuid;
  requested_address_id_value uuid := nullif(p_payload->>'customer_address_id', '')::uuid;
  cover_photo_id_value uuid := nullif(p_payload->>'cover_photo_id', '')::uuid;
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

  if requested_address_id_value is not null then
    select ca.id
    into customer_address_id_value
    from public.customer_addresses ca
    where ca.id = requested_address_id_value
      and ca.customer_id = p_customer_id
    limit 1;

    if customer_address_id_value is null then
      raise exception 'Address is not accessible.' using errcode = '42501';
    end if;
  else
    select ca.id
    into customer_address_id_value
    from public.customer_addresses ca
    where ca.customer_id = p_customer_id
    order by ca.is_primary desc, ca.updated_at desc
    limit 1;
  end if;

  if cover_photo_id_value is not null then
    perform 1
    from public.service_request_photos srp
    join public.service_requests sr on sr.id = srp.service_request_id
    where srp.id = cover_photo_id_value
      and sr.customer_id = p_customer_id
      and public.can_view_service_request(sr.id)
    limit 1;

    if not found then
      raise exception 'Asset photo is not accessible.' using errcode = '42501';
    end if;
  end if;

  if p_appliance_id is not null then
    update public.customer_appliances
    set
      company_id = coalesce(company_id, company_id_value),
      customer_address_id = customer_address_id_value,
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
    if brand_value is not null
       and public.clean_customer_crm_text(p_payload->>'model_number') is not null
       and public.clean_customer_crm_text(p_payload->>'serial_number') is not null then
      select ca.id
      into matched_appliance_id
      from public.customer_appliances ca
      where ca.customer_id = p_customer_id
        and (company_id_value is null or ca.company_id is null or ca.company_id = company_id_value)
        and public.normalize_asset_identity_text(ca.brand) = public.normalize_asset_identity_text(brand_value)
        and public.normalize_asset_identity_text(ca.model_number) = public.normalize_asset_identity_text(p_payload->>'model_number')
        and public.normalize_asset_identity_text(ca.serial_number) = public.normalize_asset_identity_text(p_payload->>'serial_number')
      order by ca.updated_at desc
      limit 1;
    end if;

    if matched_appliance_id is not null then
      update public.customer_appliances
      set
        company_id = coalesce(company_id, company_id_value),
        customer_address_id = coalesce(customer_address_id, customer_address_id_value),
        appliance_type = coalesce(nullif(appliance_type, ''), appliance_type_value),
        location_label = coalesce(location_label, public.clean_customer_crm_text(p_payload->>'location_label')),
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
        'manual',
        'confirmed'
      )
      returning id into appliance_id_value;
    end if;
  end if;

  return jsonb_build_object('appliance_id', appliance_id_value);
end;
$$;

comment on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) is
  'Creates or updates a customer appliance/asset while preserving dashboard authorization, selected customer address location, cover photo, and duplicate identity matching.';

revoke execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) to authenticated;

create or replace function public.process_asset_intelligence_result_rpc(
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
  address_result_value jsonb;
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

  if address_id_value is null
     and coalesce(request_row.street_address, request_row.city, request_row.zip_code) is not null then
    address_result_value := public.upsert_customer_address_rpc(
      request_row.customer_id,
      null,
      jsonb_build_object(
        'label', 'Job Service Address',
        'street_address', request_row.street_address,
        'unit', request_row.unit,
        'city', request_row.city,
        'state', request_row.state,
        'zip_code', request_row.zip_code,
        'country', coalesce(request_row.country, 'US'),
        'latitude', request_row.latitude,
        'longitude', request_row.longitude,
        'place_id', request_row.place_id,
        'is_primary', false
      )
    );

    address_id_value := nullif(address_result_value->>'address_id', '')::uuid;
  end if;

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

comment on function public.process_asset_intelligence_result_rpc(uuid, jsonb) is
  'Processes one service_request_photo through Asset Intelligence and links Job-originated assets to the originating Job service address.';

revoke all on function public.process_asset_intelligence_result_rpc(uuid, jsonb) from public;
grant execute on function public.process_asset_intelligence_result_rpc(uuid, jsonb) to authenticated;
