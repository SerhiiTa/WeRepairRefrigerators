-- COM-07F: Canonical Customer phone matching for trusted inbound website requests.
--
-- Purpose:
-- - Make existing Customer CRM matching treat common US phone variants as the
--   same number:
--     13463818094
--     +13463818094
--     3463818094
--     346-381-8094
--     (346) 381-8094
--     +1 346 381 8094
-- - Preserve non-US/international behavior by only stripping the leading "1"
--   when an 11-digit number has the US country-code shape.
-- - Allow the server-side trusted website inbound persistence path to resolve
--   existing customers without creating new Customer records automatically.

create or replace function public.normalize_customer_crm_phone(input_phone text)
returns text
language sql
immutable
as $$
  with digits as (
    select nullif(regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g'), '') as value
  )
  select case
    when value is null then null
    when length(value) = 11 and left(value, 1) = '1' then right(value, 10)
    else value
  end
  from digits;
$$;

create or replace function public.resolve_existing_customer_for_inbound_rpc(
  p_company_id uuid,
  p_phone text default null,
  p_email text default null
)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      public.normalize_customer_crm_phone(p_phone) as phone_value,
      public.normalize_customer_crm_email(p_email) as email_value
  )
  select c.id, c.full_name, c.phone, c.email
  from public.customers c, normalized n
  where c.company_id = p_company_id
    and (
      (n.phone_value is not null and public.normalize_customer_crm_phone(c.phone) = n.phone_value)
      or (
        n.phone_value is null
        and n.email_value is not null
        and public.normalize_customer_crm_email(c.email) = n.email_value
      )
    )
  order by c.created_at
  limit 1;
$$;

revoke execute on function public.resolve_existing_customer_for_inbound_rpc(uuid, text, text)
  from public;
grant execute on function public.resolve_existing_customer_for_inbound_rpc(uuid, text, text)
  to service_role;

comment on function public.normalize_customer_crm_phone(text) is
  'Normalizes Customer CRM phone values for matching. US 10-digit and +1/leading-1 variants normalize to the same 10-digit national number; other digit strings are preserved.';

comment on function public.resolve_existing_customer_for_inbound_rpc(uuid, text, text) is
  'Service-role helper for trusted inbound persistence. Resolves an existing company Customer by canonical phone, or by email when no phone is supplied. Does not create Customers.';
