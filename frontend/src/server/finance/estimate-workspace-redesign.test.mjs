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
const estimateSaveRoute = readFileSync(
  resolve(root, "frontend/src/app/api/service-requests/[id]/estimates/route.ts"),
  "utf8",
);
const depositSettingsMigration = readFileSync(
  resolve(
    root,
    "supabase/migrations/0136_estimate_deposit_settings_rpc_apply_ready.sql",
  ),
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
  "Paid",
  "Remaining",
  "Collect Payment",
  "Create Job Invoice",
  "Update Invoice",
  "onCollectPayment",
  "onCreateInvoice",
  "sendToClient",
  "calculateRepairProposalTotals",
  "Search Price Book",
  "Add Part",
  "Add Labor",
  "Add Service",
  "Add Fee",
  "Custom Line Item",
  "activeWorkspaceTab",
  "workspaceTabs",
  "Details",
  "Items",
  "Terms",
  "Attachments",
  "History",
  "Deposit Settings",
  "Deposit Type",
  "Deposit Value",
  "Calculated Required Deposit",
  "Remaining After Deposit",
  "Fixed Amount ($)",
  "Percentage (%)",
  "Edit in Draft Revision",
  "lg:static",
  "max-w-6xl",
  "pb-[calc(7.5rem+env(safe-area-inset-bottom))]",
  "Item / Service",
  "Unit Price",
  "grid-cols-[48%_10%_16%_16%_10%]",
  "isAddItemMenuOpen",
  "Add Item",
  "canEditFinancialFields",
  "Approved estimates are read-only. Open a Draft Revision to make changes.",
  "This estimate is read-only. Open a Draft Revision to make changes.",
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
  (editor.match(/Add Service/g) ?? []).length,
  1,
  "Estimate editor should expose Add Service through the compact Add Item menu only.",
);
assert.equal(
  (editor.match(/Add Fee/g) ?? []).length,
  1,
  "Estimate editor should expose Add Fee through the compact Add Item menu only.",
);
assert.match(
  editor,
  /estimateStatus === "approved"[\s\S]*?Collect Payment/,
  "Approved estimates should expose Collect Payment through the shared action area.",
);
assert.ok(
  editor.includes("Open a Draft Revision") && editor.includes("Duplicate"),
  "Read-only guidance should point approved Estimate edits to Draft Revision while preserving the separate Duplicate action.",
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
  /async function deleteLine\(lineId: string\)[\s\S]*?const nextLines = lines\.filter[\s\S]*?await saveDraft\(\{ source: "manual", linesOverride: nextLines \}\);/,
  "Deleting an estimate item must persist immediately through the Estimate save path.",
);
assert.match(
  editor,
  /onOverlayStateChange\?\.\(hasOpenEstimateOverlay\)/,
  "Estimate editor must report active modals so background refreshes do not interrupt item entry.",
);
assert.match(
  editor,
  /return \(\) => onOverlayStateChange\?\.\(false\);/,
  "Estimate editor must clear the active modal signal on unmount.",
);
includesAll(editor, [
  "activeSavePromiseRef.current ||",
  "hasUnsavedChanges",
  "const nextLines = getInitialEstimateLines(initialEstimate);",
  "setLines(nextLines);",
  "setLastSavedSignature(nextSignature);",
]);
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
assert.match(
  editor,
  /depositSettings: \{[\s\S]*?depositType,[\s\S]*?depositValue:[\s\S]*?depositType === "none" \? null/,
  "Estimate save payload must include normalized deposit settings.",
);
assert.match(
  editor,
  /depositType === "fixed"[\s\S]*?Fixed deposit cannot exceed the Estimate total\./,
  "Fixed deposit validation must prevent deposits above the Estimate total.",
);
assert.match(
  editor,
  /depositType === "percent"[\s\S]*?Deposit percentage cannot exceed 100%\./,
  "Percentage deposit validation must prevent values above 100%.",
);
assert.match(
  editor,
  /async function reviseEstimateForDepositSettings\(\)[\s\S]*?setActiveWorkspaceTab\("details"\);[\s\S]*?await reviseEstimate\(\);/,
  "Approved Estimate deposit changes must go through the Draft Revision flow.",
);

includesAll(detail, [
  "onCollectPayment={(estimate) =>",
  "openPaymentWorkflow(target)",
  "depositPaid={",
  "estimateUsesJobLevelPaidCredit(manualEstimate)",
  "getEstimateLogicalPaidCreditCents(manualEstimate)",
]);
assert.match(
  detail,
  /setPendingManualEstimateAddItem\([\s\S]*?await loadEstimates\(\);[\s\S]*?setManualEstimateId\(payload\.estimate\.id\)/,
  "New draft revisions must refresh into estimate state before opening the editor for Add Item.",
);
assert.ok(
  !detail.includes("syncEstimateWorkspaceUrl("),
  "Revision transitions must call the existing Estimate workspace history helper, not an undefined URL helper.",
);
assert.match(
  detail,
  /if \(existingDraftRevision\) \{[\s\S]*?syncEstimateWorkspaceHistory\(existingDraftRevision\.id, "replace"\)/,
  "Existing draft revisions must update the Estimate workspace URL without throwing.",
);
assert.match(
  detail,
  /if \(payload\.estimate\?\.id\) \{[\s\S]*?syncEstimateWorkspaceHistory\(payload\.estimate\.id, "replace"\)/,
  "Newly created draft revisions must update the Estimate workspace URL without throwing.",
);
assert.match(
  detail,
  /key=\{`\$\{financeEstimateMode\}:\$\{manualEstimateId \?\? "new"\}:\$\{manualEstimate\?\.estimateStatus \?\? "none"\}`\}/,
  "Estimate editor must not remount on background item-count or updated-at refreshes.",
);
assert.match(
  detail,
  /if \(isManualEstimateOverlayOpen\) \{[\s\S]*?return;[\s\S]*?const params = new URLSearchParams/,
  "Route-state sync must not reset the Estimate editor while an item modal is open.",
);
assert.match(
  detail,
  /function applyEstimateRouteState\(options: \{ allowWorkspaceClose: boolean \}\)/,
  "Estimate route synchronization must distinguish refresh-driven sync from explicit browser navigation.",
);
assert.match(
  detail,
  /const matchingLogicalEstimateId =[\s\S]*?matchingEstimate\.logicalEstimateId \?\? matchingEstimate\.id;[\s\S]*?const workspaceEstimate =[\s\S]*?estimate\.estimateStatus === "draft"[\s\S]*?estimate\.revisionStatus === "draft"[\s\S]*?estimate\.revisionStatus === "current"[\s\S]*?setManualEstimateId\(workspaceEstimate\.id\)/,
  "Estimate route synchronization must open the resolved workspace document, not a stale logical root revision.",
);
assert.match(
  detail,
  /if \(tab === "finance"\) \{[\s\S]*?!options\.allowWorkspaceClose[\s\S]*financeEstimateMode === "manual"[\s\S]*financeEstimateMode === "saved"[\s\S]*return;[\s\S]*setManualEstimateId\(null\)/,
  "Refresh-driven route sync must not close an active Estimate editor after a successful item save.",
);
assert.match(
  detail,
  /function handleEstimateRoutePopState\(\) \{[\s\S]*?applyEstimateRouteState\(\{ allowWorkspaceClose: true \}\);[\s\S]*?\}/,
  "Explicit Back/Forward navigation must still be able to close the Estimate workspace.",
);
assert.match(
  detail,
  /setInterval\(\(\) => \{[\s\S]*?if \(isManualEstimateOverlayOpen\) \{[\s\S]*?return;/,
  "Finance polling must pause while an Estimate modal is open.",
);
assert.match(
  detail,
  /function refreshExternalEstimateChanges\(\) \{[\s\S]*?if \(isManualEstimateOverlayOpen\) \{[\s\S]*?return;[\s\S]*?void refreshServiceRequest\(\);/,
  "Focus and visibility refreshes must pause while an Estimate item modal is open.",
);
assert.match(
  detail,
  /onOverlayStateChange=\{setIsManualEstimateOverlayOpen\}/,
  "Estimate editor overlay state must be wired to the Job workspace.",
);
includesAll(detail, [
  "const getEstimateLogicalPaidCreditCents = (",
  "allocatedInvoice?.logicalEstimateId",
  "allocatedEstimate?.logicalEstimateId",
  "allocationLogicalId === estimateLogicalId",
  "getEstimateLogicalPaidCreditCents(manualEstimate)",
  "const depositAction = paymentTarget?.cardActions.find(",
  "const paymentActionLabel = depositAction ? \"Collect Deposit\" : \"Collect Payment\"",
  "const paymentSummaryLabel = depositAction ? \"Deposit paid\" : \"Paid\"",
  "Invoice Update Required",
  "financeInvoiceSyncRequired",
  "financeInvoiceSyncDifference",
]);
assert.doesNotMatch(
  detail,
  /key=\{`[^`]*(updatedAt|items\.length)[^`]*`\}/,
  "Estimate editor key must not include volatile refresh fields.",
);

includesAll(manualApprovalRoute, [
  "createUserScopedServerClient",
  "approve_service_request_estimate_for_customer_rpc",
  "Manual estimate approval failed",
]);

includesAll(invoiceRoute, [
  "sync_job_invoice_from_approved_estimates_rpc",
  "service_request_id",
  "Choose a valid approved estimate to invoice.",
]);

includesAll(estimateSaveRoute, [
  "depositSettings",
  "cleanEstimateDepositSettings",
  "persistEstimateDepositSettings",
  "update_service_request_estimate_deposit_settings_rpc",
  "p_deposit_type: depositSettings.depositType",
  "p_deposit_value: depositSettings.depositValue",
]);
assert.match(
  estimateSaveRoute,
  /depositType === "fixed"[\s\S]*?depositValue > estimateTotal/,
  "Server-side fixed deposit validation must use the Estimate total.",
);
assert.match(
  estimateSaveRoute,
  /depositType === "percent"[\s\S]*?depositValue > 100/,
  "Server-side percentage deposit validation must cap at 100%.",
);
includesAll(depositSettingsMigration, [
  "create or replace function public.update_service_request_estimate_deposit_settings_rpc",
  "security definer",
  "set search_path = public",
  "where p.id = auth.uid()",
  "v_status <> 'draft'",
  "user_can_access_company(v_company_id)",
  "deposit_type = null",
  "deposit_value = null",
  "deposit_type = v_deposit_type",
  "deposit_value = v_deposit_value",
  "grant execute on function public.update_service_request_estimate_deposit_settings_rpc(uuid, text, numeric) to authenticated",
]);
assert.match(
  depositSettingsMigration,
  /v_deposit_type = 'fixed'[\s\S]*?v_deposit_value > coalesce\(v_total, 0\)/,
  "Deposit settings RPC must prevent fixed deposits above the Estimate total.",
);
assert.match(
  depositSettingsMigration,
  /v_deposit_type = 'percent'[\s\S]*?v_deposit_value > 100/,
  "Deposit settings RPC must prevent percentages above 100%.",
);

console.log("estimate-workspace-redesign static contract: PASS");
