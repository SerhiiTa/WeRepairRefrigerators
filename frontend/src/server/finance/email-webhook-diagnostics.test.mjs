import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(new URL('./receipt-email-webhook.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const event=()=>({data:{id:'11111111-1111-4111-8111-111111111111',event_type:'email.delivered',occurred_at:'2026-10-16T23:42:35Z',payload:{id:'22222222-2222-4222-8222-222222222222',to:{email:'qa@example.com'}}}});
function setup(mode, matchingTable){
 const logs=[],exports={},lookups=[];let writes=0;
 const row={id:'delivery',company_id:'company',revision_id:'revision',recipient:'qa@example.com',delivery_status:'sent',updated_at:'v1',delivery_metadata:{}};
 if(mode==='duplicate')row.delivery_metadata.email_event_id=event().data.id;
 if(mode==='older')row.delivery_metadata.email_event_at='2026-10-17T00:00:00Z';
 if(mode==='terminal')row.delivery_status='failed';
 const db={from(table){let change;const q={select:()=>q,eq:()=>q,update:v=>{change=v;return q},maybeSingle:async()=>{
 if(!change){lookups.push(table);if(matchingTable&&table!==matchingTable)return {data:null};}
 if(!change)return mode==='lookup'?{error:{code:'42501',message:'secret qa@example.com'}}:mode==='missing'?{data:null}:{data:structuredClone(row)};
 writes++;if(mode==='update')return {error:{code:'42501',message:'secret'}};
 if(mode==='conflict')return {data:null};Object.assign(row,change);return {data:{id:row.id}};
 }};return q;}};
 vm.runInNewContext(code,{exports,require:n=>n==='server-only'?{}:n.includes('service-role')?{getSupabaseServiceRoleClient:()=>mode==='no-client'?null:db}:{normalizeReceiptEmail:v=>typeof v==='string'&&v.includes('@')?v:null},console:{info:(label,value)=>logs.push(value)}});
 return {api:exports,logs,row,lookups,get writes(){return writes}};
}
const cases=[['success',200,'delivery_update_succeeded'],['lookup',503,'delivery_lookup_failed'],['missing',503,'delivery_not_found'],['update',503,'delivery_update_failed'],['conflict',503,'concurrent_update_exhausted'],['no-client',503,'database_client_unavailable'],['duplicate',200,'duplicate_ignored'],['older',200,'older_event_ignored'],['terminal',200,'terminal_state_preserved']];
for(const fn of ['applyReceiptEmailEvent','applyInvoiceEmailEvent','applyEstimateEmailEvent'])for(const [mode,status,stage] of cases)test(`${fn} ${mode}`,async()=>{
 const f=setup(mode);assert.equal(await f.api[fn](event()),status);assert.equal(f.logs.at(-1).stage,stage);
 assert(!JSON.stringify(f.logs).includes('qa@example.com'));assert(!JSON.stringify(f.logs).includes('secret'));
 if(['lookup','update'].includes(mode))assert.equal(f.logs.at(-1).databaseErrorCode,'42501');
 if(['duplicate','older','terminal'].includes(mode))assert.equal(f.writes,0);
 if(mode==='conflict')assert.equal(f.writes,3);
 if(mode==='success'){assert.equal(f.row.delivery_status,'delivered');assert.equal(await f.api[fn](event()),200);assert.equal(f.writes,1);}
});
test('invalid envelope and recipient are distinguished',async()=>{const f=setup('success');let e=event();delete e.data.id;assert.equal(await f.api.applyEstimateEmailEvent(e),400);assert.equal(f.logs.at(-1).stage,'invalid_event_envelope');e=event();e.data.payload.to={};assert.equal(await f.api.applyEstimateEmailEvent(e),400);assert.equal(f.logs.at(-1).stage,'invalid_recipient_projection');assert.equal(f.writes,0);});
test('route rejects unsigned requests and diagnoses processing exceptions',async()=>{
 const route=fs.readFileSync(new URL('../../app/api/communications/telnyx-email/route.ts',import.meta.url),'utf8');
 for(const signed of [false,true]){const exports={},logs=[];vm.runInNewContext(ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='next/server'?{NextResponse:Response}:n.includes('telnyx-sms')?{verifyTelnyxWebhookSignature:()=>signed}:{applyDocumentEmailWebhookEvent:async()=>{throw Error('private')},logEmailWebhookDiagnostic:stage=>logs.push(stage)}});const response=await exports.POST(new Request('https://example.com',{method:'POST',body:JSON.stringify(event())}));assert.equal(response.status,signed?503:401);assert.deepEqual(logs,signed?['handler_exception']:[]);}
});

const receiptTable='service_request_payment_receipt_deliveries';
const invoiceTable='service_request_invoice_deliveries';
const estimateTable='service_request_estimate_revision_deliveries';
for(const table of [receiptTable,invoiceTable,estimateTable])test(`shared routing delivers only to ${table}`,async()=>{
 const f=setup('success',table);
 assert.equal(await f.api.applyDocumentEmailWebhookEvent(event()),200);
 assert.equal(f.writes,1);assert.equal(f.row.delivery_status,'delivered');
 assert.equal(f.logs.at(-1).table,table);assert.equal(f.logs.at(-1).stage,'delivery_update_succeeded');
 assert(!f.logs.some(l=>l.stage==='delivery_not_found'));
 assert.deepEqual(f.lookups,[receiptTable,invoiceTable,estimateTable].slice(0,[receiptTable,invoiceTable,estimateTable].indexOf(table)+1));
 assert.equal(await f.api.applyDocumentEmailWebhookEvent(event()),200);assert.equal(f.writes,1);
 const older=event();older.data.id='older';older.data.occurred_at='2026-10-16T22:00:00Z';
 assert.equal(await f.api.applyDocumentEmailWebhookEvent(older),200);assert.equal(f.writes,1);
});
test('unknown message remains retryable after all tables are checked',async()=>{
 const f=setup('missing');assert.equal(await f.api.applyDocumentEmailWebhookEvent(event()),503);
 assert.deepEqual(f.lookups,[receiptTable,invoiceTable,estimateTable]);assert.equal(f.writes,0);
 assert.equal(f.logs.at(-1).stage,'delivery_not_found');assert.equal(f.logs.at(-1).table,undefined);
});
for(const mode of ['lookup','update','conflict'])test(`shared routing does not mask ${mode} failure with an unrelated table miss`,async()=>{
 const f=setup(mode,invoiceTable);assert.equal(await f.api.applyDocumentEmailWebhookEvent(event()),503);
 assert(!f.lookups.includes(estimateTable));assert.equal(f.logs.at(-1).table,invoiceTable);
 assert.equal(f.logs.at(-1).stage,mode==='lookup'?'delivery_lookup_failed':mode==='update'?'delivery_update_failed':'concurrent_update_exhausted');
});
test('callback before message-ID persistence remains retryable then correlates',async()=>{
 const missing=setup('missing');assert.equal(await missing.api.applyDocumentEmailWebhookEvent(event()),503);
 const persisted=setup('success',receiptTable);assert.equal(await persisted.api.applyDocumentEmailWebhookEvent(event()),200);assert.equal(persisted.writes,1);
});
