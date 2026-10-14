import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const require = createRequire(resolve(root, 'frontend/package.json'));
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const detail = readFileSync(resolve(root, 'frontend/src/components/dashboard/ServiceRequestDetail.tsx'), 'utf8');
const editor = readFileSync(resolve(root, 'frontend/src/components/dashboard/ManualEstimateEditor.tsx'), 'utf8');
function element(source, testId) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attr) =>
      ts.isJsxAttribute(attr) && attr.name.text === 'data-testid' && attr.initializer?.text === testId)) result = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `Missing ${testId}`);
  return result;
}
function execute(code, scope) {
  const js = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  scope = { useClassicMobileFinance: false, ...scope };
  return new Function('React', ...Object.keys(scope), js)(React, ...Object.values(scope));
}
const money = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
function render(source, testId, scope) {
  const tree = execute(`return (${element(source, testId)});`, { formatServiceRequestMoney: money, ...scope });
  return { tree, html: renderToStaticMarkup(tree) };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function estimate(overrides = {}) {
  return render(editor, 'mobile-estimate-payment-summary', {
    linkedInvoiceNumber: null, onOpenLinkedInvoice: undefined, depositPaid: 0, directEstimateNetPaid: 0,
    hasDirectEstimatePayments: false, remainingEstimateBalance: 900, ...overrides,
  });
}
function invoice(overrides = {}) {
  return render(detail, 'mobile-invoice-financial-summary', {
    invoice: { id: 'qa', total: 900, invoiceStatus: 'sent', invoiceLifecycleStatus: 'current', voidedAt: null },
    allocatedPaid: 125, balanceDue: 775, invoiceOriginalPayments: 150, invoiceRefunds: 25,
    isCollectibleInvoice: (value) => value.invoiceLifecycleStatus === 'current' && value.invoiceStatus !== 'void' && value.voidedAt === null,
    ...overrides,
  });
}
test('Estimate keeps the standard summary and restricts its large coverage panel to desktop', () => {
  const summary = editor.slice(editor.indexOf('>Financial Summary</h3>'), editor.indexOf('data-testid="mobile-estimate-payment-summary"'));
  for (const label of ['Subtotal', 'Discount', 'Tax', 'Total']) assert.ok(summary.includes(label));
  assert.match(editor, /useClassicMobileFinance \? "grid" : "hidden lg:grid"/);
  assert.match(estimate().tree.props.className, /lg:hidden/);
});
test('linked Estimate opens its existing Invoice and never displays a second balance', () => {
  let opened = 0;
  const { tree, html } = estimate({ linkedInvoiceNumber: 'INV-QA-1', depositPaid: 125, onOpenLinkedInvoice: () => opened++ });
  assert.match(html, /Linked to Invoice/);
  assert.match(html, /INV-QA-1/);
  assert.doesNotMatch(html, /Remaining|Direct Net Paid|Estimate Total|Unallocated/);
  nodes(tree).find((node) => node.type === 'button').props.onClick();
  assert.equal(opened, 1);
  const wiring = detail.slice(detail.indexOf('onOpenLinkedInvoice={() =>'), detail.indexOf('invoiceCoverageSummary={getEstimateInvoiceCoverageSummary(manualEstimate)}'));
  assert.match(wiring, /invoicesByEstimateId.get\(manualEstimate.id\)/);
  assert.match(wiring, /navigateMobileFinance\("invoices"\)/);
  assert.match(wiring, /setFinanceEstimateMode\("home"\)/);
  assert.match(wiring, /openInvoiceWorkspace\(linkedInvoice.id\)/);
  // This existing map contains only current, non-void Invoice relationships.
  assert.match(detail, /const invoicesByEstimateId = activeInvoicesByEstimateId/);
  assert.match(detail, /const activeInvoicesByEstimateId = new Map\(\s*currentLifecycleInvoices/);
});
test('standalone Estimate shows existing net paid and remaining only when payment exists', () => {
  const paid = estimate({ depositPaid: 200, directEstimateNetPaid: 125, remainingEstimateBalance: 700 });
  assert.match(paid.html, /Direct Net Paid/); assert.match(paid.html, /\$125.00/); assert.match(paid.html, /\$700.00/);
  assert.doesNotMatch(paid.html, /\$200.00/);
  assert.doesNotMatch(estimate({ depositPaid: 200 }).html, /<dl/);
  assert.doesNotMatch(estimate().html, /<dl|<button/);
  const refunded = estimate({ hasDirectEstimatePayments: true });
  assert.match(refunded.html, /Direct Net Paid/); assert.match(refunded.html, /\$0.00/);
});
test('Invoice compact summary uses canonical total, net paid and collectible balance', () => {
  const { tree, html } = invoice();
  assert.match(tree.props.className, /lg:hidden/);
  const topSummary = nodes(tree).find((node) => node.type === 'dl');
  const topHtml = renderToStaticMarkup(topSummary);
  assert.match(topHtml, /Invoice Total/); assert.match(topHtml, /Net Paid/);
  assert.match(topHtml, /\$900.00/); assert.match(topHtml, /\$125.00/);
  assert.doesNotMatch(topHtml, /Original Paid|Refunds/);
  assert.match(html, /Balance Due/); assert.match(html, /\$775.00/);
});
test('native Payment breakdown is collapsed by default and contains preserved expanded accounting data', () => {
  const disclosure = nodes(invoice().tree).find((node) => node.type === 'details');
  assert.equal(disclosure.props.open, undefined);
  assert.equal(nodes(disclosure).filter((node) => node.type === 'summary').length, 1);
  const expanded = renderToStaticMarkup(React.cloneElement(disclosure, { open: true }));
  assert.match(expanded, /<details[^>]*open/);
  for (const value of ['Original Paid', 'Refunds', 'Net Paid', '$150.00', '$25.00', '$125.00']) assert.ok(expanded.includes(value));
  assert.equal(disclosure.key, 'qa');
});
test('zero refunds are omitted even from the expandable breakdown', () => {
  assert.doesNotMatch(invoice({ invoiceRefunds: 0 }).html, /Refunds/);
  assert.match(invoice({ invoiceRefunds: 0.01 }).html, /Refunds/);
});
test('historical and void Invoices never advertise a collectible balance', () => {
  for (const state of [
    { invoiceStatus: 'sent', invoiceLifecycleStatus: 'historical', voidedAt: null },
    { invoiceStatus: 'void', invoiceLifecycleStatus: 'current', voidedAt: null },
    { invoiceStatus: 'sent', invoiceLifecycleStatus: 'current', voidedAt: '2026-01-01' },
  ]) {
    const { html } = invoice({ invoice: { id: 'old', total: 900, ...state } });
    assert.match(html, /Not collectible/);
    assert.doesNotMatch(html, /Balance Due|\$775.00/);
    assert.match(html, /Original Paid/);
  }
});
test('Invoice metadata stays in Details and desktop Overview, with one render location', () => {
  assert.match(detail, /invoiceWorkspaceTab === "overview" \? "hidden lg:block" : undefined/);
  assert.match(detail, /const showDetails =\s*invoiceWorkspaceTab === "overview" \|\| invoiceWorkspaceTab === "details"/);
  assert.equal(detail.split('{renderDetails()}').length - 1, 1);
  const metadata = detail.slice(detail.indexOf('const renderDetails ='), detail.indexOf('const showItems ='));
  for (const label of ['Status', 'Created', 'Source Estimate', 'Sent', 'Paid']) assert.ok(metadata.includes(`["${label}"`));
  assert.match(detail, /hidden grid-cols-2 divide-x divide-y[^"\n]+lg:grid/);
  assert.match(detail, /hidden border-t border-\[#D7DEE8\] py-3 sm:py-4 lg:block/);
});
