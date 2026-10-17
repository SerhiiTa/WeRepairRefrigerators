import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const ts = require('typescript');
const source = fs.readFileSync(new URL('./StripeSuccessExperience.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness({ available = true, post, staff = true } = {}) {
  const slots = []; let cursor = 0; const calls = [];
  const options = { email: { available, recipient: 'qa@example.com', reason: 'Not configured' }, sms: { available: true, recipient: '+15555550100' } };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn) { return fn(); }, useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const testModule = { exports: {} };
  vm.runInNewContext(compiled, { exports: testModule.exports, module: testModule, URLSearchParams, Intl, Date, Math, Set,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/link') return { default: 'a' };
      if (name === '@/lib/supabase/client') return { getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic' } } }) } }) };
      throw new Error(name);
    },
    fetch: async (url, init = {}) => {
      calls.push({ url, ...init });
      if (init.method === 'POST') return post ? post() : { ok: true, json: async () => ({ ok: true }) };
      return { ok: true, json: async () => ({ ok: true, deliveryOptions: options, deliveries: [{ id: 'delivery', delivery_channel: 'email', delivery_status: 'sent' }] }) };
    },
  });
  function render() {
    cursor = 0;
    const tree = testModule.exports.StripeSuccessExperience({ dashboardReturnPath: staff ? '/dashboard/jobs/job' : null, query: {}, initialStatus: { authorized: true, paymentStatus: 'received', documentHref: '/invoices/synthetic', receipt: { amount: '10.00', receiptNumber: 'RCP-QA', jobNumber: 'QA', href: '/receipts/synthetic', paidAt: null }, ...(staff ? { staffReceiptDelivery: { paymentId: 'payment', serviceRequestId: 'job' } } : {}) } });
    const nodes = [];
    function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (node && typeof node === 'object') { nodes.push(node); walk(node.props?.children); } }
    walk(tree); return nodes;
  }
  const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : n ?? '';
  const button = label => render().find(n => n.type === 'button' && text(n) === label);
  const checkbox = index => render().filter(n => n.type === 'input' && n.props.type === 'checkbox')[index];
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { calls, render, button, checkbox, settle, text: () => render().map(text).join(' '), async open() { button('Send Receipt').props.onClick(); await settle(); }, email(value) { render().find(n => n.props?.['aria-label'] === 'Receipt recipient email').props.onChange({ currentTarget: { value } }); } };
}
test('API availability controls Email; canonical prefill is editable and validated', async () => {
  const h = harness(); await h.open(); assert.equal(h.checkbox(1).props.disabled, false);
  h.checkbox(1).props.onChange({ currentTarget: { checked: true } });
  assert.equal(h.render().find(n => n.props?.type === 'email').props.value, 'qa@example.com');
  h.email('invalid'); h.button('Confirm Send').props.onClick(); await h.settle();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 0); assert.match(h.text(), /valid email address/);
  h.checkbox(0).props.onChange({ currentTarget: { checked: false } }); h.email(' edited@example.com ');
  h.button('Confirm Send').props.onClick(); await h.settle();
  const body = JSON.parse(h.calls.find(c => c.method === 'POST').body);
  assert.equal(body.channel, 'email'); assert.equal(body.recipient, 'edited@example.com'); assert.match(body.idempotencyKey, /-email$/);
  assert.match(h.text(), /Accepted for sending/); assert.match(h.text(), /Delivery History/);
});
test('unconfigured Email stays disabled and SMS payload is preserved', async () => {
  const h = harness({ available: false }); await h.open(); assert.equal(h.checkbox(1).props.disabled, true);
  h.button('Confirm Send').props.onClick(); await h.settle();
  const sends = h.calls.filter(c => c.method === 'POST'); assert.equal(sends.length, 1);
  assert.equal(JSON.parse(sends[0].body).channel, 'sms'); assert.equal(JSON.parse(sends[0].body).recipient, '+15555550100');
});
test('loading lock prevents concurrent clicks; completed attempt cannot be resubmitted', async () => {
  let finish; const h = harness({ post: () => new Promise(resolve => { finish = resolve; }) }); await h.open();
  const click = h.button('Confirm Send').props.onClick; click(); click(); await h.settle();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1); assert.equal(h.button('Sending...').props.disabled, true);
  finish({ ok: true, json: async () => ({ ok: true }) }); await h.settle();
  h.button('Confirm Send').props.onClick(); await h.settle(); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});
test('provider rejection and uncertain network outcomes are not reported as acceptance or retried', async () => {
  for (const post of [async () => ({ ok: false, json: async () => ({ ok: false, message: 'Provider rejected' }) }), async () => { throw new Error('network'); }]) {
    const h = harness({ post }); await h.open(); h.button('Confirm Send').props.onClick(); await h.settle();
    assert.doesNotMatch(h.text(), /Accepted for sending/); assert.match(h.text(), /Provider rejected|not confirmed/);
    h.button('Confirm Send').props.onClick(); await h.settle(); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  }
});
test('both selected channels get distinct idempotency keys and canonical history refresh', async () => {
  const h = harness(); await h.open(); h.checkbox(1).props.onChange({ currentTarget: { checked: true } });
  h.button('Confirm Send').props.onClick(); await h.settle();
  const sends = h.calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body));
  assert.deepEqual(sends.map(c => c.channel), ['sms', 'email']); assert.notEqual(sends[0].idempotencyKey, sends[1].idempotencyKey);
  assert.equal(h.calls.filter(c => !c.method).length, 2);
});
test('success and View Receipt remain present; public returns cannot send', () => {
  const h = harness({ staff: false }); assert.match(h.text(), /Payment Successful!/); assert.match(h.text(), /View Receipt/); assert.equal(h.button('Send Receipt'), undefined); assert.equal(h.calls.length, 0);
});
