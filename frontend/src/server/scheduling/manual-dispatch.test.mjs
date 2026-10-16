import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const route=read('../../app/api/service-requests/[id]/appointments/route.ts');
const id='00000000-0000-4000-8000-000000000001';
function api({authorized=true,result={operation:'updated',appointment:null},error=null}={}) {
 const calls=[],exports={};const c=vm.createContext({exports,Date,require:name=>{
 if(name==='next/server')return {NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}};
 if(name.includes('homefix-private-access'))return {requireHomeFixPrivateAccess:async()=>authorized?{ok:true,context:{supabase:{rpc:async(...args)=>{calls.push(args);return {data:result,error};}}}}:{ok:false,response:{status:401}}};
 return {};
 }});vm.runInContext(ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);
 return {calls,run:(body,method='PUT')=>exports[method]({method,json:async()=>body},{params:Promise.resolve({id})})};
}
const schedule={appointmentDate:'2026-10-19',windowStartTime:'10:00',windowEndTime:'12:00'};
test('unassigned scheduling uses one atomic RPC, no direct writes',async()=>{const a=api();assert.equal((await a.run(schedule)).status,200);assert.equal(a.calls.length,1);assert.equal(a.calls[0][0],'manual_dispatch_rpc');assert.equal(a.calls[0][1].p_technician_profile_id,null);});
test('assignment removal is explicit null; schedule has separate operation',async()=>{const a=api();await a.run({operation:'assign_technician',technicianProfileId:null},'PATCH');assert.equal(a.calls[0][1].p_operation,'assign');assert.equal(a.calls[0][1].p_technician_profile_id,null);});
test('unauthorized, invalid date and reversed window never invoke dispatch',async()=>{const a=api({authorized:false});assert.equal((await a.run(schedule)).status,401);assert.equal(a.calls.length,0);for(const body of [{...schedule,appointmentDate:'2026-02-30'},{...schedule,windowEndTime:'09:00'}]) {const b=api();assert.equal((await b.run(body)).status,400);assert.equal(b.calls.length,0);}});
test('conflict response and explicit reason confirmation',async()=>{const a=api({result:{conflict:true,message:'Conflict'}});assert.equal((await a.run(schedule)).status,409);assert.equal((await a.run({...schedule,overrideConflict:true})).status,400);await a.run({...schedule,overrideConflict:true,overrideReason:'Emergency'});assert.equal(a.calls.at(-1)[1].p_override_conflict,true);});
test('cross-company database rejection remains forbidden',async()=>{const a=api({error:{code:'42501',message:'private'}});assert.equal((await a.run(schedule)).status,403);});
const helper=read('../../lib/manual-dispatch.ts');
for(const confirm of [false,true])test(`browser conflict requires explicit confirmation: ${confirm}`,async()=>{
 const calls=[],exports={};const c=vm.createContext({exports,window:{confirm:()=>confirm,prompt:()=> 'Emergency'},fetch:async(_url,options)=>{calls.push(options);return {status:409,clone:()=>({json:async()=>({conflict:true,message:'Overlap'})})};}});
 vm.runInContext(ts.transpileModule(helper,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);await exports.submitManualDispatch('/fixture',{body:'{}'});assert.equal(calls.length,confirm?2:1);if(confirm)assert.equal(JSON.parse(calls[1].body).overrideReason,'Emergency');
});
const migration=read('../../../../supabase/migrations/0152_independent_manual_dispatch_apply_ready.sql');
function fn(s,name){const start=s.indexOf('create or replace function public.'+name);return s.slice(start,s.indexOf('$$;',start)+3);}
test('conversion changes only schedule technician dependency; Customer/Job creation untouched',()=>{
 let expected=fn(read('../../../../supabase/migrations/0105_service_request_job_numbers_and_unassigned_conversion_apply_ready.sql'),'convert_intake_request_rpc');
 const start=expected.indexOf('  if intake_row.appointment_date is not null'),end=expected.indexOf('  select count(*)',start);
 expected=expected.slice(0,start)+expected.slice(end);
 expected=expected.replace('        and intake_row.assigned_technician_id is not null\n','').replace('     and intake_row.window_end_time is not null\n     and intake_row.assigned_technician_id is not null then','     and intake_row.window_end_time is not null then');
 assert.equal(fn(migration,'convert_intake_request_rpc'),expected);
});
test('wrapper retains converted retry safety and changes only required technician check',()=>{
 const old=fn(read('../../../../supabase/migrations/0146_communication_job_save_contract_apply_ready.sql'),'save_conversation_job_rpc');
 assert.equal(fn(migration,'save_conversation_job_rpc'),old.replace(' or edited.assigned_technician_id is null','').replace('date, start/end time and technician.','date and start/end time.'));
});
test('board safely groups nullable assignment and displays Job number',()=>{const board=read('../../components/dashboard/TechnicianSchedule.tsx');assert.match(board,/technicianProfileId\?\?UNASSIGNED/);assert.match(board,/request\?\.jobNumber/);assert.match(board,/name:"Unassigned"/);});

test('non-manual booking retains exact verified Production body including company ZIP exemption',()=>{
 const updated=fn(migration,'book_service_request_appointment_rpc');
 const body=updated.split('$$')[1];
 const branchStart=body.indexOf("  if p_source='manual' then"),branchEnd=body.indexOf('  if auth.uid() is null');
 assert.ok(branchStart>0 && branchEnd>branchStart);
 const original=(body.slice(0,branchStart)+body.slice(branchEnd)).replace('  manual_result jsonb;\n','');
 // pg_proc.prosrc hash from owner-supplied SCHEDULE-02.5 Production catalog report.
 assert.equal(createHash('md5').update(original).digest('hex'),'3235ee25c88027beea03a33829d321b2');
 assert.match(original,/if not is_same_company_member_dispatch/);
 assert.match(original,/membership\.removed_at is null/);
 assert.match(original,/membership\.suspended_at is null/);
 assert.match(updated,/if p_source='manual' then/);
 assert.match(updated,/return manual_result->'appointment'/);
 assert.match(route,/p_operation:assign\?"assign":request.method==="POST"\?"book":"schedule"/);
 assert.doesNotMatch(route,/book_service_request_appointment_rpc/);
 const conversion=fn(migration,'convert_intake_request_rpc');
 assert.match(conversion,/book_service_request_appointment_rpc\([\s\S]*?'manual'/);
});
