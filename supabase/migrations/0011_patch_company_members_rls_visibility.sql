-- WeRepairRefrigerators Task 74 dev/staging patch.
--
-- Purpose:
-- Tighten raw company_members self-read visibility after Task 73 found that
-- suspended members could still read their own row, including private/internal
-- notes, while archived_at was null.
--
-- Scope:
-- - Current confirmed dev/staging Supabase project only.
-- - Does not change frontend behavior.
-- - Removes raw self-row visibility for non-manager members because the table
--   includes private/internal notes.
-- - Keeps company manager/admin membership visibility through the existing
--   "Company managers can select memberships" policy from 0010.
-- - If users need to see their own membership state later, expose a sanitized
--   view/RPC that excludes private/internal notes.

drop policy if exists "Users can select own company memberships"
on public.company_members;

drop policy if exists "Users can select own active company memberships"
on public.company_members;

-- Intentionally no replacement self-select policy here.
-- Raw company_members includes private/admin fields such as notes, so non-manager
-- users should not read it directly. The existing manager/admin policy remains:
-- "Company managers can select memberships" using public.can_manage_company_members(company_id).
