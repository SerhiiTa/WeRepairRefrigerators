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
