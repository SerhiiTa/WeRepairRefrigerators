# Migration Application Result - Task 72

## Purpose

Task 72 applied the onboarding foundation, audit log foundation, RLS helper, and onboarding RLS policy migrations to the current user-confirmed dev/staging Supabase project.

## Environment

- Environment: dev/staging only
- Supabase project ref: `hejpgyzorrxpfcyvmypb`
- Production data: none
- Production customers: none
- Application state: local/mock frontend still active

## Application Method

Manual Supabase SQL Editor application by the user.

Codex did not execute SQL, did not run Supabase CLI commands, did not use a service-role key, and did not modify the database directly.

## Migrations Applied

The user reported all four migrations completed successfully in this order with `Success. No rows returned.`

1. `supabase/migrations/0007_onboarding_foundation_apply_ready.sql`
2. `supabase/migrations/0008_audit_log_foundation_apply_ready.sql`
3. `supabase/migrations/0009_rls_helpers_apply_ready.sql`
4. `supabase/migrations/0010_onboarding_rls_policies_apply_ready.sql`

## Expected Applied Objects

The successful SQL Editor runs imply these objects were created or updated:

- Onboarding enums:
  - `onboarding_status`
  - `company_status`
  - `company_member_role`
  - `company_member_status`
  - `technician_status`
  - `technician_affiliation_type`
  - `company_invite_status`
  - `company_join_request_status`
- Audit enum:
  - `audit_event_type`
- Tables:
  - `companies`
  - `company_members`
  - `technician_profiles`
  - `company_invites`
  - `company_join_requests`
  - `audit_logs`
- Helper functions:
  - `auth_user_id()`
  - `current_profile_role()`
  - `is_admin()`
  - `is_company_owner(uuid)`
  - `is_active_company_member(uuid)`
  - `current_company_ids()`
  - `can_manage_company(uuid)`
  - `can_view_company(uuid)`
  - `can_manage_company_members(uuid)`
  - `can_view_technician_profile(uuid)`
  - `can_manage_technician_profile(uuid)`
  - `can_view_public_technician_profile(uuid)`
- Conservative onboarding RLS policies from `0010`.

## Verification Performed By Codex

Codex performed non-mutating local and browser-safe checks only:

- Confirmed local public Supabase URL points to project ref `hejpgyzorrxpfcyvmypb`.
- Confirmed `NEXT_PUBLIC_SUPABASE_ANON_KEY` is present without printing the key.
- Scanned project files for service-role exposure; only documentation warnings were found.
- Re-ran blocker phrase scan on `0007`-`0010`.
- Re-ran destructive operation scan on `0007`-`0010`.
- Ran read-only anon REST probes through the public anon key.
- Ran `git diff --check`.

## Browser-Safe REST Probe Results

Anon REST probes returned `42501 permission denied`, which confirms the objects are visible to the API schema while browser/anon access is denied:

| Object | Probe | Result |
| --- | --- | --- |
| `companies` | anon select | `401 / 42501 permission denied` |
| `company_members` | anon select | `401 / 42501 permission denied` |
| `technician_profiles` | anon select | `401 / 42501 permission denied` |
| `company_invites` | anon select | `401 / 42501 permission denied` |
| `company_join_requests` | anon select | `401 / 42501 permission denied` |
| `audit_logs` | anon select | `401 / 42501 permission denied` |
| `auth_user_id()` | anon RPC | `401 / 42501 permission denied` |
| `current_profile_role()` | anon RPC | `401 / 42501 permission denied` |
| `is_admin()` | anon RPC | `401 / 42501 permission denied` |

This is the expected anonymous/browser privacy posture for private onboarding and audit objects.

## Verification Still Needed

The following checks require SQL Editor/admin catalog queries or seeded authenticated users and were not completed by Codex because the Supabase CLI is unavailable and service-role access is not allowed:

- Catalog confirmation that every enum exists.
- Catalog confirmation that every policy exists.
- Catalog confirmation that RLS is enabled on every expected table.
- Authenticated user tests for own-profile reads/updates.
- Authenticated user tests for blocked `profiles.role`, `profiles.status`, `profiles.company_id`, `profiles.onboarding_status`, and `profiles.onboarding_completed_at` self-updates.
- Authenticated tests that raw `company_invites` and `audit_logs` remain unreadable.
- Audit update/delete failure tests.
- Cross-company isolation tests.
- Suspended/removed member tests.
- Helper recursion tests with seeded company/member/technician fixtures.

## Frontend Impact

No frontend behavior changed.

The public marketplace, dashboard mock workflows, repair cases, leads, open jobs, community, analytics, reputation, and AI workflow surfaces still use mock/local data. The newly applied tables are not wired into UI flows yet.

## Follow-Up Tasks

Recommended next tasks:

1. Run SQL Editor catalog verification for tables, enums, functions, RLS, and policies.
2. Create dev/staging seed fixtures for company owners, technicians, companies, memberships, technician profiles, invites, and join requests.
3. Run positive and negative RLS access tests.
4. Design server-side onboarding actions for company creation, invite creation, invite acceptance, join request review, technician profile updates, verification, and onboarding completion.
5. Add trusted audit insert helpers or server-side audit logging before any privileged onboarding mutations.
6. Keep route protection non-blocking until auth/middleware enforcement is explicitly approved.

## Safety Confirmation

- No production data was modified.
- No service-role key was exposed or used by Codex.
- No frontend behavior changed.
- No packages were installed.
- No commit was made.
