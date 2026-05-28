# Onboarding Server Actions Implementation - Task 75

## Purpose

Task 75 adds the first real server-side onboarding action layer for the current dev/staging Supabase onboarding schema.

This is a conservative foundation. It validates authenticated sessions, reads the caller's `public.profiles` row server-side, normalizes inputs, respects the applied RLS policies, and avoids service-role usage.

## Files Added

- `frontend/src/server/onboarding/actions.ts`
- `frontend/src/server/onboarding/supabase.ts`
- `frontend/src/server/onboarding/types.ts`
- `frontend/src/server/onboarding/validation.ts`

## Files Updated

- `frontend/src/lib/supabase/types.ts`
- `frontend/src/lib/auth/profile.ts`

## Implemented Actions

### `createCompanyAndOwnerMembership`

Status: validation-only until a trusted transaction path exists.

Implemented:

- Validates authenticated Supabase access token server-side with `supabase.auth.getUser`.
- Reads the authenticated user's profile through RLS.
- Requires active/verified profile status.
- Requires role `company_owner` or `admin`.
- Validates company name, slug, state, email, phone, and URL fields.
- Stops before writing.

Why it stops:

- Applied RLS intentionally grants no direct authenticated `INSERT` on `companies` or `company_members`.
- Company creation needs an atomic trusted mutation path:
  - insert `companies`
  - insert owner `company_members`
  - update protected `profiles.company_id`
  - update protected onboarding fields
  - insert audit logs

Next required backend work:

- Create a reviewed database RPC or server-only transaction path.
- Add audited insert behavior.
- Add seeded RLS tests for owner/company creation.

### `updateTechnicianProfile`

Status: first real write path, limited to safe draft creation.

Implemented:

- Validates authenticated Supabase access token server-side.
- Reads the authenticated profile through RLS.
- Requires active/verified profile status.
- Requires technician-capable role:
  - `technician`
  - `verified_technician`
  - `expert_technician`
  - `company_owner`
  - `admin`
- Normalizes public/private technician profile fields.
- Checks whether a technician profile already exists.
- Creates a draft `technician_profiles` row when none exists.
- Forces safe server-controlled fields:
  - `affiliation_type = independent`
  - `technician_status = draft`
  - `marketplace_enabled = false`
  - `public_profile_ready = false`
  - verification/rejection/suspension/archive fields remain null

Known limitation:

- Updating an existing technician profile is intentionally not enabled yet because `0010` deferred technician profile updates until column-safe server actions or additional protection triggers exist.
- Pending technicians may still be blocked by the current `current_profile_role()` helper because it only returns real roles for `active` or `verified` profiles. This should be fixed in a future RLS/server-action review if technician onboarding should start while profile status is `pending`.

### `completeOnboarding`

Status: readiness check only until a trusted completion path exists.

Implemented:

- Validates authenticated Supabase access token server-side.
- Reads profile and technician profile state through RLS.
- Calculates whether the profile looks ready for a trusted completion mutation.
- Stops before writing protected profile fields.

Why it stops:

- `profiles.onboarding_status` and `profiles.onboarding_completed_at` are protected by the applied trigger.
- Completion should write audit logs and protected profile fields through a reviewed RPC/server-only transaction.

## Security Protections

- No service-role key is used.
- No service-role key is exposed to browser/frontend code.
- Actions require an access token and validate it server-side with Supabase Auth.
- Actions use a user-scoped Supabase client with the public anon key plus the validated bearer token.
- RLS remains the database enforcement layer.
- Browser-submitted role/company ids are not trusted.
- Privileged multi-table writes stop before partial mutations.
- Audit logs are not written yet because raw `audit_logs` has no browser/authenticated insert path and no trusted server insert helper exists.

## Current Gaps

- No onboarding UI is wired to these actions yet.
- No route protection is added.
- No service-role/server-admin client exists.
- No RPC/transaction exists for company creation or onboarding completion.
- No trusted audit insert helper exists.
- No invite acceptance, join request review, admin verification, or public onboarding forms are implemented.
- Seeded authenticated RLS tests are still needed before onboarding server actions become production-worthy.

## Verification

Completed:

- `npm run lint`
- `npm run build -- --webpack`
- service-role scan of new server/auth code

No SQL was applied. No production data was modified. No packages were installed. No commit was made.
