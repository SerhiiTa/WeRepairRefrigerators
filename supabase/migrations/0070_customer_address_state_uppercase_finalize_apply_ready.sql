-- Task XXX follow-up: finalize customer address state persistence casing.
--
-- Scope:
-- - Persist normalized customer address state as uppercase.
-- - Texas/texas/TX/tx/Tx must store as TX.
-- - Do not change tables or schema.
-- - Do not rewrite or delete legacy QA rows.
-- - Do not change address dedupe, Job service address, Property Intelligence, Maps, Distance, or UI behavior.

create or replace function public.upsert_customer_address_rpc(
  p_customer_id uuid,
  p_address_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  company_id_value uuid := public.current_dashboard_company_id();
  target_address_id uuid := p_address_id;
  address_id_value uuid;
  is_primary_value boolean := coalesce(nullif(p_payload->>'is_primary', '')::boolean, true);
  street_value text := public.clean_customer_crm_text(p_payload->>'street_address', 240);
  unit_value text := public.clean_customer_crm_text(p_payload->>'unit');
  city_value text := public.clean_customer_crm_text(p_payload->>'city');
  state_value text := upper(nullif(public.normalize_customer_address_match_value(p_payload->>'state', 'state'), ''));
  zip_value text := nullif(left(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), 5), '');
  matched_existing_value boolean := false;
  country_value text := public.clean_customer_crm_text(upper(p_payload->>'country'), 2);
begin
  if not public.can_manage_customer_crm(p_customer_id) then
    raise exception 'Customer is not accessible.' using errcode = '42501';
  end if;

  select coalesce(company_id, company_id_value)
  into company_id_value
  from public.customers
  where id = p_customer_id;

  if company_id_value is null and not public.is_admin() then
    raise exception 'A dashboard company context is required.' using errcode = '42501';
  end if;

  if target_address_id is null then
    select ca.id
    into target_address_id
    from public.customer_addresses ca
    where ca.customer_id = p_customer_id
      and (
        (
          public.clean_customer_crm_text(p_payload->>'place_id', 240) is not null
          and ca.place_id is not null
          and ca.place_id = public.clean_customer_crm_text(p_payload->>'place_id', 240)
        )
        or (
          public.normalize_customer_address_match_value(ca.street_address, 'street') = public.normalize_customer_address_match_value(street_value, 'street')
          and public.normalize_customer_address_match_value(ca.unit, 'unit') = public.normalize_customer_address_match_value(unit_value, 'unit')
          and public.normalize_customer_address_match_value(ca.city, 'city') = public.normalize_customer_address_match_value(city_value, 'city')
          and public.normalize_customer_address_match_value(ca.state, 'state') = public.normalize_customer_address_match_value(state_value, 'state')
          and public.normalize_customer_address_match_value(ca.zip_code, 'zip') = public.normalize_customer_address_match_value(zip_value, 'zip')
          and (
            public.normalize_customer_address_match_value(street_value, 'street') <> ''
            or public.normalize_customer_address_match_value(zip_value, 'zip') <> ''
          )
        )
      )
    order by ca.is_primary desc, ca.updated_at desc
    limit 1;

    matched_existing_value := target_address_id is not null;
  end if;

  if is_primary_value then
    update public.customer_addresses
    set is_primary = false,
        updated_by = auth.uid()
    where customer_id = p_customer_id
      and (target_address_id is null or id <> target_address_id);
  end if;

  if target_address_id is not null then
    if matched_existing_value then
      update public.customer_addresses
      set
        label = coalesce(label, public.clean_customer_crm_text(p_payload->>'label')),
        is_primary = is_primary_value,
        company_id = coalesce(company_id, company_id_value),
        updated_by = auth.uid()
      where id = target_address_id
        and customer_id = p_customer_id
      returning id into address_id_value;
    else
      update public.customer_addresses
      set
        label = coalesce(public.clean_customer_crm_text(p_payload->>'label'), label),
        street_address = street_value,
        unit = unit_value,
        city = city_value,
        state = coalesce(state_value, state),
        zip_code = zip_value,
        country = coalesce(country_value, country),
        latitude = nullif(p_payload->>'latitude', '')::double precision,
        longitude = nullif(p_payload->>'longitude', '')::double precision,
        place_id = public.clean_customer_crm_text(p_payload->>'place_id', 240),
        is_primary = is_primary_value,
        company_id = coalesce(company_id, company_id_value),
        updated_by = auth.uid()
      where id = target_address_id
        and customer_id = p_customer_id
      returning id into address_id_value;
    end if;

    if address_id_value is null then
      raise exception 'Address is not accessible.' using errcode = '42501';
    end if;
  else
    insert into public.customer_addresses (
      customer_id,
      company_id,
      label,
      street_address,
      unit,
      city,
      state,
      zip_code,
      country,
      latitude,
      longitude,
      place_id,
      is_primary,
      created_by,
      updated_by
    )
    values (
      p_customer_id,
      company_id_value,
      coalesce(public.clean_customer_crm_text(p_payload->>'label'), 'Primary'),
      street_value,
      unit_value,
      city_value,
      coalesce(state_value, 'TX'),
      zip_value,
      coalesce(country_value, 'US'),
      nullif(p_payload->>'latitude', '')::double precision,
      nullif(p_payload->>'longitude', '')::double precision,
      public.clean_customer_crm_text(p_payload->>'place_id', 240),
      is_primary_value,
      auth.uid(),
      auth.uid()
    )
    returning id into address_id_value;
  end if;

  return jsonb_build_object('address_id', address_id_value);
end;
$$;

comment on function public.upsert_customer_address_rpc(uuid, uuid, jsonb) is
  'Task XXX/0070 customer address write repair: dedupes normalized address variants, keeps original human-readable address when a duplicate is found, normalizes ZIP to five digits, and persists normalized state uppercase.';

revoke execute on function public.upsert_customer_address_rpc(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_customer_address_rpc(uuid, uuid, jsonb) to authenticated;



-- Deterministic state normalization validation. This is intentionally read-only.
do $$
declare
  v_input text;
  v_normalized text;
begin
  foreach v_input in array array['Texas', 'texas', 'TX', 'tx', 'Tx'] loop
    v_normalized := upper(nullif(public.normalize_customer_address_match_value(v_input, 'state'), ''));

    if v_normalized is distinct from 'TX' then
      raise exception '0070 state normalization validation failed for input %: got %', v_input, v_normalized;
    end if;
  end loop;
end;
$$;
