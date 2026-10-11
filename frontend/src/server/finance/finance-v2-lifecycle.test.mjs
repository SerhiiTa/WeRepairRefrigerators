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
const jobInvoiceAggregation = read(
  "supabase/migrations/0131_finance_v2_job_invoice_aggregation_apply_ready.sql",
);
const createEstimateRepair = read(
  "supabase/migrations/0132_finance_v2_create_estimate_logical_identity_repair_apply_ready.sql",
);
const jobInvoiceAuthorizationRepair = read(
  "supabase/migrations/0133_finance_v2_job_invoice_sync_authorization_repair_apply_ready.sql",
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

test("Finance V2 independent Estimate creation populates logical root identity", () => {
  const createEstimate = createEstimateRepair.match(
    /create or replace function public\.create_service_request_estimate_rpc[\s\S]*?end;\s*\$\$/i,
  )?.[0] ?? "";

  assert.match(createEstimate, /v_estimate_id uuid := gen_random_uuid\(\)/);
  assert.match(createEstimate, /insert into public\.service_request_estimates/);
  assert.match(createEstimate, /logical_estimate_id,\s*[\s\S]*revision_number,\s*[\s\S]*revision_status/);
  assert.match(createEstimate, /v_estimate_id,\s*[\s\S]*1,\s*[\s\S]*'current'/);
  assert.match(createEstimate, /public\.user_can_access_company\(v_company_id\)/);
  assert.match(createEstimate, /public\.can_view_service_request\(p_request_id\)/);
  assert.match(createEstimateRepair, /grant execute on function public\.create_service_request_estimate_rpc\(uuid, jsonb, jsonb, jsonb\) to authenticated/);
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

test("Finance V2 Job summary sums effective current approved Estimates instead of stale Invoice snapshots", () => {
  assert.match(
    serviceRequestDetail,
    /const financeApprovedEstimates = Array\.from\(\s*currentEstimateByLogicalEstimateId\.values\(\),\s*\)/s,
    "Job approved scope must be derived from the effective current approved Estimate revisions.",
  );
  assert.match(
    serviceRequestDetail,
    /estimate\.estimateStatus === "approved"[\s\S]*estimate\.revisionStatus === "current"[\s\S]*estimate\.archivedAt === null/s,
  );
  assert.match(
    serviceRequestDetail,
    /const financeApprovedTotal = financeApprovedEstimates\.reduce\(\s*\(total, estimate\) => total \+ estimate\.total,\s*0,\s*\)/s,
    "Multiple approved logical Estimates should combine into one Job-level approved scope.",
  );
  assert.doesNotMatch(
    serviceRequestDetail,
    /const financeApprovedTotal =\s*financeCurrentInvoices\.reduce/,
    "A stale current Invoice snapshot must not define the Job approved scope.",
  );
});

test("Finance V2 Stage 2 resolves Job approved scope from effective approved Estimate revisions", () => {
  assert.match(
    jobInvoiceAggregation,
    /create or replace function public\.get_service_request_effective_approved_scope_rpc/,
  );
  assert.match(jobInvoiceAggregation, /partition by coalesce\(estimate\.logical_estimate_id, estimate\.id\)/);
  assert.match(jobInvoiceAggregation, /estimate\.estimate_status = 'approved'/);
  assert.match(jobInvoiceAggregation, /coalesce\(estimate\.revision_status, 'current'\) = 'current'/);
  assert.match(jobInvoiceAggregation, /estimate\.archived_at is null/);
  assert.match(jobInvoiceAggregation, /coalesce\(round\(sum\(effective\.total\), 2\), 0\) as total/);
  assert.doesNotMatch(
    jobInvoiceAggregation,
    /sum\(invoice\.total\)/i,
    "Approved Job scope must not be derived from existing Invoice totals.",
  );
});

test("Finance V2 Stage 2 synchronizes one combined current Job Invoice without touching payments", () => {
  assert.match(
    jobInvoiceAggregation,
    /create or replace function public\.sync_job_invoice_from_approved_estimates_rpc/,
  );
  assert.match(jobInvoiceAggregation, /pg_advisory_xact_lock\(hashtextextended\(request_row\.id::text, 127\)\)/);
  assert.match(jobInvoiceAggregation, /invoice_lifecycle_status = 'superseded'/);
  assert.match(jobInvoiceAggregation, /source_type,\s*[\s\S]*'consolidated_conversion'/);
  assert.match(jobInvoiceAggregation, /source_logical_estimate_id/);
  assert.match(jobInvoiceAggregation, /source_approved_estimate_id/);
  assert.match(jobInvoiceAggregation, /public\.active_service_request_paid_credit\(request_row\.id\)/);
  assert.doesNotMatch(jobInvoiceAggregation, /delete from public\.service_request_payments/i);
  assert.doesNotMatch(jobInvoiceAggregation, /delete from public\.service_request_payment_allocations/i);
  assert.doesNotMatch(
    jobInvoiceAggregation,
    /create unique index[\s\S]*on public\.service_request_invoices \(service_request_id\)[\s\S]*invoice_lifecycle_status = 'current'/i,
    "The final one-current-Invoice uniqueness index must wait until existing duplicate-current Production Jobs are reconciled.",
  );
});

test("Finance V2 Job Invoice sync uses internal Finance write authorization", () => {
  const syncRepair = jobInvoiceAuthorizationRepair.match(
    /create or replace function public\.sync_job_invoice_from_approved_estimates_rpc[\s\S]*?end;\s*\$\$/i,
  )?.[0] ?? "";

  assert.match(syncRepair, /public\.can_record_service_request_payment\(request_row\.id\)/);
  assert.doesNotMatch(
    syncRepair,
    /public\.can_view_service_request\(request_row\.id\)/,
    "Job Invoice sync is a financial document write and must not use read-only Job visibility authorization.",
  );
  assert.match(
    jobInvoiceAuthorizationRepair,
    /grant execute on function public\.sync_job_invoice_from_approved_estimates_rpc\(uuid\) to authenticated/,
  );
});

test("Finance V2 Stage 2 summary exposes sync status, balance and overpayment", () => {
  assert.match(
    jobInvoiceAggregation,
    /create or replace function public\.get_service_request_finance_v2_summary_rpc/,
  );
  assert.match(jobInvoiceAggregation, /'invoice_sync_required'/);
  assert.match(jobInvoiceAggregation, /'balance_due', greatest\(approved_total - paid_credit, 0\)/);
  assert.match(jobInvoiceAggregation, /'overpayment', greatest\(paid_credit - approved_total, 0\)/);
  assert.match(jobInvoiceAggregation, /'contributing_approved_estimate_ids'/);
  assert.match(jobInvoiceAggregation, /current_invoice_count <> 1/);
});

test("Finance V2 Stage 2 blocks checkout reservations for stale current Invoices", () => {
  assert.match(
    jobInvoiceAggregation,
    /create or replace function public\.validate_invoice_checkout_matches_job_scope/,
  );
  assert.match(
    jobInvoiceAggregation,
    /create trigger validate_invoice_checkout_matches_job_scope[\s\S]*before insert or update of invoice_id, checkout_status, amount[\s\S]*on public\.service_request_payment_checkout_attempts/s,
  );
  assert.match(jobInvoiceAggregation, /current_invoice_count <> 1/);
  assert.match(
    jobInvoiceAggregation,
    /round\(coalesce\(invoice_row\.total, 0\), 2\) <> approved_total/,
  );
  assert.match(jobInvoiceAggregation, /Invoice must be synchronized before checkout/);
});

test("Finance V2 Stage 3 unapprove removes one logical Estimate from scope without payment deletion", () => {
  const unapprove = jobInvoiceAggregation.match(
    /create or replace function public\.undo_service_request_estimate_approval_rpc[\s\S]*?end;\s*\$\$/i,
  )?.[0] ?? "";

  assert.match(unapprove, /coalesce\(estimate_row\.logical_estimate_id, estimate_row\.id\)/);
  assert.match(unapprove, /estimate\.estimate_status = 'approved'/);
  assert.match(unapprove, /coalesce\(estimate\.revision_status, 'current'\) = 'current'/);
  assert.match(unapprove, /estimate_status = 'draft'/);
  assert.match(unapprove, /revision_status = 'draft'/);
  assert.match(unapprove, /finance_v2_invoice_sync_required/);
  assert.match(unapprove, /public\.get_service_request_finance_v2_summary_rpc/);
  assert.doesNotMatch(unapprove, /service_request_payment_allocations allocation[\s\S]*raise exception/i);
  assert.doesNotMatch(unapprove, /service_request_invoice_estimates membership[\s\S]*raise exception/i);
  assert.doesNotMatch(unapprove, /delete from public\.service_request_payments/i);
  assert.doesNotMatch(unapprove, /delete from public\.service_request_payment_allocations/i);
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
