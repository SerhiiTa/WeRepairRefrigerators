import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('frontend/package.json'));
const ts = require('typescript');
const root = 'frontend/src/server/';
const authSource = readFileSync('frontend/src/lib/auth/homefix-private-access.ts', 'utf8');
const authExports = {};
new Function('exports', ts.transpileModule(authSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(authExports);
const company = authExports.HOMEFIX_PRIVATE_COMPANY_ID;
const customerA = '22222222-2222-4222-8222-222222222222';
const customerB = '33333333-3333-4333-8333-333333333333';
const env = () => ({ STRIPE_SECRET_KEY: 'sk_test_fake' });
function load(path, environment, imports = {}) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(root + path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', 'process', js)(exports, id => id === '@/lib/auth/homefix-private-access' ? authExports : imports[id], { env: environment });
  return exports;
}
function config(environment = env(), overrides = {}) {
  const policy = load('finance/sandbox-test-policy.ts', environment);
  const client = { accounts: { retrieve: async () => ({ id: 'acct_fake' }) }, balance: { retrieve: async () => ({ livemode: false }) }, ...overrides };
  return load('finance/stripe-config.ts', environment, { stripe: function() { return client; }, './sandbox-test-policy': policy });
}
test('multiple customers and Jobs in the configured company pass without customer configuration', () => {
  const p = load('finance/sandbox-test-policy.ts', env());
  for (const customerId of [customerA, customerB]) for (const job of ['job-1', 'job-2']) {
    assert.equal(p.isSandboxTestContextAllowed({ companyId: company, customerCompanyId: company, customerId, job }), true);
  }
  for (const value of [{ companyId: customerA }, { customerCompanyId: customerA }, { customerId: null }]) {
    assert.equal(p.isSandboxTestContextAllowed({ companyId: company, customerCompanyId: company, customerId: customerA, ...value }), false);
  }
});
test('existing Production test credentials work without customer/company/account env; stale settings are ignored', () => {
  const environment = { ...env(), NODE_ENV: 'production', WRA_STRIPE_SANDBOX_ACCOUNT_ID: 'invalid', WRA_STRIPE_SANDBOX_TEST_CUSTOMER_IDS: 'invalid', WRA_STRIPE_SANDBOX_PILOT_CUSTOMER_ID: 'invalid' };
  assert.equal(config(environment).getStripeRuntimeConfig().mode, 'test');
  assert.equal(load('finance/sandbox-test-policy.ts', environment).isSandboxTestContextAllowed({ companyId: company, customerCompanyId: company, customerId: customerB }), true);
});
test('live or malformed credentials and production mock mode fail; absent credentials disable Checkout', () => {
  for (const change of [{ STRIPE_SECRET_KEY: 'sk_live_fake' }, { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_fake' }, { STRIPE_SECRET_KEY: 'invalid' }, { STRIPE_MOCK_MODE: '1', NODE_ENV: 'production' }, { STRIPE_WEBHOOK_SECRET: 'invalid' }]) {
    assert.throws(() => config({ ...env(), ...change }).getStripeRuntimeConfig());
  }
  assert.equal(config({}).getStripeRuntimeConfig().mode, 'disabled');
  assert.equal(config({}).getStripeClient(), null);
});
const sms = readFileSync(root + 'communications/telnyx-sms-transport.ts', 'utf8');
function smsGate(environment, mock = false) {
  const ast = ts.createSourceFile('sms.ts', sms, ts.ScriptTarget.Latest, true); const names = ['normalizeSmsPhone', 'getProductionSmsTestRecipients', 'checkOutboundSmsRecipientAllowed'];
  const funcs = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast).replace(/^export /, '')).join('\n');
  const js = ts.transpileModule(funcs + '\nreturn checkOutboundSmsRecipientAllowed;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('process', 'isLocalQaSmsMockEnabled', js)({ env: environment }, () => mock);
}
test('different valid SMS recipients are accepted without allowlists; stale env values are ignored', () => {
  for (const environment of [{}, { WRA_PRODUCTION_SMS_TEST_RECIPIENT: 'invalid', WRA_PRODUCTION_SMS_TEST_RECIPIENTS: '' }]) {
    const gate = smsGate(environment);
    for (const phone of ['+12025550101', '+12025550102', '+442079460123']) assert.equal(gate(phone).ok, true);
  }
  assert.doesNotMatch(sms, /WRA_PRODUCTION_SMS_TEST_RECIPIENT/);
});
test('invalid normalized SMS phones fail before provider or message writes', () => {
  const gate = smsGate({});
  for (const phone of ['', '+1', 'invalid', '12025550101', '+0123456789', '+1234567890123456']) assert.equal(gate(phone).status, 400);
});
test('existing SMS route authorization, tenant access and provider rejection handling remain', () => {
  const route = readFileSync('frontend/src/app/api/communications/conversations/[id]/messages/route.ts', 'utf8');
  assert.match(route, /requireHomeFixPrivateAccess/);
  assert.match(route, /can_access_communication_conversation/);
  assert.ok(route.indexOf('canAccess !== true') < route.indexOf('await sendConversationSms'));
  assert.match(sms, /Telnyx rejected the SMS/);
  assert.match(sms, /delivery_status: "failed"/);
  assert.match(sms, /Unable to check SMS idempotency/);
});
test('Checkout and webhook share company policy and retain credential/signature/eligibility protections', () => {
  const checkout = readFileSync(root + 'finance/stripe-checkout.ts', 'utf8');
  const webhook = readFileSync(root + 'finance/stripe-webhook-accounting.ts', 'utf8');
  assert.match(checkout, /isSandboxTestContextAllowed\(context\)/);
  assert.match(webhook, /isSandboxTestContextAllowed\(/);
  for (const name of ['createStripeCheckoutSession', 'createPublicStripeCheckoutSession']) {
    const part = checkout.slice(checkout.indexOf('export async function ' + name));
    assert.ok(part.indexOf('assertPilotCustomerAllowed(config, targetContext)') < part.indexOf('supabase.rpc('));
  }
  assert.match(checkout, /get_service_request_payment_eligibility_rpc/);
  assert.match(webhook, /event.livemode/);
  assert.match(checkout, /idempotencyKey/);
  assert.match(sms, /const recipientGate = checkOutboundSmsRecipientAllowed\(toPhone\)/);
});
test('webhook customer/company guard permits multiple customers but rejects cross-company attempts', async () => {
  const source = readFileSync(root + 'finance/stripe-webhook-accounting.ts', 'utf8');
  const ast = ts.createSourceFile('webhook.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'isAttemptAllowedForRuntime');
  const js = ts.transpileModule(fn.getText(ast) + '\nreturn isAttemptAllowedForRuntime;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  async function check(customerId, jobCompany = company, customerCompany = company) {
    const service = { from: table => ({ select() { return this; }, eq() { return this; }, async maybeSingle() {
      return { data: table === 'customers' ? { company_id: customerCompany } : { company_id: jobCompany, customer_id: customerId }, error: null };
    } }) };
    const guard = new Function('getStripeRuntimeConfig', 'getSupabaseServiceRoleClient', 'isSandboxTestContextAllowed', js)(
      () => ({ mode: 'test' }), () => service,
      load('finance/sandbox-test-policy.ts', env()).isSandboxTestContextAllowed,
    );
    return guard({ service_request_id: 'job', company_id: company });
  }
  for (const id of [customerA, customerB]) assert.equal(await check(id), true);
  assert.equal(await check(customerA, customerB), false);
  assert.equal(await check(customerA, company, customerB), false);
  assert.equal(await check(null), false);
});

test('shared private-access company replaces duplicate company env; stale allowlists cannot override it', () => {
  const environment = { ...env(), WRA_STRIPE_SANDBOX_COMPANY_ID: customerA, WRA_STRIPE_SANDBOX_TEST_CUSTOMER_IDS: customerA, WRA_STRIPE_SANDBOX_PILOT_CUSTOMER_ID: customerA };
  const policy = load('finance/sandbox-test-policy.ts', environment);
  assert.equal(policy.getSandboxTestPolicy().companyId, company);
  assert.equal(policy.isSandboxTestContextAllowed({ companyId: company, customerCompanyId: company, customerId: customerB }), true);
  assert.equal(policy.isSandboxTestContextAllowed({ companyId: customerA, customerCompanyId: customerA, customerId: customerB }), false);
  assert.doesNotMatch(readFileSync(root + 'finance/sandbox-test-policy.ts', 'utf8'), /WRA_STRIPE_SANDBOX_COMPANY_ID|WRA_STRIPE_SANDBOX_TEST_CUSTOMER_IDS|WRA_STRIPE_SANDBOX_PILOT_CUSTOMER_ID|acct_1UNvfe/);
});

test('account binding uses existing secret key and signed webhook, without claiming an independent account pin', () => {
  const configuration = readFileSync(root + 'finance/stripe-config.ts', 'utf8');
  const policy = readFileSync(root + 'finance/sandbox-test-policy.ts', 'utf8');
  const route = readFileSync('frontend/src/app/api/payments/stripe-webhook/route.ts', 'utf8');
  assert.doesNotMatch(configuration + policy, /WRA_STRIPE_SANDBOX_ACCOUNT_ID|accounts.retrieve|balance.retrieve/);
  assert.match(configuration, /new Stripe\(process.env.STRIPE_SECRET_KEY/);
  assert.match(route, /constructEvent/);
  assert.match(route, /config.webhookSecret/);
});
