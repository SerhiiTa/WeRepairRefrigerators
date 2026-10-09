import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/0119_estimate_customer_revision_approval_apply_ready.sql",
  ),
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
const sendRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/send/route.ts"),
  "utf8",
);
const reviseRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/revise/route.ts"),
  "utf8",
);
const respondRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/respond/route.ts"),
  "utf8",
);
const publicApproval = readFileSync(
  resolve(root, "frontend/src/components/public/PublicEstimateApproval.tsx"),
  "utf8",
);

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

includesAll(migration, [
  "create table if not exists public.service_request_estimate_revisions",
  "create table if not exists public.service_request_estimate_revision_items",
  "create table if not exists public.service_request_estimate_revision_deliveries",
  "create or replace function public.create_service_request_estimate_revision_snapshot",
  "create or replace function public.send_service_request_estimate_to_customer_rpc",
  "create or replace function public.revise_service_request_estimate_rpc",
  "create or replace function public.get_public_estimate_by_token_rpc",
  "create or replace function public.respond_to_public_estimate_rpc",
  "public_approval_token_hash",
  "token_expires_at",
  "token_revoked_at",
  "revision_number",
  "customer_decision",
  "customer_decision_channel",
]);

assert.match(
  migration,
  /update public\.service_request_estimate_revisions[\s\S]*token_revoked_at = coalesce\(token_revoked_at, now\(\)\)/,
  "Sending or revising must revoke older open customer links.",
);
assert.match(
  migration,
  /revision_row := public\.create_service_request_estimate_revision_snapshot\(/,
  "Send RPC should snapshot the revision before returning an approval token.",
);
const sendRpcBody = migration.match(
  /create or replace function public\.send_service_request_estimate_to_customer_rpc[\s\S]*?end;\s*\$\$/i,
)?.[0];
assert.ok(sendRpcBody, "Expected to find Send Estimate RPC body.");
assert.ok(
  !sendRpcBody.includes("p_response"),
  "Send Estimate RPC must not reference customer response variables.",
);
assert.ok(
  !sendRpcBody.includes("revision_row.customer_id"),
  "Send Estimate RPC should use the Job customer, not a non-existent revision customer field.",
);
assert.match(
  sendRpcBody,
  /insert into public\.communication_timeline_events[\s\S]*'estimate_sent'[\s\S]*request_row\.customer_id/s,
  "Send Estimate RPC should record an estimate_sent timeline event against the matching conversation.",
);
const respondRpcBody = migration.match(
  /create or replace function public\.respond_to_public_estimate_rpc[\s\S]*?end;\s*\$\$/i,
)?.[0];
assert.ok(respondRpcBody, "Expected to find public Estimate response RPC body.");
assert.match(
  respondRpcBody,
  /insert into public\.communication_timeline_events[\s\S]*estimate_approved[\s\S]*estimate_declined[\s\S]*request_row\.customer_id/s,
  "Public Estimate responses should record approval/decline timeline events against the matching conversation.",
);
assert.match(
  migration,
  /insert into public\.service_request_estimate_revision_items[\s\S]*from public\.service_request_estimate_items item/,
  "Revision snapshots should copy estimate items instead of reading mutable current items.",
);
assert.match(
  migration,
  /delivery_channel,[\s\S]*'email'[\s\S]*'unavailable'/,
  "Email delivery must not fake provider success while no email provider exists.",
);
includesAll(migration, [
  "communication_message_id",
  "idempotency_key",
  "request_fingerprint",
  "estimate_declined",
]);
assert.match(
  migration,
  /if revision_row\.token_revoked_at is not null then[\s\S]*newest estimate link/,
  "Stale revision links must be rejected with a safe updated-estimate message.",
);
assert.match(
  migration,
  /if revision_row\.token_expires_at <= now\(\) then[\s\S]*estimate link has expired/,
  "Expired revision links must be rejected.",
);
assert.match(
  migration,
  /if revision_row\.customer_decision is not null then[\s\S]*'idempotent', true/,
  "Double-submit customer responses should be idempotent.",
);
assert.match(
  migration,
  /where id = p_estimate_id\s+for update/,
  "Send/revise RPCs should lock the Estimate row before lifecycle changes.",
);
assert.match(
  migration,
  /where public_approval_token_hash = token_hash\s+for update/,
  "Customer response should lock the revision token row.",
);
assert.match(
  migration,
  /where id = revision_row\.estimate_id\s+for update/,
  "Customer response should lock the Estimate row before approval/decline.",
);
assert.match(
  migration,
  /from public\.service_request_payment_allocations allocation[\s\S]*allocation_status = 'active'/,
  "Revision should be blocked after active Estimate deposits.",
);
assert.match(
  migration,
  /from public\.service_request_invoices invoice[\s\S]*invoice_status <> 'void'/,
  "Revision should be blocked after invoice conversion.",
);

includesAll(editor, [
  "onReviseEstimate",
  "canReviseEstimate",
  "reviseEstimate",
  "Revise Estimate",
  "Create Draft Revision",
  "Previously sent links were revoked",
]);
assert.match(
  editor,
  /estimateStatus === "sent"[\s\S]*?Resend[\s\S]*?Revise[\s\S]*?Mark Approved/,
  "Sent estimates should expose resend, revise, and manual approval actions.",
);
assert.match(
  editor,
  /estimateStatus === "declined"[\s\S]*?Create Draft Revision/,
  "Declined estimates should expose a draft revision workflow.",
);

includesAll(detail, [
  "reviseEstimateById",
  "/api/estimates/${estimateId}/revise",
  "onReviseEstimate",
]);
includesAll(reviseRoute, [
  "revise_service_request_estimate_rpc",
  "Only sent or declined estimates can be reopened as a draft revision.",
  "This estimate already has payments",
  "This estimate is linked to an invoice",
]);
includesAll(sendRoute, [
  "Choose SMS or Email before sending this estimate.",
  "sendEstimateRevisionSms",
  "send_service_request_estimate_to_customer_rpc",
  "Estimate sent by SMS.",
  "provider_unavailable",
  "Email estimate delivery is not configured yet. Choose SMS for this send.",
]);
includesAll(respondRoute, [
  "This estimate has been updated. Please ask the technician for the newest approval link.",
  "This estimate link has expired. Please ask the technician to resend the estimate.",
]);
includesAll(publicApproval, [
  "link_state",
  "Updated estimate available",
  "Estimate link expired",
  "Please ask the technician for the newest approval link.",
]);

console.log("estimate-lifecycle-03-customer-revisions static checks passed");
