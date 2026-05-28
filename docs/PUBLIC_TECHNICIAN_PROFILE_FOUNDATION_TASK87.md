# Task 87 — Public Technician Profile Foundation

## Summary

Task 87 establishes the first Supabase-backed public technician profile foundation while preserving strict public/private data boundaries.

The existing public technician routes remain:

- `/technicians`
- `/technicians/[slug]`

The routes now load through a public-safe profile loader that reads a sanitized Supabase projection when available and falls back to existing mock public technician previews when the view has not been applied or has no public rows yet.

## SQL Created

- `supabase/migrations/0015_public_technician_profiles_view_apply_ready.sql`

Codex did not apply this migration.

The migration creates:

- `public.public_technician_profiles`

This is a sanitized public view over `public.technician_profiles`.

## Public Exposure Boundary

The public view exposes only:

- `slug`
- `display_name`
- `business_name`
- `primary_city`
- `primary_state`
- `service_summary_public`
- `specialties`
- `languages`
- `years_experience`
- `service_zip_codes`
- `technician_status` as `verified` only
- `public_profile_ready`
- `marketplace_enabled`
- `created_at`

The public view never exposes:

- `profile_id`
- `company_id`
- `bio_private`
- email
- phone
- private notes
- verification internals
- suspension/rejection/archive fields
- audit/admin data
- exact technician schedule data
- customer data

## Public Readiness Gating

Rows are public only when all of the following are true:

- `public_profile_ready = true`
- `marketplace_enabled = true`
- `technician_status = verified`
- `archived_at is null`
- `rejected_at is null`
- `suspended_at is null`
- display name or business name is present

Draft, pending, suspended, rejected, archived, or non-marketplace profiles are excluded from the public view.

## Slug Strategy

The public view derives a deterministic slug from:

1. `business_name`, if present
2. otherwise `display_name`
3. otherwise a safe fallback label

It appends a short non-reversible hash suffix based on the internal technician profile id:

```text
normalized-name-xxxxxxxx
```

This avoids exposing raw ids while reducing collisions until a dedicated public slug column/moderation workflow is added.

Future production work should add a reviewed `public_slug` column or slug reservation table for durable SEO URLs.

## Frontend Loader

Created:

- `frontend/src/lib/public-technician-profiles.ts`

The loader:

- uses the public anon Supabase server client only
- queries `public_technician_profiles`
- maps rows into the existing public `TechnicianProfilePreview` UI contract
- falls back to existing mock public technician previews if Supabase/view data is unavailable
- does not query raw `technician_profiles`
- does not use service-role credentials

## Route Updates

Updated:

- `frontend/src/app/technicians/page.tsx`
- `frontend/src/app/technicians/[slug]/page.tsx`

Both routes are now dynamic so future public Supabase profile rows can appear without static rebuild-only routing.

The detail route:

- loads Supabase public view data first
- falls back to existing mock technician data only for existing mock slugs
- returns `notFound()` for missing/non-public slugs
- keeps SEO metadata public-safe

## UI Copy Cleanup

Updated public technician components to avoid implying real ratings or live booking when no real data exists:

- `TechnicianTrustStats`
- `TechnicianProfileHeader`
- `TechnicianServiceAreas`
- `TechnicianRepairCaseList`

## Security Notes

- No service-role key is used.
- No RLS bypass exists in frontend code.
- Anonymous/public access should be granted only to the sanitized view, not the raw table.
- Public profile pages must keep using the view/mapper and must not query raw dashboard/private technician profile rows.
- Public repair case attribution remains mock-only until real privacy-safe published repair case records exist.

## Manual Supabase Step

Before real public technician profiles can appear from Supabase:

1. Review `supabase/migrations/0015_public_technician_profiles_view_apply_ready.sql`.
2. Apply it manually to dev/staging only.
3. Verify anonymous select works on `public.public_technician_profiles`.
4. Verify raw `public.technician_profiles` remains inaccessible to anonymous users.
5. Create or update a verified, marketplace-enabled, public-profile-ready technician profile row for testing.

Codex did not apply SQL.

## Remaining Limitations

- No review system.
- No ratings.
- No messaging.
- No booking/dispatch.
- No lead claiming.
- No Stripe/payment work.
- No public ZIP search migration to real data yet.
- No dedicated `public_slug` column yet.
- Existing public technician listing can still fall back to mock profiles when the public view is absent or empty.
