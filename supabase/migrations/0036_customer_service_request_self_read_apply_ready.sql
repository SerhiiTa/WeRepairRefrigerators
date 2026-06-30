-- 0036_customer_service_request_self_read_apply_ready.sql
-- Task 146: Customer portal service request read policy.
--
-- Apply manually in Supabase SQL Editor after 0035.
-- This migration lets authenticated customer accounts read service requests
-- linked to their own customer profile. It does not allow anonymous reads,
-- does not add writes, and does not weaken dashboard technician RLS.

create or replace function public.can_view_own_customer_service_request(
  target_service_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.service_requests sr
    join public.customers c on c.id = sr.customer_id
    where sr.id = target_service_request_id
      and c.auth_user_id = auth.uid()
      and c.customer_status = 'active'
  );
$$;

comment on function public.can_view_own_customer_service_request(uuid) is
  'Task 146 helper. Allows authenticated customers to read service requests linked to their own active customer profile.';

revoke execute on function public.can_view_own_customer_service_request(uuid) from public;
grant execute on function public.can_view_own_customer_service_request(uuid) to authenticated;

alter table public.service_requests enable row level security;

grant select on public.service_requests to authenticated;
revoke select on public.service_requests from anon;

drop policy if exists "service_requests_customer_self_select" on public.service_requests;
create policy "service_requests_customer_self_select"
on public.service_requests
for select
to authenticated
using (public.can_view_own_customer_service_request(id));

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
  v_request_source text;
begin
  v_customer_id := public.find_or_create_customer_for_request_rpc(
    p_customer_first_name,
    p_customer_last_name,
    p_customer_phone,
    p_customer_email
  );

  v_request_source := coalesce(nullif(trim(p_request_source), ''), 'schedule_service');

  if v_request_source not in (
    'schedule_service',
    'technician_profile',
    'homepage_cta',
    'zip_search',
    'brand_page',
    'service_page',
    'location_page',
    'other'
  ) then
    v_request_source := 'schedule_service';
  end if;

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
    v_request_source,
    'new'
  );

  return jsonb_build_object(
    'ok', true,
    'customer_id', v_customer_id,
    'service_request_id', v_request_id
  );
end;
$$;

comment on function public.create_service_request_with_customer_rpc(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Task 146 patch. Creates customer-linked service requests and normalizes unsupported customer request sources to schedule_service.';

revoke execute on function public.create_service_request_with_customer_rpc(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_service_request_with_customer_rpc(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
