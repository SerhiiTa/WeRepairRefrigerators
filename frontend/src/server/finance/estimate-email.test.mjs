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
            return {data:{active:true}}; if (n === 'node:crypto')
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
            return { data: { claimed: false, delivery_status: row.delivery_status } }; reserved = true; mutations++; return { data: { claimed: true, delivery_id: 'delivery', company_id: 'company', estimate_number: '<QA>', revision_id:'revision', approval_token: 'a'.repeat(64) } }; } };
    const db = { rpc: async (name, args) => { finalized = args.p_outcome; row.delivery_status = outcome === 'accepted' ? 'sent' : outcome === 'failed' ? 'failed' : 'pending'; return {data:{active:true}}; }, from: () => { const q = { update: v => { Object.assign(row, v); return q; }, eq: () => q, select: () => q, single: async () => ({ data: { id: 'delivery' } }) }; return q; } };
    const t = { emailConfiguration: () => configured ? config : null, normalizeReceiptEmail: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null, sendReceiptEmail: async () => { sends++; return outcome === 'accepted' ? { status: 'accepted', messageId: 'provider' } : { status: outcome, message: 'Safe failure' }; } };
    const api = load('server/finance/estimate-email-delivery.ts', { '@/lib/supabase/service-role': { getSupabaseServiceRoleClient: () => db }, '@/server/communications/telnyx-email-transport': t }, { process: { env: { HOMEFIXOS_PUBLIC_ORIGIN: 'https://example.com' } } });
    return { api, userClient, db, row, get sends() { return sends; }, get mutations() { return mutations; }, get finalized() { return finalized; } };
}
const input = { estimateId: 'estimate', recipient: 'qa@example.com', idempotencyKey: 'synthetic-key-1234' };
test('accepted estimate uses existing transport and canonical link', async () => { const f = setup(); assert.equal((await f.api.sendEstimateEmail({ ...input, userClient: f.userClient })).status, 200); assert.equal(f.sends, 1); assert.equal(f.finalized, 'accepted'); });
test('missing configuration preserves status and links: no reservation', async () => { const f = setup({ configured: false }); assert.equal((await f.api.sendEstimateEmail({ ...input, userClient: f.userClient })).status, 503); assert.equal(f.mutations, 0); assert.equal(f.sends, 0); });
test('invalid recipient preserves status and links', async () => { const f = setup(); assert.equal((await f.api.sendEstimateEmail({ ...input, recipient: 'bad', userClient: f.userClient })).status, 400); assert.equal(f.mutations, 0); });
test('unauthorized user cannot reserve or send', async () => { const f = setup({ authorized: false }); assert.equal((await f.api.sendEstimateEmail({ ...input, userClient: f.userClient })).status, 403); assert.equal(f.mutations, 0); assert.equal(f.sends, 0); });
for (const outcome of ['failed', 'unknown'])
    test(`provider ${outcome} is persisted without successful status`, async () => { const f = setup({ outcome }); const r = await f.api.sendEstimateEmail({ ...input, userClient: f.userClient }); assert.equal(r.status, outcome === 'failed' ? 502 : 409); assert.equal(f.finalized, outcome); await f.api.sendEstimateEmail({ ...input, userClient: f.userClient }); assert.equal(f.sends, 1); });
test('concurrent duplicate requests and successful retry send once', async () => { const f = setup(); await Promise.all(Array.from({ length: 5 }, () => f.api.sendEstimateEmail({ ...input, userClient: f.userClient }))); assert.equal(f.sends, 1); assert.equal(f.mutations, 1); assert.equal((await f.api.sendEstimateEmail({ ...input, userClient: f.userClient })).status, 200); });
test('template escapes content; origin is server configuration only', () => { const f = setup(); const p = f.api.estimateEmailTemplate(config.from, config.replyTo, 'qa@example.com', '<script>', `https://example.com/estimates/${'a'.repeat(64)}`); assert.match(p.html_body, /&lt;script&gt;/); assert.doesNotMatch(p.html_body, /<script>/); assert.throws(() => f.api.estimateEmailTemplate(config.from, config.replyTo, 'qa@example.com', 'x', 'https://example.com/dashboard')); assert.equal(f.api.estimateEmailOrigin(), 'https://example.com'); assert.doesNotMatch(read('server/finance/estimate-email-delivery.ts'), /headers.get/); });
for (const kind of ['delivered', 'bounced', 'failed'])
    test(`Estimate webhook ${kind}, duplicate and old events`, async () => { const row = { id: 'id', company_id: 'company', recipient: 'qa@example.com', delivery_status: 'sent', updated_at: '1', delivery_metadata: {} }; let updates = 0; const db = { from(table) { assert.equal(table, 'service_request_estimate_revision_deliveries'); let changes; const q = { select: () => q, eq: () => q, update: v => { changes = v; return q; }, maybeSingle: async () => { if (changes) {
                updates++;
                Object.assign(row, changes);
                return { data: { id: row.id } };
            } return { data: structuredClone(row) }; } }; return q; } }; const api = load('server/finance/receipt-email-webhook.ts', { '@/lib/supabase/service-role': { getSupabaseServiceRoleClient: () => db }, '@/server/communications/telnyx-email-transport': { normalizeReceiptEmail: v => v } }); const e = { data: { id: 'event', event_type: `email.${kind}`, occurred_at: '2026-10-16T12:00:00Z', payload: { id: 'provider', to: { email: 'qa@example.com' } } } }; await api.applyEstimateEmailEvent(e); await api.applyEstimateEmailEvent(e); assert.equal(updates, 1); assert.equal(row.delivery_status, kind === 'delivered' ? 'delivered' : 'failed'); e.data.id = 'old'; e.data.event_type = 'email.queued'; e.data.occurred_at = '2026-10-15T12:00:00Z'; await api.applyEstimateEmailEvent(e); assert.equal(updates, 1); e.data.payload.to.email = 'other@example.com'; assert.equal(await api.applyEstimateEmailEvent(e), 400); });
test('Estimate SMS bridge and existing approval RPC stay unchanged',async()=>{const {execFileSync}=await import('node:child_process');for(const p of ['frontend/src/server/finance/estimate-communications-delivery.ts','supabase/migrations/0119_estimate_customer_revision_approval_apply_ready.sql','supabase/migrations/0127_finance_v2_estimate_invoice_revision_lifecycle_apply_ready.sql'])assert.equal(execFileSync('git',['diff','--',p],{encoding:'utf8'}),'');});
for(const valid of [false,true])test(`UI email preflight blocks draft mutation: ${valid?'missing configuration':'invalid recipient'}`,async()=>{
 const source=read('components/dashboard/ManualEstimateEditor.tsx');
 const start=source.indexOf('  async function sendToClient()');const end=source.indexOf('  async function approveForCustomer()',start);
 const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let saves=0;const context=vm.createContext({estimateEmailSendLock:{current:false},deliveryChannel:'email',estimateEmailOption:{available:!valid},deliveryRecipientIsValid:valid,setSaveState:()=>{},saveDraft:async()=>{saves++}});
 vm.runInContext(code,context);await vm.runInContext('sendToClient()',context);assert.equal(saves,0);assert.equal(context.estimateEmailSendLock.current,false);
});
