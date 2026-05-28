# Task 95 Safety Backup

## Current Git Status

The working tree is already dirty from prior auth, onboarding, public technician, service request, dashboard CRM, and status workflow tasks. Task 95 should only add the internal notes/timeline foundation for service requests.

## Relevant Files Likely To Change

- `supabase/migrations/0020_service_request_notes_foundation_apply_ready.sql`
- `frontend/src/app/api/service-requests/[id]/notes/route.ts`
- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/types.ts`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

- Revert the Task 95 API route and `ServiceRequestDetail` changes to return to status-only CRM detail pages.
- Do not apply `0020` if internal notes/timeline should remain disabled.
- If `0020` is manually applied in dev/staging and needs rollback, drop the `service_request_notes` table, related RPCs/policies, and restore the prior `update_service_request_status_rpc` body from `0019`.

## Database Migration Expectation

A database migration is expected. The current schema has real `service_requests` and status RPCs, but no internal note/timeline table. Task 95 should create an apply-ready notes table plus narrow RPCs and should not grant broad browser writes.
