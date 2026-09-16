-- Task: Customer Assets workspace manual create/edit support.
--
-- Forward-only, apply-ready.
-- Purpose:
--   Keep the existing customer_appliances table/RPC, but make manual dashboard
--   asset creation populate the 0075 Asset Intelligence company/address context.

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

  select ca.id
  into customer_address_id_value
  from public.customer_addresses ca
  where ca.customer_id = p_customer_id
  order by ca.is_primary desc, ca.updated_at desc
  limit 1;

  if p_appliance_id is not null then
    update public.customer_appliances
    set
      company_id = coalesce(company_id, company_id_value),
      customer_address_id = coalesce(customer_address_id, customer_address_id_value),
      appliance_type = coalesce(appliance_type_value, appliance_type),
      brand = brand_value,
      model_number = public.clean_customer_crm_text(p_payload->>'model_number'),
      serial_number = public.clean_customer_crm_text(p_payload->>'serial_number'),
      purchase_year = nullif(p_payload->>'purchase_year', '')::integer,
      location_label = public.clean_customer_crm_text(p_payload->>'location_label'),
      notes = public.clean_customer_crm_text(p_payload->>'notes', 1000),
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
      'active',
      'manual',
      'confirmed'
    )
    returning id into appliance_id_value;
  end if;

  return jsonb_build_object('appliance_id', appliance_id_value);
end;
$$;

comment on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) is
  'Creates or updates a customer appliance/asset while preserving dashboard authorization and populating Asset Intelligence company/address context.';

revoke execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) to authenticated;
