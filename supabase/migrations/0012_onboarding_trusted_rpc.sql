-- WeRepairRefrigerators Task 76 dev/staging migration.
--
-- Purpose:
-- Add narrow trusted RPC transactions for onboarding mutations that normal
-- browser-scoped RLS intentionally blocks.
--
-- Scope:
-- - Current confirmed dev/staging Supabase project only.
-- - Does not expose service_role behavior to frontend code.
-- - Keeps privileged writes inside authenticated SECURITY DEFINER functions.
-- - Returns only minimal safe IDs/status fields.

-- ---------------------------------------------------------------------------
-- Trusted onboarding trigger bypass
-- ---------------------------------------------------------------------------

create or replace function public.prevent_unsafe_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.trusted_onboarding_mutation', true), 'off') = 'on' then
    return new;
  end if;

  if public.current_app_role() = 'admin' then
    return new;
  end if;

  if old.id <> new.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if old.role is distinct from new.role then
    raise exception 'Profile role changes require admin review';
  end if;

  if old.status is distinct from new.status then
    raise exception 'Profile status changes require admin review';
  end if;

  if old.company_id is distinct from new.company_id then
    raise exception 'Company assignment changes require admin review';
  end if;

  if old.role_intent is distinct from new.role_intent then
    raise exception 'Role intent changes require admin review';
  end if;

  return new;
end;
$$;

comment on function public.prevent_unsafe_profile_updates() is
  'Task 76 update. Blocks protected profile changes except active admin updates or narrowly scoped trusted onboarding RPC transactions.';

create or replace function public.prevent_unsafe_onboarding_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.trusted_onboarding_mutation', true), 'off') = 'on' then
    return new;
  end if;

  if public.current_app_role() = 'admin' then
    return new;
  end if;

  if old.onboarding_status is distinct from new.onboarding_status then
    raise exception 'Onboarding status changes require reviewed server/admin flow';
  end if;

  if old.onboarding_completed_at is distinct from new.onboarding_completed_at then
    raise exception 'Onboarding completion changes require reviewed server/admin flow';
  end if;

  return new;
end;
$$;

comment on function public.prevent_unsafe_onboarding_profile_updates() is
  'Task 76 update. Blocks protected onboarding field changes except active admin updates or narrowly scoped trusted onboarding RPC transactions.';

-- ---------------------------------------------------------------------------
-- create_company_and_owner_membership_rpc
-- ---------------------------------------------------------------------------

create or replace function public.create_company_and_owner_membership_rpc(
  p_company_name text,
  p_slug text,
  p_primary_city text default null,
  p_primary_state text default 'TX',
  p_business_email text default null,
  p_business_phone text default null,
  p_website_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_company_id uuid;
  v_membership_id uuid;
  v_now timestamptz := now();
  v_company_name text := nullif(btrim(p_company_name), '');
  v_slug text := lower(nullif(btrim(p_slug), ''));
  v_primary_state text := upper(coalesce(nullif(btrim(p_primary_state), ''), 'TX'));
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile row is required'
      using errcode = '42501';
  end if;

  if v_profile.status not in ('active', 'verified') then
    raise exception 'Active profile is required'
      using errcode = '42501';
  end if;

  if v_profile.role not in ('company_owner', 'admin') then
    raise exception 'Only active company owners or admins can create a company'
      using errcode = '42501';
  end if;

  if v_company_name is null or length(v_company_name) < 2 then
    raise exception 'Company name is required';
  end if;

  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Company slug must contain lowercase letters, numbers, and hyphens only';
  end if;

  if v_primary_state !~ '^[A-Z]{2}$' then
    raise exception 'Primary state must be a two-letter state code';
  end if;

  if p_business_email is not null
    and btrim(p_business_email) <> ''
    and btrim(p_business_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Business email is not valid';
  end if;

  if exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.profile_id = v_user_id
      and cm.member_role = 'owner'
      and cm.member_status = 'active'
      and cm.archived_at is null
      and c.status in ('pending', 'active')
      and c.archived_at is null
  ) then
    raise exception 'Profile already owns an active or pending company';
  end if;

  perform set_config('app.trusted_onboarding_mutation', 'on', true);

  insert into public.companies (
    owner_profile_id,
    name,
    slug,
    primary_city,
    primary_state,
    business_phone,
    business_email,
    website_url,
    status,
    onboarding_status,
    created_by_profile_id,
    reviewed_by_profile_id,
    reviewed_at
  )
  values (
    v_user_id,
    v_company_name,
    v_slug,
    nullif(btrim(p_primary_city), ''),
    v_primary_state,
    nullif(btrim(p_business_phone), ''),
    nullif(btrim(p_business_email), ''),
    nullif(btrim(p_website_url), ''),
    'active',
    'company_ready',
    v_user_id,
    v_user_id,
    v_now
  )
  returning id into v_company_id;

  insert into public.company_members (
    company_id,
    profile_id,
    member_role,
    member_status,
    joined_at,
    notes
  )
  values (
    v_company_id,
    v_user_id,
    'owner',
    'active',
    v_now,
    null
  )
  returning id into v_membership_id;

  update public.profiles
  set
    company_id = v_company_id,
    onboarding_status = 'complete',
    onboarding_completed_at = coalesce(onboarding_completed_at, v_now),
    updated_at = v_now
  where id = v_user_id;

  insert into public.audit_logs (
    event_type,
    actor_user_id,
    actor_profile_id,
    target_user_id,
    target_profile_id,
    company_id,
    related_table,
    related_entity_id,
    related_entity_label,
    action_source,
    metadata
  )
  values
    (
      'company_created',
      v_user_id,
      v_user_id,
      v_user_id,
      v_user_id,
      v_company_id,
      'companies',
      v_company_id,
      v_slug,
      'database_trigger',
      jsonb_build_object('source', 'create_company_and_owner_membership_rpc')
    ),
    (
      'company_member_added',
      v_user_id,
      v_user_id,
      v_user_id,
      v_user_id,
      v_company_id,
      'company_members',
      v_membership_id,
      'owner',
      'database_trigger',
      jsonb_build_object('member_role', 'owner', 'source', 'create_company_and_owner_membership_rpc')
    ),
    (
      'onboarding_completed',
      v_user_id,
      v_user_id,
      v_user_id,
      v_user_id,
      v_company_id,
      'profiles',
      v_user_id,
      'company_owner',
      'database_trigger',
      jsonb_build_object('onboarding_status', 'complete', 'source', 'create_company_and_owner_membership_rpc')
    );

  return jsonb_build_object(
    'company_id', v_company_id,
    'membership_id', v_membership_id,
    'profile_id', v_user_id,
    'company_status', 'active',
    'onboarding_status', 'complete',
    'audit_status', 'written'
  );
end;
$$;

comment on function public.create_company_and_owner_membership_rpc(text, text, text, text, text, text, text) is
  'Task 76 trusted onboarding RPC. Creates a company, owner membership, protected profile onboarding update, and sanitized audit logs for the authenticated caller only.';

-- ---------------------------------------------------------------------------
-- complete_onboarding_rpc
-- ---------------------------------------------------------------------------

create or replace function public.complete_onboarding_rpc()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_now timestamptz := now();
  v_next_status public.onboarding_status;
  v_completed_at timestamptz := null;
  v_company_id uuid := null;
  v_technician_profile_id uuid := null;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile row is required'
      using errcode = '42501';
  end if;

  if v_profile.status not in ('active', 'verified') then
    raise exception 'Active profile is required'
      using errcode = '42501';
  end if;

  if v_profile.role = 'customer' then
    v_next_status := 'complete';
    v_completed_at := coalesce(v_profile.onboarding_completed_at, v_now);
  elsif v_profile.role in ('technician', 'verified_technician', 'expert_technician') then
    select id
    into v_technician_profile_id
    from public.technician_profiles
    where profile_id = v_user_id
      and archived_at is null
    limit 1;

    if v_technician_profile_id is null then
      v_next_status := 'technician_profile_required';
    elsif v_profile.role in ('verified_technician', 'expert_technician') then
      v_next_status := 'complete';
      v_completed_at := coalesce(v_profile.onboarding_completed_at, v_now);
    else
      v_next_status := 'technician_verification_pending';
    end if;
  elsif v_profile.role = 'company_owner' then
    select cm.company_id
    into v_company_id
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.profile_id = v_user_id
      and cm.member_role = 'owner'
      and cm.member_status = 'active'
      and cm.archived_at is null
      and c.status = 'active'
      and c.archived_at is null
    limit 1;

    if v_company_id is null then
      v_next_status := 'company_required';
    else
      v_next_status := 'complete';
      v_completed_at := coalesce(v_profile.onboarding_completed_at, v_now);
    end if;
  elsif v_profile.role = 'admin' then
    v_next_status := 'complete';
    v_completed_at := coalesce(v_profile.onboarding_completed_at, v_now);
  else
    v_next_status := 'profile_required';
  end if;

  perform set_config('app.trusted_onboarding_mutation', 'on', true);

  update public.profiles
  set
    company_id = coalesce(v_company_id, company_id),
    onboarding_status = v_next_status,
    onboarding_completed_at = case
      when v_next_status = 'complete' then v_completed_at
      else onboarding_completed_at
    end,
    updated_at = v_now
  where id = v_user_id;

  if v_next_status = 'complete'
    and v_profile.onboarding_status is distinct from 'complete' then
    insert into public.audit_logs (
      event_type,
      actor_user_id,
      actor_profile_id,
      target_user_id,
      target_profile_id,
      company_id,
      related_table,
      related_entity_id,
      related_entity_label,
      action_source,
      metadata
    )
    values (
      'onboarding_completed',
      v_user_id,
      v_user_id,
      v_user_id,
      v_user_id,
      v_company_id,
      'profiles',
      v_user_id,
      v_profile.role::text,
      'database_trigger',
      jsonb_build_object('onboarding_status', 'complete', 'source', 'complete_onboarding_rpc')
    );
  end if;

  return jsonb_build_object(
    'profile_id', v_user_id,
    'company_id', v_company_id,
    'technician_profile_id', v_technician_profile_id,
    'onboarding_status', v_next_status,
    'onboarding_completed_at', case when v_next_status = 'complete' then v_completed_at else null end,
    'audit_status', case when v_next_status = 'complete' then 'written_if_transitioned' else 'not_written_not_complete' end
  );
end;
$$;

comment on function public.complete_onboarding_rpc() is
  'Task 76 trusted onboarding RPC. Updates protected onboarding fields for the authenticated caller without role escalation.';

revoke all on function public.create_company_and_owner_membership_rpc(text, text, text, text, text, text, text) from public;
revoke all on function public.complete_onboarding_rpc() from public;

grant execute on function public.create_company_and_owner_membership_rpc(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.complete_onboarding_rpc() to authenticated;
