import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "supabase/migrations/0113_manual_payment_collection_rpc_apply_ready.sql"),
  "utf8",
);
const route = readFileSync(
  resolve(root, "frontend/src/app/api/service-requests/[id]/payments/route.ts"),
  "utf8",
);
const conversionRepairMigration = readFileSync(
  resolve(
    root,
    "supabase/migrations/0115_estimate_invoice_conversion_lock_repair_apply_ready.sql",
  ),
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
  "record_manual_service_request_payment_rpc",
  "can_record_service_request_payment",
  "security definer",
  "if auth.uid() is null then",
  "public.can_record_service_request_payment(request_row.id)",
  "cm.member_role in ('owner', 'manager', 'dispatcher', 'technician')",
  "cm.member_status = 'active'",
  "cm.archived_at is null",
  "cm.removed_at is null",
  "cm.suspended_at is null",
  "'cash', 'check', 'zelle', 'venmo', 'cash_app'",
  "payment_status,",
  "'succeeded'",
  "payment_type,",
  "'manual'",
  "recorded_by_profile_id",
  "insert into public.service_request_payment_allocations",
  "allocation_source",
  "'estimate_deposit'",
  "if p_amount > remaining_amount then",
  "provider_payment_key := 'manual:' || clean_idempotency_key",
  "for update;",
  "existing_payment.company_id is distinct from request_row.company_id",
  "allocation_row.estimate_id is distinct from p_target_id",
  "allocation_row.invoice_id is distinct from p_target_id",
  "round(existing_payment.amount, 2) is distinct from round(p_amount, 2)",
  "where invoice.estimate_id = estimate_row.id",
  "estimate_has_invoice := exists",
  "allocation_row.carried_from_estimate_id is distinct from p_target_id",
  "This Estimate has already been converted to an Invoice. Record payment against the Invoice instead.",
  "grant execute on function public.can_record_service_request_payment(uuid)",
  "grant execute on function public.record_manual_service_request_payment_rpc",
  "to authenticated",
]);

assert.ok(
  !migration.includes("public.can_view_service_request(request_row.id)"),
  "Manual payment writes must not be authorized by read/view access alone.",
);

const estimateLockIndex = migration.indexOf("where id = p_target_id\n    for update;");
const estimateAllocationIndex = migration.indexOf(
  "where allocation.estimate_id = estimate_row.id",
);
assert.ok(estimateLockIndex >= 0, "Estimate payment target must be locked.");
assert.ok(
  estimateAllocationIndex > estimateLockIndex,
  "Estimate balance must be calculated after acquiring the Estimate lock.",
);

const invoiceLockIndex = migration.indexOf("where id = p_target_id\n    for update;", estimateLockIndex + 1);
const invoiceAllocationIndex = migration.indexOf(
  "where allocation.invoice_id = invoice_row.id",
);
assert.ok(invoiceLockIndex >= 0, "Invoice payment target must be locked.");
assert.ok(
  invoiceAllocationIndex > invoiceLockIndex,
  "Invoice balance must be calculated after acquiring the Invoice lock.",
);

const existingPaymentIndex = migration.indexOf("into existing_payment");
const balanceRejectionIndex = migration.indexOf("if p_amount > remaining_amount then");
assert.ok(
  existingPaymentIndex > 0 && balanceRejectionIndex > existingPaymentIndex,
  "Idempotent replay must be checked before rejecting against the post-payment remaining balance.",
);

const conversionRejectionIndex = migration.indexOf(
  "if normalized_target_type = 'estimate' and estimate_has_invoice then",
);
assert.ok(
  conversionRejectionIndex > existingPaymentIndex && conversionRejectionIndex < balanceRejectionIndex,
  "Exact idempotent Estimate-payment retries must be allowed before rejecting new payments after Invoice conversion.",
);

assert.ok(
  !/update\s+public\.service_requests/i.test(migration),
  "Manual payment RPC must not mutate operational Job status.",
);
assert.ok(
  !/grant\s+execute[\s\S]*\bto\s+anon\b/i.test(migration),
  "Manual payment RPC must not grant anonymous execution.",
);

includesAll(route, [
  "requireHomeFixPrivateAccess(request)",
  "targetType !== \"estimate\" && targetType !== \"invoice\"",
  "MANUAL_PAYMENT_METHODS.has(paymentMethod)",
  "amountCents === null || amountCents <= 0",
  "record_manual_service_request_payment_rpc",
  "p_service_request_id: serviceRequestId",
  "p_idempotency_key: idempotencyKey",
  "converted to an Invoice",
  "Record payment against the Invoice",
]);

includesAll(conversionRepairMigration, [
  "create or replace function public.create_invoice_from_estimate_rpc",
  "where id = p_estimate_id\n  for update;",
  "on conflict (estimate_id)",
  "where allocation.estimate_id = estimate_row.id",
  "estimate_deposit_carry_forward",
  "grant execute on function public.create_invoice_from_estimate_rpc(uuid) to authenticated",
]);

const conversionEstimateLockIndex = conversionRepairMigration.indexOf(
  "where id = p_estimate_id\n  for update;",
);
const conversionPaymentLockIndex = conversionRepairMigration.indexOf(
  "from public.service_request_payments payment",
);
const conversionCarryForwardIndex = conversionRepairMigration.indexOf(
  "update public.service_request_payment_allocations allocation",
);
assert.ok(
  conversionPaymentLockIndex > conversionEstimateLockIndex,
  "Invoice conversion must lock the Estimate before locking deposit Payment rows.",
);
assert.ok(
  conversionCarryForwardIndex > conversionPaymentLockIndex,
  "Invoice conversion must carry deposits forward after deterministic payment locks.",
);

includesAll(detail, [
  "type InvoiceWorkspaceTab",
  "function openInvoiceWorkspace(invoiceId: string)",
  "function closeInvoiceWorkspace()",
  "function renderInvoiceSummaryCard(invoice: DashboardServiceRequestInvoice)",
  "function renderInvoiceWorkspace(invoice: DashboardServiceRequestInvoice)",
  "Back to Job Finance",
  "Invoice #",
  "From Estimate",
  "break-words text-[clamp(1rem,4.3vw,1.25rem)]",
  "Overview",
  "Items",
  "Payments",
  "Details",
  "History",
  "Invoice Items",
  "Invoice Total",
  "Payments (",
  "Invoice Details",
  "Void Invoice",
  "Delete Invoice",
  "Preview Invoice",
  "Send Invoice",
  "renderInvoiceSummaryCard(financePrimaryInvoice)",
  "renderInvoiceWorkspace(viewingInvoice)",
  "entry.invoiceTarget?.id === invoice.id",
  "const paymentTarget = manualPaymentTargets.find(",
  "target.type === \"invoice\" && target.id === invoice.id",
  "openPaymentWorkflow(paymentTarget)",
  "grid grid-cols-3 divide-x divide-[#D7DEE8] py-3 sm:py-5",
  "whitespace-nowrap break-keep text-[clamp(1.05rem,4.7vw,1.25rem)] font-bold leading-tight text-[#0B1228] tabular-nums",
  "whitespace-nowrap break-keep text-[clamp(1.05rem,4.7vw,1.25rem)] font-bold leading-tight text-emerald-700 tabular-nums",
  "whitespace-nowrap break-keep text-[clamp(1.1rem,5vw,1.375rem)] font-bold leading-tight text-[#0F6BFF] tabular-nums",
  "grid-cols-[0.82fr_0.9fr_1.28fr]",
  "h-11 min-w-0",
  "whitespace-nowrap\">Collect Payment",
  "Collect Deposit",
  "Collect Payment",
  "Payment History",
  "openPaymentWorkflow",
  "expandedPaymentHistoryId",
  "setExpandedPaymentHistoryId",
  "Manual Payment",
  "Save Payment",
  "\"Card - Stripe\", \"Apple Pay / Google Pay\"",
  "Coming Soon",
  "paymentHistory.map(renderPaymentHistoryItem)",
  "No payable Estimate or Invoice is available.",
  "Create Estimate",
  "await Promise.all([loadPayments(), loadEstimates(), loadInvoices()])",
  "get_service_request_invoice_financial_summary_rpc",
  "financialSummary: mapInvoiceFinancialSummaryPayload(summaryData)",
  "const getInvoiceAllocatedCents = (invoice: DashboardServiceRequestInvoice)",
  "invoice.financialSummary\n      ? moneyToCents(invoice.financialSummary.allocatedPaid)",
  "const getInvoiceBalanceDue = (invoice: DashboardServiceRequestInvoice)",
  "invoice.financialSummary.balanceDue",
  "void Promise.all([loadInvoices(), loadPayments(), loadEstimates()])",
]);

assert.doesNotMatch(
  detail,
  /renderInvoiceCard\(financePrimaryInvoice\)/,
  "Job Finance should render a compact Invoice summary card, not the old expanded invoice editor.",
);

assert.ok(
  detail.includes("+{formatServiceRequestMoney(entry.payment.amount)}"),
  "Collapsed payment rows should show compact signed amounts.",
);
assert.ok(
  detail.includes("Provider ID:") && detail.includes("Internal note:"),
  "Expanded payment details should retain provider/reference/note information.",
);
assert.doesNotMatch(
  detail,
  /<h3 className="[^"]*">Quick Actions<\/h3>/,
  "Finance tab should not render the oversized duplicate Quick Actions grid.",
);
assert.doesNotMatch(
  detail,
  /Payment History[\s\S]{0,250}providerPaymentId/,
  "Collapsed Payment History row should not expose provider IDs.",
);

assert.match(
  detail,
  /label: "PAY"[\s\S]*?onClick: \(\) => openPaymentWorkflow\(\)/,
  "Top PAY quick action should open the shared payment workflow.",
);

assert.doesNotMatch(
  detail,
  /setManualPaymentDraft\(\(current\) =>[\s\S]{0,180}event\.currentTarget\.value/,
  "Collect Payment input handlers must capture event.currentTarget.value before deferred state updates.",
);

includesAll(detail, [
  "const nextAmount = event.currentTarget.value;",
  "current ? { ...current, amount: nextAmount } : current",
  "const nextReferenceCode = event.currentTarget.value;",
  "current\n                              ? { ...current, referenceCode: nextReferenceCode }",
  "const nextNote = event.currentTarget.value;",
  "current ? { ...current, note: nextNote } : current",
]);

console.log("manual-payment-workflow static contract: PASS");
