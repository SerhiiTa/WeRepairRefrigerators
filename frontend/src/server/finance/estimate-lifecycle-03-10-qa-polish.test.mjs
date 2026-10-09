import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const publicApproval = readFileSync(
  resolve(root, "frontend/src/components/public/PublicEstimateApproval.tsx"),
  "utf8",
);
const customerPreview = readFileSync(
  resolve(root, "frontend/src/components/public/CustomerEstimatePreview.tsx"),
  "utf8",
);
const editor = readFileSync(
  resolve(root, "frontend/src/components/dashboard/ManualEstimateEditor.tsx"),
  "utf8",
);
const deliveryBridge = readFileSync(
  resolve(root, "frontend/src/server/finance/estimate-communications-delivery.ts"),
  "utf8",
);
const respondRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/respond/route.ts"),
  "utf8",
);
const communicationsHub = readFileSync(
  resolve(root, "frontend/src/components/dashboard/communications/CommunicationsHub.tsx"),
  "utf8",
);
const serviceRequestDetail = readFileSync(
  resolve(root, "frontend/src/components/dashboard/ServiceRequestDetail.tsx"),
  "utf8",
);

assert.match(
  customerPreview,
  /fillViewport = true[\s\S]*fillViewport \? "min-h-screen" : ""/,
  "Customer estimate preview should keep standalone full-height behavior by default.",
);
assert.ok(
  publicApproval.includes("<CustomerEstimatePreview data={customerPreviewData} fillViewport={false} />"),
  "Public approval page should disable nested full-viewport preview height so the response panel follows the document.",
);
assert.match(
  publicApproval,
  /<section className="mx-auto mt-4 max-w-4xl px-3 sm:mt-6 sm:px-6">/,
  "Response panel should use normal 16-24px spacing after the estimate document.",
);

assert.ok(
  !editor.includes("Your secure approval link will be included when delivery is sent."),
  "Customer-facing SMS preview must not contain internal placeholder language.",
);
assert.match(
  editor,
  /Your estimate \$\{savedEstimateNumber \?\? "Estimate"\} is ready for review\. Please approve or decline using this secure link:/,
  "Customer-facing SMS preview should be professional and include the dynamic estimate number.",
);

assert.ok(
  !/communicationTimelineTable\(supabase\)\.insert\(\{[\s\S]*event_type:\s*"estimate_sent"/.test(
    deliveryBridge,
  ),
  "Delivery bridge should not duplicate the estimate_sent event already created by the send RPC.",
);
assert.match(
  deliveryBridge,
  /source_account_id:\s*readiness\.sourceAccountId[\s\S]*provider_name:\s*"telnyx"[\s\S]*primary_source_type:\s*"sms"/,
  "Delivery bridge should persist the resolved SMS source account for later Communications replies.",
);
assert.match(
  deliveryBridge,
  /existingDelivery[\s\S]*request_fingerprint[\s\S]*409/,
  "Idempotency key reuse with a changed send request must remain rejected.",
);

assert.ok(
  communicationsHub.includes('event.type === "estimate_sent"') &&
    communicationsHub.includes('route: "HomeFix → Customer"'),
  "Estimate sent timeline event should display HomeFix to Customer.",
);
assert.ok(
  communicationsHub.includes('event.type === "estimate_approved"') &&
    communicationsHub.includes('event.type === "estimate_declined"') &&
    communicationsHub.includes('route: "Customer → HomeFix"'),
  "Customer approval and decline events should display Customer to HomeFix.",
);

assert.match(
  communicationsHub,
  /function getCanonicalConversationSummary[\s\S]*estimate approval pending[\s\S]*Review the latest Estimate status in Job Finance/,
  "AI Summary panel should guard against stale approval-pending text without triggering paid regeneration.",
);
assert.match(
  communicationsHub,
  /sourceAccountCarrier[\s\S]*conversation\.sourceAccountId[\s\S]*sourceAccountId:\s*sourceAccountCarrier\.sourceAccountId/,
  "Customer-thread aggregation should preserve a valid SMS source account from any conversation in the thread.",
);
assert.match(
  respondRoute,
  /refreshCommunicationSummaryAfterResponse[\s\S]*Estimate approved\. Review scheduling, invoice, or deposit next steps\./,
  "Public approval route should refresh the conversation summary after approval.",
);

assert.match(
  serviceRequestDetail,
  /window\.setInterval\(\(\) => \{[\s\S]*document\.visibilityState !== "visible"[\s\S]*loadEstimates\(\)[\s\S]*15000/,
  "Job Finance should refresh visible Estimate state after external customer approval without a full-page reload.",
);

console.log("estimate-lifecycle-03.10 QA polish static checks passed");
