import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration = read(
  "supabase/migrations/0127_finance_v2_estimate_invoice_revision_lifecycle_apply_ready.sql",
);
const records = read("frontend/src/lib/service-request-records.ts");
const serviceRequestDetail = read(
  "frontend/src/components/dashboard/ServiceRequestDetail.tsx",
);
const editor = read("frontend/src/components/dashboard/ManualEstimateEditor.tsx");

test("Finance V2 migration creates draft revisions instead of mutating approved estimates", () => {
  assert.match(migration, /add column if not exists logical_estimate_id uuid/);
  assert.match(migration, /add column if not exists revision_number integer/);
  assert.match(migration, /add column if not exists revision_status text not null default 'current'/);
  assert.match(migration, /create or replace function public\.revise_service_request_estimate_rpc/);
  assert.match(migration, /insert into public\.service_request_estimates/);
  assert.match(migration, /estimate_row\.estimate_status not in \('approved', 'sent', 'declined'\)/);
  assert.match(migration, /'Draft revision created|revision ' \|\| next_revision_number/);
  assert.doesNotMatch(
    migration,
    /set\s+estimate_status\s*=\s*'draft'[\s\S]*where id = estimate_row\.id[\s\S]*returning \* into estimate_row/i,
    "Approved historical estimates must not be reopened in place.",
  );
});

test("Finance V2 invoice conversion creates replacement versions without ON CONFLICT reuse", () => {
  const conversion = migration.match(
    /create or replace function public\.create_invoice_from_estimate_rpc[\s\S]*?end;\s*\$\$/i,
  )?.[0] ?? "";

  assert.match(conversion, /invoice_lifecycle_status/);
  assert.match(conversion, /replaces_invoice_id/);
  assert.match(conversion, /replaced_by_invoice_id/);
  assert.match(conversion, /service_request_invoice_estimates/);
  assert.match(conversion, /membership_status = 'void'/);
  assert.match(conversion, /public\.active_service_request_paid_credit/);
  assert.doesNotMatch(
    conversion,
    /on conflict \(estimate_id\)/i,
    "Invoice conversion must not silently reuse old invoices by estimate_id.",
  );
});

test("Finance V2 payment display uses job-level valid paid credit for current scope", () => {
  assert.match(migration, /create or replace function public\.active_service_request_paid_credit/);
  assert.match(migration, /payment\.payment_status in \('paid', 'succeeded', 'imported', 'partially_refunded'\)/);
  assert.match(migration, /payment\.voided_at is null/);
  assert.match(migration, /current_invoice\.estimate_id is distinct from current_estimate\.id/);
  assert.match(migration, /current_estimate\.revision_number[\s\S]*invoice_source_estimate\.revision_number/);
  assert.doesNotMatch(
    migration,
    /approved_total := coalesce\(current_invoice\.total, current_estimate\.total, 0\)/,
    "Finance V2 summary must not always prefer a stale current Invoice over a newer approved Estimate revision.",
  );
  assert.match(records, /logicalEstimateId/);
  assert.match(records, /revisionNumber/);
  assert.match(records, /invoiceLifecycleStatus/);
  assert.match(serviceRequestDetail, /validPaidCreditCents/);
  assert.match(serviceRequestDetail, /financeBalanceDueTotal = Math\.max\(\s*0,\s*financeApprovedTotal - financePaidTotal/s);
  assert.match(serviceRequestDetail, /invoice\.invoiceLifecycleStatus === "current"[\s\S]*validPaidCreditCents/);
});

test("Finance V2 UI exposes unified Add Item revisions and keeps history visible", () => {
  assert.match(editor, /estimateStatus === "approved"[\s\S]*estimateStatus === "sent"[\s\S]*estimateStatus === "declined"/);
  assert.match(editor, /canStartAddItem/);
  assert.match(editor, /openAddItemType/);
  assert.match(editor, /saveDraft\(\{ source: "manual", linesOverride: nextLines \}\)/);
  assert.match(editor, /buildPayload\(payloadLines/);
  assert.doesNotMatch(editor, /Add Work/);
  assert.match(serviceRequestDetail, /revisionStatus === "current"/);
  assert.match(serviceRequestDetail, /pendingManualEstimateAddItem/);
  assert.match(serviceRequestDetail, /draftEstimateByLogicalEstimateId/);
  assert.match(serviceRequestDetail, /currentEstimateByLogicalEstimateId/);
  assert.match(serviceRequestDetail, /resolveEstimateWorkspaceDocument/);
  assert.match(serviceRequestDetail, /draftEstimateByLogicalEstimateId\.get\(logicalEstimateId\)[\s\S]*currentEstimateByLogicalEstimateId\.get\(logicalEstimateId\)/);
  assert.match(serviceRequestDetail, /rootEstimateDocuments\.map\(\s*resolveEstimateWorkspaceDocument/s);
  assert.match(serviceRequestDetail, /visibleDocumentEstimates/);
  assert.match(serviceRequestDetail, /\(estimate\.logicalEstimateId \?\? estimate\.id\) === estimate\.id/);
  assert.match(serviceRequestDetail, /activeInvoicesByEstimateId/);
  assert.match(serviceRequestDetail, /visibleInvoiceHistory/);
  assert.match(serviceRequestDetail, /invoiceLifecycleStatus === "current"/);
  assert.match(serviceRequestDetail, /invoicePreviewId/);
  assert.match(serviceRequestDetail, /setInvoicePreviewId\(invoice\.id\)/);
  assert.doesNotMatch(serviceRequestDetail, /Invoice preview is not available yet/);
});
