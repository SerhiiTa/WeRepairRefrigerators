import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
const root = process.cwd();
const require = createRequire(resolve(root, 'frontend/package.json'));
const ts = require('typescript');
const React = require('react');
const source = readFileSync(resolve(root, 'frontend/src/components/dashboard/ServiceRequestDetail.tsx'), 'utf8');
const ast = ts.createSourceFile('detail.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  function visit(node) { if (predicate(node)) result = node; ts.forEachChild(node, visit); }
  visit(ast); assert.ok(result); return result.getText(ast);
}
function jsx(testId) {
  return find((n) => ts.isJsxElement(n) && n.openingElement.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.text === 'data-testid' && a.initializer?.text === testId));
}
function execute(code, scope) {
  const js = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  scope = { useClassicMobileFinance: false, ...scope };
  return new Function('React', ...Object.keys(scope), js)(React, ...Object.values(scope));
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const renderCode = find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'renderPaymentHistoryItem');
const canonicalCode = source.slice(source.indexOf('  const grossPaidPaymentIds ='), source.indexOf('  const succeededRefundsById ='));
function fixture(status = 'succeeded', amount = 100, refunds = [], expanded = false, eligible = true, receipt = { receiptNumber: 'R-42' }, classic = false) {
  const payment = { id: 'p', paymentStatus: status, amount, paymentMethod: 'cash', voidedAt: null, createdAt: '2026-10-14T12:00:00Z' };
  const entry = { payment, invoiceTarget: { invoiceNumber: 'INV-42' }, refunds, receipt, receiptDeliveries: [] };
  const calls = []; let expandedId = expanded ? 'p' : null;
  const scope = {
    useClassicMobileFinance: classic,
    paymentsState: { payments: [payment], refunds }, activePaymentAllocations: [],
    moneyToCents: (v) => Math.round(v * 100), centsToMoney: (v) => v / 100,
    expandedPaymentHistoryId: expandedId,
    setExpandedPaymentHistoryId: (fn) => { expandedId = fn(expandedId); },
    getPaymentAppliedToLabel: () => 'Invoice', canVoidPayment: () => eligible,
    canShowReceiptActions: () => eligible, canRefundPayment: () => eligible,
    formatServiceRequestMoney: (v) => '$' + v.toFixed(2), formatServiceRequestDate: (v) => v,
    formatServiceRequestSource: (v) => v.replaceAll('_', ' '), getPaymentDisplayLabel: () => 'Cash Payment',
    getPaymentDisplayIcon: () => '$', Image: 'img', FinanceChevron: 'i',
    getManualPaymentVoidReasonLabel: () => 'Entered by mistake',
    setManualPaymentVoidDraft: (v) => calls.push(['void', v]), setManualPaymentVoidState: () => {},
    setPaymentRefundDraft: (v) => calls.push(['refund', v]), setPaymentRefundState: () => {},
    getRefundableCentsForPayment: () => 1000, formatPlainMoney: String, buildPaymentIdempotencyKey: () => 'stable',
    viewPaymentReceipt: (id) => calls.push(['receipt', id]), openReceiptDelivery: (...args) => calls.push(['send', ...args]),
  };
  const render = execute(`${canonicalCode}; const getSucceededRefundCentsForPayment = getPaymentSucceededRefundCents; ${renderCode}; return renderPaymentHistoryItem;`, scope);
  return { tree: render(entry), calls, expanded: () => expandedId };
}
function textOf(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return tree?.props ? textOf(tree.props.children) : '';
}
function row(tree) { return nodes(tree).find((n) => n.props?.['data-testid'] === 'mobile-payment-history-row'); }
const refund = (id, amount, status = 'succeeded') => ({ id, paymentId: 'p', amount, status, reason: 'Customer request ' + id, createdAt: '2026-10-14', providerRefundId: 'provider-' + id });
for (const [status, amount, refunds, expected, label] of [
  ['succeeded', 100, [], '+$100.00', 'succeeded'],
  ['refunded', 53.25, [refund('r1', 53.25)], '$0.00', 'Refunded $53.25'],
  ['partially_refunded', 200, [refund('r1', 50)], '+$150.00', 'Partially refunded'],
  ['void', 250, [], '$0.00', 'Void'],
  ...['pending', 'failed', 'canceled'].map((status) => [status, 250, [], '$0.00', status]),
  ['succeeded', 100, [refund('r1', 50, 'pending')], '+$100.00', 'succeeded'],
]) {
  test(`mobile ${status} net presentation: ${expected} / ${label}`, () => {
    const rendered = row(fixture(status, amount, refunds).tree);
    const net = nodes(rendered).find((n) => n.props?.['data-testid'] === 'mobile-payment-net');
    assert.equal(textOf(net), expected); assert.ok(textOf(rendered).endsWith(label));
  });
}
test('row toggles existing expansion; multiple refund events retain reason, status, date and provider reference', () => {
  const collapsed = fixture(); const button = row(collapsed.tree);
  assert.equal(button.props['aria-expanded'], false);
  button.props.onClick(); assert.equal(collapsed.expanded(), 'p');
  button.props.onClick(); assert.equal(collapsed.expanded(), null);
  assert.equal(nodes(collapsed.tree).some((n) => n.props?.['data-testid'] === 'payment-history-details'), false);
  const expanded = fixture('partially_refunded', 200, [refund('r1', 25), refund('r2', 25), refund('r3', 10, 'pending')], true);
  const content = textOf(expanded.tree);
  for (const text of ['Original Payment: $200.00', 'Net Payment: $150.00', 'Refund History', 'provider-r1', 'provider-r2', 'provider-r3', 'Customer request r3', 'pending', '2026-10-14', 'Invoice INV-42', 'R-42']) assert.ok(content.includes(text), text);
});
test('existing eligible receipt, refund and void actions only open their existing workflows', () => {
  const f = fixture('succeeded', 100, [], true);
  assert.deepEqual(f.calls, []);
  const buttons = nodes(f.tree).filter((n) => n.type === 'button');
  for (const label of ['View Receipt', 'Send Receipt via SMS', 'Refund Payment', 'Void Payment']) buttons.find((n) => textOf(n) === label).props.onClick();
  assert.deepEqual(f.calls.map((v) => v[0]), ['receipt', 'send', 'refund', 'void']);
  assert.equal(f.calls[1][2], 'sms');
  assert.equal(buttons.find((n) => textOf(n).includes('Coming Soon')).props.disabled, true);
  const ineligible = textOf(fixture('failed', 100, [], true, false).tree);
  for (const label of ['View Receipt', 'Send Receipt via SMS', 'Refund Payment', 'Void Payment']) assert.ok(!ineligible.includes(label));
});
test('mobile list, heading action and Finance navigation preserve desktop rendering', () => {
  const button = jsx('mobile-history-collect'); let collected = 0;
  execute(`return (${button});`, { openPaymentWorkflow: () => collected++ }).props.onClick();
  assert.equal(collected, 1);
  assert.match(source, /onClick=\{\(\) => navigateMobileFinance\(null\)\}/);
  assert.match(source, /mobileFinanceSection !== "expenses" \? "Finance" : "Finance Overview"/);
  assert.match(source, /mobileFinanceSection === "payments"\) \? "hidden lg:inline-flex"/);
  assert.match(source, /No payments recorded yet\./);
  assert.match(jsx('payment-history-list'), /rounded-2xl bg-white lg:overflow-visible lg:rounded-none lg:bg-transparent/);
  assert.match(renderCode, /hidden lg:grid min-h-16/);
  assert.match(renderCode, /lg:hidden/);
  assert.match(renderCode, /aria-expanded=\{isExpanded\}/);
});

test('redundant summary stays desktop-only and mobile actions precede refund history', () => {
  const f = fixture('partially_refunded', 200, [refund('r1', 50)], true);
  const summary = nodes(f.tree).find((n) => n.props?.['data-testid'] === 'desktop-payment-summary');
  assert.equal(summary.props.className, 'hidden lg:contents');
  for (const label of ['Applied to:', 'Method:', 'Date:', 'Status:', 'Original Payment:', 'Refunded:', 'Net Payment:']) assert.ok(textOf(summary).includes(label));
  assert.match(renderCode, /order-1 lg:order-none lg:col-span-2/);
  assert.match(renderCode, /order-3 w-full lg:order-none/);
  assert.match(renderCode, /flex flex-wrap gap-2 lg:grid lg:grid-cols-2/);
  assert.ok(!textOf(fixture('succeeded', 100, [], true).tree).includes('Refund History'));
});
test('mobile hides missing-receipt placeholder but retains actual receipt reference and all actions', () => {
  for (const receipt of [null, { receiptNumber: 'R-42' }]) {
    const f = fixture('succeeded', 100, [], true, true, receipt);
    const details = nodes(f.tree).find((n) => n.props?.['data-testid'] === 'payment-receipt-details');
    assert.ok(details.props.className.startsWith(receipt ? 'block ' : 'hidden '));
    assert.ok(details.props.className.includes('lg:block'));
    const reference = nodes(details).find((n) => n.type === 'p' && textOf(n).includes(receipt ? 'R-42' : 'Receipt will be created'));
    assert.ok(reference.props.className.startsWith(receipt ? 'block ' : 'hidden '));
    for (const label of ['View Receipt', 'Send Receipt via SMS', 'Refund Payment', 'Void Payment']) assert.ok(textOf(f.tree).includes(label));
  }
});

test('Classic Payment History retains expanded original details and canonical net value', () => {
  const f = fixture('partially_refunded', 200, [refund('r1', 50)], true, true, { receiptNumber: 'R-42' }, true);
  assert.equal(row(f.tree), undefined);
  const content = textOf(f.tree);
  for (const value of ['+$150.00', 'Original Payment: $200.00', 'Refund History', 'View Receipt', 'Refund Payment']) assert.ok(content.includes(value));
});
