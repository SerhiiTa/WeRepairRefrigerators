import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/0120_estimate_undo_approval_customer_revision_repair_apply_ready.sql",
  ),
  "utf8",
);
const undoRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/undo-approval/route.ts"),
  "utf8",
);
const editor = readFileSync(
  resolve(root, "frontend/src/components/dashboard/ManualEstimateEditor.tsx"),
  "utf8",
);

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

includesAll(migration, [
  "create or replace function public.undo_service_request_estimate_approval_rpc",
  "public.can_record_service_request_payment(estimate_row.service_request_id)",
  "estimate_row.estimate_status <> 'approved'",
  "Approval cannot be undone because this estimate has payment history.",
  "Approval cannot be undone because this estimate is linked to an invoice.",
  "public.service_request_invoice_estimates",
  "public.service_request_estimate_revisions",
  "revision_status in ('sent', 'approved')",
  "customer_decision = 'approved'",
  "token_revoked_at = coalesce(token_revoked_at, now())",
  "approval_undo_preserves_customer_decision",
  "revoked_revision_count",
  "'undo_approval'",
  "'previous_approval_source'",
  "'previous_customer_responded_at'",
  "estimate_status = 'draft'",
  "approval_source = 'customer'",
  "public_approval_token_hash = null",
  "grant execute on function public.undo_service_request_estimate_approval_rpc(uuid) to authenticated",
]);

const undoFunction =
  migration.match(
    /create or replace function public\.undo_service_request_estimate_approval_rpc[\s\S]*?end;\s*\$\$/i,
  )?.[0] ?? "";

assert.ok(
  !/update\s+public\.service_requests/i.test(undoFunction),
  "Undo Approval must not blindly change Job operational status.",
);

assert.ok(
  /if exists \([\s\S]*service_request_payment_allocations[\s\S]*allocation\.estimate_id = estimate_row\.id[\s\S]*allocation\.carried_from_estimate_id = estimate_row\.id[\s\S]*\)/i.test(
    migration,
  ),
  "Undo Approval must remain blocked by direct and carried-forward allocations.",
);

includesAll(undoRoute, [
  "undo_service_request_estimate_approval_rpc",
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
  "Choose a valid estimate to undo approval.",
  "p_estimate_id: id",
  "Cannot undo approval: payment history is already recorded.",
  "Cannot undo approval: this estimate is linked to an invoice.",
  "Cannot undo approval: this account does not have permission.",
]);

includesAll(editor, [
  'import { createPortal } from "react-dom";',
  "sticky top-0 z-[70]",
  "lg:relative",
  "absolute right-0 z-[90]",
  "document.body",
  'document.body.style.overflow = "hidden"',
  "createPortal(children, document.body)",
  "<EstimateWorkspacePortal>",
  "fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto",
  "pb-[max(1rem,env(safe-area-inset-bottom))]",
  "max-h-[calc(100svh-2rem)]",
  "Undo Approval",
]);

const topLayerOverlayCount = (
  editor.match(/fixed inset-0 z-\[120\]/g) ?? []
).length;

assert.ok(
  topLayerOverlayCount >= 6,
  "Estimate workspace dialogs should render above the sticky workspace header.",
);

assert.ok(
  !editor.includes("fixed inset-0 z-50"),
  "Estimate workspace dialogs must not use z-50 because the sticky header is z-[70].",
);

const portalWrapperCount = (
  editor.match(/<EstimateWorkspacePortal>/g) ?? []
).length;

assert.ok(
  portalWrapperCount >= 6,
  "Estimate workspace dialogs should render through the body portal, outside the sticky workspace stacking context.",
);

console.log("estimate-lifecycle-03.12 undo approval/menu static checks passed");
