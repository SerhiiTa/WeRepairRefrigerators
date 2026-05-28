# Backup Task 97

## Current Git Status

Task 97 started with an existing dirty worktree from prior auth, onboarding, public technician, service request, status, notes, timeline, and photo upload tasks. Several docs, dashboard/public components, Supabase migration drafts, and service request files are already modified or untracked.

No commit or archive was created for this backup.

## Relevant Files Likely To Change

- `supabase/migrations/0023_pricing_catalog_and_estimates_foundation_apply_ready.sql`
- `frontend/src/app/api/service-requests/[id]/estimates/route.ts`
- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/types.ts`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

If Task 97 introduces regressions, revert the estimate-specific files/sections above. Preserve existing working service request persistence, status updates, internal notes/timeline, and photo upload foundation from Tasks 91-96.

## DB Migration Expectation

A new apply-ready Supabase migration is expected for pricing catalog items, service request estimates, estimate line items, a narrow create-estimate RPC, and estimate timeline note support. Codex should not apply the migration automatically.
