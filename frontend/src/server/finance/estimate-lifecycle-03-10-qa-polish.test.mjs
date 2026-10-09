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
const serviceRequestRecords = readFileSync(
  resolve(root, "frontend/src/lib/service-request-records.ts"),
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
  /<section className="mx-auto mt-2 max-w-4xl px-3 sm:mt-4 sm:px-6">/,
  "Response panel should use compact spacing after the estimate document.",
);
assert.match(
  publicApproval,
  /<div className="rounded-2xl border border-blue-100 bg-white p-3[\s\S]*sm:p-5">/,
  "Public response panel should keep mobile padding tight while preserving desktop spacing.",
);
assert.ok(
  !publicApproval.includes("Estimate total"),
  "Public response panel should not duplicate the Estimate total already shown in the document.",
);
const previewIndex = publicApproval.indexOf("<CustomerEstimatePreview data={customerPreviewData} fillViewport={false} />");
const approveIndex = publicApproval.indexOf("Approve Estimate");
const declineIndex = publicApproval.indexOf("Decline Estimate");
const readyIndex = publicApproval.indexOf("Ready for your response");
assert.ok(
  previewIndex > -1 &&
    approveIndex > previewIndex &&
    declineIndex > approveIndex &&
    readyIndex > declineIndex,
  "Public response panel should show approve, decline, then compact explanatory response text immediately below the document.",
);
assert.ok(
  publicApproval.includes("pb-[max(1.5rem,env(safe-area-inset-bottom))]"),
  "Public response page should preserve safe-area padding for iPhone Safari.",
);
assert.ok(
  !customerPreview.includes('label="Notes / Terms"'),
  "Public customer estimate preview should not display Notes / Terms below the document.",
);
assert.ok(
  customerPreview.includes('label="Warranty"'),
  "Public customer estimate preview should retain Warranty information.",
);
assert.match(
  customerPreview,
  /px-3 py-3[\s\S]*sm:px-8 sm:py-7/,
  "Public estimate document should use compact mobile padding while preserving the roomier desktop layout.",
);
assert.match(
  customerPreview,
  /grid-cols-\[minmax\(0,1fr\)_2\.25rem_4rem_4rem\][\s\S]*sm:grid-cols-\[minmax\(0,1fr\)_3rem_4\.5rem_4\.5rem\]/,
  "Public estimate item table should use tighter mobile columns and preserve desktop columns.",
);
assert.match(
  customerPreview,
  /text-xl font-black text-\[#0F6BFF\] sm:text-2xl/,
  "Public estimate financial summary should reduce mobile total typography without changing desktop size.",
);
assert.ok(
  !publicApproval.includes("estimate.estimate.sent_at ?? new Date().toISOString()"),
  "Public preview date fallback must not use render-time Date values that can mismatch during hydration.",
);
assert.match(
  serviceRequestRecords,
  /new Intl\.DateTimeFormat\("en-US", \{[\s\S]*timeZone: "America\/Chicago"/,
  "Shared service request date rendering should use explicit locale and timezone.",
);
assert.match(
  serviceRequestRecords,
  /\.formatToParts\(date\)/,
  "Shared service request date rendering should use formatToParts so server and browser literals match.",
);
assert.ok(
  serviceRequestRecords.includes("${month} ${day}, ${year} at ${hour}:${minute} ${dayPeriod}"),
  "Shared service request date rendering should assemble the date/time separator deterministically.",
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
assert.ok(
  communicationsHub.includes("const MESSAGE_URL_PATTERN = /https?:\\/\\/"),
  "Communications SMS rendering should detect HTTP and HTTPS links without unsafe HTML parsing.",
);
assert.ok(
  communicationsHub.includes("function MessageBodyWithLinks") &&
    communicationsHub.includes("navigator.clipboard.writeText(url)") &&
    communicationsHub.includes("Copy Link"),
  "Communications SMS links should render with a Copy Link action for the URL only.",
);
assert.ok(
  communicationsHub.includes('className="whitespace-pre-wrap break-words text-sm font-medium leading-5"'),
  "Communications SMS bubbles should wrap long URLs without horizontal overflow.",
);
assert.ok(
  !communicationsHub.includes("dangerouslySetInnerHTML"),
  "Communications link rendering must not use unsafe HTML injection.",
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
  respondRoute,
  /wasIdempotentReplay[\s\S]*idempotent[\s\S]*if \(estimateId && !wasIdempotentReplay\)/,
  "Public approval route should not duplicate Communications side effects for idempotent response retries.",
);

assert.match(
  serviceRequestDetail,
  /window\.setInterval\(\(\) => \{[\s\S]*document\.visibilityState !== "visible"[\s\S]*loadEstimates\(\)[\s\S]*15000/,
  "Job Finance should refresh visible Estimate state after external customer approval without a full-page reload.",
);
assert.match(
  serviceRequestDetail,
  /key=\{`\$\{financeEstimateMode\}:\$\{manualEstimateId \?\? "new"\}:\$\{manualEstimate\?\.estimateStatus \?\? "none"\}:\$\{manualEstimate\?\.customerRespondedAt \?\? "none"\}`\}/,
  "Open Estimate Workspace should remount from refreshed Estimate props after external approval polling.",
);

console.log("estimate-lifecycle-03.10 QA polish static checks passed");
