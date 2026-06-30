-- Task 148.4: Estimate Agent Intelligence Improvements
-- Forward-only foundation for archived draft estimates and structured estimate
-- decision events. This does not train AI models and does not call providers.

alter table public.service_request_estimates
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

comment on column public.service_request_estimates.archived_at is
  'Internal archive timestamp for draft estimates. Existing estimate_status=void remains for lifecycle compatibility.';
comment on column public.service_request_estimates.archive_reason is
  'Optional internal reason for archiving a draft estimate.';

create table if not exists public.estimate_learning_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete cascade,
  estimate_id uuid references public.service_request_estimates(id) on delete cascade,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type in (
      'draft_generated',
      'draft_saved',
      'draft_updated',
      'draft_sent',
      'draft_archived',
      'line_adjusted'
    )),
  diagnosis_text text,
  repair_scope jsonb not null default '{}'::jsonb,
  line_decisions jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  decision_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.estimate_learning_events is
  'Structured estimate decision records for future Estimate Learning Engine work. This table does not train models or call AI providers.';

create index if not exists estimate_learning_events_company_created_idx
  on public.estimate_learning_events (company_id, created_at desc);

create index if not exists estimate_learning_events_request_created_idx
  on public.estimate_learning_events (service_request_id, created_at desc)
  where service_request_id is not null;

create index if not exists estimate_learning_events_estimate_created_idx
  on public.estimate_learning_events (estimate_id, created_at desc)
  where estimate_id is not null;

alter table public.estimate_learning_events enable row level security;

revoke all on public.estimate_learning_events from public;
revoke all on public.estimate_learning_events from anon;
grant select, insert on public.estimate_learning_events to authenticated;

drop policy if exists "estimate_learning_events_company_select"
  on public.estimate_learning_events;
create policy "estimate_learning_events_company_select"
on public.estimate_learning_events
for select
to authenticated
using (public.user_can_access_company(company_id));

drop policy if exists "estimate_learning_events_company_insert"
  on public.estimate_learning_events;
create policy "estimate_learning_events_company_insert"
on public.estimate_learning_events
for insert
to authenticated
with check (public.user_can_access_company(company_id));

create or replace function public.record_estimate_learning_event_rpc(
  p_request_id uuid default null,
  p_estimate_id uuid default null,
  p_event_type text default 'draft_saved',
  p_decision_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_request_id uuid;
  v_estimate_id uuid;
  v_event_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.id = auth.uid();

  if v_profile_id is null then
    raise exception 'Authenticated profile is required.';
  end if;

  if p_event_type not in (
    'draft_generated',
    'draft_saved',
    'draft_updated',
    'draft_sent',
    'draft_archived',
    'line_adjusted'
  ) then
    raise exception 'Unsupported estimate learning event type.';
  end if;

  if p_estimate_id is not null then
    select e.id, e.service_request_id, sr.company_id
    into v_estimate_id, v_request_id, v_company_id
    from public.service_request_estimates e
    join public.service_requests sr on sr.id = e.service_request_id
    where e.id = p_estimate_id;
  elsif p_request_id is not null then
    select sr.id, sr.company_id
    into v_request_id, v_company_id
    from public.service_requests sr
    where sr.id = p_request_id;
  end if;

  if v_company_id is null then
    raise exception 'Estimate learning event target not found.';
  end if;

  if p_request_id is not null and v_request_id is not null and p_request_id <> v_request_id then
    raise exception 'Estimate learning event request mismatch.';
  end if;

  if not public.user_can_access_company(v_company_id) then
    raise exception 'Estimate learning event is not accessible.';
  end if;

  insert into public.estimate_learning_events (
    company_id,
    service_request_id,
    estimate_id,
    created_by_profile_id,
    event_type,
    diagnosis_text,
    repair_scope,
    line_decisions,
    totals,
    decision_context
  )
  values (
    v_company_id,
    v_request_id,
    v_estimate_id,
    v_profile_id,
    p_event_type,
    nullif(p_decision_context->>'diagnosisText', ''),
    coalesce(p_decision_context->'repairScope', '{}'::jsonb),
    coalesce(p_decision_context->'lineDecisions', '[]'::jsonb),
    jsonb_build_object('total', p_decision_context->'total'),
    coalesce(p_decision_context, '{}'::jsonb)
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'id', v_event_id,
    'event_type', p_event_type,
    'service_request_id', v_request_id,
    'estimate_id', v_estimate_id
  );
end;
$$;

comment on function public.record_estimate_learning_event_rpc(uuid, uuid, text, jsonb) is
  'Records structured estimate decisions for future learning. Does not train models or call external AI.';

create or replace function public.archive_service_request_estimate_draft_rpc(
  p_estimate_id uuid,
  p_archive_reason text default 'Archived from estimate workspace.'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_estimate public.service_request_estimates;
  v_company_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.id = auth.uid();

  if v_profile_id is null then
    raise exception 'Authenticated profile is required.';
  end if;

  select e.*
  into v_estimate
  from public.service_request_estimates e
  where e.id = p_estimate_id;

  if v_estimate.id is null then
    raise exception 'Estimate not found.';
  end if;

  if v_estimate.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be archived.';
  end if;

  select sr.company_id into v_company_id
  from public.service_requests sr
  where sr.id = v_estimate.service_request_id;

  if v_company_id is null or not public.user_can_access_company(v_company_id) then
    raise exception 'Estimate is not accessible.';
  end if;

  update public.service_request_estimates
  set
    estimate_status = 'void',
    archived_at = now(),
    archived_by_profile_id = v_profile_id,
    archive_reason = nullif(btrim(coalesce(p_archive_reason, '')), ''),
    updated_at = now()
  where id = p_estimate_id;

  insert into public.service_request_notes (
    service_request_id,
    created_by_profile_id,
    note_type,
    body
  )
  values (
    v_estimate.service_request_id,
    v_profile_id,
    'estimate',
    'Draft estimate ' || v_estimate.estimate_number || ' was archived.'
  );

  perform public.record_estimate_learning_event_rpc(
    v_estimate.service_request_id,
    p_estimate_id,
    'draft_archived',
    jsonb_build_object(
      'archiveReason', coalesce(p_archive_reason, 'Archived from estimate workspace.'),
      'estimateNumber', v_estimate.estimate_number
    )
  );

  return jsonb_build_object(
    'id', p_estimate_id,
    'estimate_number', v_estimate.estimate_number,
    'estimate_status', 'void',
    'archived_at', now()
  );
end;
$$;

comment on function public.archive_service_request_estimate_draft_rpc(uuid, text) is
  'Archives a draft estimate without deleting it. Keeps estimate_status=void for existing lifecycle compatibility.';

revoke all on function public.record_estimate_learning_event_rpc(uuid, uuid, text, jsonb) from public;
revoke all on function public.archive_service_request_estimate_draft_rpc(uuid, text) from public;

grant execute on function public.record_estimate_learning_event_rpc(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.archive_service_request_estimate_draft_rpc(uuid, text) to authenticated;
