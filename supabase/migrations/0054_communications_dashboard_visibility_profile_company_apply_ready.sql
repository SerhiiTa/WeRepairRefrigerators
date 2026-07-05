-- Task 152.7: Communications dashboard visibility for production phone calls.
--
-- APPLY-READY.
-- Purpose:
--   Real Retell call_analyzed payloads now create Communications Hub rows, but
--   the dashboard UI may not show them for legacy/operator accounts whose
--   active profile is scoped by profiles.company_id rather than an active
--   company_members row.
--
-- Safety model:
--   - This does not disable RLS.
--   - This does not grant public/anon access.
--   - This does not modify authentication or provider ingestion.
--   - This keeps reads scoped to the owning conversation company.
--   - company_members remains supported; profiles.company_id is a narrow
--     compatibility path for existing active dashboard profiles.

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
        or exists (
          select 1
          from public.profiles profile
          where profile.id = auth.uid()
            and profile.company_id = conversation.company_id
            and profile.status in ('active', 'verified')
            and profile.role in (
              'technician',
              'verified_technician',
              'expert_technician',
              'company_owner',
              'admin'
            )
        )
      )
  );
$$;

comment on function public.can_access_communication_conversation(uuid) is
  'Task 152.7 helper. Checks whether an authenticated dashboard user can read a Communications Hub conversation through owner/creator, active company membership, or active profile.company_id compatibility scope.';

revoke execute on function public.can_access_communication_conversation(uuid) from public;
grant execute on function public.can_access_communication_conversation(uuid) to authenticated;
