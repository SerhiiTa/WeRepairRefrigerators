import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const editor = readFileSync(
  resolve(root, "frontend/src/components/dashboard/ManualEstimateEditor.tsx"),
  "utf8",
);
const detail = readFileSync(
  resolve(root, "frontend/src/components/dashboard/ServiceRequestDetail.tsx"),
  "utf8",
);
const route = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/approve-for-customer/route.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/0114_manual_estimate_approval_rpc_repair_apply_ready.sql",
  ),
  "utf8",
);

assert.ok(
  editor.includes("message: approvalResult.message"),
  "ManualEstimateEditor must surface the API's safe manual approval error.",
);
assert.ok(
  editor.includes("function isPersistedEstimateUuid(value: string | null)") &&
    editor.includes("isPersistedEstimateUuid(savedEstimateId)") &&
    editor.includes("This estimate needs a saved database record before it can be approved."),
  "ManualEstimateEditor must disable manual approval unless a persisted estimate UUID is available.",
);
assert.ok(
  detail.includes("function isPersistedEstimateUuid(value: string)") &&
    detail.includes("if (!isPersistedEstimateUuid(estimateId))") &&
    detail.includes("`/api/estimates/${estimateId}/approve-for-customer`"),
  "ServiceRequestDetail must submit the persisted estimate UUID and reject invalid IDs before calling the route.",
);
assert.ok(
  detail.includes("return { ok: true as const }"),
  "ServiceRequestDetail should return an explicit successful approval result.",
);
assert.ok(
  detail.includes("payload?.message ??"),
  "ServiceRequestDetail should preserve the route's safe failure message.",
);
assert.ok(
  route.includes("formatManualApprovalError(error.message)"),
  "Approval route should map database errors to safe user-facing messages.",
);
assert.ok(
  route.includes(
    "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
  ),
  "Approval route must accept standard persisted UUIDs with 8-4-4-4-12 grouping.",
);

for (const requiredSql of [
  "if auth.uid() is null then",
  "public.can_view_service_request(estimate_row.service_request_id)",
  "estimate_row.estimate_status = 'declined'",
  "estimate_row.estimate_status = 'void'",
  "if estimate_row.estimate_status <> 'approved' then",
  "estimate_status = 'approved'",
  "approval_source = 'technician_manual'",
  "approved_by_profile_id = auth.uid()",
  "customer_responded_at = coalesce(customer_responded_at, now())",
  "status = 'estimate_approved'",
  "grant execute on function public.approve_service_request_estimate_for_customer_rpc(uuid) to authenticated",
]) {
  assert.ok(migration.includes(requiredSql), `Expected SQL contract: ${requiredSql}`);
}

assert.ok(
  !migration
    .split(/\r?\n/)
    .some((line) => /^\s*grant\b.*\bto\s+anon\b/i.test(line)),
  "Manual approval repair must not grant execute/table privileges to anon.",
);
assert.ok(
  !migration.includes("public_approval_token_hash ="),
  "Manual approval must not fabricate or mutate customer approval tokens.",
);

console.log("manual-estimate-approval workflow static contract: PASS");
