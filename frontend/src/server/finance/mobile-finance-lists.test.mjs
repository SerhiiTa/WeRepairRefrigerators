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
const source = readFileSync(resolve(root, 'frontend/src/components/dashboard/ServiceRequestDetail.tsx'), 'utf8');
const ast = ts.createSourceFile('detail.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function renderer(name, scope) {
  let code;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(code);
  const js = ts.transpileModule(`${code}; return ${name};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  scope = { useClassicMobileFinance: false, ...scope };
  return new Function('React', ...Object.keys(scope), js)(React, ...Object.values(scope));
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const money = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const estimate = { id: 'estimate', estimateNumber: 'EST-QA-LONG-DOCUMENT-NUMBER', estimateStatus: 'approved', total: 676.56, items: [{},{}], createdAt: '2026-10-14', sourceSystem: 'manual' };
const invoice = { id: 'invoice', invoiceNumber: 'INV-QA-LONG-DOCUMENT-NUMBER', invoiceStatus: 'sent', total: 676.56, invoiceLifecycleStatus: 'current', voidedAt: null };
function fixture(linked = true) {
  const calls = [];
  const scope = {
    invoicesByEstimateId: new Map(linked ? [[estimate.id, invoice]] : []),
    getEstimateInvoiceCoverageSummary: () => null, getEstimatePresentedNetPaidCents: () => 12500,
    centsToMoney: (v) => v / 100, manualPaymentTargets: [], viewingEstimateId: null,
    formatServiceRequestMoney: money, formatServiceRequestDate: (v) => v, formatServiceRequestSource: (v) => v,
    openEstimateFromList: (v) => calls.push(['estimate', v.id]),
    openInvoiceWorkspace: (v) => calls.push(['invoice', v]),
    navigateMobileFinance: (v) => calls.push(['section', v]),
    openPaymentWorkflow: () => calls.push(['payment']),
    getInvoiceAllocatedCents: () => 12500, getInvoiceBalanceDue: () => 551.56,
    isCollectibleInvoice: (v) => v.invoiceLifecycleStatus === 'current' && v.invoiceStatus !== 'void' && v.voidedAt === null,
  };
  return { calls, scope };
}
test('mobile Estimate card renders identity, status, total, items, date and linked reference', () => {
  const { scope } = fixture();
  const tree = renderer('renderEstimateCard', scope)(estimate);
  const mobile = nodes(tree).find((n) => n.props?.['data-testid'] === 'mobile-estimate-card');
  const html = renderToStaticMarkup(mobile);
  for (const value of [estimate.estimateNumber, 'approved', '$676.56', '2 items', '2026-10-14', 'Linked invoice', invoice.invoiceNumber]) assert.ok(html.includes(value));
  assert.match(tree.props.className, /rounded-2xl bg-white p-4/);
  assert.equal(mobile.props.className, 'lg:hidden');
  assert.doesNotMatch(html, /Direct Estimate Payments|Collect Payment/);
  assert.ok(nodes(tree).some((n) => n.props?.className === 'hidden px-1.5 sm:px-2 lg:block'));
});
test('Estimate and linked Invoice clicks use independent existing handlers', () => {
  const { scope, calls } = fixture();
  const tree = renderer('renderEstimateCard', scope)(estimate);
  const mobile = nodes(tree).find((n) => n.props?.['data-testid'] === 'mobile-estimate-card');
  const buttons = nodes(mobile).filter((n) => n.type === 'button');
  let stopped = 0;
  buttons[0].props.onClick({ stopPropagation: () => stopped++ });
  assert.deepEqual(calls, [['estimate','estimate']]);
  calls.length = 0;
  buttons[1].props.onClick({ stopPropagation: () => stopped++ });
  assert.deepEqual(calls, [['section','invoices'],['invoice','invoice']]);
  assert.equal(stopped, 2);
});
test('unlinked Estimate omits invoice reference; imported Estimate keeps its existing renderer path', () => {
  const { scope, calls } = fixture(false);
  const imported = { ...estimate, sourceSystem: 'workiz' };
  const tree = renderer('renderEstimateCard', scope)(imported);
  const mobile = nodes(tree).find((n) => n.props?.['data-testid'] === 'mobile-estimate-card');
  assert.doesNotMatch(renderToStaticMarkup(mobile), /Linked invoice/);
  tree.props.onClick();
  assert.deepEqual(calls, [['estimate','estimate']]);
});
test('mobile Invoice card uses existing canonical values and opens the existing workspace', () => {
  const { scope, calls } = fixture();
  const tree = renderer('renderMobileInvoiceCard', scope)(invoice);
  const html = renderToStaticMarkup(tree);
  for (const value of [invoice.invoiceNumber, 'sent', 'Invoice total', '$676.56', 'Net paid', '$125.00', 'Balance due', '$551.56']) assert.ok(html.includes(value));
  assert.match(tree.props.className, /rounded-2xl bg-white p-4/);
  assert.match(tree.props.className, /lg:hidden/);
  assert.match(html, /truncate/); assert.match(html, /break-words/);
  tree.props.onClick(); assert.deepEqual(calls, [['invoice','invoice']]);
});
test('historical and void Invoice cards do not present collectible balances', () => {
  const { scope } = fixture();
  const render = renderer('renderMobileInvoiceCard', scope);
  for (const document of [{ ...invoice, invoiceLifecycleStatus: 'historical' }, { ...invoice, invoiceStatus: 'void' }]) {
    const html = renderToStaticMarkup(render(document));
    assert.match(html, /Not collectible/); assert.match(html, /\$125.00/);
    assert.doesNotMatch(html, /Balance due|\$551.56/);
  }
});
test('list wiring preserves ordering, empty states, desktop Invoice renderer and header navigation', () => {
  assert.match(source, /financeEstimates\.map\(renderEstimateCard\)/);
  assert.match(source, /renderMobileInvoiceCard\(financePrimaryInvoice\)/);
  assert.match(source, /currentInvoices\.filter\(\(invoice\) => invoice.id !== financePrimaryInvoice\?\.id\)\.map\(renderMobileInvoiceCard\)/);
  assert.match(source, /invoiceHistory\.filter\(\(invoice\) => invoice.id !== financePrimaryInvoice\?\.id\)\.map\(renderMobileInvoiceCard\)/);
  assert.ok(source.includes('<div className="hidden lg:block">{renderInvoiceSummaryCard(financePrimaryInvoice)}</div>'));
  assert.match(source, /lg:hidden">No estimates yet<\/p>/);
  assert.match(source, /lg:hidden">No invoices yet<\/p>/);
  assert.match(source, /aria-label="New estimate" type="button" onClick=\{openNewManualEstimateEditor\}[^>]*>\+ New<\/button>/);
  assert.match(source, /\? "Finance" : "Finance Overview"/);
  assert.match(source, /\? "hidden lg:inline-flex" : "inline-flex"/);
  assert.equal(source.split('aria-label="Mobile job workspace sections"').length - 1, 1);
});

test('Classic Estimate card keeps original presentation with the same shared values and handler', () => {
  const { scope, calls } = fixture();
  const tree = renderer('renderEstimateCard', { ...scope, useClassicMobileFinance: true })(estimate);
  assert.ok(!nodes(tree).some((n) => n.props?.['data-testid'] === 'mobile-estimate-card'));
  const html = renderToStaticMarkup(tree); assert.ok(html.includes(estimate.estimateNumber)); assert.ok(html.includes('$676.56'));
  tree.props.onClick(); assert.deepEqual(calls, [['estimate', estimate.id]]);
});
