import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const source = fs.readFileSync(new URL('./telnyx-email-transport.ts', import.meta.url), 'utf8');
function load(sender, fetch) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
        exports, require: () => ({}), fetch, AbortSignal,
        process: {env: {HOMEFIXOS_EMAIL_FROM: sender, HOMEFIXOS_EMAIL_REPLY_TO: 'reply@example.com', TELNYX_API_KEY: 'mock-only'}},
        console: {warn() {}, info() {}},
    });
    return exports;
}
for (const sender of ['info@example.com', ' HomeFix Appliance Repair <info@example.com> ', 'HomeFix < info@example.com >']) {
    test(`normalizes sender ${sender}`, async () => {
        let call, calls = 0;
        const api = load(sender, async (url, options) => { calls++; call = {url, options}; return new Response(JSON.stringify({data: {id: 'mock-id'}}), {status: 202}); });
        const config = api.emailConfiguration();
        assert.equal(config.from, 'info@example.com');
        const payload = {from: config.from, reply_to: config.replyTo, to: ['qa@example.com'], subject: 'Synthetic', html_body: '<p>Synthetic</p>', text_body: 'Synthetic'};
        assert.equal((await api.sendReceiptEmail(payload, config.key, '11111111-1111-4111-8111-111111111111')).status, 'accepted');
        assert.deepEqual(JSON.parse(call.options.body), payload);
        assert.equal(call.options.headers['Idempotency-Key'], '11111111-1111-4111-8111-111111111111');
        assert.equal(call.url, 'https://api.telnyx.com/v2/email_messages');
        assert.equal(calls, 1);
    });
}
for (const sender of ['', 'invalid', 'HomeFix <invalid>', 'HomeFix <info@example.com', 'info@example.com>', 'HomeFix\r\nBcc: other@example.com <info@example.com>', 'HomeFix <info@example.com> trailing']) {
    test(`rejects malformed sender ${JSON.stringify(sender)}`, () => assert.equal(load(sender).emailConfiguration(), null));
}
