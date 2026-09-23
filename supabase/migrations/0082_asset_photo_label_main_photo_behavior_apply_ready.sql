-- Task: Standalone Customer Asset photo UX correction.
--
-- Forward-only, apply-ready.
-- Purpose:
--   0081 added standalone Asset photos after Production had already used the
--   Job-photo cover model. This migration preserves that schema but corrects
--   save behavior so label photos never become covers, while normal asset
--   photos can be main/additional photos.

update public.customer_appliance_photos
set is_cover = false,
    updated_at = now()
where photo_type = 'asset_label'
  and is_cover = true;

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
  label_photo_id_value uuid := coalesce(nullif(p_payload->>'label_photo_id', '')::uuid, nullif(p_payload->>'asset_photo_id', '')::uuid);
  main_photo_id_value uuid := nullif(p_payload->>'main_photo_id', '')::uuid;
  additional_photo_ids_value uuid[] := array[]::uuid[];
  additional_photo_id_value uuid;
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

  if jsonb_typeof(p_payload->'additional_photo_ids') = 'array' then
    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into additional_photo_ids_value
    from jsonb_array_elements_text(p_payload->'additional_photo_ids') as item(value)
    where nullif(value, '') is not null;
  end if;

  if label_photo_id_value is not null then
    perform 1
    from public.customer_appliance_photos cap
    where cap.id = label_photo_id_value
      and cap.customer_id = p_customer_id
      and cap.photo_type = 'asset_label'
      and (cap.customer_appliance_id is null or cap.customer_appliance_id = p_appliance_id);

    if not found then
      raise exception 'Label photo is not accessible.' using errcode = '42501';
    end if;
  end if;

  if main_photo_id_value is not null then
    perform 1
    from public.customer_appliance_photos cap
    where cap.id = main_photo_id_value
      and cap.customer_id = p_customer_id
      and cap.photo_type = 'asset_photo'
      and (cap.customer_appliance_id is null or cap.customer_appliance_id = p_appliance_id);

    if not found then
      raise exception 'Main photo is not accessible.' using errcode = '42501';
    end if;
  end if;

  foreach additional_photo_id_value in array additional_photo_ids_value loop
    perform 1
    from public.customer_appliance_photos cap
    where cap.id = additional_photo_id_value
      and cap.customer_id = p_customer_id
      and cap.photo_type = 'asset_photo'
      and (cap.customer_appliance_id is null or cap.customer_appliance_id = p_appliance_id);

    if not found then
      raise exception 'Additional photo is not accessible.' using errcode = '42501';
    end if;
  end loop;

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
        case when label_photo_id_value is not null then 'ai_attachment' else 'manual' end,
        case when label_photo_id_value is not null then 'unreviewed' else 'confirmed' end
      )
      returning id into appliance_id_value;
    end if;
  end if;

  if label_photo_id_value is not null then
    update public.customer_appliance_photos
    set
      customer_appliance_id = appliance_id_value,
      is_cover = false,
      updated_at = now()
    where id = label_photo_id_value
      and customer_id = p_customer_id
      and photo_type = 'asset_label';
  end if;

  if main_photo_id_value is not null then
    update public.customer_appliance_photos
    set
      is_cover = false,
      updated_at = now()
    where customer_appliance_id = appliance_id_value
      and customer_id = p_customer_id
      and photo_type = 'asset_photo'
      and id <> main_photo_id_value;

    update public.customer_appliance_photos
    set
      customer_appliance_id = appliance_id_value,
      is_cover = true,
      updated_at = now()
    where id = main_photo_id_value
      and customer_id = p_customer_id
      and photo_type = 'asset_photo';
  end if;

  foreach additional_photo_id_value in array additional_photo_ids_value loop
    update public.customer_appliance_photos
    set
      customer_appliance_id = appliance_id_value,
      is_cover = false,
      updated_at = now()
    where id = additional_photo_id_value
      and customer_id = p_customer_id
      and photo_type = 'asset_photo'
      and (main_photo_id_value is null or id <> main_photo_id_value);
  end loop;

  return jsonb_build_object('appliance_id', appliance_id_value);
end;
$$;

comment on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) is
  'Creates or updates a customer appliance/asset while preserving dashboard authorization, selected customer address location, service-request cover photos, standalone label photos, main asset photos, additional asset photos, and duplicate identity matching.';

revoke execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) to authenticated;
