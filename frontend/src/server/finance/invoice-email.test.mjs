import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const root = process.cwd();
const read = p => fs.readFileSync(`${root}/frontend/src/${p}`, 'utf8');
function load(path, deps = {}, globals = {}) {
    const exports = {};
    const code = ts.transpileModule(read(path), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: n => { if (n === 'server-only')
            return {}; if (n === 'node:crypto')
            return crypto; if (n in deps)
            return deps[n]; throw Error(n); }, process: { env: {} }, URL, Date, Intl, Buffer, AbortSignal, Request, Response, ...globals });
    return exports;
}
const config = { from: 'HomeFix <info@example.com>', replyTo: 'info@example.com', key: 'mock-only' };
function setup({ configured = true, outcome = 'accepted', authorized = true } = {}) {
    let reserved = false, sends = 0, mutations = 0, finalized = null;
    const row = { id: 'delivery', company_id: 'company', provider_status: 'reserved', delivery_status: 'pending', recipient: 'qa@example.com', provider_message_id: 'provider', updated_at: '1', delivery_metadata: {} };
    const userClient = { rpc: async () => { if (!authorized)
            return { error: { code: '42501' } }; if (reserved)
            return { data: { claimed: false, delivery_status: row.delivery_status } }; reserved = true; mutations++; return { data: { claimed: true, delivery_id: 'delivery', company_id: 'company', invoice_number: '<QA>', invoice_token: 'a'.repeat(64) } }; } };
    const db = { rpc: async (name, args) => { finalized = args.p_outcome; row.delivery_status = outcome === 'accepted' ? 'sent' : outcome === 'failed' ? 'failed' : 'pending'; return {}; }, from: () => { const q = { update: v => { Object.assign(row, v); return q; }, eq: () => q, select: () => q, single: async () => ({ data: { id: 'delivery' } }) }; return q; } };
    const t = { emailConfiguration: () => configured ? config : null, normalizeReceiptEmail: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null, sendReceiptEmail: async () => { sends++; return outcome === 'accepted' ? { status: 'accepted', messageId: 'provider' } : { status: outcome, message: 'Safe failure' }; } };
    const api = load('server/finance/invoice-email-delivery.ts', { '@/lib/supabase/service-role': { getSupabaseServiceRoleClient: () => db }, '@/server/communications/telnyx-email-transport': t }, { process: { env: { HOMEFIXOS_PUBLIC_ORIGIN: 'https://example.com' } } });
    return { api, userClient, db, row, get sends() { return sends; }, get mutations() { return mutations; }, get finalized() { return finalized; } };
}
const input = { invoiceId: 'invoice', recipient: 'qa@example.com', idempotencyKey: 'synthetic-key-1234' };
test('accepted invoice uses existing transport and canonical link', async () => { const f = setup(); assert.equal((await f.api.sendInvoiceEmail({ ...input, userClient: f.userClient })).status, 200); assert.equal(f.sends, 1); assert.equal(f.finalized, 'accepted'); });
test('missing configuration preserves status and links: no reservation', async () => { const f = setup({ configured: false }); assert.equal((await f.api.sendInvoiceEmail({ ...input, userClient: f.userClient })).status, 503); assert.equal(f.mutations, 0); assert.equal(f.sends, 0); });
test('invalid recipient preserves status and links', async () => { const f = setup(); assert.equal((await f.api.sendInvoiceEmail({ ...input, recipient: 'bad', userClient: f.userClient })).status, 400); assert.equal(f.mutations, 0); });
test('unauthorized user cannot reserve or send', async () => { const f = setup({ authorized: false }); assert.equal((await f.api.sendInvoiceEmail({ ...input, userClient: f.userClient })).status, 403); assert.equal(f.mutations, 0); assert.equal(f.sends, 0); });
for (const outcome of ['failed', 'unknown'])
    test(`provider ${outcome} is persisted without successful status`, async () => { const f = setup({ outcome }); const r = await f.api.sendInvoiceEmail({ ...input, userClient: f.userClient }); assert.equal(r.status, outcome === 'failed' ? 502 : 409); assert.equal(f.finalized, outcome); await f.api.sendInvoiceEmail({ ...input, userClient: f.userClient }); assert.equal(f.sends, 1); });
test('concurrent duplicate requests and successful retry send once', async () => { const f = setup(); await Promise.all(Array.from({ length: 5 }, () => f.api.sendInvoiceEmail({ ...input, userClient: f.userClient }))); assert.equal(f.sends, 1); assert.equal(f.mutations, 1); assert.equal((await f.api.sendInvoiceEmail({ ...input, userClient: f.userClient })).status, 200); });
test('template escapes content; origin is server configuration only', () => { const f = setup(); const p = f.api.invoiceEmailTemplate(config.from, config.replyTo, 'qa@example.com', '<script>', `https://example.com/invoices/${'a'.repeat(64)}`); assert.match(p.html_body, /&lt;script&gt;/); assert.doesNotMatch(p.html_body, /<script>/); assert.throws(() => f.api.invoiceEmailTemplate(config.from, config.replyTo, 'qa@example.com', 'x', 'https://example.com/dashboard')); assert.equal(f.api.invoiceEmailOrigin(), 'https://example.com'); assert.doesNotMatch(read('server/finance/invoice-email-delivery.ts'), /headers.get/); });
for (const kind of ['delivered', 'bounced', 'failed'])
    test(`Invoice webhook ${kind}, duplicate and old events`, async () => { const row = { id: 'id', company_id: 'company', recipient: 'qa@example.com', delivery_status: 'sent', updated_at: '1', delivery_metadata: {} }; let updates = 0; const db = { from(table) { assert.equal(table, 'service_request_invoice_deliveries'); let changes; const q = { select: () => q, eq: () => q, update: v => { changes = v; return q; }, maybeSingle: async () => { if (changes) {
                updates++;
                Object.assign(row, changes);
                return { data: { id: row.id } };
            } return { data: structuredClone(row) }; } }; return q; } }; const api = load('server/finance/receipt-email-webhook.ts', { '@/lib/supabase/service-role': { getSupabaseServiceRoleClient: () => db }, '@/server/communications/telnyx-email-transport': { normalizeReceiptEmail: v => v } }); const e = { data: { id: 'event', event_type: `email.${kind}`, occurred_at: '2026-10-16T12:00:00Z', payload: { id: 'provider', to: { email: 'qa@example.com' } } } }; await api.applyInvoiceEmailEvent(e); await api.applyInvoiceEmailEvent(e); assert.equal(updates, 1); assert.equal(row.delivery_status, kind === 'delivered' ? 'delivered' : 'failed'); e.data.id = 'old'; e.data.event_type = 'email.queued'; e.data.occurred_at = '2026-10-15T12:00:00Z'; await api.applyInvoiceEmailEvent(e); assert.equal(updates, 1); e.data.payload.to.email = 'other@example.com'; assert.equal(await api.applyInvoiceEmailEvent(e), 400); });
test('Invoice SMS bridge remains byte-identical; email branches before it', async () => { const { execFileSync } = await import('node:child_process'); assert.equal(execFileSync('git', ['diff', '--', 'frontend/src/server/finance/invoice-communications-delivery.ts'], { encoding: 'utf8' }), ''); const s = read('app/api/invoices/[id]/send/route.ts'); assert.ok(s.indexOf('await sendInvoiceEmail') < s.indexOf('await sendInvoiceToCustomer')); });
test('legacy mock-only email failure occurs AFTER status/token mutation', async () => {
    let status = 'draft', revoked = false;
    const invoice = { id: 'invoice', service_request_id: 'job', invoice_number: 'QA' };
    const job = { id: 'job', company_id: 'company' };
    const conversation = { id: 'conversation', company_id: 'company', customer_email: 'qa@example.com' };
    const db = { from(table) { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, update: () => q, insert: () => q, maybeSingle: async () => ({ data: table === 'service_request_invoices' ? invoice : table === 'service_requests' ? job : null }), then(resolve) { return Promise.resolve({ data: table === 'communication_conversations' ? [conversation] : [], error: null }).then(resolve); } }; return q; } };
    const bridge = load('server/finance/invoice-communications-delivery.ts', { '@/lib/supabase/service-role': { getSupabaseServiceRoleClient: () => db }, '@/server/communications/telnyx-sms-transport': {} });
    const result = await bridge.sendInvoiceToCustomer({ channel: 'email', idempotencyKey: 'synthetic-key-legacy', invoiceId: 'invoice', recipient: 'qa@example.com', messagePreview: 'Synthetic', request: new Request('https://example.com', { headers: { host: 'example.com' } }), prepareInvoiceToken: async () => { status = 'sent'; revoked = true; return { invoice_token: 'synthetic', invoice_token_id: 'token' }; } });
    assert.equal(result.ok, false);
    assert.match(result.message, /not configured/);
    assert.equal(status, 'sent');
    assert.equal(revoked, true);
});
