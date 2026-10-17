import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(new URL('./document-email-history.ts',import.meta.url),'utf8');
const api={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,require:n=>n==='node:crypto'?crypto:{},URL,Date,Map});
const raw='a'.repeat(64),hash=crypto.createHash('sha256').update(raw).digest('hex');
const token={token_hash:hash,token_expires_at:'2099-01-01',token_revoked_at:null};
function fixture(){
 const data={
 communication_conversations:[{id:'conversation',company_id:'company',customer_id:'customer',service_request_id:'job'}],
 customers:[{id:'customer',company_id:'company'}],service_requests:[{id:'job',company_id:'company',customer_id:'customer'},{id:'foreign-job',company_id:'other',customer_id:'customer'}],
 service_request_estimates:[{id:'estimate',service_request_id:'job',estimate_status:'sent'}],
 service_request_estimate_revisions:[{id:'revision',estimate_id:'estimate',company_id:'company',service_request_id:'job',public_approval_token_hash:hash,revision_status:'sent',token_expires_at:token.token_expires_at}],
 service_request_invoices:[{id:'invoice',service_request_id:'job',invoice_status:'sent',invoice_lifecycle_status:'current'}],
 service_request_payment_receipts:[{id:'receipt',company_id:'company',service_request_id:'job'}],
 service_request_invoice_delivery_tokens:[{...token,id:'invoice-token',company_id:'company',service_request_id:'job',invoice_id:'invoice'}],
 service_request_payment_receipt_tokens:[{...token,id:'receipt-token',company_id:'company',service_request_id:'job',receipt_id:'receipt'}],
 };
 for(const [type,table] of [['estimate','service_request_estimate_revision_deliveries'],['invoice','service_request_invoice_deliveries'],['receipt','service_request_payment_receipt_deliveries']]) data[table]=[{id:type+'-delivery',company_id:'company',service_request_id:'job',revision_id:'revision',invoice_id:'invoice',invoice_token_id:'invoice-token',receipt_id:'receipt',recipient:'qa@example.com',delivery_channel:'email',provider:'telnyx-email',delivery_status:'sent',provider_status:'accepted',sent_at:'2026-10-16T10:00:00Z',created_at:'2026-10-16T09:59:00Z',delivery_metadata:{secret:'never exposed',request:{from:'sender@example.com',subject:type+' subject',text_body:`Read your ${type}: https://example.com/${type==='estimate'?'estimates':type==='invoice'?'invoices':'receipts'}/${raw}`,html_body:'<script>unsafe</script>'}}}];
 const calls=[]; let denied=false,errorTable=null;
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:!denied}},from(table){let filters=[],start=0,end=499;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},range(a,b){start=a;end=b;return q},then(resolve,reject){calls.push({table});return Promise.resolve(table===errorTable?{error:{code:'42501'}}:{data:(data[table]??[]).filter(r=>filters.every(f=>f(r))).slice(start,end+1)}).then(resolve,reject)}};return q}};
 return {data,calls,db,deny(){denied=true},fail(table){errorTable=table},read:()=>api.readDocumentEmailHistory(db,'conversation','https://example.com')};
}
test('all three canonical Email types project with content, recipients, links and stable identity',async()=>{
 const f=fixture(),result=await f.read();assert.equal(result.length,3);
 for(const row of result){assert.equal(row.id,`email:${row.documentType}:${row.documentType}-delivery`);assert.equal(row.jobId,'job');assert.equal(row.sender,'sender@example.com');assert.equal(row.recipient,'qa@example.com');assert.ok(row.url);assert(!row.preview.includes(raw));assert(!JSON.stringify(row).includes('never exposed'));assert(!('delivery_metadata' in row));}
 assert(f.calls.some(c=>c.name==='can_view_service_request'&&c.args.target_service_request_id==='job'));
});
test('conversation and Job/customer conflicts fail closed',async()=>{
 const f=fixture();f.deny();await assert.rejects(f.read(),e=>e.status===403);assert(!f.calls.some(c=>c.table));
 const g=fixture();g.data.communication_conversations[0].customer_id='wrong';await assert.rejects(g.read(),e=>e.status===403);
 const h=fixture();h.data.communication_conversations[0].service_request_id='foreign-job';await assert.rejects(h.read(),e=>e.status===403);
});
test('matching email never substitutes for canonical customer linkage',async()=>{const f=fixture();f.data.communication_conversations[0].customer_id=null;f.data.communication_conversations[0].service_request_id=null;assert.equal((await f.read()).length,0)});
test('company and customer filters exclude unrelated deliveries',async()=>{const f=fixture();f.data.service_request_invoice_deliveries.push({...f.data.service_request_invoice_deliveries[0],id:'foreign',service_request_id:'foreign-job',company_id:'other'});assert.equal((await f.read()).length,3)});
test('all token types reject expired, revoked and mismatched hashes',async()=>{
 for(const field of ['token_expires_at','token_revoked_at','token_hash']){const f=fixture();for(const name of ['service_request_invoice_delivery_tokens','service_request_payment_receipt_tokens']) f.data[name][0][field]=field==='token_hash'?'wrong':'2000-01-01';const r=f.data.service_request_estimate_revisions[0];r[field==='token_hash'?'public_approval_token_hash':field]=field==='token_hash'?'wrong':'2000-01-01';for(const d of await f.read()){assert.equal(d.url,null);assert(!d.preview.includes(raw));}}
});
test('wrong token document association and superseded Invoice suppress links',async()=>{const f=fixture();f.data.service_request_invoice_delivery_tokens[0].invoice_id='wrong';assert.equal((await f.read()).find(x=>x.documentType==='invoice').url,null);const g=fixture();g.data.service_request_invoices[0].invoice_lifecycle_status='superseded';assert.equal((await g.read()).find(x=>x.documentType==='invoice').url,null)});
test('revoked revision or non-sent Estimate cannot expose a link',async()=>{for(const mode of ['revoked','draft']){const f=fixture();if(mode==='revoked')f.data.service_request_estimate_revisions[0].revision_status='revoked';else f.data.service_request_estimates[0].estimate_status='draft';assert.equal((await f.read()).find(x=>x.documentType==='estimate').url,null)}});
test('untrusted origin, route and absent snapshot fail closed',async()=>{const f=fixture();let d=f.data.service_request_invoice_deliveries[0];d.delivery_metadata.request.text_body=`https://evil.example/invoices/${raw}`;assert.equal((await f.read()).find(x=>x.documentType==='invoice').url,null);d.delivery_metadata={};const r=(await f.read()).find(x=>x.documentType==='invoice');assert.equal(r.preview,'Content unavailable.');assert.equal(r.url,null)});
test('webhook state changes are read canonically without duplicated records',async()=>{const f=fixture();for(const status of ['pending','sent','delivered','failed']){f.data.service_request_payment_receipt_deliveries[0].delivery_status=status;assert.equal((await f.read()).find(x=>x.documentType==='receipt').status,status)}f.data.service_request_payment_receipt_deliveries[0].provider_status='bounced';assert.equal((await f.read()).find(x=>x.documentType==='receipt').status,'bounced');assert.equal(f.data.service_request_payment_receipt_deliveries.length,1)});
test('stable identity deduplicates deliveries and refresh',async()=>{const f=fixture();f.data.service_request_invoice_deliveries.push({...f.data.service_request_invoice_deliveries[0]});assert.equal((await f.read()).length,3);assert.equal((await f.read()).length,3)});
test('permission failure is surfaced, never replaced by service-role access',async()=>{const f=fixture();f.fail('service_request_payment_receipt_tokens');await assert.rejects(f.read(),e=>e.status===503);assert(!source.includes('getSupabaseServiceRoleClient'))});
test('existing SMS POST is byte-for-byte unchanged from baseline',async()=>{
 const {execFileSync}=await import('node:child_process');
 const path='frontend/src/app/api/communications/conversations/[id]/messages/route.ts';
 const baseline=execFileSync('git',['show',`cef771ba4d294b26ee90ae446be7a1e49c35bf5e:${path}`],{encoding:'utf8'});
 const current=fs.readFileSync(new URL('../../app/api/communications/conversations/[id]/messages/route.ts',import.meta.url),'utf8');
 assert.equal(current.slice(current.indexOf('export async function POST'),current.indexOf('// Read-only document Email projection.')).trim(),baseline.slice(baseline.indexOf('export async function POST')).trim());
});
test('chronological merge preserves calls/SMS and deduplicates projected Email',()=>{
 const hub=fs.readFileSync(new URL('../../components/dashboard/communications/CommunicationsHub.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('hub.tsx',hub,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['buildThreadEvents','groupConsecutiveSmsEvents'].includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const context={groupCallSessions:calls=>calls.map(c=>({id:c.id,calls:[c],summaries:[]})),getCallSessionEndedAt:s=>s.calls[0].ended_at,canonicalWebsiteEvents:(timeline,messages)=>({timeline,messages})};
 vm.createContext(context);vm.runInContext(ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const email={id:'email:receipt:delivery',occurredAt:'2026-10-16T12:00:00Z'};
 const input={calls:[{id:'call',ended_at:'2026-10-16T13:00:00Z'}],messages:[{id:'sms',source_type:'sms',occurred_at:'2026-10-16T11:00:00Z'}],timelineEvents:[],websiteRequests:[],emails:[email,email]};
 const result=context.buildThreadEvents(input);assert.equal(result.length,3);assert.equal(result[0].type,'call_session');assert.equal(result[1].type,'document_email');assert.equal(result[2].type,'sms_group');assert.equal(result[2].messages[0].id,'sms');
 assert.equal(context.buildThreadEvents({...input,emails:[]}).length,2);
});
test('GET rejects unauthenticated access before projection and fails safely on read errors',async()=>{
 const route=fs.readFileSync(new URL('../../app/api/communications/conversations/[id]/messages/route.ts',import.meta.url),'utf8');
 for(const authorized of [false,true]){
  const exports={};let reads=0;
  vm.runInNewContext(ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process:{env:{}},require:n=>n==='next/server'?{NextResponse:Response}:n.includes('homefix-private-access')?{requireHomeFixPrivateAccess:async()=>authorized?{ok:true,context:{supabase:{}}}:{ok:false,response:new Response(null,{status:401})}}:n.includes('document-email-history')?{EmailHistoryError:api.EmailHistoryError,readDocumentEmailHistory:async()=>{reads++;throw new api.EmailHistoryError(503)}}:{}});
  const response=await exports.GET(new Request('https://example.com'),{params:Promise.resolve({id:'conversation'})});assert.equal(response.status,authorized?503:401);assert.equal(reads,authorized?1:0);
 }
});
for (const type of ['estimate','invoice','receipt']) test(`${type} Email card opens inline; collapsed preview hides full content and links`,()=>{
 const hub=fs.readFileSync(new URL('../../components/dashboard/communications/CommunicationsHub.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('hub.tsx',hub,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DocumentEmailCard').getText(ast);
 let opened=false;const jsx=(type,props)=>({type,props});
 const context={exports:{},useState:()=>[opened,v=>{opened=typeof v==='function'?v(opened):v}],CommunicationSourceIcon:'icon',formatServiceRequestDate:()=> 'Oct 16',formatTimeOnly:()=> '10 AM',require:()=>({jsx,jsxs:jsx})};
 vm.createContext(context);vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const email={documentType:type,preview:'Synthetic content '.repeat(30),sender:'sender@example.com',recipient:'qa@example.com',subject:'Subject',status:'delivered',occurredAt:'2026-10-16',sentAt:'2026-10-16',url:`https://example.com/${type}s/${raw}`};
 function nodes(){const out=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n==='object'){out.push(n);walk(n.props?.children)}}walk(context.DocumentEmailCard({email}));return out;}
 let n=nodes();assert.equal(n.find(x=>x.type==='button').props['aria-expanded'],false);assert(!JSON.stringify(n).includes(email.preview));assert(!n.some(x=>x.type==='a'));
 n.find(x=>x.type==='button').props.onClick();n=nodes();assert(JSON.stringify(n).includes(email.preview));assert(JSON.stringify(n).includes(email.sender));assert.equal(n.find(x=>x.type==='a').props.href,email.url);
 email.url=null;assert(!nodes().some(x=>x.type==='a'));assert(JSON.stringify(nodes()).includes('Document unavailable.'));
 nodes().find(x=>x.type==='button').props.onClick();assert.equal(nodes().find(x=>x.type==='button').props['aria-expanded'],false);
});
