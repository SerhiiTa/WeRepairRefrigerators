import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {validateWebsiteSubmissionExtras as validate,normalizeWebsiteAppointment} from './website-payload-validation.ts';
import {createUnifiedInboundEvent,normalizeUnifiedInboundAttribution} from './unified-inbound-event.ts';
import {websiteRequestFields} from './website-request.ts';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function load(source,mocks){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>{if(name in mocks)return mocks[name];throw Error(name);},Request,Response,Buffer,Date,Intl,console:{warn(){}}});return exports;}
// Use the real persistence JSON builders, without a database or provider connection.
const builders=load(read('../../server/communications/unified-inbound-persistence.ts')+'\nexport {buildRawPayload,buildExtractedData};',{'@/lib/supabase/service-role':{}});
function payload(form){return {formId:form,providerEventId:`wpforms:${form}:123`,customer:{name:'Synthetic QA',phone:'+15555550123'},serviceAddress:{formatted:'1 Test St',postalCode:'77001'},requestedService:{applianceType:'Refrigerator',brand:'LG',problemDescription:'Test only'},requestedAppointment:{date:'2026-10-20',preferredWindow:'3:00 PM',timezone:'America/Chicago'},formFields:{'9':{label:'Choose a day',value:'10/20/2026'},'11':{label:'Choose a time',value:'3:00 PM'},'99':{label:'Additional field',value:['A',{nested:'preserved'}]}},providerMetadata:{provider:'wpforms',formId:form,entryId:'123'}};}
async function submit(input){let saved,wakes=0;const route=load(read('../../app/api/public/inbound/website/route.ts'),{
 'node:buffer':{Buffer},'next/server':{NextResponse:Response},
 '@/lib/communications/website-payload-validation':{validateWebsiteSubmissionExtras:validate,normalizeWebsiteAppointment},
 '@/lib/communications/unified-inbound-event':{createUnifiedInboundEvent,normalizeUnifiedInboundAttribution},
 '@/server/communications/inbound-source-credentials':{verifyInboundSourceCredential:async()=>({ok:true,credential:{channel:'website_form',companyId:'qa-company',inboundSourceId:'qa-source',metadata:{form_routing:{162:'lead',168:'lead',695:'booking_request'}}}})},
 '@/server/communications/unified-intake-gateway':{processUnifiedInboundEvent:async event=>({ok:true,event,route:{route:'intake'}})},
 '@/server/communications/unified-inbound-persistence':{persistUnifiedInboundEvent:async gateway=>{saved=gateway.event;return {duplicate:false,intakeRequestId:'qa',timelineEventId:'event'};}},
 '@/server/notifications/post-commit-wakeup':{wakePushAfterCommit:()=>{wakes++;}},
 });const response=await route.POST(new Request('https://qa.invalid',{method:'POST',headers:{authorization:'WRA-Source test:test'},body:JSON.stringify(input)}));return {response,saved,wakes};}
for(const form of ['162','168','695'])test(`corrected PHP contract ${form}: API -> real normalizer -> canonical JSON`,async()=>{
 const p=payload(form),{response,saved,wakes}=await submit(p);assert.equal(response.status,201);assert.equal(wakes,1);assert.equal(saved.providerEventId,p.providerEventId);
 assert.deepEqual(saved.formFields,p.formFields);assert.deepEqual(saved.requestedAppointment,p.requestedAppointment);
 for(const json of [builders.buildRawPayload(saved),builders.buildExtractedData(saved)]){assert.equal(JSON.stringify(json.form_fields),JSON.stringify(p.formFields));assert.equal(JSON.stringify(json.requested_appointment),JSON.stringify(p.requestedAppointment));}
 const snapshot=builders.buildExtractedData(saved);
 for(const appointment_date of [null,'2027-01-01']){const fields=Object.fromEntries(websiteRequestFields({id:'qa',appointment_date,extracted_data:snapshot}));assert.equal(fields['Requested date'],'Oct 20, 2026');assert.equal(fields['Requested window'],'3:00 PM');assert.equal(fields['Requested time'],undefined);}
});
test('old payload without optional extras stays compatible',async()=>{const p=payload('162');delete p.formFields;delete p.requestedAppointment;assert.equal((await submit(p)).response.status,201);});
for(const bad of [{date:'2026-02-30'},{date:'10/20/2026'},{date:123},{windowStartTime:'15:00',windowEndTime:'14:00'},{windowStartTime:'25:00',windowEndTime:'26:00'},{timezone:'Not/AZone'},{preferredWindow:'25:99 PM'}])test(`invalid appointment retained without rejecting intake: ${JSON.stringify(bad)}`,async()=>{const p=payload('162');p.requestedAppointment=bad;const r=await submit(p);assert.equal(r.response.status,201);assert.deepEqual(r.saved.providerMetadata.submittedRequestedAppointment,bad);assert.ok(r.saved.providerMetadata.requestedAppointmentValidationErrors.length);assert.equal(r.wakes,1);});
test('unknown field IDs and duplicate labels preserve separate entries',async()=>{const p=payload('162');p.formFields['101']={label:'Additional field',value:0};const r=await submit(p);assert.deepEqual(r.saved.formFields,p.formFields);});
test('malformed fields rejected; larger payload rejected explicitly rather than truncated',async()=>{const p=payload('162');p.formFields={'9':{value:'date'}};assert.equal((await submit(p)).response.status,400);p.formFields={'9':{label:'Large field',value:'x'.repeat(33000)}};assert.equal((await submit(p)).response.status,413);});
test('existing column mapping, Schedule Later snapshots, and idempotency remain intact',()=>{const p=read('../../server/communications/unified-inbound-persistence.ts');assert.match(p,/appointment_date: event.requestedAppointment\?\.date/);assert.match(p,/preferred_appointment_window:\s*event.requestedAppointment\?\.preferredWindow/);assert.match(p,/if \(existingIntakeId\)/);assert.match(p,/\.eq\("intake_request_id", intakeRequestId\)/);const sql=read('../../../../supabase/migrations/0146_communication_job_save_contract_apply_ready.sql');const update=sql.slice(sql.indexOf('update public.intake_requests set'),sql.indexOf('result := public.convert_intake_request_rpc'));assert.doesNotMatch(update,/raw_payload|extracted_data/);});
for (const [label,patch] of [
 ['168 without address',{formId:'168',serviceAddress:{}}],
 ['695 without problem',{formId:'695',requestedService:{}}],
 ['name and phone only',{customer:{name:'QA',phone:'+15555550123'},serviceAddress:{},requestedService:{},formFields:undefined,requestedAppointment:undefined}],
 ['email and question only',{customer:{email:'qa@example.invalid'},message:{body:'Service question'},serviceAddress:{},requestedService:{},formFields:undefined,requestedAppointment:undefined}],
]) test(`partial intake: ${label}`,async()=>{const p={...payload(patch.formId??'162'),...patch};const r=await submit(p);assert.equal(r.response.status,201);assert.equal(r.wakes,1);});
test('invalid date never reaches typed persistence date; original fields remain',async()=>{const p=payload('162');p.requestedAppointment.date='2026-02-30';p.formFields['9'].value='02/30/2026';const r=await submit(p);assert.equal(r.response.status,201);assert.equal(r.saved.requestedAppointment?.date,undefined);assert.equal(r.saved.formFields['9'].value,'02/30/2026');assert.equal(r.saved.providerMetadata.submittedRequestedAppointment.date,'2026-02-30');});
test('empty intake is still rejected',async()=>{const p={formId:'162',providerEventId:'wpforms:162:empty'};assert.equal((await submit(p)).response.status,400);});
test('no automatic Job or new notification path added',()=>{const source=read('../../app/api/public/inbound/website/route.ts');assert.doesNotMatch(source,/convert_intake_request_rpc|book_service_request_appointment_rpc|emit_staff_notification|sendSms/);});
test('repeated providerEventId reuses existing intake/conversation/message/timeline without inserts',async()=>{
 let inserts=0;
 const rows={intake_requests:{id:'r'},communication_conversations:{id:'c',intake_request_id:'r',customer_id:null},communication_messages:{id:'m'},communication_timeline_events:{id:'t'}};
 const client={from(table){const q={select(){return q;},eq(){return q;},limit(){return q;},maybeSingle:async()=>({data:rows[table],error:null}),insert(){inserts++;throw Error('duplicate insert');},update(){throw Error('unexpected update');}};return q;}};
 const persistence=load(read('../../server/communications/unified-inbound-persistence.ts'),{'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>client}});
 const gateway={companyId:'company',source:{inboundSourceId:'source'},idempotency:{providerEventId:'wpforms:162:123',providerLeadId:null},event:{channel:'website_form',eventType:'lead',occurredAt:'2026-10-20T12:00:00Z',message:{body:'Question'}}};
 for(let n=0;n<2;n++){const result=await persistence.persistUnifiedInboundEvent(gateway);assert.equal(result.duplicate,true);assert.equal(result.intakeRequestId,'r');assert.equal(result.timelineEventId,'t');}
 assert.equal(inserts,0); // No timeline INSERT means no notification-trigger invocation.
});
