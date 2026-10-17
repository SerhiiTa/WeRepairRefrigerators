import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const root=process.cwd();
const read=p=>fs.readFileSync(`${root}/frontend/src/${p}`,'utf8');
function load(path,deps={},globals={}) {
 const exports={};
 const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:n=>{if(n==='server-only')return {};if(n==='node:crypto')return crypto;if(n in deps)return deps[n];throw Error(n)},process:{env:{}},URL,Date,Intl,Buffer,AbortSignal,Request,Response,...globals});return exports;
}
const configured={HOMEFIXOS_EMAIL_FROM:'HomeFix Appliance Repair <info@example.com>',HOMEFIXOS_EMAIL_REPLY_TO:'info@example.com',TELNYX_API_KEY:'mock-only'};
const transport=(fetch,env=configured)=>load('server/communications/telnyx-email-transport.ts',{}, {fetch,process:{env}});
const tpl=load('server/finance/receipt-email-template.ts');
const templateInput={from:'info@example.com',replyTo:'info@example.com',recipient:'qa@example.com',amount:'50',currency:'usd',paidAt:'2026-10-16T12:00:00Z',number:'R-1',customerName:'<script>bad</script>',url:`https://example.com/receipts/${'a'.repeat(64)}`};
test('valid recipient and configured sender',()=>{const t=transport();assert.equal(t.normalizeReceiptEmail(' qa@example.com '),'qa@example.com');assert.ok(t.emailConfiguration());});
for(const value of ['',null,'bad','a@b','x@example.com\r\nBCC:evil@example.com']) test(`invalid recipient ${JSON.stringify(value)}`,()=>assert.equal(transport().normalizeReceiptEmail(value),null));
test('missing configuration and provider kill switch fail closed',()=>{assert.equal(transport(null,{}).emailConfiguration(),null);assert.equal(transport(null,{...configured,WRA_DISABLE_PROVIDER_CALLS:'1'}).emailConfiguration(),null);});
test('canonical template escapes HTML and exposes only secure receipt URL',()=>{const p=tpl.receiptEmailTemplate(templateInput);assert.match(p.html_body,/&lt;script&gt;/);assert.doesNotMatch(p.html_body,/<script>/);assert.match(p.text_body,/\$50.00/);assert.throws(()=>tpl.receiptEmailTemplate({...templateInput,url:'https://example.com/dashboard'}));});
test('accepted transport uses stable identity and official payload',async()=>{let call;const t=transport(async(...args)=>{call=args;return new Response(JSON.stringify({data:{id:'provider-1'}}),{status:202})});const result=await t.sendReceiptEmail(tpl.receiptEmailTemplate(templateInput),'mock','stable');assert.equal(result.status,'accepted');assert.equal(call[1].headers['Idempotency-Key'],'stable');assert.equal(JSON.parse(call[1].body).to[0],'qa@example.com');});
for(const status of [400,401,422,429]) test(`provider rejection ${status} is safe`,async()=>{const r=await transport(async()=>new Response('private provider detail',{status})).sendReceiptEmail({},'mock','key');assert.equal(r.status,'failed');assert.doesNotMatch(r.message,/private/);});
for(const status of [409,500,202]) test(`uncertain ${status} never retried`,async()=>{let calls=0;const r=await transport(async()=>{calls++;return new Response('{}',{status})}).sendReceiptEmail({},'mock','key');assert.equal(r.status,'unknown');assert.equal(calls,1);});
test('timeout is uncertain, without retry',async()=>assert.equal((await transport(async()=>{throw Error('secret timeout')}).sendReceiptEmail({},'mock','key')).status,'unknown'));
function database() {
 const rows=[];let revision=0;
 const receipt={id:'receipt',amount:50,currency:'usd',paid_at:'2026-10-16',receipt_number:'R1',payment_id:'payment',service_request_id:'job',company_id:'company'};
 const db={from(name){let filters=[],action='read',values;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},insert(v){action='insert';values=v;return q},update(v){action='update';values=v;return q},single(){return execute()},maybeSingle(){return execute()},then(a,b){return execute().then(a,b)}};
 async function execute(){let data;
 if(name==='service_request_payment_receipts')return {data:receipt};
 if(name==='service_requests')return {data:{customer_name:'QA',company_id:'company',customer_id:'customer',customer_email:'fallback@example.com'}};
 if(name==='customers')return {data:{email:'qa@example.com'}};
 if(action==='insert'){if(rows.some(r=>r.company_id===values.company_id&&r.idempotency_key===values.idempotency_key))return {error:{code:'23505'}};data={...values,updated_at:String(++revision)};rows.push(data);}
 else {data=rows.find(r=>filters.every(([k,v])=>r[k]===v));if(data&&action==='update'){Object.assign(data,values,{updated_at:String(++revision)});}}
 return {data:data?structuredClone(data):null,error:null};}
 return q;}};return {db,rows};
}
const input={jobId:'job',paymentId:'payment',companyId:'company',actorId:'staff',recipient:'qa@example.com',idempotencyKey:'key',origin:'https://example.com'};
function deliveryFixture(result={status:'accepted',messageId:'provider-1'}){const {db,rows}=database();let sends=0,tokens=0;const t=transport();const api=load('server/finance/receipt-email-delivery.ts',{'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>db},'@/server/communications/telnyx-email-transport':{...t,sendReceiptEmail:async()=>{sends++;return result}},'./payment-receipts':{ensurePaymentReceipt:async()=>{tokens++;return {receipt_token:'a'.repeat(64)}}},'./receipt-email-template':tpl});return {api,db,rows,get sends(){return sends},get tokens(){return tokens}};}
test('concurrent requests and idempotent retry make exactly one send/token',async()=>{const f=deliveryFixture();await Promise.all(Array.from({length:8},()=>f.api.deliverPaymentReceiptEmail(input)));const retry=await f.api.deliverPaymentReceiptEmail(input);assert.equal(f.sends,1);assert.equal(f.tokens,1);assert.equal(f.rows.length,1);assert.equal(retry.status,200);assert.equal(f.rows[0].provider_message_id,'provider-1');});
test('uncertain result retains identity and blocks resend',async()=>{const f=deliveryFixture({status:'unknown',message:'Uncertain'});await f.api.deliverPaymentReceiptEmail(input);assert.equal((await f.api.deliverPaymentReceiptEmail(input)).status,409);assert.equal(f.sends,1);assert.equal(f.rows[0].delivery_status,'pending');});
test('same key with changed recipient rejected; canonical prefill',async()=>{const f=deliveryFixture();await f.api.deliverPaymentReceiptEmail(input);assert.equal((await f.api.deliverPaymentReceiptEmail({...input,recipient:'other@example.com'})).status,409);assert.equal(await f.api.receiptEmailRecipient('job'),'qa@example.com');});
function event(kind='delivered',at='2026-10-16T13:00:00Z',id=kind){return {data:{id,event_type:`email.${kind}`,occurred_at:at,payload:{id:'provider-1',to:{email:'qa@example.com'}}}};}
test('webhook correlation, duplicates, stale event, bounce, no state regression',async()=>{const f=deliveryFixture();await f.api.deliverPaymentReceiptEmail(input);const h=load('server/finance/receipt-email-webhook.ts',{'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>f.db},'@/server/communications/telnyx-email-transport':transport()});assert.equal(await h.applyReceiptEmailEvent(event()),200);assert.equal(f.rows[0].delivery_status,'delivered');const rev=f.rows[0].updated_at;await h.applyReceiptEmailEvent(event());assert.equal(f.rows[0].updated_at,rev);await h.applyReceiptEmailEvent(event('queued','2026-10-16T12:00:00Z'));assert.equal(f.rows[0].delivery_status,'delivered');await h.applyReceiptEmailEvent(event('bounced','2026-10-16T14:00:00Z'));assert.equal(f.rows[0].provider_status,'bounced');await h.applyReceiptEmailEvent(event('sent','2026-10-16T15:00:00Z'));assert.equal(f.rows[0].delivery_status,'failed');const wrong=event();wrong.data.payload.to.email='other@example.com';assert.equal(await h.applyReceiptEmailEvent(wrong),400);wrong.data.payload.id='unknown';assert.equal(await h.applyReceiptEmailEvent(wrong),503);});
// Exercise the actual route guards with a mocked authenticated client/database.
const routePath='app/api/service-requests/[id]/payments/[paymentId]/receipt/route.ts';
const uuid='11111111-1111-4111-8111-111111111111';
for(const scenario of ['unauthorized','cross-company','other-job','pending','voided','valid']) test(`receipt route ${scenario}`,async()=>{let sends=0;const payment={company_id:'company',service_request_id:scenario==='other-job'?'other':uuid,payment_status:scenario==='pending'?'pending':'succeeded',voided_at:scenario==='voided'?'now':null};const db={from(){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:payment})};return q}};const r=load(routePath,{'next/server':{NextResponse:Response},'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>db},'@/server/finance/payment-receipts':{},'@/server/communications/telnyx-sms-transport':{},'@/server/security/homefix-private-access':{requireHomeFixPrivateAccess:async()=>scenario==='unauthorized'?{ok:false,response:Response.json({ok:false},{status:401})}:{ok:true,context:{userId:'staff',supabase:{rpc:async()=>({data:scenario!=='cross-company'})}}}},'@/server/communications/telnyx-email-transport':transport(),'@/server/finance/receipt-email-delivery':{deliverPaymentReceiptEmail:async()=>{sends++;return {status:200,body:{ok:true}}}}},{process:{env:{HOMEFIXOS_PUBLIC_ORIGIN:'https://example.com'}}});const res=await r.POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({channel:'email',recipient:'qa@example.com',idempotencyKey:'test-key-long-enough'})}),{params:Promise.resolve({id:uuid,paymentId:uuid})});assert.equal(res.status,scenario==='valid'?200:scenario==='unauthorized'?401:403);assert.equal(sends,scenario==='valid'?1:0);});
test('UI selects configured email, canonical recipient, send lock and acceptance wording',()=>{const s=read('components/dashboard/ServiceRequestDetail.tsx');assert.match(s,/receiptEmailOption.available/);assert.match(s,/receipt.email.recipient/);assert.match(s,/receiptSendLock.current = true/);assert.match(s,/Accepted for sending/);assert.doesNotMatch(s,/Email delivery coming soon/);});
test('actual Ed25519 verification and email endpoint reject tampering/stale timestamps',async()=>{
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const env={TELNYX_WEBHOOK_PUBLIC_KEY:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')};
 const verifier=load('server/communications/telnyx-sms-transport.ts',{'@/lib/supabase/service-role':{},'./phone-identity':{}},{process:{env}});
 let calls=0;
 const route=load('app/api/communications/telnyx-email/route.ts',{'next/server':{NextResponse:Response},'@/server/communications/telnyx-sms-transport':verifier,'@/server/finance/receipt-email-webhook':{applyDocumentEmailWebhookEvent:async()=>{calls++;return 200}}});
 const body=JSON.stringify(event());const timestamp=String(Math.floor(Date.now()/1000));
 const signature=crypto.sign(null,Buffer.from(`${timestamp}|${body}`),privateKey).toString('base64');
 const req=(b,t=timestamp)=>new Request('https://example.com',{method:'POST',headers:{'telnyx-signature-ed25519':signature,'telnyx-timestamp':t},body:b});
 assert.equal((await route.POST(req(body))).status,200);
 assert.equal((await route.POST(req(body+' '))).status,401);
 assert.equal((await route.POST(req(body,'1'))).status,401);
 assert.equal(calls,1);
});
test('SMS implementation and route branch unchanged from verified baseline',async()=>{
 const {execFileSync}=await import('node:child_process');
 const path='frontend/src/app/api/service-requests/[id]/payments/[paymentId]/receipt/route.ts';
 const original=execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'});
 const current=fs.readFileSync(path,'utf8');
 const marker='  const receiptData = await buildReceiptResponse';
 assert.equal(current.slice(current.indexOf(marker)),original.slice(original.indexOf(marker)));
 assert.equal(execFileSync('git',['diff','--','frontend/src/server/communications/telnyx-sms-transport.ts'],{encoding:'utf8'}),'');
});
test('invalid email never reserves or calls provider',async()=>{const f=deliveryFixture();assert.equal((await f.api.deliverPaymentReceiptEmail({...input,recipient:'invalid'})).status,400);assert.equal(f.rows.length,0);assert.equal(f.sends,0);});
test('provider rejection is recorded as failed and retry does not send',async()=>{const f=deliveryFixture({status:'failed',message:'Provider rejected request.'});assert.equal((await f.api.deliverPaymentReceiptEmail(input)).status,502);assert.equal(f.rows[0].delivery_status,'failed');await f.api.deliverPaymentReceiptEmail(input);assert.equal(f.sends,1);});
test('simultaneous duplicate webhooks are idempotent',async()=>{const f=deliveryFixture();await f.api.deliverPaymentReceiptEmail(input);const h=load('server/finance/receipt-email-webhook.ts',{'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>f.db},'@/server/communications/telnyx-email-transport':transport()});const statuses=await Promise.all(Array.from({length:5},()=>h.applyReceiptEmailEvent(event())));assert.ok(statuses.every(s=>s===200));assert.equal(f.rows[0].delivery_status,'delivered');assert.equal(f.rows.length,1);});
test('actual modal opener uses canonical email and blocks unconfigured email',async()=>{
 const source=read('components/dashboard/ServiceRequestDetail.tsx');const start=source.indexOf('  async function openReceiptDelivery('),end=source.indexOf('  async function sendPaymentReceipt(',start);
 const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let draft,available=true;
 const context=vm.createContext({state:{status:'ready',request:{customerPhone:'test-phone',customerEmail:'stale@example.com'}},setReceiptDeliveryState:()=>{},loadReceiptForPayment:async()=>({email:{available,recipient:'canonical@example.com'}}),setReceiptDeliveryDraft:d=>{draft=d},buildPaymentIdempotencyKey:()=> 'stable-request-key'});
 vm.runInContext(code,context);await vm.runInContext('openReceiptDelivery("payment","email")',context);assert.equal(draft.channel,'email');assert.equal(draft.recipient,'canonical@example.com');draft=null;available=false;await vm.runInContext('openReceiptDelivery("payment","email")',context);assert.equal(draft,null);await vm.runInContext('openReceiptDelivery("payment","sms")',context);assert.equal(draft.recipient,'test-phone');
});
