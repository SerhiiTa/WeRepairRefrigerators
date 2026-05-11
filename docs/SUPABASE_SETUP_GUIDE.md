# Supabase Setup Guide

## Purpose

This guide explains how to prepare a Supabase project and safely apply the first draft migration for WeRepairRefrigerators.

Important:

- Do not apply migrations automatically.
- Do not connect production data until the SQL has been reviewed.
- Do not commit `.env.local`.
- Never use the `service_role` key in frontend code.
- The first migration, `supabase/migrations/0001_profiles_roles.sql`, is still a review-required draft.

## 1. Create a Supabase project

1. Sign in to Supabase.
2. Create a new project.
3. Choose the organization, project name, region, and database password.
4. Store the database password in a secure password manager.
5. Wait for the project to finish provisioning.

Use a development project first. Do not test the first migration directly against production.

## 2. Find project credentials

In the Supabase dashboard:

1. Open the project.
2. Go to Project Settings.
3. Open API.
4. Copy the Project URL.
5. Copy the anon public key.

Service role warning:

- The `service_role` key bypasses Row Level Security.
- Never put the `service_role` key in `frontend/.env.local`.
- Never expose the `service_role` key to browser code.
- Future server-only workflows may use service-role access, but only from trusted server code with strict scoping.

## 3. Configure frontend environment variables

Create `frontend/.env.local` locally if it does not exist.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

These are public browser-safe values. They allow the frontend Supabase client to initialize.

Do not add:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
```

The service role key must never be used in the frontend.

## 4. Never commit `.env.local`

Before committing any future changes, confirm `.env.local` is not staged:

```bash
git status --short
```

Only `.env.example` style placeholder files should be committed. Real keys belong in local environment files or approved secret storage.

## 5. Review the first migration before applying

Review:

```text
supabase/migrations/0001_profiles_roles.sql
```

Check at minimum:

- `app_role` enum values match `docs/AUTH_ROLES_PLAN.md`.
- `profile_status` enum values match auth planning.
- `public.profiles` is private and not public-safe.
- `role_intent` is advisory only and not authoritative permission data.
- `company_id` is nullable until company tables exist.
- `set_updated_at()` trigger is safe.
- `current_app_role()` security definer behavior is safe for RLS use.
- `prevent_unsafe_profile_updates()` blocks non-admin role/status/company changes.
- `handle_new_user_profile()` creates safe default profile rows.
- RLS is enabled on `public.profiles`.
- Policies do not grant public or anonymous profile access.
- Authenticated users can only select/update their own profile.
- Admin policies depend on a reviewed admin role path.

If any item is unclear, stop and revise the migration before applying it.

## 6. Safe migration option A: Supabase SQL Editor

Manual SQL Editor path:

1. Open Supabase dashboard.
2. Select the development project.
3. Open SQL Editor.
4. Paste the fully reviewed contents of `supabase/migrations/0001_profiles_roles.sql`.
5. Read the SQL one more time in the editor.
6. Run it manually.
7. Save the SQL editor run or note the migration timestamp in project notes.

Use this path for the first controlled development setup if the Supabase CLI is not configured yet.

## 7. Safe migration option B: Supabase CLI later

CLI path can be used later after the project has an approved local Supabase workflow.

Do not run CLI migration commands until:

- Supabase CLI usage is approved for the project.
- The project is linked to the correct Supabase project.
- The target environment is confirmed.
- The migration has been reviewed.
- A rollback/recovery plan exists.

The intended later workflow is:

1. Link the local repo to the correct Supabase project.
2. Confirm the target project is development, not production.
3. Run migration status checks.
4. Apply reviewed migrations.
5. Verify the resulting schema and policies.

Do not use CLI commands from this guide as a blind copy/paste checklist.

## 8. Check after applying the migration

After applying the migration in a development Supabase project, verify:

- `public.profiles` table exists.
- `app_role` enum exists.
- `profile_status` enum exists.
- RLS is enabled for `public.profiles`.
- Policies exist:
  - `Users can select own profile`
  - `Users can update limited own profile fields`
  - `Admins can select all profiles`
  - `Admins can update all profiles`
- Triggers exist:
  - `set_profiles_updated_at`
  - `prevent_unsafe_profile_updates`
  - `on_auth_user_created_create_profile`
- Functions exist:
  - `public.set_updated_at()`
  - `public.current_app_role()`
  - `public.prevent_unsafe_profile_updates()`
  - `public.handle_new_user_profile()`
- `anon` has no direct profile access.
- `authenticated` grants are still constrained by RLS.

## 9. Test signup and login manually

After configuring `frontend/.env.local` and applying the migration in development:

1. Run the frontend locally.
2. Visit `/signup`.
3. Create a test customer account.
4. Create a test technician account with technician role intent.
5. Visit `/login`.
6. Confirm both test accounts can sign in.
7. Confirm dashboard auth-awareness can show the authenticated email.

Current limitation:

- Dashboard routes are still not protected.
- Role intent is not production authorization.
- Real route protection still requires server checks, middleware or route protection, and RLS.

## 10. Verify profile row creation

After each test signup:

1. Open Supabase Table Editor.
2. Open `public.profiles`.
3. Find the test user's row by `id` or `email`.
4. Confirm:
   - `id` matches the Supabase Auth user id.
   - `email` is copied.
   - customer intent defaults to `role = customer` and `status = active`.
   - technician intent defaults to `role = technician` and `status = pending`.
   - `role_intent` is set only to `customer`, `technician`, or `null`.
   - `created_at` and `updated_at` are present.

Also test updating a safe profile field and confirm non-admin role/status/company changes are blocked.

## 11. Rollback caution

Do not run destructive rollback SQL casually.

The first migration creates enums, functions, triggers, policies, and a table linked to `auth.users`. Rolling back may require carefully dropping dependent triggers, policies, functions, table rows, and enum types in the correct order.

Before rolling back:

- Confirm this is a development project.
- Export or back up any useful test data.
- Review dependencies.
- Prefer creating a fresh development project if the setup is still early.
- Never drop production profile data without a reviewed recovery plan.

## 12. Production safety checklist

Before production use:

- Review `docs/BACKEND_ARCHITECTURE_PLAN.md`.
- Review `docs/AUTH_ROLES_PLAN.md`.
- Review `docs/SUPABASE_DATA_MODEL_PLAN.md`.
- Review `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md`.
- Review `docs/API_BACKEND_SERVICE_ARCHITECTURE_PLAN.md`.
- Review and test `supabase/migrations/0001_profiles_roles.sql`.
- Confirm `.env.local` is ignored and not committed.
- Confirm only public Supabase URL and anon key are available to frontend code.
- Confirm service role key is server-only and not present in frontend env files.
- Confirm RLS is enabled before any private data exists.
- Confirm profile policies prevent cross-user reads.
- Confirm admin role assignment has an audited, server-side plan.
- Confirm dashboard routes are protected before real private data is added.
- Confirm technician community and open jobs are gated before launch.
- Confirm test users and seed data are cleaned from production.

## Current status

This guide is documentation only. It does not apply the migration, connect to Supabase, create tables, add packages, change frontend behavior, or implement route protection.
