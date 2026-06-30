-- 0039_customer_repair_detail_update_apply_ready.sql
-- Task 147 follow-up: customer repair detail updates.
--
-- Purpose:
--   Let an authenticated customer update only their own customer-facing repair
--   problem details before technician work begins. This does not allow customer
--   status changes, technician reassignment, appointment edits, or CRM-only
--   field updates.

create or replace function public.update_customer_repair_details_rpc(
  p_service_request_id uuid,
  p_problem_description text,
  p_customer_notes text default null
)
returns public.service_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_row public.customers;
  request_row public.service_requests;
  issue_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if nullif(trim(p_problem_description), '') is null then
    raise exception 'Problem details are required.'
      using errcode = '22023';
  end if;

  select *
  into customer_row
  from public.customers
  where auth_user_id = auth.uid()
    and customer_status = 'active'
  limit 1;

  if not found then
    raise exception 'Customer account is not linked.'
      using errcode = '42501';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id
    and customer_id = customer_row.id
  for update;

  if not found then
    raise exception 'Customer repair is not accessible.'
      using errcode = '42501';
  end if;

  if request_row.status::text not in (
    'new',
    'contacted',
    'scheduled',
    'waiting_customer'
  ) then
    raise exception 'This repair cannot be edited from the customer portal.'
      using errcode = '42501';
  end if;

  issue_body := trim(p_problem_description);

  if nullif(trim(coalesce(p_customer_notes, '')), '') is not null then
    issue_body := issue_body || E'\n\nCustomer notes: ' || trim(p_customer_notes);
  end if;

  update public.service_requests
  set
    issue_description = issue_body,
    updated_at = now()
  where id = request_row.id
  returning * into request_row;

  return request_row;
end;
$$;

comment on function public.update_customer_repair_details_rpc(uuid, text, text) is
  'Task 147 follow-up. Allows authenticated customers to update only their own repair problem details before technician work begins.';

revoke execute on function public.update_customer_repair_details_rpc(uuid, text, text) from public;
grant execute on function public.update_customer_repair_details_rpc(uuid, text, text) to authenticated;
