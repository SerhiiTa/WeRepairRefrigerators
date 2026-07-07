-- Task 155: Customer CRM write actions + intake/customer matching foundation.
--
-- Scope:
-- - Internal dashboard customer creation/editing.
-- - Customer primary/service addresses.
-- - Internal customer notes.
-- - Reusable source-agnostic customer match/create helper for future intake sources.
--
-- Safety:
-- - Forward-only.
-- - No destructive changes.
-- - Does not disable RLS.
-- - Does not weaken anon/customer portal access.
-- - Dashboard writes go through SECURITY DEFINER RPCs with active company access checks.

alter table public.customers
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists customers_company_id_idx
  on public.customers(company_id);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  label text not null default 'Primary',
  street_address text,
  unit text,
  city text,
  state text not null default 'TX',
  zip_code text,
  country text not null default 'US',
  latitude double precision,
  longitude double precision,
  place_id text,
  is_primary boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_zip_format check (
    zip_code is null or zip_code ~ '^[0-9]{5}$'
  )
);

create index if not exists customer_addresses_customer_id_idx
  on public.customer_addresses(customer_id);

create index if not exists customer_addresses_company_id_idx
  on public.customer_addresses(company_id);

create index if not exists customer_addresses_zip_idx
  on public.customer_addresses(zip_code);

create unique index if not exists customer_addresses_one_primary_per_customer_idx
  on public.customer_addresses(customer_id)
  where is_primary;

create table if not exists public.customer_internal_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  body text not null,
  note_type text not null default 'general',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint customer_internal_notes_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists customer_internal_notes_customer_id_idx
  on public.customer_internal_notes(customer_id);

create index if not exists customer_internal_notes_company_id_idx
  on public.customer_internal_notes(company_id);

create or replace function public.set_customer_crm_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_addresses_set_updated_at on public.customer_addresses;
create trigger customer_addresses_set_updated_at
before update on public.customer_addresses
for each row execute function public.set_customer_crm_updated_at();

create or replace function public.current_dashboard_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select cm.company_id
     from public.company_members cm
     join public.companies c on c.id = cm.company_id
     join public.profiles p on p.id = cm.profile_id
     where cm.profile_id = auth.uid()
       and cm.member_status = 'active'
       and cm.archived_at is null
       and cm.removed_at is null
       and cm.suspended_at is null
       and c.status = 'active'
       and c.archived_at is null
       and p.status = 'active'
     order by cm.joined_at nulls last, cm.created_at
     limit 1),
    (select tp.company_id
     from public.technician_profiles tp
     join public.profiles p on p.id = tp.profile_id
     where tp.profile_id = auth.uid()
       and p.status = 'active'
       and tp.company_id is not null
       and tp.archived_at is null
     order by tp.created_at
     limit 1),
    (select p.company_id
     from public.profiles p
     where p.id = auth.uid()
       and p.status = 'active'
       and p.company_id is not null
     limit 1)
  );
$$;

create or replace function public.can_manage_customer_crm(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.customers c
      where c.id = target_customer_id
        and (
          (c.company_id is not null and public.can_view_company(c.company_id))
          or exists (
            select 1
            from public.service_requests sr
            where sr.customer_id = c.id
              and public.can_view_service_request(sr.id)
          )
          or exists (
            select 1
            from public.intake_requests ir
            where ir.linked_customer_id = c.id
              and (
                (ir.company_id is not null and public.can_view_company(ir.company_id))
                or ir.owner_profile_id = auth.uid()
              )
          )
        )
    );
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
  or public.can_manage_customer_crm(target_customer_id);
$$;

create or replace function public.normalize_customer_crm_phone(input_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.normalize_customer_crm_email(input_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(input_email, ''))), '');
$$;

create or replace function public.clean_customer_crm_text(input_text text, max_length integer default 180)
returns text
language sql
immutable
as $$
  select nullif(left(trim(coalesce(input_text, '')), greatest(max_length, 1)), '');
$$;

create or replace function public.upsert_dashboard_customer_rpc(
  p_customer_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  company_id_value uuid := public.current_dashboard_company_id();
  existing_customer_id uuid;
  customer_id_value uuid;
  first_name_value text := public.clean_customer_crm_text(p_payload->>'first_name');
  last_name_value text := public.clean_customer_crm_text(p_payload->>'last_name');
  full_name_value text;
  phone_value text := public.normalize_customer_crm_phone(p_payload->>'phone');
  email_value text := public.normalize_customer_crm_email(p_payload->>'email');
  preferred_contact_value public.customer_contact_method;
  status_value public.customer_status;
begin
  if company_id_value is null and not public.is_admin() then
    raise exception 'A dashboard company context is required.' using errcode = '42501';
  end if;

  full_name_value := public.clean_customer_crm_text(
    coalesce(
      p_payload->>'full_name',
      trim(coalesce(first_name_value, '') || ' ' || coalesce(last_name_value, ''))
    )
  );

  if full_name_value is null and phone_value is null and email_value is null then
    raise exception 'Customer needs a name, phone, or email.' using errcode = '22023';
  end if;

  if (p_payload ? 'preferred_contact_method')
     and (p_payload->>'preferred_contact_method') in ('phone', 'sms', 'email') then
    preferred_contact_value := (p_payload->>'preferred_contact_method')::public.customer_contact_method;
  end if;

  if (p_payload ? 'customer_status')
     and (p_payload->>'customer_status') in ('active', 'inactive', 'blocked') then
    status_value := (p_payload->>'customer_status')::public.customer_status;
  end if;

  if p_customer_id is not null then
    if not public.can_manage_customer_crm(p_customer_id) then
      raise exception 'Customer is not accessible.' using errcode = '42501';
    end if;

    update public.customers
    set
      first_name = coalesce(first_name_value, first_name),
      last_name = coalesce(last_name_value, last_name),
      full_name = coalesce(full_name_value, full_name),
      phone = coalesce(phone_value, phone),
      email = coalesce(email_value, email),
      preferred_contact_method = coalesce(preferred_contact_value, preferred_contact_method),
      customer_status = coalesce(status_value, customer_status),
      company_id = coalesce(company_id, company_id_value)
    where id = p_customer_id
    returning id into customer_id_value;
  else
    if phone_value is not null then
      select id into existing_customer_id
      from public.customers
      where public.normalize_customer_crm_phone(phone) = phone_value
      order by created_at
      limit 1;
    end if;

    if existing_customer_id is null and email_value is not null then
      select id into existing_customer_id
      from public.customers
      where public.normalize_customer_crm_email(email) = email_value
      order by created_at
      limit 1;
    end if;

    if existing_customer_id is not null then
      if not public.can_manage_customer_crm(existing_customer_id) then
        raise exception 'A matching customer exists but is not accessible.' using errcode = '42501';
      end if;

      update public.customers
      set
        first_name = coalesce(first_name, first_name_value),
        last_name = coalesce(last_name, last_name_value),
        full_name = coalesce(nullif(full_name, ''), full_name_value, full_name),
        phone = coalesce(phone, phone_value),
        email = coalesce(email, email_value),
        preferred_contact_method = coalesce(preferred_contact_method, preferred_contact_value),
        customer_status = coalesce(customer_status, status_value, 'active'),
        company_id = coalesce(company_id, company_id_value)
      where id = existing_customer_id
      returning id into customer_id_value;
    else
      insert into public.customers (
        company_id,
        first_name,
        last_name,
        full_name,
        phone,
        email,
        preferred_contact_method,
        customer_status
      )
      values (
        company_id_value,
        first_name_value,
        last_name_value,
        coalesce(full_name_value, phone_value, email_value, 'Customer'),
        phone_value,
        email_value,
        preferred_contact_value,
        coalesce(status_value, 'active')
      )
      returning id into customer_id_value;
    end if;
  end if;

  return jsonb_build_object(
    'customer_id', customer_id_value,
    'matched_existing', coalesce(existing_customer_id, p_customer_id) is not null
  );
end;
$$;

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
  address_id_value uuid;
  is_primary_value boolean := coalesce((p_payload->>'is_primary')::boolean, true);
begin
  if not public.can_manage_customer_crm(p_customer_id) then
    raise exception 'Customer is not accessible.' using errcode = '42501';
  end if;

  select coalesce(company_id, company_id_value)
  into company_id_value
  from public.customers
  where id = p_customer_id;

  if is_primary_value then
    update public.customer_addresses
    set is_primary = false,
        updated_by = auth.uid()
    where customer_id = p_customer_id
      and (p_address_id is null or id <> p_address_id);
  end if;

  if p_address_id is not null then
    update public.customer_addresses
    set
      label = coalesce(public.clean_customer_crm_text(p_payload->>'label'), label),
      street_address = public.clean_customer_crm_text(p_payload->>'street_address', 240),
      unit = public.clean_customer_crm_text(p_payload->>'unit'),
      city = public.clean_customer_crm_text(p_payload->>'city'),
      state = coalesce(public.clean_customer_crm_text(upper(p_payload->>'state'), 2), state),
      zip_code = nullif(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), ''),
      country = coalesce(public.clean_customer_crm_text(upper(p_payload->>'country'), 2), country),
      latitude = nullif(p_payload->>'latitude', '')::double precision,
      longitude = nullif(p_payload->>'longitude', '')::double precision,
      place_id = public.clean_customer_crm_text(p_payload->>'place_id', 240),
      is_primary = is_primary_value,
      company_id = coalesce(company_id, company_id_value),
      updated_by = auth.uid()
    where id = p_address_id
      and customer_id = p_customer_id
    returning id into address_id_value;

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
      public.clean_customer_crm_text(p_payload->>'street_address', 240),
      public.clean_customer_crm_text(p_payload->>'unit'),
      public.clean_customer_crm_text(p_payload->>'city'),
      coalesce(public.clean_customer_crm_text(upper(p_payload->>'state'), 2), 'TX'),
      nullif(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), ''),
      coalesce(public.clean_customer_crm_text(upper(p_payload->>'country'), 2), 'US'),
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
begin
  if not public.can_manage_customer_crm(p_customer_id) then
    raise exception 'Customer is not accessible.' using errcode = '42501';
  end if;

  if p_appliance_id is null and appliance_type_value is null then
    raise exception 'Appliance type is required.' using errcode = '22023';
  end if;

  if p_appliance_id is not null then
    update public.customer_appliances
    set
      appliance_type = coalesce(appliance_type_value, appliance_type),
      brand = public.clean_customer_crm_text(p_payload->>'brand'),
      model_number = public.clean_customer_crm_text(p_payload->>'model_number'),
      serial_number = public.clean_customer_crm_text(p_payload->>'serial_number'),
      purchase_year = nullif(p_payload->>'purchase_year', '')::integer,
      location_label = public.clean_customer_crm_text(p_payload->>'location_label'),
      notes = public.clean_customer_crm_text(p_payload->>'notes', 1000)
    where id = p_appliance_id
      and customer_id = p_customer_id
    returning id into appliance_id_value;

    if appliance_id_value is null then
      raise exception 'Appliance is not accessible.' using errcode = '42501';
    end if;
  else
    insert into public.customer_appliances (
      customer_id,
      appliance_type,
      brand,
      model_number,
      serial_number,
      purchase_year,
      location_label,
      notes
    )
    values (
      p_customer_id,
      appliance_type_value,
      public.clean_customer_crm_text(p_payload->>'brand'),
      public.clean_customer_crm_text(p_payload->>'model_number'),
      public.clean_customer_crm_text(p_payload->>'serial_number'),
      nullif(p_payload->>'purchase_year', '')::integer,
      public.clean_customer_crm_text(p_payload->>'location_label'),
      public.clean_customer_crm_text(p_payload->>'notes', 1000)
    )
    returning id into appliance_id_value;
  end if;

  return jsonb_build_object('appliance_id', appliance_id_value);
end;
$$;

create or replace function public.add_customer_internal_note_rpc(
  p_customer_id uuid,
  p_body text,
  p_note_type text default 'general'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  company_id_value uuid;
  note_id_value uuid;
begin
  if not public.can_manage_customer_crm(p_customer_id) then
    raise exception 'Customer is not accessible.' using errcode = '42501';
  end if;

  if public.clean_customer_crm_text(p_body, 3000) is null then
    raise exception 'Note cannot be empty.' using errcode = '22023';
  end if;

  select company_id into company_id_value
  from public.customers
  where id = p_customer_id;

  insert into public.customer_internal_notes (
    customer_id,
    company_id,
    body,
    note_type,
    created_by
  )
  values (
    p_customer_id,
    coalesce(company_id_value, public.current_dashboard_company_id()),
    public.clean_customer_crm_text(p_body, 3000),
    coalesce(public.clean_customer_crm_text(p_note_type), 'general'),
    auth.uid()
  )
  returning id into note_id_value;

  return jsonb_build_object('note_id', note_id_value);
end;
$$;

create or replace function public.match_or_create_customer_for_intake_rpc(
  p_intake_request_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  company_id_value uuid := public.current_dashboard_company_id();
  customer_id_value uuid;
  matched_reason text := null;
  review_required boolean := false;
  first_name_value text := public.clean_customer_crm_text(p_payload->>'first_name');
  last_name_value text := public.clean_customer_crm_text(p_payload->>'last_name');
  full_name_value text := public.clean_customer_crm_text(
    coalesce(
      p_payload->>'full_name',
      trim(coalesce(first_name_value, '') || ' ' || coalesce(last_name_value, ''))
    )
  );
  phone_value text := public.normalize_customer_crm_phone(p_payload->>'phone');
  email_value text := public.normalize_customer_crm_email(p_payload->>'email');
  street_value text := public.clean_customer_crm_text(p_payload->>'street_address', 240);
  unit_value text := public.clean_customer_crm_text(p_payload->>'unit');
  city_value text := public.clean_customer_crm_text(p_payload->>'city');
  state_value text := public.clean_customer_crm_text(upper(p_payload->>'state'), 2);
  zip_value text := nullif(regexp_replace(coalesce(p_payload->>'zip_code', ''), '[^0-9]', '', 'g'), '');
begin
  if company_id_value is null and not public.is_admin() then
    raise exception 'A dashboard company context is required.' using errcode = '42501';
  end if;

  if p_intake_request_id is not null then
    if not exists (
      select 1
      from public.intake_requests ir
      where ir.id = p_intake_request_id
        and (
          (ir.company_id is not null and public.can_view_company(ir.company_id))
          or ir.owner_profile_id = auth.uid()
        )
    ) then
      raise exception 'Intake is not accessible.' using errcode = '42501';
    end if;
  end if;

  if phone_value is not null then
    select id, 'phone'
    into customer_id_value, matched_reason
    from public.customers
    where public.normalize_customer_crm_phone(phone) = phone_value
      and (company_id is null or company_id = company_id_value or public.can_view_customer(id))
    order by created_at
    limit 1;
  end if;

  if customer_id_value is null and email_value is not null then
    select id, 'email'
    into customer_id_value, matched_reason
    from public.customers
    where public.normalize_customer_crm_email(email) = email_value
      and (company_id is null or company_id = company_id_value or public.can_view_customer(id))
    order by created_at
    limit 1;
  end if;

  if customer_id_value is null
     and (phone_value is not null or email_value is not null)
     and street_value is not null
     and zip_value is not null then
    select c.id,
      case when phone_value is not null then 'phone_address' else 'email_address' end
    into customer_id_value, matched_reason
    from public.customers c
    join public.customer_addresses ca on ca.customer_id = c.id
    where ca.zip_code = zip_value
      and lower(coalesce(ca.street_address, '')) = lower(street_value)
      and (
        (phone_value is not null and public.normalize_customer_crm_phone(c.phone) = phone_value)
        or (email_value is not null and public.normalize_customer_crm_email(c.email) = email_value)
      )
    order by c.created_at
    limit 1;
  end if;

  if customer_id_value is null
     and full_name_value is not null
     and street_value is not null
     and zip_value is not null then
    select c.id, 'name_address_review'
    into customer_id_value, matched_reason
    from public.customers c
    join public.customer_addresses ca on ca.customer_id = c.id
    where ca.zip_code = zip_value
      and lower(coalesce(ca.street_address, '')) = lower(street_value)
      and lower(c.full_name) = lower(full_name_value)
    order by c.created_at
    limit 1;

    review_required := customer_id_value is not null;
  end if;

  if customer_id_value is null then
    select (public.upsert_dashboard_customer_rpc(null, jsonb_build_object(
      'first_name', first_name_value,
      'last_name', last_name_value,
      'full_name', full_name_value,
      'phone', phone_value,
      'email', email_value,
      'customer_status', 'active'
    ))->>'customer_id')::uuid
    into customer_id_value;

    matched_reason := 'created';
  end if;

  if street_value is not null or zip_value is not null then
    perform public.upsert_customer_address_rpc(customer_id_value, null, jsonb_build_object(
      'label', 'Primary',
      'street_address', street_value,
      'unit', unit_value,
      'city', city_value,
      'state', coalesce(state_value, 'TX'),
      'zip_code', zip_value,
      'country', coalesce(public.clean_customer_crm_text(upper(p_payload->>'country'), 2), 'US'),
      'is_primary', true
    ));
  end if;

  if p_intake_request_id is not null then
    update public.intake_requests
    set linked_customer_id = customer_id_value,
        status = case
          when status in ('new', 'reviewed', 'needs_info') then 'customer_matched'
          else status
        end,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_intake_request_id;
  end if;

  return jsonb_build_object(
    'customer_id', customer_id_value,
    'confidence', case
      when matched_reason in ('phone', 'email', 'phone_address', 'email_address') then 'high'
      when matched_reason = 'name_address_review' then 'medium'
      else 'new'
    end,
    'reason', matched_reason,
    'review_required', review_required,
    'created', matched_reason = 'created'
  );
end;
$$;

alter table public.customer_addresses enable row level security;
alter table public.customer_internal_notes enable row level security;

drop policy if exists "customer_addresses_dashboard_read" on public.customer_addresses;
create policy "customer_addresses_dashboard_read"
on public.customer_addresses
for select
to authenticated
using (public.can_view_customer(customer_id));

drop policy if exists "customer_internal_notes_dashboard_read" on public.customer_internal_notes;
create policy "customer_internal_notes_dashboard_read"
on public.customer_internal_notes
for select
to authenticated
using (public.can_manage_customer_crm(customer_id));

grant select on public.customers to authenticated;
grant select on public.customer_addresses to authenticated;
grant select on public.customer_internal_notes to authenticated;

revoke execute on function public.current_dashboard_company_id() from public;
grant execute on function public.current_dashboard_company_id() to authenticated;

revoke execute on function public.can_manage_customer_crm(uuid) from public;
grant execute on function public.can_manage_customer_crm(uuid) to authenticated;

revoke execute on function public.upsert_dashboard_customer_rpc(uuid, jsonb) from public;
grant execute on function public.upsert_dashboard_customer_rpc(uuid, jsonb) to authenticated;

revoke execute on function public.upsert_customer_address_rpc(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_customer_address_rpc(uuid, uuid, jsonb) to authenticated;

revoke execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_customer_appliance_rpc(uuid, uuid, jsonb) to authenticated;

revoke execute on function public.add_customer_internal_note_rpc(uuid, text, text) from public;
grant execute on function public.add_customer_internal_note_rpc(uuid, text, text) to authenticated;

revoke execute on function public.match_or_create_customer_for_intake_rpc(uuid, jsonb) from public;
grant execute on function public.match_or_create_customer_for_intake_rpc(uuid, jsonb) to authenticated;

comment on table public.customer_addresses is
  'Task 155 internal Customer CRM addresses. Dashboard-managed customer service addresses; customer portal/property model remains future work.';

comment on table public.customer_internal_notes is
  'Task 155 internal Customer CRM notes. Dispatcher/technician-only notes, not customer-facing.';

comment on function public.match_or_create_customer_for_intake_rpc(uuid, jsonb) is
  'Task 155 source-neutral customer matching/creation helper for phone, SMS, website chat, email, Yelp, Thumbtack, manual, and future intake sources.';
