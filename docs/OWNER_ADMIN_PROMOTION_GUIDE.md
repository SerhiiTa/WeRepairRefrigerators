# Owner/Admin Promotion Guide

## Purpose

This guide documents a safe manual process for promoting one known project owner/developer account in Supabase after the first profiles migration has been reviewed and applied.

This is documentation only. Do not run these SQL templates until you have verified the target development Supabase project, the target user email, and the intended role.

## Current Safety Boundary

- Dashboard routes are still mock-safe and not route-protected.
- Role display in the dashboard is informational only.
- Frontend role checks are not a security boundary.
- Real production access still requires server checks, route protection, and Supabase RLS.
- The `service_role` key must never be used in frontend code.

## Why Owner/Admin Roles Must Never Come From Public Signup

Public signup can only collect user intent. It must never grant privileged roles.

Reasons:

- Anyone can submit a public signup form.
- Signup metadata can be user-controlled or spoofed.
- `company_owner` and `admin` roles can eventually expose company data, moderation tools, billing controls, user management, and audit workflows.
- Role escalation must be deliberate, reviewed, and auditable.
- Production role changes should eventually happen through server-side admin tools with audit logs, not public UI.

Current public signup may create `technician` or `customer` intent only. Owner/admin promotion is a manual development step for now.

## Role Differences

### technician

Use for technician accounts that are signing up or onboarding.

- Can represent a repair technician.
- Starts in `pending` status for technician signup.
- Should not receive owner/admin powers.
- Future access may include assigned work, own profile, and verified technician workflows after approval.

### company_owner

Use for the project owner/developer during normal development.

- Represents the owner of a service company or team.
- Future access may include team leads, jobs, repair cases, analytics, coverage, and company settings.
- Should be the default elevated role for the project owner while building owner-level dashboard flows.
- Does not need full platform-admin power for routine development.

### admin

Use only for short, explicit platform-admin testing.

- Represents a platform operator.
- Future access may include role changes, verification, moderation, support, and audit review.
- Should be assigned sparingly and only to trusted internal accounts.
- Should not be the default role for day-to-day owner workflow testing.

## Recommended Current Role For Project Owner

Recommended development role:

```text
role = company_owner
status = active
```

Use `company_owner` for normal owner/developer testing. Promote to `admin` only when you specifically need to test admin-only behavior, then roll back when finished.

## Before Running Any SQL

Confirm all of the following:

- You are in the correct Supabase project.
- You are using the Supabase SQL Editor, not frontend code.
- You know the exact owner/developer email.
- The user already exists in Supabase Auth.
- A matching row exists in `public.profiles`.
- You have reviewed `supabase/migrations/0001_profiles_roles.sql`.
- You understand dashboard routes are still not protected.
- You are not using or exposing the `service_role` key in frontend code.

## Step 1: Verify The User Email

Replace `OWNER_EMAIL@example.com` before running.

```sql
select
  id,
  email,
  full_name,
  role,
  status,
  company_id,
  created_at,
  updated_at
from public.profiles
where lower(email) = lower('OWNER_EMAIL@example.com');
```

Expected result:

- Exactly one row.
- Email matches the intended owner/developer account.
- If zero rows return, do not promote. Sign in/sign up first and verify the profile trigger.
- If multiple rows return, stop and investigate before making changes.

## Step 2A: Promote To Company Owner

Use this for normal project owner/developer development.

Replace `OWNER_EMAIL@example.com` before running.

```sql
begin;

update public.profiles
set
  role = 'company_owner'::public.app_role,
  status = 'active'::public.profile_status,
  updated_at = now()
where lower(email) = lower('OWNER_EMAIL@example.com')
returning
  id,
  email,
  role,
  status,
  updated_at;

commit;
```

If the `returning` result is not exactly one expected row, roll back instead of committing.

## Step 2B: Promote To Admin

Use this only for short admin-specific testing.

Replace `OWNER_EMAIL@example.com` before running.

```sql
begin;

update public.profiles
set
  role = 'admin'::public.app_role,
  status = 'active'::public.profile_status,
  updated_at = now()
where lower(email) = lower('OWNER_EMAIL@example.com')
returning
  id,
  email,
  role,
  status,
  updated_at;

commit;
```

If the `returning` result is not exactly one expected row, roll back instead of committing.

## Step 3: Verify The Promotion

Replace `OWNER_EMAIL@example.com` before running.

```sql
select
  id,
  email,
  role,
  status,
  updated_at
from public.profiles
where lower(email) = lower('OWNER_EMAIL@example.com');
```

Then locally verify:

1. Log out and log back in, or refresh the dashboard.
2. Open `/dashboard`.
3. Confirm the dashboard auth badge displays the expected role and status.
4. Optionally open `/dashboard/dev/supabase-check` and confirm the same profile row appears.

## Rollback To Technician/Pending

Use this to return the account to the normal technician onboarding state.

Replace `OWNER_EMAIL@example.com` before running.

```sql
begin;

update public.profiles
set
  role = 'technician'::public.app_role,
  status = 'pending'::public.profile_status,
  updated_at = now()
where lower(email) = lower('OWNER_EMAIL@example.com')
returning
  id,
  email,
  role,
  status,
  updated_at;

commit;
```

After rollback, verify the dashboard displays:

```text
Role: Technician
Profile status: Pending
```

## Important Warnings

- Verify the user email before running any update.
- Do not expose admin tools publicly yet.
- Do not add owner/admin promotion controls to public signup.
- Do not use the `service_role` key in frontend code.
- Do not rely on dashboard role display as authorization.
- Do not add privileged data to dashboard pages until route protection, server authorization, and RLS are complete.
- Future production promotions should be performed through audited server-side admin tools.

## Current Status

This guide does not apply SQL, change migrations, add route protection, use service-role credentials, or change frontend behavior.
