-- FINANCE-V2-38
-- Narrow RPC for authenticated Estimate editors to persist draft-only deposit
-- configuration without granting broad table UPDATE on service_request_estimates.

create or replace function public.update_service_request_estimate_deposit_settings_rpc(
  p_estimate_id uuid,
  p_deposit_type text default null,
  p_deposit_value numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_request_id uuid;
  v_company_id uuid;
  v_status text;
  v_total numeric(10, 2);
  v_deposit_type text := nullif(trim(coalesce(p_deposit_type, '')), '');
  v_deposit_value numeric(10, 2);
begin
  select p.id
  into v_profile_id
  from public.profiles p
  where p.id = auth.uid();

  if v_profile_id is null then
    raise exception 'Authenticated profile is required.';
  end if;

  select e.service_request_id, e.estimate_status, e.total, sr.company_id
  into v_request_id, v_status, v_total, v_company_id
  from public.service_request_estimates e
  join public.service_requests sr on sr.id = e.service_request_id
  where e.id = p_estimate_id;

  if v_request_id is null then
    raise exception 'Estimate not found.';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft estimates can update deposit settings.';
  end if;

  if v_company_id is not null then
    if not public.user_can_access_company(v_company_id) then
      raise exception 'Estimate is not accessible.';
    end if;
  elsif not public.can_view_service_request(v_request_id) then
    raise exception 'Estimate is not accessible.';
  end if;

  if v_deposit_type is null then
    update public.service_request_estimates
    set deposit_type = null,
        deposit_value = null,
        updated_at = now()
    where id = p_estimate_id;
  else
    if v_deposit_type not in ('fixed', 'percent') then
      raise exception 'Deposit type must be fixed, percent or null.';
    end if;

    if p_deposit_value is null or p_deposit_value <= 0 then
      raise exception 'Deposit value must be greater than zero.';
    end if;

    v_deposit_value := round(p_deposit_value, 2);

    if v_deposit_type = 'fixed' and v_deposit_value > coalesce(v_total, 0) then
      raise exception 'Fixed deposit cannot exceed the Estimate total.';
    end if;

    if v_deposit_type = 'percent' and v_deposit_value > 100 then
      raise exception 'Deposit percentage cannot exceed 100%%.';
    end if;

    update public.service_request_estimates
    set deposit_type = v_deposit_type,
        deposit_value = v_deposit_value,
        updated_at = now()
    where id = p_estimate_id;
  end if;

  return (
    select jsonb_build_object(
      'id', e.id,
      'deposit_type', e.deposit_type,
      'deposit_value', e.deposit_value,
      'estimate_status', e.estimate_status,
      'total', e.total
    )
    from public.service_request_estimates e
    where e.id = p_estimate_id
  );
end;
$$;

comment on function public.update_service_request_estimate_deposit_settings_rpc(uuid, text, numeric) is
  'FINANCE-V2-38. Persists fixed/percent/null deposit settings for draft Estimates after normal Estimate editor authorization.';

revoke all on function public.update_service_request_estimate_deposit_settings_rpc(uuid, text, numeric) from public;
grant execute on function public.update_service_request_estimate_deposit_settings_rpc(uuid, text, numeric) to authenticated;
