import test from 'node:test';
import {validateWebsiteSubmissionExtras,normalizeWebsiteAppointment} from './website-payload-validation.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import {getCommunicationSource} from '../../components/dashboard/communications/communication-source.ts';
import {canonicalWebsiteEvents,websiteRequestFields} from './website-request.ts';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const request={id:'r1',provider_event_id:'submission1',customer_name:'Test Customer',appliance_type:'Washer',brand:'Test Brand',model_number:'M1',service_address:'1 Test St',unit:'2',city:'Houston',state:'TX',zip_code:'77001',problem_description:'Does not start',appointment_date:'2026-11-02',window_start_time:'09:00:00',window_end_time:'12:00:00',raw_message:'Please use side door'};
const event={id:'e1',type:'website_request',conversationId:'c1',intakeRequestId:'r1',body:'Does not start',eventTime:'2026-10-15T10:00:00Z'};
const message={id:'m1',source_type:'website_form',conversation_id:'c1',external_message_id:'submission1',body:event.body,occurred_at:event.eventTime};
test('one submission: message + timeline render one canonical card',()=>{const result=canonicalWebsiteEvents([event],[message],[request]);assert.equal(result.timeline.length,1);assert.equal(result.messages.length,0);});
test('two submissions with identical description stay distinct',()=>{const e2={...event,id:'e2',intakeRequestId:'r2'};const r2={...request,id:'r2',provider_event_id:'submission2'};const result=canonicalWebsiteEvents([event,e2],[message,{...message,id:'m2',external_message_id:'submission2'}],[request,r2]);assert.equal(result.timeline.length,2);assert.equal(result.messages.length,0);});
test('repeated timeline representation is deduped by canonical intake ID only',()=>{const result=canonicalWebsiteEvents([event,{...event,id:'retry'}],[message],[request]);assert.equal(result.timeline.length,1);});
test('same identity in another conversation does not suppress a message',()=>{assert.equal(canonicalWebsiteEvents([event],[{...message,conversation_id:'other'}],[request]).messages.length,1);});
test('legacy custom externalMessageId pairs by exact time and body',()=>{assert.equal(canonicalWebsiteEvents([event],[{...message,external_message_id:'custom-message'}],[request]).messages.length,0);});
test('ambiguous or unmatched legacy messages remain visible',()=>{assert.equal(canonicalWebsiteEvents([event],[{...message,external_message_id:'custom',occurred_at:'2026-10-15T11:00:00Z'}],[request]).messages.length,1);assert.equal(canonicalWebsiteEvents([event],[{...message,external_message_id:'a'},{...message,external_message_id:'b'}],[request]).messages.length,2);});
test('non-website messages untouched',()=>{assert.equal(canonicalWebsiteEvents([event],[{...message,source_type:'sms'}],[request]).messages.length,1);});
test('structured fields and requested wall-clock date/window without timezone shifts',()=>{const f=Object.fromEntries(websiteRequestFields(request));assert.equal(f.Appliance,'Washer');assert.equal(f.Brand,'Test Brand');assert.equal(f['Service address'],'1 Test St, Unit 2, Houston, TX, 77001');assert.equal(f['Requested date'],'Nov 2, 2026');assert.equal(f['Requested time'],'9:00 AM – 12:00 PM');assert.equal(f['Additional notes'],'Please use side door');});
test('no fabricated optional values or appointment',()=>{assert.deepEqual(websiteRequestFields({id:'empty'}),[]);assert.deepEqual(websiteRequestFields(null,'Saved summary'),[['Problem','Saved summary']]);});
function load(path,mocks){const exports={};vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error(n);},Request,Response,URL,Buffer,Date,console:{warn(){}}});return exports;}
test('mobile and desktop card uses native keyboard/touch expandable details and escaped fields',()=>{const {WebsiteRequestCard}=load('../../components/dashboard/communications/WebsiteRequestCard.tsx',{'react/jsx-runtime':jsx,'@/lib/communications/website-request':{websiteRequestFields},'./CommunicationSourceIcon':load('../../components/dashboard/communications/CommunicationSourceIcon.tsx',{'react/jsx-runtime':jsx,'./communication-source':{getCommunicationSource}})});const html=renderToStaticMarkup(React.createElement(WebsiteRequestCard,{request:{...request,brand:'<script>unsafe</script>'},body:event.body,submittedAt:event.eventTime}));assert.match(html,/<details/);assert.match(html,/aria-label="Website"/);assert.match(html,/text-\[#7C3AED\]/);assert.match(html,/group-open:rotate-180/);assert.match(html,/min-h-11/);assert.match(html,/list-none/);assert.doesNotMatch(html,/Request reference|>r1</);assert.match(html,/<summary/);assert.match(html,/Requested appointment only/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|href=/);});
async function routeScenario(mode){let committed=false,wakes=0,persistCalls=0;const route=load('../../app/api/public/inbound/website/route.ts',{
 'node:buffer':{Buffer},'next/server':{NextResponse:Response},
 '@/lib/communications/website-payload-validation':{validateWebsiteSubmissionExtras,normalizeWebsiteAppointment},
 '@/lib/communications/unified-inbound-event':{createUnifiedInboundEvent:x=>x,normalizeUnifiedInboundAttribution:x=>x},
 '@/server/communications/inbound-source-credentials':{verifyInboundSourceCredential:async()=>mode==='unauthorized'?{ok:false}:{ok:true,credential:{channel:'website_form',companyId:'company',inboundSourceId:'source',metadata:{}}}},
 '@/server/communications/unified-intake-gateway':{processUnifiedInboundEvent:async event=>mode==='company'?{ok:false,code:'company_mismatch'}:{ok:true,event,route:{route:'lead'}}},
 '@/server/communications/unified-inbound-persistence':{persistUnifiedInboundEvent:async()=>{persistCalls++;await Promise.resolve();if(mode==='failed')throw Error('write failed');committed=true;return {duplicate:mode==='duplicate',intakeRequestId:'r1',timelineEventId:'e1'};}},
 '@/server/notifications/post-commit-wakeup':{wakePushAfterCommit:()=>{assert.equal(committed,true);wakes++;}},
 });
 const response=await route.POST(new Request('https://local.test/api/public/inbound/website',{method:'POST',headers:{authorization:'WRA-Source public:test','content-type':'application/json'},body:JSON.stringify({customer:{name:'Synthetic Test',phone:'+15555550123'},serviceAddress:{formatted:'1 Test St',postalCode:'77001'},requestedService:{problemDescription:'Test'},submissionId:'s1'})}));return {status:response.status,wakes,persistCalls};}
for(const [mode,status,wakes] of [['success',201,1],['duplicate',200,1],['failed',503,0],['unauthorized',401,0],['company',422,0]])test(`website commit wake-up: ${mode}`,async()=>{const result=await routeScenario(mode);assert.equal(result.status,status);assert.equal(result.wakes,wakes);if(['unauthorized','company'].includes(mode))assert.equal(result.persistCalls,0);});
test('reuse canonical trigger and worker; no new notification or customer SMS path',()=>{const route=read('../../app/api/public/inbound/website/route.ts');assert.doesNotMatch(route,/emit_staff_notification|sendSms|processGeneralPush|\.sendNotification/);const migration=read('../../../../supabase/migrations/0147_staff_notifications_foundation_apply_ready.sql');assert.match(migration,/'website:'\|\|coalesce\(new.intake_request_id,new.id\)/);});

test('submission snapshot survives cleared Schedule Later fields and later confirmed scheduling',()=>{
 const snapshot={date:'2026-11-02',windowStartTime:'09:00',windowEndTime:'12:00',timezone:'America/Chicago'};
 for(const columnDate of [null,'2027-01-01']) {
  const fields=Object.fromEntries(websiteRequestFields({...request,appointment_date:columnDate,window_start_time:null,window_end_time:null,extracted_data:{requested_appointment:snapshot}}));
  assert.equal(fields['Requested date'],'Nov 2, 2026');assert.equal(fields['Requested time'],'9:00 AM – 12:00 PM');
 }
});
test('raw submission fallback and partial request do not invent missing scheduling fields',()=>{
 const fields=Object.fromEntries(websiteRequestFields({...request,extracted_data:{},raw_payload:{requested_appointment:{preferredWindow:'Morning'}}}));
 assert.equal(fields['Requested window'],'Morning');assert.equal(fields['Requested date'],undefined);assert.equal(fields['Requested time'],undefined);
});
