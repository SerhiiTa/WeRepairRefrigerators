-- Task 122: Technician availability foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add simple recurring technician availability rules for internal dispatcher
--   preview recommendations.
--
-- Safety model:
--   - This does not create appointments, bookings, assignments, calendar
--     events, SMS, calls, provider calls, or customer-facing behavior.
--   - Availability is private operational data.
--   - Access is scoped through existing technician/company RLS helpers.
--   - Independent technicians can manage their own rules through
--     can_manage_technician_profile(...); company owners/managers/admins can
--     manage company technician rules through the same helper.

create table if not exists public.technician_availability_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid
    references public.companies(id)
    on delete cascade,
  technician_profile_id uuid not null
    references public.technician_profiles(id)
    on delete cascade,
  day_of_week integer not null
    check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint technician_availability_rules_time_order_check
    check (start_time < end_time)
);

comment on table public.technician_availability_rules is
  'Task 122 recurring technician availability rules for internal dispatcher preview. Not appointments, assignments, holds, or calendar sync.';
comment on column public.technician_availability_rules.day_of_week is
  '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.';
comment on column public.technician_availability_rules.is_available is
  'False can be used for future blocked recurring periods. Task 122 only converts true rules into work windows.';

create index if not exists technician_availability_rules_technician_day_idx
  on public.technician_availability_rules (
    technician_profile_id,
    day_of_week,
    start_time
  );
create index if not exists technician_availability_rules_company_day_idx
  on public.technician_availability_rules (company_id, day_of_week, start_time)
  where company_id is not null;
create index if not exists technician_availability_rules_available_idx
  on public.technician_availability_rules (is_available)
  where is_available = true;

drop trigger if exists set_technician_availability_rules_updated_at
  on public.technician_availability_rules;
create trigger set_technician_availability_rules_updated_at
before update on public.technician_availability_rules
for each row
execute function public.set_updated_at();

alter table public.technician_availability_rules enable row level security;

revoke all on public.technician_availability_rules from public;
revoke all on public.technician_availability_rules from anon;
grant select, insert, update, delete on public.technician_availability_rules
  to authenticated;

drop policy if exists "Availability rules can be selected by technician viewers"
  on public.technician_availability_rules;
drop policy if exists "Availability rules can be inserted by technician managers"
  on public.technician_availability_rules;
drop policy if exists "Availability rules can be updated by technician managers"
  on public.technician_availability_rules;
drop policy if exists "Availability rules can be deleted by technician managers"
  on public.technician_availability_rules;

create policy "Availability rules can be selected by technician viewers"
on public.technician_availability_rules
for select
to authenticated
using (public.can_view_technician_profile(technician_profile_id));

create policy "Availability rules can be inserted by technician managers"
on public.technician_availability_rules
for insert
to authenticated
with check (
  public.can_manage_technician_profile(technician_profile_id)
  and (
    company_id is null
    or public.can_manage_company_members(company_id)
  )
  and (
    exists (
      select 1
      from public.technician_profiles tp
      where tp.id = technician_profile_id
        and (
          (tp.company_id is null and company_id is null)
          or tp.company_id = company_id
        )
    )
  )
);

create policy "Availability rules can be updated by technician managers"
on public.technician_availability_rules
for update
to authenticated
using (public.can_manage_technician_profile(technician_profile_id))
with check (
  public.can_manage_technician_profile(technician_profile_id)
  and (
    company_id is null
    or public.can_manage_company_members(company_id)
  )
  and (
    exists (
      select 1
      from public.technician_profiles tp
      where tp.id = technician_profile_id
        and (
          (tp.company_id is null and company_id is null)
          or tp.company_id = company_id
        )
    )
  )
);

create policy "Availability rules can be deleted by technician managers"
on public.technician_availability_rules
for delete
to authenticated
using (public.can_manage_technician_profile(technician_profile_id));
