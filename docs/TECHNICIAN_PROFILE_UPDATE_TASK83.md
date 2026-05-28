# Task 83 — Technician Profile Safe Update Path

## Summary

Task 83 adds a narrow database-side update path for existing technician profile edits.

The chosen approach is a trusted authenticated RPC rather than a broad table `UPDATE` policy. This keeps system-controlled fields protected while allowing technicians to edit their own profile copy fields.

## Created SQL

- `supabase/migrations/0013_technician_profile_safe_update_rpc_apply_ready.sql`

The migration was created but not applied by Codex.

Manual Supabase step before existing profile edits can save:

1. Review `0013_technician_profile_safe_update_rpc_apply_ready.sql`.
2. Apply it to the confirmed dev/staging Supabase project through SQL Editor or the configured CLI.
3. Stop on any SQL error.
4. Confirm `public.update_own_technician_profile_rpc(...)` exists and execute is granted only to `authenticated`.

## RPC Behavior

`public.update_own_technician_profile_rpc(...)`:

- requires `auth.uid()`
- loads the caller's `public.profiles` row
- requires profile status `active` or `verified`
- allows only technician-capable roles:
  - `technician`
  - `verified_technician`
  - `expert_technician`
  - `company_owner`
  - `admin`
- finds only the caller's own non-archived `technician_profiles` row
- rejects profiles in rejected, suspended, or archived technician status
- updates only approved editable fields
- returns the updated technician profile row

## Editable Fields

The RPC and server action allow only:

- `display_name`
- `business_name`
- `years_experience`
- `service_summary_public`
- `bio_private`
- `primary_city`
- `primary_state`
- `service_zip_codes`
- `specialties`
- `languages`

The RPC normalizes text/list inputs server-side so direct RPC calls cannot bypass frontend trimming and length limits.

## Protected Fields

The RPC does not accept or update:

- `profile_id`
- `company_id`
- `affiliation_type`
- `technician_status`
- `marketplace_enabled`
- `public_profile_ready`
- verification fields
- rejection/suspension/archive fields
- ownership fields
- timestamps except normal `updated_at`

## Server Action Wiring

`frontend/src/server/onboarding/actions.ts` now calls `update_own_technician_profile_rpc` when an existing technician profile is present.

If the migration has not been applied yet, the server action returns an honest `trusted_mutation_required` error explaining that Task 83's safe update RPC must be applied before edits can save.

Draft technician profile creation still uses the existing RLS-respecting insert path from Task 82.

## Security Notes

- No `service_role` key is used.
- No frontend/browser code receives privileged credentials.
- The browser cannot choose a target profile id, user id, company id, status, verification field, or marketplace flag.
- The RPC uses authenticated caller identity and explicit ownership validation before writing.
- Public technician profile visibility still requires future sanitized projections/views.

## Remaining Work

- Apply and verify `0013` in dev/staging.
- Run seeded authenticated tests for:
  - owner can update own editable fields
  - another technician cannot update the profile
  - customer cannot call the RPC successfully
  - pending/suspended/rejected profiles are rejected
  - system fields cannot be changed through the RPC
- Add audit logging for profile edit history if needed.
