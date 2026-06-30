# M3 - Dispatcher Matching + Availability Rollback

Milestone tag: `milestone-m3-task122`

Created before Task 123 appointment booking work.

Important git note: the repository currently contains a large uncommitted worktree from Tasks 101-122. The local tag marks the current committed `HEAD`; this document records the application milestone state and files that define the M3 worktree. Do not assume the tag alone captures uncommitted task files.

## Current scope

M3 includes the platform state through Task 122:

- estimate approval flow;
- invoice foundation;
- address intelligence and Google Places address autocomplete;
- provider-neutral integration skeleton;
- provider-free scheduling/dispatcher pipeline;
- read-only dispatcher preview on service request detail;
- dispatcher preview snapshot persistence draft;
- real technician matching from CRM `technician_profiles`;
- technician availability rules foundation draft.

## Applied migrations

User-reported/manual dev-staging application has previously covered:

- `0007_onboarding_foundation_apply_ready.sql`
- `0008_audit_log_foundation_apply_ready.sql`
- `0009_rls_helpers_apply_ready.sql`
- `0010_onboarding_rls_policies_apply_ready.sql`
- `0011_patch_company_members_rls_visibility.sql`
- `0012_onboarding_trusted_rpc.sql`
- `0015_public_technician_profiles_view_apply_ready.sql`
- `0016_dev_public_ready_technician_profile_apply_ready.sql`
- `0017_service_requests_foundation_apply_ready.sql`
- `0018_service_requests_dashboard_read_policies_apply_ready.sql`
- `0021_service_request_photos_foundation_apply_ready.sql`
- `0025_estimate_lifecycle_rpc_apply_ready.sql`
- `0026_estimate_customer_approval_flow_apply_ready.sql`
- `0027_estimate_token_generation_fix_apply_ready.sql`

Migrations created but not necessarily applied by Codex:

- `0013_technician_profile_safe_update_rpc_apply_ready.sql`
- `0014_technician_onboarding_upsert_rpc_apply_ready.sql`
- `0019_service_request_status_update_policies_apply_ready.sql`
- `0020_service_request_notes_foundation_apply_ready.sql`
- `0022_patch_service_request_photos_anon_select_revoke_apply_ready.sql`
- `0023_pricing_catalog_and_estimates_foundation_apply_ready.sql`
- `0024_estimate_ux_v2_fields_apply_ready.sql`
- `0028_invoice_foundation_apply_ready.sql`
- `0029_service_request_address_intelligence_apply_ready.sql`
- `0030_dispatcher_preview_snapshots_apply_ready.sql`
- `0031_technician_availability_rules_apply_ready.sql`

Confirm actual remote state in Supabase before rollback or re-application; Codex does not have authoritative migration history.

## Active RPCs

Known RPCs used by the current app include:

- `create_company_and_owner_membership_rpc`
- `complete_onboarding_rpc`
- `upsert_own_technician_profile_rpc`
- `update_own_technician_profile_rpc`
- `create_service_request_estimate_rpc`
- `update_service_request_estimate_draft_rpc`
- `void_service_request_estimate_draft_rpc`
- `send_service_request_estimate_to_customer_rpc`
- `get_public_estimate_by_token_rpc`
- `respond_to_public_estimate_rpc`
- `create_invoice_from_estimate_rpc`
- `send_service_request_invoice_rpc`
- `mark_service_request_invoice_paid_rpc`
- `void_service_request_invoice_rpc`
- `update_service_request_status_rpc`
- `update_service_request_address_rpc`
- `add_service_request_note_rpc`
- `add_service_request_photo_rpc`
- `save_dispatcher_preview_snapshot_rpc`
- `latest_dispatcher_preview_snapshot_rpc`

## Scheduling engine modules

Provider-free scheduling modules live in `frontend/src/lib/integrations/scheduling/`:

- `types.ts`
- `availability.ts`
- `availability-engine.ts`
- `company-config.ts`
- `company-availability.ts`
- `dispatcher-recommendations.ts`
- `dispatcher-response-builder.ts`
- `scheduling-intake.ts`
- `scheduling-orchestrator.ts`
- `service-request-adapter.ts`
- `technician-matching.ts`
- `technician-availability-rules.ts`
- `dev-scenarios.ts`
- `index.ts`

These modules must remain provider-free until a focused provider task introduces reviewed integration boundaries.

## Dispatcher modules and UI

Current dispatcher surfaces:

- `/dashboard/dev/scheduling-engine` for static provider-free diagnostics.
- `/dashboard/leads/[id]` internal Dispatcher Preview.
- `/api/service-requests/[id]/dispatcher-preview` for internal snapshot save/load.

Current dispatcher preview behavior:

- reads a real service request;
- normalizes scheduling intake;
- loads RLS-readable real technician profiles;
- scores technician matches;
- loads availability rules when `0031` exists;
- runs provider-free availability/recommendation/response pipeline;
- can persist an internal dispatcher snapshot when `0030` exists.

It does not book, assign, hold, notify, or call providers.

## Technician matching

Matching is implemented in `technician-matching.ts`.

Eligibility:

- verified technician status;
- marketplace enabled;
- not suspended, rejected, or archived;
- service ZIP coverage includes the request ZIP.

Ranking:

- ZIP coverage: highest priority;
- appliance specialty: high priority;
- brand experience: medium priority;
- years of experience: medium priority;
- profile completeness: low priority.

Brand specialty is a score boost, not a hard block.

## Availability rules

Availability draft migration: `0031_technician_availability_rules_apply_ready.sql`.

Table: `technician_availability_rules`.

Fields:

- `company_id`
- `technician_profile_id`
- `day_of_week`
- `start_time`
- `end_time`
- `is_available`
- timestamps

These are recurring operational windows only. They are not appointments, holds, calendar events, assignments, or customer promises.

## Known working routes

- `/login`
- `/dashboard`
- `/dashboard/dev/supabase-check`
- `/dashboard/dev/scheduling-engine`
- `/dashboard/leads`
- `/dashboard/leads/[id]`
- `/dashboard/technician-profile`
- `/technicians`
- `/technicians/[slug]`
- `/schedule-service`
- `/estimates/[token]`

## Rollback instructions

Code rollback options:

1. For local source rollback to committed state, inspect `git status --short`.
2. To inspect the milestone tag: `git show milestone-m3-task122`.
3. Because the M3 state includes uncommitted files, use this document plus `git diff` to identify M3 files before reverting any later Task 123 changes.
4. Do not use `git reset --hard` unless the user explicitly approves discarding uncommitted work.

Database rollback guidance:

- Do not drop production or dev/staging data blindly.
- If Task 123 introduces `0032`, rollback should first disable or ignore appointment UI/API paths before considering SQL reversal.
- For dev/staging only, a forward-only rollback migration is preferred over editing old migrations.
- Preserve estimate, invoice, service request, technician profile, dispatcher snapshot, and availability data unless the user explicitly approves destructive cleanup.

## Verification at milestone

Expected commands:

```bash
cd frontend
npm run lint
npm run build -- --webpack
cd ..
git diff --check
```

Task 122 verification passed before Task 123 began.
