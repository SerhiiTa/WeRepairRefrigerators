-- COM-07F production hotfix: allow server-side website inbound persistence
-- to link an existing customer to an intake request after customer resolution.

grant update (
  linked_customer_id,
  status,
  updated_by
) on public.intake_requests to service_role;
