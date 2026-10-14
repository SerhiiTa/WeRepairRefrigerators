import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
const methods = ['card', 'cash', 'check', 'zelle', 'venmo', 'cash_app'];
function selector(selected = 'cash') {
  let draft = { paymentMethod: selected, amount: '37.50', checkoutKind: 'custom_deposit', customDepositMode: 'percent', customDepositPercent: '25', idempotencyKey: 'unchanged' };
  const scope = {
    manualPaymentDraft: draft, manualPaymentState: { status: 'idle' },
    selectedCardAmountCents: 3750, selectedCardCheckoutAction: { amountCents: 10000 }, selectedManualPaymentTarget: { remaining: 100 },
    formatCentsAsInput: (v) => (v / 100).toFixed(2), moneyToCents: (v) => v * 100,
    setManualPaymentDraft: (fn) => { draft = fn(draft); }, setManualPaymentState: () => {},
    getManualPaymentMethodLabel: (v) => v, Image: () => null,
  };
  return { tree: execute(`return (${jsx('collect-payment-methods')});`, scope), current: () => draft };
}
test('six methods have exactly one selected indicator for every selection', () => {
  for (const method of methods) {
    const buttons = nodes(selector(method).tree).filter((n) => n.type === 'button');
    assert.deepEqual(buttons.map((n) => n.key), methods);
    assert.deepEqual(buttons.filter((n) => n.props['aria-pressed']).map((n) => n.key), [method]);
  }
});
test('method selection updates the draft only and preserves amount/deposit settings', () => {
  for (const method of methods) {
    const fixture = selector();
    nodes(fixture.tree).find((n) => n.type === 'button' && n.key === method).props.onClick();
    assert.deepEqual(fixture.current(), { paymentMethod: method, amount: '37.50', checkoutKind: 'custom_deposit', customDepositMode: 'percent', customDepositPercent: '25', idempotencyKey: 'unchanged' });
  }
  assert.doesNotMatch(jsx('collect-payment-methods'), /saveManualPayment|startTechnicianStripeCheckout|fetch\(/);
});
test('primary action invokes only the existing guarded dispatcher when explicitly clicked', () => {
  for (const method of methods) {
    let submissions = 0;
    const button = execute(`return (${jsx('collect-payment-submit')});`, {
      manualPaymentState: { status: 'idle' }, manualPaymentDraft: { paymentMethod: method }, saveManualPayment: () => submissions++,
    });
    assert.equal(submissions, 0);
    assert.equal(button.props.children, method === 'card' ? 'Continue to payment' : 'Save Payment');
    button.props.onClick(); assert.equal(submissions, 1);
  }
});
test('the dispatcher reserves Stripe for Card and retains manual amount validation', async () => {
  const code = find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'saveManualPayment');
  for (const method of methods) {
    let stripe = 0; const errors = [];
    const run = execute(`${code}; return saveManualPayment;`, {
      state: { status: 'ready' }, manualPaymentDraft: { paymentMethod: method, amount: '0' }, selectedManualPaymentTarget: { remaining: 100 },
      parseMoneyInputToCents: () => 0, moneyToCents: (v) => v * 100,
      startTechnicianStripeCheckout: async () => stripe++, setManualPaymentState: (v) => errors.push(v),
    });
    await run();
    assert.equal(stripe, method === 'card' ? 1 : 0);
    if (method !== 'card') assert.match(errors[0].message, /valid payment amount/);
  }
});
test('payment link opens the supported delivery dialog without sending or checkout', () => {
  for (const eligible of [false, true]) {
    const calls = [];
    const invoice = { id: 'invoice' };
    const button = execute(`return (${jsx('mobile-send-payment-link')});`, {
      canOpenPaymentLink: eligible, paymentLinkInvoice: invoice, manualPaymentState: { status: 'idle' }, Image: () => null,
      setIsManualPaymentOpen: (v) => calls.push(['close', v]), openInvoiceDelivery: (v) => calls.push(['delivery', v.id]),
    });
    assert.equal(button.props.disabled, !eligible);
    button.props.onClick();
    assert.deepEqual(calls, eligible ? [['close', false], ['delivery', 'invoice']] : []);
  }
  assert.doesNotMatch(jsx('mobile-send-payment-link'), /sendInvoiceDelivery|fetch\(|startTechnicianStripeCheckout/);
});
test('Full, custom and deposit controls stay available with desktop order preserved', () => {
  for (const text of ['selectedManualPaymentTarget.cardActions.map', 'customDepositMode', 'customDepositPercent', 'manual-payment-amount', 'updateManualPaymentTarget(target)', 'payment-amount-options']) assert.ok(source.includes(text));
  for (const order of [1,2,3,4,5,6,7]) assert.ok(source.includes(`sm:order-${order}`));
  assert.match(source, /sm:contents sm:space-y-0/);
  assert.match(source, /mobilePaymentStep === 2 \? "block" : "hidden"/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(jsx('mobile-collect-payment-hero'), /selectedManualPaymentTarget\?\.remaining/);
  assert.match(jsx('mobile-collect-payment-hero'), /text-\[1\.6rem\]/);
});
test('official assets are local, attributed and unmodified; no icon package added', () => {
  const assets = resolve(root, 'frontend/public/images/payment-methods');
  const sources = JSON.parse(readFileSync(resolve(assets, 'sources.json'), 'utf8'));
  for (const name of ['card.svg','cash.svg','check.svg','link.svg','zelle.png','venmo.png','cash-app.svg','LUCIDE-LICENSE.txt']) {
    assert.ok(existsSync(resolve(assets, name))); assert.ok(sources[name]);
  }
  const pkg = JSON.parse(readFileSync(resolve(root, 'frontend/package.json'), 'utf8'));
  assert.equal(pkg.dependencies['lucide-react'], undefined);
  assert.match(JSON.stringify(sources), /venmo.com\/about\/brand/);
  assert.match(JSON.stringify(sources), /www.zelle.com/);
  assert.match(JSON.stringify(sources), /developers.cash.app/);
});

function declaration(name) {
  return find((n) => ts.isVariableDeclaration(n) && n.name.getText(ast) === name);
}
test('Continue, Back and Change only navigate and retain the draft', () => {
  for (const [id, expected] of [['mobile-payment-continue', 2], ['mobile-payment-back', 1], ['mobile-payment-change', 1]]) {
    const steps = [];
    const button = execute(`return (${jsx(id)});`, {
      selectedManualPaymentTarget: { id: 'invoice' }, manualPaymentState: { status: 'idle' },
      setMobilePaymentStep: (step) => steps.push(step),
    });
    assert.deepEqual(steps, []);
    button.props.onClick();
    assert.deepEqual(steps, [expected]);
    assert.doesNotMatch(jsx(id), /saveManualPayment|submitMobilePayment|setManualPaymentDraft/);
  }
});
test('mobile confirmation labels and invalid/busy disabling are method-specific', () => {
  for (const method of methods) for (const valid of [false, true]) for (const status of ['idle', 'saving', 'success']) {
    let calls = 0;
    const button = execute(`return (${jsx('mobile-payment-submit')});`, {
      isMobilePaymentAmountValid: valid, manualPaymentState: { status }, manualPaymentDraft: { paymentMethod: method }, submitMobilePayment: () => calls++,
    });
    assert.equal(calls, 0);
    assert.equal(button.props.disabled, !valid || status === 'saving' || status === 'success');
    assert.equal(button.props.children, status === 'saving' ? 'Processing...' : method === 'card' ? 'Collect payment' : 'Record payment');
  }
});
test('confirmation uses canonical card amounts or parsed manual amounts and rejects invalid deposits', () => {
  for (const method of methods) for (const amount of [null, 0, 3750, 10000, 10001]) {
    const result = execute(`const ${declaration('mobilePaymentAmountCents')}; const ${declaration('isMobilePaymentAmountValid')}; return { amount: mobilePaymentAmountCents, valid: isMobilePaymentAmountValid };`, {
      manualPaymentDraft: { paymentMethod: method, amount: 'input', checkoutKind: 'custom_deposit', customDepositMode: 'fixed' },
      selectedCardAmountCents: amount, parseMoneyInputToCents: () => amount,
      selectedManualPaymentTarget: { id: 'invoice' }, customDepositMaxCents: 10000, customDepositPercent: null,
    });
    assert.equal(result.amount, amount);
    assert.equal(result.valid, amount !== null && amount > 0 && amount <= 10000);
  }
  for (const percent of [null, 0, 101, 25, 100]) {
    const valid = execute(`const ${declaration('isMobilePaymentAmountValid')}; return isMobilePaymentAmountValid;`, {
      manualPaymentDraft: { paymentMethod: 'card', checkoutKind: 'custom_deposit', customDepositMode: 'percent' },
      mobilePaymentAmountCents: 3750, selectedManualPaymentTarget: {}, customDepositMaxCents: 10000, customDepositPercent: percent,
    });
    assert.equal(valid, percent !== null && percent > 0 && percent <= 100);
  }
  for (const valid of [false, true]) {
    const rendered = execute(`return (${jsx('mobile-payment-final-amount')});`, {
      isMobilePaymentAmountValid: valid, mobilePaymentAmountCents: 3750,
      formatServiceRequestMoney: (v) => '$' + v.toFixed(2), centsToMoney: (v) => v / 100,
    });
    assert.ok(nodes(rendered).some((n) => n.props?.children === (valid ? '$37.50' : 'Enter a valid amount')));
  }
});
test('mobile submission blocks Step 1, invalid amounts and duplicate clicks before auth completes', async () => {
  const code = find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'submitMobilePayment');
  for (const step of [1, 2]) for (const valid of [false, true]) {
    let calls = 0; let finish;
    const pending = new Promise((resolve) => { finish = resolve; });
    const ref = { current: false };
    const submit = execute(`${code}; return submitMobilePayment;`, {
      mobilePaymentStep: step, isMobilePaymentAmountValid: valid, mobilePaymentSubmissionRef: ref,
      manualPaymentState: { status: 'idle' }, setManualPaymentState: () => {},
      saveManualPayment: async () => { calls++; await pending; },
    });
    const first = submit(); const second = submit();
    assert.equal(calls, step === 2 && valid ? 1 : 0);
    finish(); await Promise.all([first, second]); assert.equal(ref.current, false);
  }
});
test('job changes clear draft; close returns to origin; desktop keeps the single form', () => {
  assert.match(source, /setMobilePaymentStep\(1\);\s*setIsManualPaymentOpen\(false\);\s*setManualPaymentDraft\(null\);[\s\S]*?\}, \[requestId\]\)/);
  const close = find((n) => ts.isJsxElement(n) && n.openingElement.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.text === 'aria-label' && a.initializer?.text === 'Close payment form'));
  const calls = [];
  execute(`return (${close});`, { manualPaymentState: { status: 'idle' }, setIsManualPaymentOpen: (v) => calls.push(v), setManualPaymentState: () => {} }).props.onClick();
  assert.deepEqual(calls, [false]);
  assert.match(jsx('collect-payment-submit'), /hidden.*sm:block/);
  assert.match(jsx('collect-payment-submit'), /saveManualPayment\(\)/);
  assert.match(source, /sm:order-2 sm:block/);
  const modal = source.slice(source.indexOf('{isManualPaymentOpen ? ('), source.indexOf('{jobDeleteState.status'));
  assert.doesNotMatch(modal, /Continue to Stripe|Stripe checkout|Secure card checkout|Card amounts are calculated/);
});
test('target changes use existing eligible target balances and retain method and reference draft', () => {
  const code = find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'updateManualPaymentTarget');
  for (const method of methods) {
    let draft = { paymentMethod: method, referenceCode: 'reference', note: 'note', idempotencyKey: 'stable', customDepositMode: 'percent', customDepositPercent: '25' };
    const update = execute(`${code}; return updateManualPaymentTarget;`, {
      setManualPaymentDraft: (fn) => { draft = fn(draft); }, setManualPaymentState: () => {},
      formatCentsAsInput: (v) => (v / 100).toFixed(2), moneyToCents: (v) => v * 100,
    });
    update({ type: 'invoice', id: 'new-invoice', remaining: 80, cardActions: [{ kind: 'balance_due', amountCents: 8000 }] });
    assert.equal(draft.targetId, 'new-invoice'); assert.equal(draft.amount, '80.00');
    assert.equal(draft.checkoutKind, 'balance_due'); assert.equal(draft.paymentMethod, method);
    assert.equal(draft.referenceCode, 'reference'); assert.equal(draft.idempotencyKey, 'stable');
  }
});
test('card full and custom deposit choices retain existing suggested amounts without submission', () => {
  const code = find((n) => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'button' && n.getText(ast).includes('key={action.kind}'));
  for (const kind of ['pay_in_full', 'balance_due', 'custom_deposit']) {
    let draft = { paymentMethod: 'card', idempotencyKey: 'stable' };
    const button = execute(`return (${code});`, {
      action: { kind, amountCents: 10000, label: kind }, isSelected: false,
      manualPaymentState: { status: 'idle' }, selectedManualPaymentTarget: { depositSuggestionCents: 2500 },
      setManualPaymentDraft: (fn) => { draft = fn(draft); }, setManualPaymentState: () => {},
      formatCentsAsInput: (v) => (v / 100).toFixed(2), formatServiceRequestMoney: (v) => String(v), centsToMoney: (v) => v / 100,
    });
    button.props.onClick();
    assert.equal(draft.checkoutKind, kind); assert.equal(draft.amount, kind === 'custom_deposit' ? '25.00' : '100.00');
    assert.equal(draft.idempotencyKey, 'stable');
  }
  assert.doesNotMatch(code, /saveManualPayment|startTechnicianStripeCheckout/);
});
