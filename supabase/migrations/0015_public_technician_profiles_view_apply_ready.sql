-- Task 87: Public technician profile foundation.
-- Apply-ready for dev/staging review, but not applied by Codex.
--
-- Purpose:
--   Expose a sanitized, public-readable technician profile projection for
--   customer-facing SEO/profile pages without granting anonymous access to the
--   raw public.technician_profiles table.
--
-- Security notes:
--   - This view intentionally exposes only public-safe fields.
--   - It excludes profile_id, company_id, bio_private, verification internals,
--     rejection/suspension/archive fields, audit data, email, and phone fields.
--   - Raw technician_profiles grants remain restricted by existing RLS/policies.
--   - Only verified, marketplace-enabled, public-profile-ready, non-archived,
--     non-rejected, non-suspended rows are visible.

create or replace view public.public_technician_profiles
with (security_barrier = true)
as
select
  (
    trim(
      both '-' from lower(
        regexp_replace(
          coalesce(nullif(tp.business_name, ''), nullif(tp.display_name, ''), 'houston-refrigeration-technician'),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        )
      )
    )
    || '-'
    || substring(md5(tp.id::text) from 1 for 8)
  ) as slug,
  tp.display_name,
  tp.business_name,
  tp.primary_city,
  tp.primary_state,
  tp.service_summary_public,
  tp.specialties,
  tp.languages,
  tp.years_experience,
  tp.service_zip_codes,
  tp.technician_status,
  tp.public_profile_ready,
  tp.marketplace_enabled,
  tp.created_at
from public.technician_profiles tp
where tp.public_profile_ready = true
  and tp.marketplace_enabled = true
  and tp.technician_status = 'verified'
  and tp.archived_at is null
  and tp.rejected_at is null
  and tp.suspended_at is null
  and (
    nullif(tp.display_name, '') is not null
    or nullif(tp.business_name, '') is not null
  );

revoke all on public.public_technician_profiles from public;
grant select on public.public_technician_profiles to anon, authenticated;

comment on view public.public_technician_profiles is
  'Sanitized public technician profile projection for customer-facing pages. Does not expose profile_id, company_id, private bio, verification internals, suspension/rejection/archive details, emails, phones, or audit data.';
