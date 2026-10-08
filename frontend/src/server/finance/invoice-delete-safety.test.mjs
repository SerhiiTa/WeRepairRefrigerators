import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(
  resolve(__dirname, "../../app/api/invoices/[id]/route.ts"),
  "utf8",
);
const serviceRequestDetail = readFileSync(
  resolve(__dirname, "../../components/dashboard/ServiceRequestDetail.tsx"),
  "utf8",
);

test("invoice delete endpoint is authenticated and company scoped", () => {
  assert.match(route, /export async function DELETE/);
  assert.match(route, /requireHomeFixPrivateAccess\(request\)/);
  assert.match(route, /serviceRequest\.company_id !== HOMEFIX_PRIVATE_COMPANY_ID/);
  assert.match(route, /return fail\("This account is not allowed to delete that invoice\.", 403\)/);
});

test("invoice delete protects Steven Wolf and imported provenance invoices", () => {
  assert.match(route, /PROTECTED_STEVEN_WOLF_CUSTOMER_ID/);
  assert.match(route, /PROTECTED_STEVEN_WOLF_SERVICE_REQUEST_IDS/);
  assert.match(route, /PROTECTED_STEVEN_WOLF_INVOICE_IDS/);
  assert.match(route, /isProvenanceProtectedInvoice\(invoice\)/);
  assert.match(route, /Imported or provenance-bearing invoices cannot be deleted from the dashboard\./);
});

test("invoice delete rejects payment and allocation relationships", () => {
  assert.match(route, /\.from\("service_request_payments"\)/);
  assert.match(route, /\.eq\("invoice_id", invoice\.id\)/);
  assert.match(route, /Invoices with payment history cannot be deleted\./);
  assert.match(route, /\.from\("service_request_payment_allocations"\)/);
  assert.match(route, /\.eq\("allocation_status", "active"\)/);
  assert.match(route, /Invoices with active payment allocations cannot be deleted\./);
});

test("invoice delete remains safe before allocation table exists", () => {
  assert.match(route, /function isSchemaMissingError/);
  assert.match(route, /service_request_payment_allocations/);
  assert.match(route, /schema cache/);
  assert.match(route, /Could not find the table/);
});

test("invoice delete preserves parent records and line-item cascade", () => {
  assert.match(route, /\.from\("service_request_invoices"\)\s*\n\s*\.delete\(\)/);
  assert.doesNotMatch(route, /\.from\("customers"\)\s*\n\s*\.delete\(\)/);
  assert.doesNotMatch(route, /\.from\("service_requests"\)\s*\n\s*\.delete\(\)/);
  assert.doesNotMatch(route, /\.from\("service_request_estimates"\)\s*\n\s*\.delete\(\)/);
});

test("invoice delete restores only explicit converted estimate state", () => {
  assert.match(route, /\.eq\("estimate_id", estimateId\)/);
  assert.match(route, /estimate\?\.estimate_status === "converted_to_invoice"/);
  assert.match(route, /update\(\{ estimate_status: "approved" \}\)/);
  assert.match(route, /\.eq\("estimate_status", "converted_to_invoice"\)/);
});

test("invoice delete does not recycle invoice numbers", () => {
  assert.doesNotMatch(route, /invoice_number.*update/i);
  assert.doesNotMatch(route, /counter|sequence|reuse/i);
});

test("invoice delete UI is subtle and requires confirmation", () => {
  assert.match(serviceRequestDetail, /function deleteInvoice/);
  assert.match(serviceRequestDetail, /window\.confirm/);
  assert.match(serviceRequestDetail, /Delete this test invoice\?/);
  assert.match(serviceRequestDetail, /Delete Invoice/);
  assert.match(serviceRequestDetail, /method: "DELETE"/);
  assert.match(serviceRequestDetail, /void loadInvoices\(\)/);
  assert.match(serviceRequestDetail, /void loadEstimates\(\)/);
});
