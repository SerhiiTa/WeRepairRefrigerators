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
function functionSource(name) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing function ${name}`);
  return found;
}
function execute(code, scope) {
  const js = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  scope = { useClassicMobileFinance: false, ...scope };
  return new Function('React', ...Object.keys(scope), js)(React, ...Object.values(scope));
}
const start = source.indexOf('{mobileFinanceSection === null ? (');
const end = source.indexOf('\n        <div\n          className={`hidden lg:grid', start);
assert.ok(start > 0 && end > start);
const expression = source.slice(start + 1, end).trim().slice(0, -1);
const money = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
function fixture(overrides = {}) {
  const calls = [];
  const scope = {
    mobileFinanceSection: null, financeApprovedTotal: 1200, financePaidTotal: 250,
    financeBalanceDueTotal: 950, financeApprovedEstimates: [{}], financeEstimates: [{}, {}],
    currentInvoices: [{ total: 1200 }], invoiceHistory: [{}], paymentHistory: [{}, {}, {}],
    statusLabel: 'Scheduled', formatServiceRequestMoney: money,
    FinanceHomeIcon: () => React.createElement('svg', { 'aria-hidden': true }),
    navigateMobileFinance: (section) => calls.push(['section', section]),
    openNewManualEstimateEditor: () => calls.push(['estimate']),
    openPaymentWorkflow: () => calls.push(['payment']), ...overrides,
  };
  const tree = execute(`return (${expression});`, scope);
  return { tree, html: renderToStaticMarkup(tree), calls, scope };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join('');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
test('overview renders canonical amounts, exactly four destinations and no refund summary', () => {
  const { tree, html } = fixture();
  for (const value of ['$950.00', '$1,200.00', '$250.00', '3 recorded payments', '2 total · Approved first']) assert.ok(html.includes(value));
  const nav = nodes(tree).find((n) => n.props?.['aria-label'] === 'Finance sections');
  const buttons = nodes(nav).filter((n) => n.type === 'button' && !n.props['aria-label']);
  assert.equal(buttons.length, 4);
  assert.doesNotMatch(html, /Refund|Gross Payments|Taxes|Payment count includes/);
});
test('all rows navigate independently; estimate plus and bottom actions invoke existing handlers', () => {
  const { tree, calls } = fixture();
  for (const button of nodes(tree).filter((n) => n.type === 'button')) button.props.onClick();
  assert.deepEqual(calls, [['section','estimates'], ['estimate'], ['section','invoices'], ['section','payments'], ['section','expenses'], ['estimate'], ['payment']]);
});
test('each destination hides overview and sticky bar and provides overview back navigation', () => {
  for (const section of ['estimates','invoices','payments','expenses']) {
    const { tree, html, calls } = fixture({ mobileFinanceSection: section });
    assert.doesNotMatch(html, /mobile-finance-overview|mobile-finance-actions/);
    nodes(tree).find((n) => n.type === 'button' && text(n).includes('Finance')).props.onClick();
    assert.deepEqual(calls, [['section', null]]);
  }
});
test('empty/current invoice states never display a historical fallback total', () => {
  const { html } = fixture({ currentInvoices: [], invoiceHistory: [{ total: 9999 }], paymentHistory: [], financeEstimates: [] });
  assert.match(html, /1 in history · No current invoice/);
  assert.match(html, /0 recorded payments/);
  assert.doesNotMatch(html, /9,999/);
});
test('section history preserves job URL context and clears stale estimate links', () => {
  let href = 'http://localhost:3000/dashboard/leads/qa?tab=finance&estimateId=old&returnTo=jobs';
  let selected, tab;
  const history = [];
  const window = { location: { get href() { return href; } }, history: { state: { existing: true }, pushState(state, _, url) { href = String(url); history.push({ state, url: new URL(href) }); } } };
  const navigate = execute(`${functionSource('navigateMobileFinance')}\nreturn navigateMobileFinance;`, { window, URL, setMobileFinanceSection: (v) => { selected = v; }, setActiveJobTab: (v) => { tab = v; } });
  for (const section of ['estimates','invoices','payments','expenses',null]) {
    navigate(section);
    const url = history.at(-1).url;
    assert.equal(url.searchParams.get('financeSection'), section);
    assert.equal(url.searchParams.get('tab'), 'finance');
    assert.equal(url.searchParams.get('estimateId'), null);
    assert.equal(url.searchParams.get('returnTo'), 'jobs');
    assert.equal(selected, section); assert.equal(tab, 'estimate');
    assert.equal(history.at(-1).state.existing, true);
  }
});
test('estimate route refresh preserves open editors; explicit browser back closes them', () => {
  for (const mode of ['manual','saved']) {
    const changes = [];
    const apply = execute(`${functionSource('applyEstimateRouteState')}\nreturn applyEstimateRouteState;`, {
      isManualEstimateOverlayOpen: false, window: { location: { search: '?tab=finance&financeSection=estimates' } },
      URLSearchParams, financeEstimateMode: mode,
      setActiveJobTab: (v) => changes.push(['tab',v]), setIsFinanceEstimatesOpen: () => {},
      setManualEstimateId: (v) => changes.push(['id',v]), setFinanceEstimateMode: (v) => changes.push(['mode',v]),
    });
    apply({ allowWorkspaceClose: false }); assert.deepEqual(changes, []);
    apply({ allowWorkspaceClose: true }); assert.deepEqual(changes, [['tab','estimate'],['id',null],['mode','home']]);
  }
});
test('mobile content and action bar have desktop hiding and safe-area clearance', () => {
  const { tree } = fixture();
  assert.match(tree.props.className, /lg:hidden/);
  assert.match(tree.props.className, /10rem\+env\(safe-area-inset-bottom\)/);
  const bar = nodes(tree).find((n) => n.props?.['data-testid'] === 'mobile-finance-actions');
  assert.match(bar.props.className, /safe-area-inset-bottom/);
  for (const flag of ['Estimates','Invoice','Payments','Expenses']) {
    assert.ok(source.includes(`isFinance${flag}Open ? "" : "lg:hidden"`));
  }
});


test('shared mobile tabs keep identical layout and update only active color and underline', () => {
  const label = 'aria-label="Mobile job workspace sections"';
  assert.equal(source.split(label).length - 1, 1);
  const navStart = source.lastIndexOf('<nav', source.indexOf(label));
  const navEnd = source.indexOf('</nav>', navStart) + 6;
  const navSource = source.slice(navStart, navEnd);
  let referenceLayout;
  for (const activeJobTab of ['overview', 'estimate', 'timeline']) {
    const nav = execute(`return (${navSource});`, { activeJobTab });
    const buttons = nodes(nav).filter((node) => node.type === 'button');
    assert.deepEqual(buttons.map(text), ['Details', 'Finance', 'Timeline']);
    assert.deepEqual(buttons.map((button) => button.key), ['overview', 'estimate', 'timeline']);
    assert.equal(nav.props.className, 'mt-3 grid grid-cols-3 border-b border-[#E5E7EB]');
    for (const button of buttons) {
      const active = button.key === activeJobTab;
      assert.equal(button.props['aria-current'], active ? 'page' : undefined);
      assert.equal(button.props.className.includes('border-[#2563EB] text-[#2563EB]'), active);
      assert.equal(button.props.className.includes('border-transparent text-[#475569]'), !active);
      assert.doesNotMatch(button.props.className, /shadow|rounded|bg-/);
    }
    const layout = buttons.map((button) => button.props.className.replace(/border-\[#[A-Fa-f0-9]+\]|border-transparent|(?:hover:)?text-\[#[A-Fa-f0-9]+\]/g, '').trim());
    if (referenceLayout) assert.deepEqual(layout, referenceLayout);
    referenceLayout = layout;
  }
  assert.match(source, /<header className="lg:hidden">/);
});

test('shared mobile tab clicks retain route history and clear only section routing state', () => {
  const navStart = source.lastIndexOf('<nav', source.indexOf('aria-label="Mobile job workspace sections"'));
  const navSource = source.slice(navStart, source.indexOf('</nav>', navStart) + 6);
  for (const destination of ['overview', 'estimate', 'timeline']) {
    const calls = [];
    const nav = execute(`return (${navSource});`, {
      activeJobTab: 'estimate', URL,
      window: { location: { href: 'http://localhost:3000/dashboard/leads/qa?tab=finance&financeSection=payments&returnTo=jobs' }, history: { state: { preserved: true }, pushState(state, _, url) { calls.push({ state, url }); } } },
      setMobileFinanceSection: (value) => calls.push(value),
      setActiveJobTab: (value) => calls.push(value),
    });
    nodes(nav).find((node) => node.type === 'button' && node.key === destination).props.onClick();
    assert.equal(calls[0].url.searchParams.get('tab'), destination === 'estimate' ? 'finance' : destination);
    assert.equal(calls[0].url.searchParams.get('financeSection'), null);
    assert.equal(calls[0].url.searchParams.get('returnTo'), 'jobs');
    assert.deepEqual(calls[0].state, { preserved: true });
    assert.deepEqual(calls.slice(1), [null, destination]);
  }
});
