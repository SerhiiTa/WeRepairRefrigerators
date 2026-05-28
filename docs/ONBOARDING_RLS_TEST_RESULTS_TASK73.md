# Onboarding RLS Test Results - Task 73

## Purpose

Task 73 creates a safe dev/staging testing plan and partial verification path for authenticated onboarding RLS behavior after `0007`-`0010` were applied to the current dev/staging Supabase project.

No production data was touched. No service-role key was exposed or used by Codex. No frontend behavior was changed. No packages were installed. No commit was made.

## Environment

- Environment: dev/staging only
- Supabase project ref: `hejpgyzorrxpfcyvmypb`
- Current frontend state: still mock/local UI data
- Applied migrations under test:
  - `0007_onboarding_foundation_apply_ready.sql`
  - `0008_audit_log_foundation_apply_ready.sql`
  - `0009_rls_helpers_apply_ready.sql`
  - `0010_onboarding_rls_policies_apply_ready.sql`

## What Codex Tested Safely

Codex ran non-mutating anonymous REST probes using only the public anon key.

No service-role key was used. No SQL was executed by Codex. No writes were attempted because a misconfigured write test could mutate dev data.

### Anonymous Probe Results

All anonymous probes returned `401 / 42501 permission denied`, which is the expected result for private onboarding/audit objects.

| Actor | Object | Operation | Result |
| --- | --- | --- | --- |
| anonymous | `profiles` | select | Pass: permission denied |
| anonymous | `companies` | select | Pass: permission denied |
| anonymous | `company_members` | select | Pass: permission denied |
| anonymous | `technician_profiles` | select | Pass: permission denied |
| anonymous | `company_invites` | select | Pass: permission denied |
| anonymous | `company_join_requests` | select | Pass: permission denied |
| anonymous | `audit_logs` | select | Pass: permission denied |
| anonymous | `auth_user_id()` | RPC | Pass: permission denied |
| anonymous | `current_profile_role()` | RPC | Pass: permission denied |
| anonymous | `is_admin()` | RPC | Pass: permission denied |
| anonymous | `current_company_ids()` | RPC | Pass: permission denied |

## Static Policy Findings

### Finding 1: Suspended members may still read their own `company_members` row

`0010_onboarding_rls_policies_apply_ready.sql` currently includes:

```sql
create policy "Users can select own company memberships"
on public.company_members
for select
to authenticated
using (
  profile_id = public.auth_user_id()
  and archived_at is null
);
```

This allows a suspended or removed member to select their own membership row as long as `archived_at` is null.

Risk:

- `company_members.notes` is documented as private company/admin notes.
- A suspended member may still see private membership metadata.
- The readiness checklist expected suspended members to lose company/member access.

Recommendation:

- Before building onboarding server actions, update this policy in a follow-up migration so own membership reads require `member_status = 'active'` unless a deliberate limited self-status view is created.
- If users need to see their own inactive/suspended status, create a sanitized view/RPC that excludes private company/admin fields such as `notes`, reviewer fields, and internal timestamps.

Current safety decision:

- RLS is not safe enough for production onboarding server actions until this is fixed or explicitly accepted as a product decision.

Task 74 follow-up:

- `supabase/migrations/0011_patch_company_members_rls_visibility.sql` was created to remove raw self-row visibility for non-manager members.
- The user manually applied the Task 74 patch through Supabase SQL Editor with `Success. No rows returned.`
- `docs/RLS_PATCH_RESULT_TASK74.md` contains verification notes and remaining seeded test expectations.
- `docs/COMPANY_MEMBER_SELF_STATUS_VIEW_PLAN.md` documents the safer future option for suspended/removed users to see sanitized membership status without raw `company_members.notes`.
- Until seeded authenticated tests pass, onboarding server actions should remain blocked.

### Finding 2: Authenticated write tests need seeded users and should be run carefully

The current policies intentionally allow limited authenticated inserts for:

- own draft `technician_profiles`
- own pending `company_join_requests`

Authenticated negative tests must use controlled dev users and should not be run with real accounts or production-like data.

## Test Coverage Matrix

| Test | Status | Notes |
| --- | --- | --- |
| Anonymous users cannot read private onboarding tables | Passed | Verified via anon REST probes. |
| Anonymous users cannot call helper RPCs | Passed | Verified via anon REST probes. |
| Raw invite hashes are not anonymous/browser-readable | Partially passed | Anonymous select denied. Authenticated denial still needs seeded user test. |
| Audit logs are not anonymous/browser-readable | Partially passed | Anonymous select denied. Authenticated select/insert/update/delete still needs seeded user test. |
| Authenticated users cannot self-update protected profile fields | Pending | Needs logged-in test users. |
| Customer cannot become `company_owner` | Pending | Needs logged-in customer test and protected profile update attempt. |
| Technician cannot approve own company membership | Pending | No browser update grants exist for `company_members`, but needs authenticated test. |
| Company members cannot read another company | Pending | Needs Company A/Company B fixtures. |
| Suspended members lose company access | Patch applied, seeded test pending | Task 74 migration removes raw own membership reads for non-manager members; verify with fixtures. |
| Archived members lose company access | Likely pass, pending test | Own membership policy excludes `archived_at is not null`; needs fixture. |
| Multi-company member sees only active companies | Pending | Needs fixture. |
| Public technician visibility is not exposed through raw `technician_profiles` | Partially passed | Anonymous select denied. Authenticated/raw visibility needs fixture tests. |

## Dev-Only Fixture Setup Plan

Create test users through the app UI first so Supabase Auth creates real `auth.users` and `public.profiles` rows:

1. `rls.customer@example.test`
2. `rls.technician@example.test`
3. `rls.owner.a@example.test`
4. `rls.owner.b@example.test`
5. `rls.suspended@example.test`
6. `rls.archived@example.test`
7. `rls.multi@example.test`

After signup/profile rows exist, run the following dev-only SQL in Supabase SQL Editor.

Do not run this against production.

```sql
-- DEV/STAGING ONLY: Task 73 fixture setup.
-- Requires the listed auth users/profiles to already exist.

do $$
declare
  customer_id uuid;
  technician_id uuid;
  owner_a_id uuid;
  owner_b_id uuid;
  suspended_id uuid;
  archived_id uuid;
  multi_id uuid;
  company_a_id uuid;
  company_b_id uuid;
begin
  select id into customer_id from public.profiles where email = 'rls.customer@example.test';
  select id into technician_id from public.profiles where email = 'rls.technician@example.test';
  select id into owner_a_id from public.profiles where email = 'rls.owner.a@example.test';
  select id into owner_b_id from public.profiles where email = 'rls.owner.b@example.test';
  select id into suspended_id from public.profiles where email = 'rls.suspended@example.test';
  select id into archived_id from public.profiles where email = 'rls.archived@example.test';
  select id into multi_id from public.profiles where email = 'rls.multi@example.test';

  if customer_id is null or technician_id is null or owner_a_id is null or owner_b_id is null
     or suspended_id is null or archived_id is null or multi_id is null then
    raise exception 'Create all Task 73 test users through signup before running fixtures.';
  end if;

  update public.profiles
  set role = 'customer', status = 'active', full_name = 'RLS Customer'
  where id = customer_id;

  update public.profiles
  set role = 'technician', status = 'active', full_name = 'RLS Technician'
  where id = technician_id;

  update public.profiles
  set role = 'company_owner', status = 'active', full_name = 'RLS Owner A'
  where id = owner_a_id;

  update public.profiles
  set role = 'company_owner', status = 'active', full_name = 'RLS Owner B'
  where id = owner_b_id;

  update public.profiles
  set role = 'technician', status = 'active', full_name = 'RLS Suspended Member'
  where id = suspended_id;

  update public.profiles
  set role = 'technician', status = 'active', full_name = 'RLS Archived Member'
  where id = archived_id;

  update public.profiles
  set role = 'technician', status = 'active', full_name = 'RLS Multi Member'
  where id = multi_id;

  insert into public.companies (
    owner_profile_id,
    name,
    slug,
    primary_city,
    primary_state,
    status,
    onboarding_status,
    created_by_profile_id,
    reviewed_by_profile_id,
    reviewed_at
  )
  values (
    owner_a_id,
    'Task 73 Company A',
    'task-73-company-a',
    'Houston',
    'TX',
    'active',
    'company_ready',
    owner_a_id,
    owner_a_id,
    now()
  )
  on conflict (slug) do update set updated_at = now()
  returning id into company_a_id;

  insert into public.companies (
    owner_profile_id,
    name,
    slug,
    primary_city,
    primary_state,
    status,
    onboarding_status,
    created_by_profile_id,
    reviewed_by_profile_id,
    reviewed_at
  )
  values (
    owner_b_id,
    'Task 73 Company B',
    'task-73-company-b',
    'Katy',
    'TX',
    'active',
    'company_ready',
    owner_b_id,
    owner_b_id,
    now()
  )
  on conflict (slug) do update set updated_at = now()
  returning id into company_b_id;

  insert into public.company_members (
    company_id,
    profile_id,
    member_role,
    member_status,
    invited_by_profile_id,
    invited_at,
    joined_at,
    notes
  )
  values
    (company_a_id, owner_a_id, 'owner', 'active', owner_a_id, now(), now(), 'Task 73 owner A private note'),
    (company_b_id, owner_b_id, 'owner', 'active', owner_b_id, now(), now(), 'Task 73 owner B private note'),
    (company_a_id, suspended_id, 'technician', 'suspended', owner_a_id, now(), now(), 'Task 73 suspended private note'),
    (company_a_id, archived_id, 'technician', 'removed', owner_a_id, now(), now(), 'Task 73 archived private note'),
    (company_a_id, multi_id, 'technician', 'active', owner_a_id, now(), now(), 'Task 73 multi A private note'),
    (company_b_id, multi_id, 'technician', 'active', owner_b_id, now(), now(), 'Task 73 multi B private note')
  on conflict (company_id, profile_id) do update
  set member_role = excluded.member_role,
      member_status = excluded.member_status,
      notes = excluded.notes,
      updated_at = now();

  update public.company_members
  set suspended_at = now()
  where company_id = company_a_id
    and profile_id = suspended_id;

  update public.company_members
  set archived_at = now(),
      archived_by_profile_id = owner_a_id,
      removed_at = now()
  where company_id = company_a_id
    and profile_id = archived_id;

  insert into public.technician_profiles (
    profile_id,
    company_id,
    affiliation_type,
    display_name,
    primary_city,
    primary_state,
    service_zip_codes,
    specialties,
    technician_status,
    marketplace_enabled,
    public_profile_ready,
    verification_submitted_at,
    verified_at,
    verified_by_profile_id
  )
  values
    (technician_id, null, 'independent', 'RLS Independent Technician', 'Houston', 'TX', array['77024'], array['Sub-Zero'], 'draft', false, false, null, null, null),
    (multi_id, company_a_id, 'company_member', 'RLS Multi Technician', 'Houston', 'TX', array['77024','77494'], array['LG','Samsung'], 'verified', true, true, now(), now(), owner_a_id)
  on conflict (profile_id) do update
  set company_id = excluded.company_id,
      affiliation_type = excluded.affiliation_type,
      display_name = excluded.display_name,
      technician_status = excluded.technician_status,
      marketplace_enabled = excluded.marketplace_enabled,
      public_profile_ready = excluded.public_profile_ready,
      updated_at = now();

  insert into public.company_join_requests (
    company_id,
    requesting_profile_id,
    request_status,
    requested_role,
    message,
    expires_at
  )
  values (
    company_a_id,
    technician_id,
    'pending',
    'technician',
    'Task 73 pending join request',
    now() + interval '7 days'
  )
  on conflict (company_id, requesting_profile_id)
  where request_status = 'pending'
  do update set updated_at = now();
end
$$;
```

## Dev-Only Cleanup SQL

Run this after testing to remove fixture rows.

```sql
-- DEV/STAGING ONLY: Task 73 fixture cleanup.

do $$
declare
  company_a_id uuid;
  company_b_id uuid;
begin
  select id into company_a_id from public.companies where slug = 'task-73-company-a';
  select id into company_b_id from public.companies where slug = 'task-73-company-b';

  delete from public.company_join_requests
  where company_id in (company_a_id, company_b_id)
     or requesting_profile_id in (
       select id from public.profiles where email like 'rls.%@example.test'
     );

  delete from public.technician_profiles
  where profile_id in (
    select id from public.profiles where email like 'rls.%@example.test'
  );

  delete from public.company_members
  where company_id in (company_a_id, company_b_id)
     or profile_id in (
       select id from public.profiles where email like 'rls.%@example.test'
     );

  delete from public.companies
  where slug in ('task-73-company-a', 'task-73-company-b');

  update public.profiles
  set company_id = null,
      onboarding_status = 'not_started',
      onboarding_completed_at = null,
      full_name = null
  where email like 'rls.%@example.test';
end
$$;
```

## Authenticated Test Plan

Run these tests only after creating fixture users and signing in as the named user through the normal app login flow.

Use browser/client calls with each user's own session. Do not use service-role keys.

### Customer

Expected:

- Can select own `profiles` row.
- Cannot update `profiles.role` to `company_owner`.
- Cannot update `profiles.status`.
- Cannot update `profiles.company_id`.
- Cannot select `company_members`.
- Cannot select `company_invites`.
- Cannot select `audit_logs`.

### Technician

Expected:

- Can select own `profiles` row.
- Can insert own draft `technician_profiles` row only if one does not already exist.
- Can insert own pending `company_join_requests` with `requested_role = technician`.
- Cannot request owner/manager/dispatcher role.
- Cannot approve own join request.
- Cannot insert/update `company_members`.
- Cannot select raw `company_invites`.
- Cannot select raw `audit_logs`.

### Company Owner A

Expected:

- Can select Company A.
- Cannot select Company B unless also a member.
- Can select active Company A memberships through manager policy.
- Cannot update `companies` directly from browser.
- Cannot insert/update/delete `company_members` directly from browser.
- Cannot select raw `company_invites`.
- Cannot select raw `audit_logs`.

### Suspended Member

Expected target behavior:

- Should not select Company A.
- Should not select Company A memberships or private member notes.

Current static risk:

- Own `company_members` policy may allow suspended user to read their own membership row if `archived_at is null`.

### Archived Member

Expected:

- Cannot select archived own membership row because `archived_at is not null`.
- Cannot select Company A via membership helper.

### Multi-Company Member

Expected:

- Can select Company A and Company B when active in both.
- Can select only their own memberships and memberships visible through manager/owner policies.
- Cannot see unrelated companies.

## Suggested Browser Test Snippets

After signing in as each test user, use a temporary local browser console or a small throwaway dev page to run calls with the existing browser Supabase client.

Do not commit any temporary test page.

Example read tests:

```ts
await supabase.from("profiles").select("*");
await supabase.from("companies").select("*");
await supabase.from("company_members").select("*");
await supabase.from("technician_profiles").select("*");
await supabase.from("company_invites").select("*");
await supabase.from("company_join_requests").select("*");
await supabase.from("audit_logs").select("*");
```

Example protected profile update tests:

```ts
await supabase.from("profiles").update({ role: "company_owner" }).eq("id", user.id);
await supabase.from("profiles").update({ status: "active" }).eq("id", user.id);
await supabase.from("profiles").update({ onboarding_status: "complete" }).eq("id", user.id);
```

Expected result:

- Protected updates fail with trigger/policy errors.
- No role/status/onboarding escalation occurs.

## Security Decision

RLS does not yet look safe enough for onboarding server actions.

Reason:

- Anonymous/private table access is behaving correctly.
- Raw invite/audit anonymous access is denied.
- Static review found a suspended-member visibility gap in `company_members`; Task 74 patch has been manually applied, but seeded authenticated verification is still pending.
- Authenticated fixture tests are still pending.

Before server actions are added, create a follow-up migration that either:

1. Verifies the Task 74 patch with seeded authenticated users.
2. Adds a sanitized self-status view/RPC for inactive members only if the product needs inactive-member status messaging.

## Follow-Up Recommended Task

Task 74 should patch and re-test onboarding RLS:

- Verify the Task 74 suspended member `company_members` visibility patch with seeded authenticated users.
- Add a sanitized member-status view/RPC if needed.
- Run SQL Editor catalog verification.
- Run seeded authenticated tests.
- Record pass/fail results for each actor.
