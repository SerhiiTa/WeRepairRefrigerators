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
const manualApprovalRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/approve-for-customer/route.ts"),
  "utf8",
);
const invoiceRoute = readFileSync(
  resolve(root, "frontend/src/app/api/estimates/[id]/invoice/route.ts"),
  "utf8",
);

function includesAll(source, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected to find: ${value}`);
  }
}

includesAll(editor, [
  "Mark Estimate as Approved?",
  "Approval method",
  "Technician / Manual",
  "Confirm Approval",
  "Mark as Approved",
  "Estimate Total",
  "Deposit Paid",
  "Remaining",
  "Collect Payment",
  "Convert to Invoice",
  "onCollectPayment",
  "onCreateInvoice",
  "sendToClient",
  "calculateRepairProposalTotals",
  "Search Price Book",
  "Add Part",
  "Add Labor",
  "Add Service / Fee",
  "Custom Line Item",
  "activeWorkspaceTab",
  "workspaceTabs",
  "Details",
  "Items",
  "Terms",
  "Attachments",
  "History",
  "lg:static",
  "max-w-6xl",
  "pb-[calc(7.5rem+env(safe-area-inset-bottom))]",
  "Item / Service",
  "Unit Price",
  "grid-cols-[48%_10%_16%_16%_10%]",
  "isAddItemMenuOpen",
  "Add Item",
  "canEditFinancialFields",
  "Approved estimates are read-only. Duplicate this estimate to make changes.",
  "This estimate is read-only. Duplicate it to make changes.",
]);

const sendForApprovalCount = (editor.match(/Send for Approval/g) ?? []).length;
assert.equal(
  sendForApprovalCount,
  1,
  "Estimate editor should expose one Send for Approval action.",
);
assert.match(
  editor,
  /disabled=\{!canAttemptSend\}[\s\S]*?Send for Approval[\s\S]*?disabled=\{!canApproveForCustomer\}[\s\S]*?Mark as Approved/,
  "Draft action bar should show Send for Approval as secondary and Mark as Approved as the primary visible action.",
);
assert.ok(
  !editor.includes("Preview proposal"),
  "Preview Proposal should live in the top-right actions menu, not the bottom action bar.",
);
assert.ok(
  !editor.includes("bg-[#FFD400]"),
  "Estimate primary action should use HomeFix blue, not the duplicate yellow footer.",
);
assert.ok(
  !editor.includes("<summary className=\"flex cursor-pointer list-none items-center justify-center") ||
    !editor.includes("More Actions"),
  "Estimate editor should use the compact top-right actions menu, not a large inline More Actions accordion.",
);
assert.equal(
  (editor.match(/Add Part/g) ?? []).length,
  1,
  "Estimate editor should expose Add Part through the compact Add Item menu only.",
);
assert.equal(
  (editor.match(/Add Labor/g) ?? []).length,
  1,
  "Estimate editor should expose Add Labor through the compact Add Item menu only.",
);
assert.equal(
  (editor.match(/Add Service \/ Fee/g) ?? []).length,
  1,
  "Estimate editor should expose Add Service / Fee through the compact Add Item menu only.",
);
assert.match(
  editor,
  /estimateStatus === "approved"[\s\S]*?Collect Payment/,
  "Approved estimates should expose Collect Payment through the shared action area.",
);
assert.match(
  editor,
  /const canEditFinancialFields =[\s\S]*?estimateStatus === "unsaved" \|\| estimateStatus === "draft"/,
  "Only unsaved and draft estimates should expose financial editing.",
);
assert.match(
  editor,
  /if \(!canEditFinancialFields\) \{[\s\S]*?return;\n\s*\}[\s\S]*?setItemDraft/,
  "Approved financial items must not enter add/edit mode.",
);
assert.match(
  editor,
  /if \(\s*!canEditFinancialFields \|\|[\s\S]*?void saveDraft\(\{ source: "autosave" \}\);/,
  "Approved estimates must not autosave financial edits.",
);
assert.match(
  editor,
  /canEditFinancialFields \? \([\s\S]*?Search Price Book[\s\S]*?\) : null/,
  "Price Book and Add Item controls should be hidden outside draft editing.",
);
assert.match(
  editor,
  /canEditFinancialFields \? \([\s\S]*?Discount type[\s\S]*?\) : null/,
  "Discount and tax controls should be hidden outside draft editing.",
);

includesAll(detail, [
  "onCollectPayment={(estimate) =>",
  "openPaymentWorkflow(target)",
  "depositPaid={",
  "estimateAllocatedCents.get(manualEstimate.id)",
]);

includesAll(manualApprovalRoute, [
  "createUserScopedServerClient",
  "approve_service_request_estimate_for_customer_rpc",
  "Manual estimate approval failed",
]);

includesAll(invoiceRoute, [
  "create_invoice_from_estimate_rpc",
  "Choose a valid approved estimate to invoice.",
]);

console.log("estimate-workspace-redesign static contract: PASS");
