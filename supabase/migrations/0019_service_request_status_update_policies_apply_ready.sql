-- Task 94: Safe service request status updates.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add the first real CRM mutation for service_requests without granting broad
--   table UPDATE access to browser clients.
--
-- Security model:
--   - Anonymous users cannot update service_requests.
--   - Authenticated dashboard users call a narrow RPC.
--   - The RPC reuses public.can_view_service_request(request_id), so admins can
--     update all requests and eligible technician/company-owner roles can update
--     only requests selected for their own public technician slug.
--   - Only status and updated_at are updated.
--   - Customer contact, issue, location, technician slug, and source fields are
--     not client-writable through this workflow.

alter table public.service_requests
  drop constraint if exists service_requests_status_check;

alter table public.service_requests
  add constraint service_requests_status_check
  check (status in (
    'new',
    'contacted',
    'scheduled',
    'completed',
    'canceled',
    -- Legacy/dev values retained so older verification rows do not block
    -- migration application. The app/RPC below only writes the five CRM values.
    'reviewed',
    'lead_created',
    'archived',
    'spam'
  ));

create or replace function public.update_service_request_status_rpc(
  p_request_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_request public.service_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if p_next_status not in ('new', 'contacted', 'scheduled', 'completed', 'canceled') then
    raise exception 'Invalid service request status.'
      using errcode = '22023';
  end if;

  if not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  update public.service_requests
  set
    status = p_next_status,
    updated_at = now()
  where id = p_request_id
  returning * into updated_request;

  if not found then
    raise exception 'Service request was not found.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', updated_request.id,
    'status', updated_request.status,
    'updated_at', updated_request.updated_at
  );
end;
$$;

comment on function public.update_service_request_status_rpc(uuid, text) is
  'Task 94 RPC. Updates only service_requests.status and updated_at after checking authenticated dashboard visibility.';

revoke all on function public.update_service_request_status_rpc(uuid, text) from public;
grant execute on function public.update_service_request_status_rpc(uuid, text) to authenticated;

-- No service_requests UPDATE grant or UPDATE policy is added here. The RPC is
-- intentionally the only browser-callable status mutation path for this task.
