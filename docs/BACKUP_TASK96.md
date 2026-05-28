# Backup Task 96

## Current Git Status

Task 96 started with an existing dirty worktree from prior tasks. Current relevant modified/untracked areas include project docs, public intake, dashboard auth/navigation, service request CRM files, Supabase migrations through `0020`, and real service request/notes/status workflow files.

No commit or archive was created for this backup.

## Relevant Files Likely To Change

- `frontend/src/app/api/service-requests/route.ts`
- `frontend/src/components/public/ServiceRequestFlow.tsx`
- `frontend/src/components/public/ServiceRequestForm.tsx`
- `frontend/src/components/public/ServiceRequestSuccess.tsx`
- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/service-requests.ts`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/types.ts`
- `supabase/migrations/0021_service_request_photos_foundation_apply_ready.sql`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

If Task 96 introduces regressions, revert only the photo-upload changes above. Preserve existing service request persistence, dashboard inbox, status update, and internal notes/timeline work from Tasks 91-95.

## DB/Storage Expectation

A new apply-ready Supabase migration is expected for `service_request_photos` metadata, private Storage bucket setup, storage policies, and narrow photo metadata insert/read behavior. Codex should not apply the migration automatically.
