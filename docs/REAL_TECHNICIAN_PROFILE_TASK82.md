# Task 82 — Real Technician Profile Editing

## Summary

Task 82 added the first real dashboard technician profile workflow after auth/onboarding.

The new `/dashboard/technician-profile` page reads the current authenticated user's `technician_profiles` row through Supabase RLS and provides a form for the fields already present in the applied schema.

## Implemented

- Added `/dashboard/technician-profile`.
- Added `TechnicianProfileEditor` dashboard component.
- Added a role-aware navigation link for technician-capable roles.
- Extended the existing `updateTechnicianProfile` server action so it:
  - creates a draft technician profile when none exists and RLS allows insert
  - attempts safe own-profile updates using only editable profile fields
  - relies on the authenticated anon Supabase session
  - uses no service-role key
  - does not bypass RLS

## Supported Schema Fields

The editor supports only fields present in the applied `technician_profiles` schema:

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

The page also displays read-only status/visibility fields:

- `technician_status`
- `affiliation_type`
- `marketplace_enabled`
- `public_profile_ready`

## Update Behavior

Current applied RLS allows authenticated active technician-capable roles to insert their own draft technician profile with safe defaults:

- `technician_status = draft`
- `marketplace_enabled = false`
- `public_profile_ready = false`
- verification/suspension/archive fields unset

Current applied RLS does not yet include a browser-safe update policy for existing `technician_profiles` rows. Existing profile edits therefore attempt a user-scoped anon update and surface the RLS limitation if blocked.

## RLS Limitations

Existing technician profile updates need one of the following before they can reliably save:

- a reviewed column-safe update policy that allows only self-editable profile fields, or
- a narrow trusted RPC/server action that updates only the approved fields and writes audit logs if needed.

Admin-controlled fields must remain server/admin controlled:

- verification fields
- `technician_status`
- `marketplace_enabled`
- `public_profile_ready`
- company affiliation fields
- suspension/rejection/archive fields

## Remaining Schema Needs

Future profile features will need additional schema or companion tables:

- technician phone/contact visibility preferences
- profile photo/avatar storage
- service-area records beyond raw ZIP arrays
- certifications/licenses/insurance fields
- public profile slug and moderation state
- availability and workload records
- audit trail for profile edits
