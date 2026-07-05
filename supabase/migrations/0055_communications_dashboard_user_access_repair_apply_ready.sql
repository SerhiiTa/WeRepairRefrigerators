-- Task 152.9B: Repair dashboard user company access for Communications UI.
--
-- APPLY-READY.
-- Purpose:
--   Real Retell calls are now ingested into Communications Hub tables, but the
--   production dashboard user below cannot see the existing conversation rows
--   because company-scoped RLS requires an active relationship to the owning
--   company.
--
-- Target user:
--   info@refrigeratorhoustonrepair.com
--   auth/profile id: 7d4195e4-572f-4640-a15f-d954123b34d7
--
-- Target company:
--   f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633
--
-- Safety:
--   - This does not disable RLS.
--   - This does not alter RLS policies.
--   - This does not grant public/anon access.
--   - This repairs only one known dashboard user/company relationship.

begin;

update public.profiles
set
  company_id = 'f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633'::uuid,
  updated_at = now()
where id = '7d4195e4-572f-4640-a15f-d954123b34d7'::uuid;

insert into public.company_members (
  company_id,
  profile_id,
  member_role,
  member_status,
  joined_at,
  archived_at,
  removed_at,
  suspended_at,
  notes,
  created_at,
  updated_at
)
values (
  'f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633'::uuid,
  '7d4195e4-572f-4640-a15f-d954123b34d7'::uuid,
  'owner',
  'active',
  now(),
  null,
  null,
  null,
  'Task 152.9B: repaired dashboard access to Communications Hub production call records.',
  now(),
  now()
)
on conflict (company_id, profile_id)
do update set
  member_role = case
    when public.company_members.member_role in ('owner', 'manager', 'dispatcher')
      then public.company_members.member_role
    else 'owner'
  end,
  member_status = 'active',
  joined_at = coalesce(public.company_members.joined_at, now()),
  archived_at = null,
  removed_at = null,
  suspended_at = null,
  updated_at = now(),
  notes = concat_ws(
    E'\n',
    nullif(public.company_members.notes, ''),
    'Task 152.9B: repaired dashboard access to Communications Hub production call records.'
  );

commit;

select
  profile.id as profile_id,
  profile.email,
  profile.company_id as profile_company_id,
  membership.company_id as membership_company_id,
  membership.member_role,
  membership.member_status
from public.profiles profile
left join public.company_members membership
  on membership.profile_id = profile.id
 and membership.company_id = 'f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633'::uuid
where profile.id = '7d4195e4-572f-4640-a15f-d954123b34d7'::uuid;
