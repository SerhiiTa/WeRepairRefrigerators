import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/0118_estimate_undo_approval_and_safe_delete_apply_ready.sql",
  ),
  "utf8",
);
const undoRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/undo-approval/route.ts"),
  "utf8",
);
const deleteRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/route.ts"),
  "utf8",
);
const editor = readFileSync(
  resolve(root, "frontend/src/components/dashboard/ManualEstimateEditor.tsx"),
  "utf8",
);
const detail = readFileSync(
  resolve(root, "frontend/src/components/dashboard/ServiceRequestDetail.tsx"),
  "utf8",
);

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

includesAll(migration, [
  "create or replace function public.undo_service_request_estimate_approval_rpc",
  "select *",
  "where id = p_estimate_id",
  "for update",
  "pg_advisory_xact_lock(hashtextextended(estimate_row.service_request_id::text, 216))",
  "public.can_record_service_request_payment(estimate_row.service_request_id)",
  "estimate_row.estimate_status <> 'approved'",
  "Approval cannot be undone because this estimate has payment history.",
  "Approval cannot be undone because this estimate is linked to an invoice.",
  "public.service_request_invoice_estimates membership",
  "'undo_approval'",
  "'previous_approval_source'",
  "'previous_approved_by_profile_id'",
  "'previous_customer_responded_at'",
  "estimate_status = 'draft'",
  "approved_by_profile_id = null",
  "customer_responded_at = null",
  "grant execute on function public.undo_service_request_estimate_approval_rpc(uuid) to authenticated",
]);

assert.ok(
  !/update\s+public\.service_requests[\s\S]*estimate_approved/i.test(
    migration.match(
      /create or replace function public\.undo_service_request_estimate_approval_rpc[\s\S]*?end;\s*\$\$/i,
    )?.[0] ?? "",
  ),
  "Undo Approval must not blindly change Job operational status.",
);

includesAll(migration, [
  "create or replace function public.delete_draft_service_request_estimate_rpc",
  "estimate_row.estimate_status <> 'draft'",
  "This draft estimate has dependent supplemental estimates.",
  "This estimate cannot be deleted because it has payment history.",
  "where allocation.estimate_id = estimate_row.id",
  "or allocation.carried_from_estimate_id = estimate_row.id",
  "where invoice.estimate_id = estimate_row.id",
  "where membership.estimate_id = estimate_row.id",
  "Draft estimate ",
  "was permanently deleted. Snapshot:",
  "delete from public.service_request_estimates",
  "grant execute on function public.delete_draft_service_request_estimate_rpc(uuid) to authenticated",
]);

assert.ok(
  /if\s+to_regclass\('public\.service_request_invoice_estimates'\)\s+is not null[\s\S]*membership\.estimate_id = estimate_row\.id/i.test(
    migration,
  ),
  "Both undo and delete paths should check 0116 invoice membership when present.",
);

includesAll(undoRoute, [
  "undo_service_request_estimate_approval_rpc",
  "Choose a valid estimate to undo approval.",
  "Cannot undo approval: payment history is already recorded.",
  "Cannot undo approval: this estimate is linked to an invoice.",
  "Cannot undo approval: this account does not have permission.",
]);

includesAll(deleteRoute, [
  "delete_draft_service_request_estimate_rpc",
  'message.includes("supplemental")',
  "This estimate can't be deleted because it already contains financial or customer history.",
]);

includesAll(editor, [
  "onUndoApproval",
  "canUndoApproval",
  "Undo Approval",
  "Undo estimate approval?",
  "This returns the Estimate to Draft so it can be edited or deleted.",
  "Approval history is preserved for audit.",
  "estimateStatus === \"approved\"",
  "setEstimateStatus(\"draft\")",
]);

includesAll(detail, [
  "undoEstimateApprovalById",
  "/api/estimates/${estimateId}/undo-approval",
  "Approval undone. This estimate is back in Draft.",
  "estimateStatus: \"draft\"",
  "onUndoApproval={(estimate) =>",
]);

console.log("lifecycle-02c undo/delete estimate static contract: PASS");
