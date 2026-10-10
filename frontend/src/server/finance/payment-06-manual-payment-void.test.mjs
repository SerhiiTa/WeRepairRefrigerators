import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

const migration = read(
  "supabase/migrations/0124_manual_payment_void_apply_ready.sql",
);
const route = read(
  "frontend/src/app/api/service-requests/[id]/payments/[paymentId]/void/route.ts",
);
const detail = read("frontend/src/components/dashboard/ServiceRequestDetail.tsx");
const serviceRequestRecords = read("frontend/src/lib/service-request-records.ts");

includesAll(migration, [
  "void_manual_service_request_payment_rpc",
  "security definer",
  "set search_path = public",
  "public.can_record_service_request_payment(request_row.id)",
  "pg_advisory_xact_lock(hashtextextended(request_row.id::text, 406))",
  "from public.service_request_payments",
  "for update;",
  "coalesce(payment_row.payment_type, '') <> 'manual'",
  "coalesce(payment_row.provider, '') <> 'manual'",
  "payment_row.provider_payment_id not like 'manual:%'",
  "Provider-confirmed payments require a refund workflow.",
  "set\n    allocation_status = 'void'",
  "payment_status = 'void'",
  "voided_at = now()",
  "voided_by_profile_id = auth.uid()",
  "void_reason = clean_reason",
  "payment_voided",
  "communication_timeline_payment_voided_uidx",
  "grant execute on function public.void_manual_service_request_payment_rpc",
  "to authenticated",
]);

assert.doesNotMatch(
  migration,
  /insert\s+into\s+public\.service_request_payments/i,
  "Voiding must not create a second payment ledger entry.",
);
assert.doesNotMatch(
  migration,
  /delete\s+from\s+public\.service_request_payments/i,
  "Voiding must not delete the original payment.",
);
assert.doesNotMatch(
  migration,
  /update\s+public\.service_requests/i,
  "Voiding a payment must not mutate operational Job status.",
);
assert.doesNotMatch(
  migration,
  /grant execute[\s\S]*to anon/i,
  "Void RPC must not grant anonymous execution.",
);

includesAll(route, [
  "requireHomeFixPrivateAccess(request)",
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
  "resolveServiceRequestIdForPayment",
  '.from("service_request_payments")',
  '.select("service_request_id")',
  ".eq(\"id\", paymentId)",
  "const serviceRequestId = isUuid(routeServiceRequestId)",
  "void_manual_service_request_payment_rpc",
  "p_service_request_id: serviceRequestId",
  "p_payment_id: paymentId",
  "p_reason: reason",
  "p_reason_note: reasonNote",
  "Choose a valid void reason.",
  "This account is not allowed to void payments for that job.",
  "refund workflow",
]);

assert.ok(
  route.indexOf("if (!isUuid(paymentId))") <
    route.indexOf("const serviceRequestId = isUuid(routeServiceRequestId)"),
  "Void route must validate the selected payment before resolving canonical job context.",
);

assert.doesNotMatch(
  route,
  /if \(!isUuid\(serviceRequestId\)\) \{\s*return fail\("Choose a valid job before voiding payment\."\);/m,
  "Void route must not reject non-canonical route job segments before looking up the selected payment.",
);

includesAll(detail, [
  "type ManualPaymentVoidReason",
  "type ManualPaymentVoidDraft",
  "manualPaymentVoidReasonOptions",
  "function canVoidPayment(payment: DashboardServiceRequestPayment)",
  "provider === \"manual\"",
  "payment.providerPaymentId?.startsWith(\"manual:\") === true",
  "Void this payment?",
  "This will reverse the recorded payment and restore the outstanding",
  "Void Payment",
  "Void reason: ",
  "Only eligible manual payments can be voided here.",
  "payment.serviceRequestId !== state.request.id",
  "`/api/service-requests/${payment.serviceRequestId}/payments/${payment.id}/void`",
  "await Promise.all([loadPayments(), loadEstimates(), loadInvoices()])",
]);

assert.doesNotMatch(
  detail,
  /\/api\/service-requests\/\$\{state\.request\.id\}\/payments\/\$\{payment\.id\}\/void/,
  "Void Payment must derive the API job context from the selected payment serviceRequestId.",
);

assert.doesNotMatch(
  detail,
  /Provider ID:|Internal note:|Recorded by:|Reference:|Allocation:/,
  "Payment History UI must keep technical accounting metadata hidden.",
);

includesAll(serviceRequestRecords, [
  "voided_at",
  "voided_by_profile_id",
  "void_reason",
  "void_reason_note",
  "voidedAt: row.voided_at ?? null",
  "voidReason: row.void_reason ?? null",
]);

console.log("payment-06 manual payment void static contract: PASS");
