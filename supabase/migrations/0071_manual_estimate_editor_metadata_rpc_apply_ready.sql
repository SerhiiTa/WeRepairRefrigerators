-- Task 168.5D: Manual Estimate editor metadata persistence.
--
-- Purpose:
--   The compact Manual Estimate editor stores editor-only text such as
--   "What we found", "Repair solution", warranty, and estimated completion in
--   existing service_request_estimates fields. Estimate creation and line-item
--   persistence already use company-scoped SECURITY DEFINER RPCs; this adds the
--   same narrow authorization model for metadata updates.
--
-- Scope:
--   - No table or schema changes.
--   - No RLS disablement.
--   - No anon/authenticated table write grants.
--   - Updates draft estimate metadata only after validating the authenticated
--     dashboard user's access to the estimate's company/service request.

create or replace function public.update_service_request_estimate_editor_metadata_rpc(
  p_estimate_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_company_id uuid;
  v_status text;
  v_customer_preview_notes text;
  v_warranty_text text;
  v_disclaimer_text text;
begin
  if auth.uid() is null then
    raise exception 'Authenticated profile is required.';
  end if;

  select e.service_request_id, e.estimate_status, sr.company_id
  into v_request_id, v_status, v_company_id
  from public.service_request_estimates e
  join public.service_requests sr on sr.id = e.service_request_id
  where e.id = p_estimate_id;

  if v_request_id is null then
    raise exception 'Estimate not found.';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft estimates can be updated.';
  end if;

  if v_company_id is not null then
    if not public.user_can_access_company(v_company_id) then
      raise exception 'Estimate is not accessible.';
    end if;
  elsif not public.can_view_service_request(v_request_id) then
    raise exception 'Estimate is not accessible.';
  end if;

  v_customer_preview_notes := nullif(
    left(
      coalesce(
        p_metadata->>'customerPreviewNotes',
        p_metadata->>'customer_preview_notes',
        ''
      ),
      1500
    ),
    ''
  );
  v_warranty_text := nullif(
    left(coalesce(p_metadata->>'warrantyText', p_metadata->>'warranty_text', ''), 1500),
    ''
  );
  v_disclaimer_text := nullif(
    left(
      coalesce(p_metadata->>'disclaimerText', p_metadata->>'disclaimer_text', ''),
      1500
    ),
    ''
  );

  update public.service_request_estimates
  set customer_preview_notes = v_customer_preview_notes,
      warranty_text = v_warranty_text,
      disclaimer_text = v_disclaimer_text,
      updated_at = now()
  where id = p_estimate_id;

  return jsonb_build_object(
    'id', p_estimate_id,
    'service_request_id', v_request_id,
    'estimate_status', v_status,
    'metadata_saved', true
  );
end;
$$;

revoke all on function public.update_service_request_estimate_editor_metadata_rpc(uuid, jsonb) from public;
grant execute on function public.update_service_request_estimate_editor_metadata_rpc(uuid, jsonb) to authenticated;

comment on function public.update_service_request_estimate_editor_metadata_rpc(uuid, jsonb) is
  'Task 168.5D. Safely updates compact Manual Estimate editor metadata for draft estimates after authenticated company/service-request access validation.';
