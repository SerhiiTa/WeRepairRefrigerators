# Backup Task 98

## Current Git Status

Task 98 started with an existing dirty worktree from prior auth, onboarding, public technician, CRM service request, status, notes, photos, and estimate foundation tasks. Important estimate-related files from Task 97 are still untracked/modified in the working tree.

No commit or archive was created for this backup.

## Relevant Files Likely To Change

- `supabase/migrations/0024_estimate_ux_v2_fields_apply_ready.sql`
- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/types.ts`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

If Task 98 introduces regressions, revert only the estimate v2 migration/types/UI changes above. Preserve Task 97 estimate foundation files and all service request, notes, timeline, and photo upload work.

## DB Migration Expectation

A new apply-ready Supabase migration is expected to extend the existing pricing catalog and estimate tables with customer-preview fields, warranty/disclaimer text, customer price, technician cost, taxability, and estimate numbering. Codex should not apply the migration automatically.
