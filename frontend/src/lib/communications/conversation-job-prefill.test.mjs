import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {buildConversationJobPrefill as prefill,mergeConversationPrefill as merge,conversationWizardPayload as payload} from './conversation-job-prefill.ts';
const id='00000000-0000-4000-8000-000000000100';
for(const source of ['phone','sms','website_form']) test(`${source}: structured request + canonical Customer prefill`,()=>{
 const result=prefill({id,primary_source_type:source,summary:'Call summary'},{customer_name:'Wrong Name',customer_first_name:'Wrong',service_address:'Test Street',unit:'2',city:'Houston',state:'TX',zip_code:'77001',appliance_type:'Washer',brand:'Brand',model_number:'Model',serial_number:'Serial',problem_description:'Leak',appointment_date:'2026-10-25',window_start_time:'09:00:00',window_end_time:'11:00:00'},{id:'lead'},{id:'customer',full_name:'Canonical Customer',phone:'+12025550100'});
 assert.equal(result.selectedCustomerId,'customer');assert.equal(result.customerFirstName,'Canonical');assert.equal(result.customerLastName,'Customer');assert.equal(result.serviceAddress,'Test Street');assert.equal(result.brand,'Brand');assert.equal(result.modelNumber,'Model');assert.equal(result.serialNumber,'Serial');assert.equal(result.problemDescription,'Leak');assert.equal(result.appointmentDate,'2026-10-25');assert.equal(result.windowStartTime,'09:00');assert.equal(result.assignedTechnicianId,'');assert.equal(result.scheduleMode,'later');
});
test('Lead/new Customer fallback and missing optional fields',()=>{
 const result=prefill({summary:'Call summary'},{},{customer_name:'New Caller',customer_phone:'+12025550100',service_address:'Lead Street'});
 assert.equal(result.selectedCustomerId,'');assert.equal(result.customerFirstName,'New');assert.equal(result.serviceAddress,'Lead Street');assert.equal(result.problemDescription,'Call summary');assert.equal(result.modelNumber,'');assert.equal(result.applianceType,'Refrigerator');
});
test('late prefill preserves operator edits',()=>assert.deepEqual(merge({brand:'Operator',city:''},{brand:'Remote',city:'Houston'},new Set(['brand'])),{brand:'Operator',city:'Houston'}));
test('Later clears scheduling; Now preserves reviewed values; Customer ID fixed',()=>{
 const form={scheduleMode:'later',appointmentDate:'2026-10-25',windowStartTime:'09:00',windowEndTime:'11:00',assignedTechnicianId:id,selectedCustomerId:'wrong'};
 const later=payload(form,'canonical');assert.equal(later.customerId,'canonical');for(const key of ['appointmentDate','windowStartTime','windowEndTime','assignedTechnicianId'])assert.equal(later[key],null);
 assert.equal(payload({...form,scheduleMode:'now'},null).assignedTechnicianId,id);
});
const inbox=readFileSync(new URL('../../components/dashboard/ServiceRequestsInbox.tsx',import.meta.url),'utf8');
const hub=readFileSync(new URL('../../components/dashboard/communications/CommunicationsHub.tsx',import.meta.url),'utf8');
const method=inbox.slice(inbox.indexOf('  async function createJobFromWizard()'),inbox.indexOf('  if (loadState.status',inbox.indexOf('  async function createJobFromWizard()')));
function harness({jobId=null,mode='later',technician='',pending=false}={}) {
 const calls=[],urls=[],states=[];const ctx=vm.createContext({conversationSubmitRef:{current:pending},conversationContext:{conversationId:id,customerId:'canonical',jobId},conversationPrefillReady:true,newJobForm:{scheduleMode:mode,assignedTechnicianId:technician,customerPhone:'+12025550100'},validateNewJobForm:()=>null,setNewJobState:s=>states.push(s),getAccessToken:async()=>'fixture',conversationWizardPayload:payload,normalizeUSPhone:v=>v,conversationReturnRef:{current:'/dashboard/communications?conversation='+id+'&view=detail'},setConversationContext:()=>{},router:{push:url=>urls.push(url)},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ok:true,conversion:{serviceRequestId:'job'}})};}});
 vm.runInContext(ts.transpileModule(method,{}).outputText,ctx);return {ctx,calls,urls,states};
}
test('Conversation submit uses only atomic endpoint, duplicate click ignored',async()=>{
 const h=harness();await Promise.all([h.ctx.createJobFromWizard(),h.ctx.createJobFromWizard()]);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,`/api/communications/conversations/${id}/create-job`);assert.equal(JSON.parse(h.calls[0].options.body).allowPossibleDuplicate,false);assert.match(h.urls[0],/^\/dashboard\/leads\/job\?returnTo=/);
});
test('known Job recovery navigates without submitting',async()=>{const h=harness({jobId:'existing'});await h.ctx.createJobFromWizard();assert.equal(h.calls.length,0);assert.match(h.urls[0],/leads\/existing/);});
test('Now without technician blocks submission',async()=>{const h=harness({mode:'now'});await h.ctx.createJobFromWizard();assert.equal(h.calls.length,0);assert.match(h.states[0].message,/technician/);});
test('cancel, generic prefill, generic save and navigation remain connected',()=>{
 assert.match(inbox,/if \(conversationContext\) \{\s*router.replace\(conversationReturnRef.current\)/);
 assert.match(inbox,/if \(params.get\("conversationId"\)\) return;/);
 assert.match(inbox,/params.get\("assetId"\)/);assert.match(inbox,/fetch\("\/api\/intake"/);
 assert.doesNotMatch(hub,/trusted website request is required/i);
 assert.match(hub,/newJob=1&conversationId=/);assert.match(hub,/router.push\(withReturnTo\(`\/dashboard\/communication-leads/);
});
const route=readFileSync(new URL('../../app/api/communications/conversations/[id]/create-job/route.ts',import.meta.url),'utf8');
function getApi(authorized=true,permitted=true) {
 const tables={communication_conversations:{id,company_id:'company',customer_id:'customer',intake_request_id:'source',summary:'summary'},intake_requests:{id:'source',linked_customer_id:'customer',company_id:'company'},communication_leads:{id:'lead',customer_id:'customer',conversation_id:id,company_id:'company'},customers:{id:'customer',company_id:'company',full_name:'Canonical'}};
 const reads=[];const exports={};const db={rpc:async()=>({data:permitted,error:null}),from:table=>{reads.push(table);const filters=[];const query={select:()=>query,eq:(key,value)=>{filters.push([key,value]);return query;},single:async()=>({data:tables[table],error:filters.some(([k,v])=>tables[table]?.[k]!==v)?{}:null}),maybeSingle:async()=>({data:tables[table],error:null})};return query;}};
 const c=vm.createContext({exports,Set,require:name=>{
 if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
 if(name.endsWith('conversation-job-prefill'))return {buildConversationJobPrefill:prefill};
 if(name.endsWith('homefix-private-access'))return {requireHomeFixPrivateAccess:async()=>authorized?{ok:true,context:{supabase:db}}:{ok:false,response:{status:401}}};
 return {};
 }});vm.runInContext(ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);
 return {reads,get:()=>exports.GET({}, {params:Promise.resolve({id})})};
}
test('server prefill preserves IDs, returns normalized fields without provider payloads',async()=>{const h=getApi();const response=await h.get();assert.equal(response.status,200);assert.equal(response.body.context.leadId,'lead');assert.equal(response.body.context.sourceRequestId,'source');assert.equal(response.body.fields.selectedCustomerId,'customer');assert.equal(response.body.raw_payload,undefined);});
test('unauthorized/cross-company prefill rejected before data reads',async()=>{for(const h of [getApi(false),getApi(true,false)]){assert.ok((await h.get()).status>=400);assert.equal(h.reads.length,0);}});
