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
const sendRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/send/route.ts"),
  "utf8",
);
const providerAdapters = readFileSync(
  resolve(root, "frontend/src/lib/communications/provider-adapters.ts"),
  "utf8",
);
const communicationTypes = readFileSync(
  resolve(root, "frontend/src/lib/communications/types.ts"),
  "utf8",
);
const deliveryBridge = readFileSync(
  resolve(root, "frontend/src/server/finance/estimate-communications-delivery.ts"),
  "utf8",
);
const telnyxTransport = readFileSync(
  resolve(root, "frontend/src/server/communications/telnyx-sms-transport.ts"),
  "utf8",
);
const migration0119 = readFileSync(
  resolve(
    root,
    "supabase/migrations/0119_estimate_customer_revision_approval_apply_ready.sql",
  ),
  "utf8",
);

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

includesAll(editor, [
  "type EstimateDeliveryChannel = \"sms\" | \"email\"",
  "type EstimateDeliveryRequest",
  "isSendEstimateOpen",
  "deliveryChannel",
  "deliveryRecipient",
  "allowCustomerEmailReplacement",
  "openSendEstimateModal",
  "Send estimate",
  "SMS",
  "Email",
  "Message preview",
  "Send Estimate",
  "This Customer does not have an email yet.",
  "Replace the existing Customer email after this send is accepted by",
]);

assert.match(
  editor,
  /setDeliveryChannel\("sms"\)[\s\S]*setDeliveryRecipient\(request\.customerPhone \?\? ""\)/,
  "SMS should be the default selected channel and recipient.",
);
assert.match(
  editor,
  /channel === "sms"[\s\S]*request\.customerPhone[\s\S]*request\.customerEmail/,
  "Changing channels should prefill phone or email from the current request.",
);
assert.match(
  editor,
  /disabled=\{!canConfirmEstimateDelivery \|\| pendingAction === "send"\}/,
  "Send Estimate confirmation must be disabled until channel and recipient are valid.",
);
assert.match(
  editor,
  /onClick=\{openSendEstimateModal\}/,
  "Visible send buttons should open the modal instead of directly sending.",
);
assert.equal(
  (editor.match(/onClick=\{\(\) => void sendToClient\(\)\}/g) ?? []).length,
  1,
  "Only the modal's explicit Send Estimate confirmation should submit delivery.",
);

includesAll(detail, [
  "channel: \"sms\" | \"email\"",
  "messagePreview",
  "idempotencyKey",
  "allowCustomerEmailReplacement",
  "body: JSON.stringify(delivery)",
]);
assert.ok(
  !detail.includes("await sendEstimateById(savedEstimate.id, savedEstimate.estimateNumber);"),
  "Legacy save-and-send path must not automatically deliver an estimate.",
);

includesAll(sendRoute, [
  "SendEstimatePayload",
  "sendEstimateRevisionSms",
  "normalizeChannel",
  "isValidSmsRecipient",
  "isValidEmail",
  "Send Estimate requires an idempotency key.",
  "send_service_request_estimate_to_customer_rpc",
  "Estimate sent by SMS.",
  "provider_unavailable",
  "Email estimate delivery is not configured yet. Choose SMS for this send.",
]);
assert.ok(
  !sendRoute.includes("telnyxCommunicationProvider"),
  "Estimate sending must not use the disabled provider adapter path.",
);
assert.ok(
  !sendRoute.includes(".from(\"customers\")"),
  "Customer email must not be mutated by the send route.",
);

includesAll(deliveryBridge, [
  "sendConversationSms",
  "checkConversationSmsReadiness",
  "communication_conversations",
  "communication_message_id",
  "service_request_estimate_revision_deliveries",
  "idempotency_key",
  "request_fingerprint",
  "estimate_sent",
]);
assert.match(
  deliveryBridge,
  /checkConversationSmsReadiness\(context\.conversationId\)[\s\S]*input\.sendRevision\(\)/,
  "SMS readiness must be checked before creating an immutable sent revision.",
);
assert.match(
  deliveryBridge,
  /existingDelivery[\s\S]*request_fingerprint[\s\S]*409/,
  "Idempotency key reuse for a changed send request must be rejected.",
);
assert.ok(
  !deliveryBridge.includes("fetch(\"https://api.telnyx.com"),
  "Estimate delivery bridge must reuse the existing Telnyx transport instead of duplicating provider calls.",
);
includesAll(telnyxTransport, [
  "export async function checkConversationSmsReadiness",
  "export async function sendConversationSms",
]);

includesAll(communicationTypes, ["sendEstimateMessage", "providerMessageId"]);
includesAll(providerAdapters, [
  "sendEstimateMessage",
  "provider_unavailable",
  "outbound delivery is not configured",
]);

includesAll(migration0119, [
  "service_request_estimate_revision_deliveries",
  "communication_message_id",
  "recipient",
  "idempotency_key",
  "request_fingerprint",
  "provider_message_id",
  "delivery_status",
  "revision_id",
  "public_approval_token_hash",
  "estimate_declined",
]);

console.log("estimate-lifecycle-03.1 send delivery UI static checks passed");
