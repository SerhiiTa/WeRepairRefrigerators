-- COM-07H.2: operational Lead lifecycle fields for follow-up, notes, lost
-- reason, and company-scoped phone history.
--
-- 0094 and 0095 are prior local checkpoints. This migration is forward-only
-- and does not modify trusted booking conversion history in 0091-0093.

alter table public.communication_leads
  add column if not exists canonical_phone text,
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_note text,
  add column if not exists closed_reason text,
  add column if not exists closed_note text;

update public.communication_leads
set canonical_phone = public.normalize_customer_crm_phone(customer_phone)
where canonical_phone is null
  and customer_phone is not null;

create index if not exists communication_leads_company_canonical_phone_idx
  on public.communication_leads (company_id, canonical_phone, created_at desc)
  where canonical_phone is not null;

create index if not exists communication_leads_company_follow_up_idx
  on public.communication_leads (company_id, follow_up_at, created_at desc)
  where follow_up_at is not null
    and status in ('open', 'reviewed');

create or replace function public.set_communication_lead_canonical_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.canonical_phone := public.normalize_customer_crm_phone(new.customer_phone);
  return new;
end;
$$;

drop trigger if exists set_communication_lead_canonical_phone on public.communication_leads;
create trigger set_communication_lead_canonical_phone
before insert or update of customer_phone on public.communication_leads
for each row
execute function public.set_communication_lead_canonical_phone();

create table if not exists public.communication_lead_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.communication_leads(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.communication_lead_notes is
  'Internal durable notes for CRM communication leads. Notes do not create communication messages.';

create index if not exists communication_lead_notes_lead_created_idx
  on public.communication_lead_notes (lead_id, created_at desc);

alter table public.communication_lead_notes enable row level security;

revoke all on public.communication_lead_notes from public;
revoke all on public.communication_lead_notes from anon;
grant select on public.communication_lead_notes to authenticated;

drop policy if exists "communication_lead_notes_dashboard_select" on public.communication_lead_notes;
create policy "communication_lead_notes_dashboard_select"
on public.communication_lead_notes
for select
to authenticated
using (public.can_access_communication_lead(lead_id));

create or replace function public.set_communication_lead_follow_up_rpc(
  p_lead_id uuid,
  p_follow_up_at timestamptz,
  p_note text default null
)
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

  if lead_row.status in ('converted', 'closed', 'spam', 'archived') then
    raise exception 'Follow-up can only be scheduled for an active Lead.' using errcode = '22023';
  end if;

  update public.communication_leads
  set
    follow_up_at = p_follow_up_at,
    follow_up_note = nullif(trim(coalesce(p_note, '')), ''),
    status = case when status = 'open' and p_follow_up_at is not null then 'reviewed' else status end,
    updated_by = auth.uid()
  where id = p_lead_id
  returning * into lead_row;

  return jsonb_build_object(
    'ok', true,
    'lead_id', lead_row.id,
    'follow_up_at', lead_row.follow_up_at
  );
end;
$$;

revoke execute on function public.set_communication_lead_follow_up_rpc(uuid, timestamptz, text) from public;
grant execute on function public.set_communication_lead_follow_up_rpc(uuid, timestamptz, text) to authenticated;

create or replace function public.add_communication_lead_note_rpc(
  p_lead_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.communication_leads;
  note_row public.communication_lead_notes;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'Note is required.' using errcode = '22023';
  end if;

  select *
  into lead_row
  from public.communication_leads
  where id = p_lead_id;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if not public.can_access_communication_lead(p_lead_id) then
    raise exception 'Lead is not accessible for this account.' using errcode = '42501';
  end if;

  insert into public.communication_lead_notes (
    company_id,
    lead_id,
    body,
    created_by
  ) values (
    lead_row.company_id,
    lead_row.id,
    trim(p_body),
    auth.uid()
  )
  returning * into note_row;

  return jsonb_build_object(
    'ok', true,
    'note_id', note_row.id,
    'lead_id', lead_row.id
  );
end;
$$;

revoke execute on function public.add_communication_lead_note_rpc(uuid, text) from public;
grant execute on function public.add_communication_lead_note_rpc(uuid, text) to authenticated;

create or replace function public.close_communication_lead_with_reason_rpc(
  p_lead_id uuid,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.communication_leads;
  allowed_reasons text[] := array[
    'No response',
    'Price',
    'Outside service area',
    'Duplicate',
    'Spam',
    'Customer declined',
    'Other'
  ];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if p_reason is null or p_reason <> all(allowed_reasons) then
    raise exception 'A valid close reason is required.' using errcode = '22023';
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
    closed_reason = p_reason,
    closed_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_by = auth.uid()
  where id = p_lead_id
  returning * into lead_row;

  return jsonb_build_object(
    'ok', true,
    'lead_id', lead_row.id,
    'status', lead_row.status,
    'closed_reason', lead_row.closed_reason
  );
end;
$$;

revoke execute on function public.close_communication_lead_with_reason_rpc(uuid, text, text) from public;
grant execute on function public.close_communication_lead_with_reason_rpc(uuid, text, text) to authenticated;
