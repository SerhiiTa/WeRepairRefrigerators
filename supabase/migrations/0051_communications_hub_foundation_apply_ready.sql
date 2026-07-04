-- Task 151: Communications Hub foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Create the provider-neutral communications backbone that future phone, SMS,
--   website, email, Yelp, Google Business Messages, Facebook Messenger,
--   WhatsApp, Telnyx, and Retell integrations plug into.
--
-- Safety model:
--   - This does not modify authentication, auth settings, or environment keys.
--   - This does not connect production phone numbers or external providers.
--   - This does not send SMS, email, calls, AI messages, or notifications.
--   - This does not write directly to service_requests, estimates, invoices, or
--     appointments. It only stores communication history and links.
--   - Normal technician UI should show business events only, not internal
--     extraction, language, confidence, provider, or debug events.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.communication_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  primary_source_type text not null default 'manual'
    check (primary_source_type in (
      'phone',
      'sms',
      'website_form',
      'email',
      'yelp',
      'google_business_messages',
      'facebook_messenger',
      'whatsapp',
      'manual',
      'other'
    )),
  status text not null default 'open'
    check (status in ('open', 'needs_action', 'linked', 'resolved', 'archived')),
  customer_id uuid,
  intake_request_id uuid,
  service_request_id uuid,
  appointment_id uuid,
  estimate_id uuid,
  invoice_id uuid,
  payment_reference text,
  customer_display_name text,
  customer_phone text,
  customer_email text,
  service_address text,
  summary text,
  next_action text,
  last_event_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.communication_conversations is
  'Task 151 provider-neutral customer conversation record. WRA owns the business conversation; carriers/AI engines are only providers.';
comment on column public.communication_conversations.primary_source_type is
  'Business communication source type. Do not use provider-specific names in normal technician UI.';
comment on column public.communication_conversations.summary is
  'Technician-facing summary of what the customer needs.';
comment on column public.communication_conversations.next_action is
  'Technician-facing next action. Do not store internal debug/extraction detail here.';

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  source_type text not null default 'manual'
    check (source_type in (
      'phone',
      'sms',
      'website_form',
      'email',
      'yelp',
      'google_business_messages',
      'facebook_messenger',
      'whatsapp',
      'manual',
      'other'
    )),
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound', 'internal')),
  sender_role text not null default 'customer'
    check (sender_role in ('customer', 'dispatcher', 'technician', 'system')),
  sender_display_name text,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  external_message_id text,
  transcript_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.communication_messages is
  'Task 151 normalized messages/call notes/form text for a customer conversation. Provider payloads should be transformed before display.';

create table if not exists public.communication_transcripts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  source_type text not null default 'phone'
    check (source_type in (
      'phone',
      'sms',
      'website_form',
      'email',
      'yelp',
      'google_business_messages',
      'facebook_messenger',
      'whatsapp',
      'manual',
      'other'
    )),
  transcript_text text,
  speaker_segments jsonb not null default '[]'::jsonb,
  recording_reference text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.communication_transcripts is
  'Task 151 transcript foundation for future speaker-separated call/message transcripts and future recording playback references. No recording storage is implemented.';
comment on column public.communication_transcripts.speaker_segments is
  'Future speaker-separated transcript segments with timestamps. Normal UI should show human business content, not extraction/debug metadata.';

create table if not exists public.communication_timeline_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'incoming_call',
      'incoming_sms',
      'website_request',
      'incoming_email',
      'customer_replied',
      'appointment_scheduled',
      'appointment_changed',
      'estimate_sent',
      'estimate_approved',
      'invoice_sent',
      'payment_received',
      'repair_completed',
      'customer_canceled',
      'note_added'
    )),
  title text not null,
  body text,
  event_time timestamptz not null default now(),
  intake_request_id uuid,
  service_request_id uuid,
  appointment_id uuid,
  estimate_id uuid,
  invoice_id uuid,
  payment_reference text,
  created_at timestamptz not null default now()
);

comment on table public.communication_timeline_events is
  'Task 151 business-only customer conversation timeline. Do not store AI confidence, language detection, parsing, ZIP validation, or provider debug events here.';

create index if not exists communication_conversations_company_updated_idx
  on public.communication_conversations (company_id, updated_at desc)
  where company_id is not null;
create index if not exists communication_conversations_owner_updated_idx
  on public.communication_conversations (owner_profile_id, updated_at desc)
  where owner_profile_id is not null;
create index if not exists communication_conversations_customer_idx
  on public.communication_conversations (customer_id)
  where customer_id is not null;
create index if not exists communication_conversations_service_request_idx
  on public.communication_conversations (service_request_id)
  where service_request_id is not null;
create index if not exists communication_messages_conversation_time_idx
  on public.communication_messages (conversation_id, occurred_at desc);
create index if not exists communication_transcripts_conversation_created_idx
  on public.communication_transcripts (conversation_id, created_at desc);
create index if not exists communication_timeline_conversation_time_idx
  on public.communication_timeline_events (conversation_id, event_time desc);

drop trigger if exists set_communication_conversations_updated_at
  on public.communication_conversations;
create trigger set_communication_conversations_updated_at
before update on public.communication_conversations
for each row
execute function public.set_updated_at();

alter table public.communication_conversations enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_transcripts enable row level security;
alter table public.communication_timeline_events enable row level security;

revoke all on public.communication_conversations from public;
revoke all on public.communication_conversations from anon;
revoke all on public.communication_messages from public;
revoke all on public.communication_messages from anon;
revoke all on public.communication_transcripts from public;
revoke all on public.communication_transcripts from anon;
revoke all on public.communication_timeline_events from public;
revoke all on public.communication_timeline_events from anon;

grant select on public.communication_conversations to authenticated;
grant select on public.communication_messages to authenticated;
grant select on public.communication_transcripts to authenticated;
grant select on public.communication_timeline_events to authenticated;

create or replace function public.normalize_communication_source_type(
  source_value text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(source_value, 'manual'))
    when 'phone' then 'phone'
    when 'sms' then 'sms'
    when 'website_form' then 'website_form'
    when 'email' then 'email'
    when 'yelp' then 'yelp'
    when 'google_business_messages' then 'google_business_messages'
    when 'facebook_messenger' then 'facebook_messenger'
    when 'whatsapp' then 'whatsapp'
    when 'manual' then 'manual'
    else 'other'
  end;
$$;

create or replace function public.can_access_communication_conversation(
  target_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = target_conversation_id
      and auth.uid() is not null
      and (
        conversation.owner_profile_id = auth.uid()
        or conversation.created_by = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = conversation.company_id
            and cm.profile_id = auth.uid()
            and cm.member_status = 'active'
            and cm.archived_at is null
        )
      )
  );
$$;

comment on function public.can_access_communication_conversation(uuid) is
  'Task 151 helper. Checks whether the authenticated dashboard user can read a Communications Hub conversation.';

revoke execute on function public.can_access_communication_conversation(uuid) from public;
grant execute on function public.can_access_communication_conversation(uuid) to authenticated;

drop policy if exists "communication_conversations_dashboard_select"
  on public.communication_conversations;
create policy "communication_conversations_dashboard_select"
on public.communication_conversations
for select
to authenticated
using (public.can_access_communication_conversation(id));

drop policy if exists "communication_messages_dashboard_select"
  on public.communication_messages;
create policy "communication_messages_dashboard_select"
on public.communication_messages
for select
to authenticated
using (public.can_access_communication_conversation(conversation_id));

drop policy if exists "communication_transcripts_dashboard_select"
  on public.communication_transcripts;
create policy "communication_transcripts_dashboard_select"
on public.communication_transcripts
for select
to authenticated
using (public.can_access_communication_conversation(conversation_id));

drop policy if exists "communication_timeline_dashboard_select"
  on public.communication_timeline_events;
create policy "communication_timeline_dashboard_select"
on public.communication_timeline_events
for select
to authenticated
using (public.can_access_communication_conversation(conversation_id));

create or replace function public.create_communication_conversation_rpc(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  requested_company_id uuid;
  effective_company_id uuid;
  conversation_row public.communication_conversations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'Profile is required.'
      using errcode = '28000';
  end if;

  select cm.company_id
  into effective_company_id
  from public.company_members cm
  where cm.profile_id = auth.uid()
    and cm.member_status = 'active'
    and cm.archived_at is null
  order by cm.joined_at nulls last, cm.created_at
  limit 1;

  requested_company_id := nullif(p_payload->>'company_id', '')::uuid;

  if requested_company_id is not null
     and not exists (
       select 1
       from public.company_members cm
       where cm.company_id = requested_company_id
         and cm.profile_id = auth.uid()
         and cm.member_status = 'active'
         and cm.archived_at is null
     ) then
    raise exception 'Communication company is not accessible for this account.'
      using errcode = '42501';
  end if;

  effective_company_id := coalesce(requested_company_id, effective_company_id, profile_row.company_id);

  insert into public.communication_conversations (
    company_id,
    owner_profile_id,
    primary_source_type,
    status,
    customer_id,
    intake_request_id,
    service_request_id,
    appointment_id,
    estimate_id,
    invoice_id,
    payment_reference,
    customer_display_name,
    customer_phone,
    customer_email,
    service_address,
    summary,
    next_action,
    last_event_at,
    created_by,
    updated_by
  )
  values (
    effective_company_id,
    auth.uid(),
    public.normalize_communication_source_type(p_payload->>'primary_source_type'),
    case lower(coalesce(p_payload->>'status', 'open'))
      when 'needs_action' then 'needs_action'
      when 'linked' then 'linked'
      when 'resolved' then 'resolved'
      when 'archived' then 'archived'
      else 'open'
    end,
    nullif(p_payload->>'customer_id', '')::uuid,
    nullif(p_payload->>'intake_request_id', '')::uuid,
    nullif(p_payload->>'service_request_id', '')::uuid,
    nullif(p_payload->>'appointment_id', '')::uuid,
    nullif(p_payload->>'estimate_id', '')::uuid,
    nullif(p_payload->>'invoice_id', '')::uuid,
    nullif(trim(p_payload->>'payment_reference'), ''),
    nullif(trim(p_payload->>'customer_display_name'), ''),
    nullif(trim(p_payload->>'customer_phone'), ''),
    nullif(lower(trim(p_payload->>'customer_email')), ''),
    nullif(trim(p_payload->>'service_address'), ''),
    nullif(trim(p_payload->>'summary'), ''),
    nullif(trim(p_payload->>'next_action'), ''),
    now(),
    auth.uid(),
    auth.uid()
  )
  returning * into conversation_row;

  return to_jsonb(conversation_row);
end;
$$;

comment on function public.create_communication_conversation_rpc(jsonb) is
  'Task 151 provider-neutral conversation create RPC for authenticated dashboard users. Future provider ingestion should call trusted server-side code that writes to the Communications Hub, not directly to CRM business tables.';

revoke execute on function public.create_communication_conversation_rpc(jsonb) from public;
grant execute on function public.create_communication_conversation_rpc(jsonb) to authenticated;
