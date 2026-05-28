# Task 94 Safety Backup

## Current Git Status

The working tree is already dirty from prior auth, onboarding, public technician profile, service request, and dashboard CRM work. Task 94 should only touch the narrow service request status workflow.

## Relevant Files Likely To Change

- `supabase/migrations/0019_service_request_status_update_policies_apply_ready.sql`
- `frontend/src/app/api/service-requests/[id]/status/route.ts`
- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/types.ts`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Rollback Notes

- Revert the Task 94 API route and UI changes to restore read-only service request detail pages.
- Do not apply the Task 94 SQL migration if status updates should remain disabled.
- If the SQL is manually applied and needs rollback in dev/staging, remove the `update_service_request_status_rpc` function and any related grants; no table structure changes are expected beyond an optional status constraint replacement.

## Database Migration Expectation

A database migration is expected. The current table allows only legacy statuses and has no safe UPDATE path. Task 94 should create an apply-ready RPC migration that updates only `status` and `updated_at`, without granting broad table UPDATE access.
