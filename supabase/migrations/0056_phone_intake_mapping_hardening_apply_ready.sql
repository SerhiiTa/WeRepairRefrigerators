-- Task 152.2: Production phone intake mapping hardening.
--
-- APPLY-READY.
-- Purpose:
--   Harden the existing phone intake pipeline without replacing the dispatcher
--   workflow. Phone ingestion creates intake_requests, and the existing
--   authenticated conversion RPC turns those intakes into CRM jobs. This patch
--   adds a narrow post-conversion sync so converted phone intakes also preserve
--   structured address output and link/create the customer's appliance record.
--
-- Safety:
--   - This does not disable RLS.
--   - This does not modify authentication.
--   - This does not create calls, SMS, emails, estimates, invoices, payments,
--     or appointments.
--   - This does not replace the existing intake conversion RPC.
--   - It only enriches service_requests after an intake is already linked.

create or replace function public.find_or_create_customer_appliance_for_intake(
  p_customer_id uuid,
  p_appliance_type text,
  p_brand text,
  p_model_number text,
  p_serial_number text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  appliance_id_value uuid;
  cleaned_appliance_type text := nullif(btrim(coalesce(p_appliance_type, '')), '');
  cleaned_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  cleaned_model_number text := nullif(btrim(coalesce(p_model_number, '')), '');
  cleaned_serial_number text := nullif(btrim(coalesce(p_serial_number, '')), '');
begin
  if p_customer_id is null or cleaned_appliance_type is null then
    return null;
  end if;

  if cleaned_serial_number is not null then
    select ca.id
    into appliance_id_value
    from public.customer_appliances ca
    where ca.customer_id = p_customer_id
      and lower(coalesce(ca.serial_number, '')) = lower(cleaned_serial_number)
    order by ca.updated_at desc
    limit 1;

    if appliance_id_value is not null then
      return appliance_id_value;
    end if;
  end if;

  if cleaned_model_number is not null then
    select ca.id
    into appliance_id_value
    from public.customer_appliances ca
    where ca.customer_id = p_customer_id
      and lower(ca.appliance_type) = lower(cleaned_appliance_type)
      and lower(coalesce(ca.brand, '')) = lower(coalesce(cleaned_brand, ''))
      and lower(coalesce(ca.model_number, '')) = lower(cleaned_model_number)
    order by ca.updated_at desc
    limit 1;

    if appliance_id_value is not null then
      return appliance_id_value;
    end if;
  end if;

  select ca.id
  into appliance_id_value
  from public.customer_appliances ca
  where ca.customer_id = p_customer_id
    and lower(ca.appliance_type) = lower(cleaned_appliance_type)
    and lower(coalesce(ca.brand, '')) = lower(coalesce(cleaned_brand, ''))
  order by ca.updated_at desc
  limit 1;

  if appliance_id_value is not null then
    return appliance_id_value;
  end if;

  insert into public.customer_appliances (
    customer_id,
    appliance_type,
    brand,
    model_number,
    serial_number,
    notes
  )
  values (
    p_customer_id,
    cleaned_appliance_type,
    cleaned_brand,
    cleaned_model_number,
    cleaned_serial_number,
    'Created from a converted WRA phone intake.'
  )
  returning id into appliance_id_value;

  return appliance_id_value;
end;
$$;

comment on function public.find_or_create_customer_appliance_for_intake(uuid, text, text, text, text) is
  'Task 152.2 helper. Matches or creates a customer appliance when a phone intake is converted into a CRM job.';

revoke execute on function public.find_or_create_customer_appliance_for_intake(uuid, text, text, text, text) from public;
grant execute on function public.find_or_create_customer_appliance_for_intake(uuid, text, text, text, text) to authenticated;

create or replace function public.sync_converted_intake_service_request_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appliance_id_value uuid;
  formatted_address text;
begin
  if new.linked_service_request_id is null then
    return new;
  end if;

  if new.linked_customer_id is not null then
    appliance_id_value := public.find_or_create_customer_appliance_for_intake(
      new.linked_customer_id,
      new.appliance_type,
      new.brand,
      new.model_number,
      new.serial_number
    );
  end if;

  formatted_address := public.format_service_request_full_address(
    new.service_address,
    new.unit,
    new.city,
    coalesce(nullif(btrim(coalesce(new.state, '')), ''), 'TX'),
    new.zip_code,
    coalesce(nullif(btrim(coalesce(new.country, '')), ''), 'US')
  );

  update public.service_requests sr
  set
    customer_appliance_id = coalesce(sr.customer_appliance_id, appliance_id_value),
    full_address = coalesce(formatted_address, sr.full_address),
    street_address = coalesce(nullif(btrim(coalesce(new.service_address, '')), ''), sr.street_address),
    unit = coalesce(nullif(btrim(coalesce(new.unit, '')), ''), sr.unit),
    city = coalesce(nullif(btrim(coalesce(new.city, '')), ''), sr.city),
    state = coalesce(nullif(btrim(coalesce(new.state, '')), ''), sr.state),
    country = coalesce(nullif(btrim(coalesce(new.country, '')), ''), sr.country),
    zip_code = coalesce(nullif(btrim(coalesce(new.zip_code, '')), ''), sr.zip_code),
    updated_at = now()
  where sr.id = new.linked_service_request_id;

  return new;
end;
$$;

comment on function public.sync_converted_intake_service_request_context() is
  'Task 152.2 post-conversion sync. Preserves structured address fields and appliance linkage on CRM jobs created from intakes.';

drop trigger if exists intake_requests_sync_converted_service_request_context
  on public.intake_requests;
create trigger intake_requests_sync_converted_service_request_context
after insert or update of
  linked_service_request_id,
  linked_customer_id,
  appliance_type,
  brand,
  model_number,
  serial_number,
  service_address,
  unit,
  city,
  state,
  zip_code,
  country
on public.intake_requests
for each row
when (new.linked_service_request_id is not null)
execute function public.sync_converted_intake_service_request_context();

-- Backfill existing converted intakes, including the verified production phone
-- intake from Task 152, without changing any intake lifecycle status.
update public.intake_requests
set linked_service_request_id = linked_service_request_id
where linked_service_request_id is not null
  and linked_customer_id is not null;
