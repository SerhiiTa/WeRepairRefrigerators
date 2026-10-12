import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration = read(
  "supabase/migrations/0128_finance_v2_checkout_paid_credit_alignment_apply_ready.sql",
);
const jobBalanceAlignmentMigration = read(
  "supabase/migrations/0138_finance_v2_stripe_estimate_job_balance_alignment_apply_ready.sql",
);
const publicInvoiceAuthRepair = read(
  "supabase/migrations/0129_public_invoice_checkout_token_authorization_repair_apply_ready.sql",
);

test("Finance V2 checkout uses job-level paid credit and job-level reservations", () => {
  assert.match(migration, /create or replace function public\.active_service_request_checkout_reserved_amount/);
  assert.match(migration, /public\.active_service_request_paid_credit\(estimate_row\.service_request_id\)/);
  assert.match(migration, /public\.active_service_request_paid_credit\(invoice_row\.service_request_id\)/);
  assert.match(migration, /public\.active_service_request_checkout_reserved_amount\(estimate_row\.service_request_id\)/);
  assert.match(migration, /public\.active_service_request_checkout_reserved_amount\(invoice_row\.service_request_id\)/);
  assert.doesNotMatch(
    migration,
    /where allocation\.estimate_id = estimate_row\.id[\s\S]{0,120}allocation_status = 'active'/,
    "Checkout eligibility must not calculate paid balance from only current Estimate allocations.",
  );
  assert.doesNotMatch(
    migration,
    /where allocation\.invoice_id = invoice_row\.id[\s\S]{0,120}allocation_status = 'active'/,
    "Checkout eligibility must not calculate paid balance from only current Invoice allocations.",
  );
});

test("Finance V2 checkout rejects stale or superseded payment targets", () => {
  assert.match(migration, /coalesce\(estimate_row\.revision_status, 'current'\) <> 'current'/);
  assert.match(migration, /coalesce\(invoice_row\.invoice_lifecycle_status, 'current'\) <> 'current'/);
  assert.match(migration, /Cannot post payment to a stale Estimate revision/);
  assert.match(migration, /Cannot post payment to a stale or void Invoice/);
});

test("Finance V2 reservation requires exact current eligible amount", () => {
  assert.match(migration, /round\(p_amount, 2\) is distinct from round\(eligible_amount, 2\)/);
  assert.match(migration, /Payment amount must match the current eligible balance/);
  assert.match(migration, /checkout_in_progress/);
  assert.match(migration, /This idempotency key was already used for a different checkout request/);
});

test("Finance V2 webhook posting preserves canonical ledger and posts to current target", () => {
  assert.match(migration, /create or replace function public\.record_stripe_checkout_payment_rpc/);
  assert.match(migration, /public\.active_service_request_paid_credit\(attempt_row\.service_request_id\)/);
  assert.match(migration, /available_amount := greatest\(target_total - paid_credit, 0\);/);
  assert.match(migration, /insert into public\.service_request_payments/);
  assert.match(migration, /insert into public\.service_request_payment_allocations/);
  assert.match(migration, /finance_v2_job_credit_allocation/);
  assert.match(migration, /target_invoice_id := current_invoice_row\.id/);
});

test("Finance V2 Stripe Estimate checkout uses current Job approved scope instead of only the target Estimate total", () => {
  assert.match(
    jobBalanceAlignmentMigration,
    /service_request_payment_checkout_attempts_kind_check[\s\S]*custom_deposit/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /create or replace function public\.get_service_request_payment_eligibility_rpc/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /scope := public\.get_service_request_effective_approved_scope_rpc\(estimate_row\.service_request_id\);/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /target_total := approved_total;/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /remaining_amount := greatest\(target_total - paid_credit - reserved_amount, 0\);/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /approved_scope_estimate\.value::uuid/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /estimate_not_in_current_scope/,
  );
  assert.doesNotMatch(
    jobBalanceAlignmentMigration,
    /target_total := estimate_row\.total;/,
    "Estimate checkout must not compare total of one Estimate against all Job-level paid credit.",
  );
});

test("Finance V2 Stripe posting validates against remaining Job balance without double-counting its own reservation", () => {
  assert.match(
    jobBalanceAlignmentMigration,
    /create or replace function public\.record_stripe_checkout_payment_rpc/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /scope := public\.get_service_request_effective_approved_scope_rpc\(attempt_row\.service_request_id\);/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /other_reserved_amount := greatest\(active_reserved_amount - attempt_row\.amount, 0\);/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /available_amount := greatest\(target_total - paid_credit - other_reserved_amount, 0\);/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /Cannot post payment to an Estimate outside the current approved Job scope/,
  );
  assert.match(
    jobBalanceAlignmentMigration,
    /finance_v2_other_active_reserved_before_posting/,
  );
  assert.doesNotMatch(
    jobBalanceAlignmentMigration,
    /available_amount := greatest\(target_total - paid_credit, 0\);/,
    "Webhook posting must account for other active reservations without subtracting the completed attempt twice.",
  );
});

test("public Invoice Checkout is token-scoped and avoids dashboard authorization", () => {
  assert.match(
    publicInvoiceAuthRepair,
    /create or replace function public\.reserve_public_invoice_payment_checkout_rpc/,
  );
  assert.match(
    publicInvoiceAuthRepair,
    /public\.estimate_approval_token_hash\(p_token\)/,
  );
  assert.match(
    publicInvoiceAuthRepair,
    /from public\.service_request_invoice_delivery_tokens invoice_token[\s\S]*where invoice_token\.token_hash = clean_token_hash[\s\S]*for update/,
  );
  assert.match(
    publicInvoiceAuthRepair,
    /where id = token_row\.service_request_id[\s\S]*and id = invoice_row\.service_request_id[\s\S]*and company_id = token_row\.company_id/,
  );
  assert.match(
    publicInvoiceAuthRepair,
    /from public\.customers[\s\S]*where id = request_row\.customer_id[\s\S]*and company_id = request_row\.company_id/,
  );
  assert.match(
    publicInvoiceAuthRepair,
    /public\.active_service_request_paid_credit\(request_row\.id\)/,
  );
  assert.match(
    publicInvoiceAuthRepair,
    /public\.active_service_request_checkout_reserved_amount\(request_row\.id\)/,
  );
  assert.match(
    publicInvoiceAuthRepair,
    /balance_due := greatest\(invoice_row\.total - paid_credit - reserved_amount, 0\)/,
  );
  assert.match(publicInvoiceAuthRepair, /Payment checkout already in progress/);
  assert.match(publicInvoiceAuthRepair, /This idempotency key was already used/);
  assert.match(
    publicInvoiceAuthRepair,
    /grant execute on function public\.reserve_public_invoice_payment_checkout_rpc\(text, text, text, text, text\) to anon, authenticated/,
  );
  assert.doesNotMatch(
    publicInvoiceAuthRepair,
    /can_view_service_request/,
    "Public invoice checkout must be authorized by the secure invoice token, not dashboard auth.",
  );
  assert.doesNotMatch(
    publicInvoiceAuthRepair,
    /reserve_service_request_payment_checkout_rpc/,
    "Public invoice checkout must not delegate back to the dashboard reservation RPC.",
  );
});
