-- COMM-08A: Communications live state + identity foundation.
--
-- Purpose:
-- - Add conversation state needed for live inbox handling, AI/human handoff,
--   unread tracking, and read markers.
-- - Add outbound message delivery state without implementing SMS/MMS sending.
-- - Establish a company-scoped phone identity resolver:
--   Customer by canonical phone -> Lead by canonical phone -> Unknown.
--
-- Safety:
-- - Forward-only.
-- - No provider integration, Realtime publication, UI redesign, or AI routing.
-- - No anon access.
-- - owner_profile_id remains the dispatcher assignment/owner field; this
--   migration intentionally does not add a duplicate assigned_profile_id.

alter table public.communication_conversations
  add column if not exists handling_mode text not null default 'human',
  add column if not exists ai_state text not null default 'idle',
  add column if not exists unread_count integer not null default 0,
  add column if not exists last_read_at timestamptz,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists ai_paused_at timestamptz,
  add column if not exists ai_paused_by uuid references public.profiles(id) on delete set null;

alter table public.communication_conversations
  drop constraint if exists communication_conversations_handling_mode_check,
  add constraint communication_conversations_handling_mode_check
    check (handling_mode in ('ai', 'human')),
  drop constraint if exists communication_conversations_ai_state_check,
  add constraint communication_conversations_ai_state_check
    check (ai_state in ('idle', 'handling', 'needs_approval', 'paused')),
  drop constraint if exists communication_conversations_unread_count_check,
  add constraint communication_conversations_unread_count_check
    check (unread_count >= 0);

comment on column public.communication_conversations.owner_profile_id is
  'Dispatcher assignment/owner for the Communications inbox. COMM-08A reuses this existing field instead of adding a duplicate assigned_profile_id.';
comment on column public.communication_conversations.handling_mode is
  'Current handling lane for the conversation: human dispatcher or AI.';
comment on column public.communication_conversations.ai_state is
  'AI handling state. This records readiness/handoff state only; it does not invoke an AI provider.';
comment on column public.communication_conversations.unread_count is
  'Server-maintained count of unread inbound customer-facing events for this conversation.';
comment on column public.communication_conversations.last_read_at is
  'Most recent dashboard read marker for this conversation.';
comment on column public.communication_conversations.last_inbound_at is
  'Most recent inbound customer-facing event timestamp.';
comment on column public.communication_conversations.last_outbound_at is
  'Most recent outbound customer-facing human or AI message timestamp.';
comment on column public.communication_conversations.ai_paused_at is
  'Timestamp when AI handling was paused.';
comment on column public.communication_conversations.ai_paused_by is
  'Profile that paused AI handling, when paused by a dashboard user.';

create index if not exists communication_conversations_company_status_updated_idx
  on public.communication_conversations (company_id, status, updated_at desc);

create index if not exists communication_conversations_company_handling_ai_idx
  on public.communication_conversations (company_id, handling_mode, ai_state, updated_at desc);

create index if not exists communication_conversations_company_owner_updated_idx
  on public.communication_conversations (company_id, owner_profile_id, updated_at desc)
  where owner_profile_id is not null;

create index if not exists communication_conversations_company_unread_idx
  on public.communication_conversations (company_id, unread_count, updated_at desc)
  where unread_count > 0;

alter table public.communication_messages
  add column if not exists delivery_status text not null default 'delivered',
  add column if not exists provider_message_id text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text;

alter table public.communication_messages
  drop constraint if exists communication_messages_delivery_status_check,
  add constraint communication_messages_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'delivered', 'failed')),
  drop constraint if exists communication_messages_sender_role_check,
  add constraint communication_messages_sender_role_check
    check (sender_role in (
      'customer',
      'dispatcher',
      'human',
      'technician',
      'ai',
      'system'
    ));

comment on column public.communication_messages.direction is
  'Message transport direction. direction=internal represents an Internal Note and must not be delivered to the customer transport.';
comment on column public.communication_messages.sender_role is
  'Business sender identity. Includes ai for future AI-authored customer-facing drafts/messages while preserving existing dispatcher/technician/system values.';
comment on column public.communication_messages.delivery_status is
  'Outbound transport delivery state. Existing/inbound/internal rows default to delivered to preserve current reads.';
comment on column public.communication_messages.provider_message_id is
  'Provider-assigned outbound message id after a transport accepts a customer-facing message.';
comment on column public.communication_messages.failure_reason is
  'Sanitized customer-safe delivery failure summary. Do not store provider secrets or raw credentials here.';

create index if not exists communication_messages_conversation_delivery_idx
  on public.communication_messages (conversation_id, delivery_status, occurred_at desc);

create unique index if not exists communication_messages_conversation_provider_message_uidx
  on public.communication_messages (conversation_id, provider_message_id)
  where provider_message_id is not null;

create or replace function public.resolve_phone_identity_for_communication_rpc(
  p_company_id uuid,
  p_phone text
)
returns table (
  identity_type text,
  customer_id uuid,
  lead_id uuid,
  display_name text,
  phone text,
  email text,
  canonical_phone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_phone text := public.normalize_customer_crm_phone(p_phone);
begin
  if p_company_id is null or normalized_phone is null then
    return query
      select
        'unknown'::text,
        null::uuid,
        null::uuid,
        null::text,
        p_phone,
        null::text,
        normalized_phone;
    return;
  end if;

  return query
    select
      'customer'::text,
      c.id,
      null::uuid,
      c.full_name,
      c.phone,
      c.email,
      normalized_phone
    from public.customers c
    where c.company_id = p_company_id
      and public.normalize_customer_crm_phone(c.phone) = normalized_phone
    order by c.created_at asc
    limit 1;

  if found then
    return;
  end if;

  return query
    select
      'lead'::text,
      null::uuid,
      l.id,
      l.customer_name,
      l.customer_phone,
      l.customer_email,
      normalized_phone
    from public.communication_leads l
    where l.company_id = p_company_id
      and l.canonical_phone = normalized_phone
      and l.status in ('open', 'reviewed')
    order by l.created_at desc
    limit 1;

  if found then
    return;
  end if;

  return query
    select
      'unknown'::text,
      null::uuid,
      null::uuid,
      null::text,
      p_phone,
      null::text,
      normalized_phone;
end;
$$;

comment on function public.resolve_phone_identity_for_communication_rpc(uuid, text) is
  'COMM-08A service-role resolver for inbound phone/SMS identity. Resolves Customer by company-scoped canonical phone, then active Lead by company-scoped canonical phone, otherwise Unknown. Email is intentionally not used.';

revoke execute on function public.resolve_phone_identity_for_communication_rpc(uuid, text)
  from public;
grant execute on function public.resolve_phone_identity_for_communication_rpc(uuid, text)
  to service_role;

create or replace function public.apply_communication_inbound_state_rpc(
  p_conversation_id uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.communication_conversations;
  event_at timestamptz := coalesce(p_occurred_at, now());
begin
  if auth.uid() is not null
    and not public.can_access_communication_conversation(p_conversation_id) then
    raise exception 'You do not have access to this conversation.' using errcode = '42501';
  end if;

  update public.communication_conversations
  set
    unread_count = coalesce(unread_count, 0) + 1,
    last_inbound_at = greatest(
      coalesce(last_inbound_at, event_at),
      event_at
    ),
    last_event_at = greatest(
      coalesce(last_event_at, event_at),
      event_at
    ),
    status = case
      when status in ('archived', 'resolved') then status
      else 'needs_action'
    end,
    updated_at = now()
  where id = p_conversation_id
  returning *
  into updated_row;

  if not found then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'conversation_id', updated_row.id,
    'status', updated_row.status,
    'unread_count', updated_row.unread_count,
    'last_inbound_at', updated_row.last_inbound_at
  );
end;
$$;

create or replace function public.apply_communication_outbound_state_rpc(
  p_conversation_id uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.communication_conversations;
  event_at timestamptz := coalesce(p_occurred_at, now());
begin
  if auth.uid() is not null
    and not public.can_access_communication_conversation(p_conversation_id) then
    raise exception 'You do not have access to this conversation.' using errcode = '42501';
  end if;

  update public.communication_conversations
  set
    last_outbound_at = greatest(
      coalesce(last_outbound_at, event_at),
      event_at
    ),
    last_event_at = greatest(
      coalesce(last_event_at, event_at),
      event_at
    ),
    updated_at = now()
  where id = p_conversation_id
  returning *
  into updated_row;

  if not found then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'conversation_id', updated_row.id,
    'status', updated_row.status,
    'unread_count', updated_row.unread_count,
    'last_outbound_at', updated_row.last_outbound_at
  );
end;
$$;

create or replace function public.mark_communication_conversation_read_rpc(
  p_conversation_id uuid,
  p_read_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.communication_conversations;
  read_at timestamptz := coalesce(p_read_at, now());
begin
  if auth.uid() is not null
    and not public.can_access_communication_conversation(p_conversation_id) then
    raise exception 'You do not have access to this conversation.' using errcode = '42501';
  end if;

  update public.communication_conversations
  set
    unread_count = 0,
    last_read_at = read_at,
    updated_at = now()
  where id = p_conversation_id
  returning *
  into updated_row;

  if not found then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'conversation_id', updated_row.id,
    'status', updated_row.status,
    'unread_count', updated_row.unread_count,
    'last_read_at', updated_row.last_read_at
  );
end;
$$;

comment on function public.apply_communication_inbound_state_rpc(uuid, timestamptz) is
  'COMM-08A primitive for inbound customer-facing events. Atomically increments unread_count, sets last_inbound_at/last_event_at, and marks active conversations needs_action.';
comment on function public.apply_communication_outbound_state_rpc(uuid, timestamptz) is
  'COMM-08A primitive for outbound customer-facing human or AI messages. Updates outbound/event timestamps without incrementing unread_count.';
comment on function public.mark_communication_conversation_read_rpc(uuid, timestamptz) is
  'COMM-08A primitive for dashboard read markers. Resets unread_count and records last_read_at.';

revoke execute on function public.apply_communication_inbound_state_rpc(uuid, timestamptz)
  from public;
revoke execute on function public.apply_communication_outbound_state_rpc(uuid, timestamptz)
  from public;
revoke execute on function public.mark_communication_conversation_read_rpc(uuid, timestamptz)
  from public;

grant execute on function public.apply_communication_inbound_state_rpc(uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.apply_communication_outbound_state_rpc(uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.mark_communication_conversation_read_rpc(uuid, timestamptz)
  to authenticated, service_role;
