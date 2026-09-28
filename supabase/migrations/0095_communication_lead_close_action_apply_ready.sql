-- COM-07H.1: minimum operational Lead workflow close/lost action.
--
-- 0094 is Production history. This migration adds only the explicit
-- Close/Lost Lead action. Closing a Lead does not create a Customer, Job, or
-- Customer Address.

create or replace function public.close_communication_lead_rpc(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.communication_leads;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into lead_row
  from public.communication_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if not public.can_access_communication_lead(p_lead_id) then
    raise exception 'Lead is not accessible for this account.' using errcode = '42501';
  end if;

  if lead_row.status = 'converted' or lead_row.service_request_id is not null then
    return jsonb_build_object(
      'ok', true,
      'lead_id', lead_row.id,
      'status', lead_row.status,
      'already_converted', true
    );
  end if;

  update public.communication_leads
  set
    status = 'closed',
    updated_by = auth.uid()
  where id = p_lead_id
  returning * into lead_row;

  return jsonb_build_object(
    'ok', true,
    'lead_id', lead_row.id,
    'status', lead_row.status
  );
end;
$$;

revoke execute on function public.close_communication_lead_rpc(uuid) from public;
grant execute on function public.close_communication_lead_rpc(uuid) to authenticated;
