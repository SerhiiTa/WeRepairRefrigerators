import assert from "node:assert/strict";
import test from "node:test";
import { validateConversationJobPayload as validate } from "./conversation-job-contract.ts";
test("omitted fields stay absent; explicit null clears", () => {
 assert.deepEqual(validate({brand:null,customerName:" Reviewed "}),{brand:null,customer_name:"Reviewed"});
 assert.deepEqual(validate({}),{});
});
test("canonical Wizard field names and schedule modes", () => {
 assert.deepEqual(validate({scheduleMode:"later",modelNumber:"M",serialNumber:null}),{schedule_mode:"later",model_number:"M",serial_number:null});
 assert.equal(validate({scheduleMode:"now",appointmentDate:"2026-10-20"}).appointment_date,"2026-10-20");
});
test("invalid field types, IDs and unsupported payload rejected", () => {
 for (const input of [null,[],{customerId:"bad"},{brand:3},{scheduleMode:null},{scheduleMode:"automatic"},{companyId:"anything"},{serviceRequestId:"anything"}]) assert.throws(()=>validate(input));
});

import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const route=readFileSync(new URL('../../app/api/communications/conversations/[id]/create-job/route.ts',import.meta.url),'utf8');
function api({authorized=true,error=null}={}) {
 const calls=[];const exports={};
 const ctx=vm.createContext({exports,require:name=>{
  if(name.endsWith('conversation-job-prefill'))return {};
  if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
  if(name.endsWith('intake-service'))return {formatIntakeError:value=>value};
  if(name.endsWith('conversation-job-contract'))return {validateConversationJobPayload:validate};
  if(name.endsWith('homefix-private-access'))return {requireHomeFixPrivateAccess:async()=>authorized?{ok:true,context:{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {error,data:{service_request_id:'job',already_converted:true}};}}}}:{ok:false,response:{status:401}}};
  throw Error(name);
 }});
 vm.runInContext(ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,ctx);
 return {calls,post:body=>exports.POST({json:async()=>body},{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000100'})})};
}
test('API uses exactly one atomic RPC and preserves response contract',async()=>{
 const a=api();const result=await a.post({wizard:{brand:null,scheduleMode:'later'},allowPossibleDuplicate:false});
 assert.equal(result.body.conversion.serviceRequestId,'job');assert.equal(result.body.conversion.alreadyConverted,true);
 assert.equal(a.calls.length,1);assert.equal(a.calls[0].name,'save_conversation_job_rpc');
 assert.equal(a.calls[0].args.p_fields.brand,null);assert.equal(a.calls[0].args.p_fields.schedule_mode,'later');
});
test('existing caller without wizard remains supported',async()=>{const a=api();assert.equal((await a.post({allowPossibleDuplicate:true})).status,200);assert.equal(Object.keys(a.calls[0].args.p_fields).length,0);});
test('unauthorized and invalid API input cannot call RPC',async()=>{const a=api({authorized:false});assert.equal((await a.post({})).status,401);assert.equal(a.calls.length,0);const b=api();assert.equal((await b.post({wizard:{brand:123}})).status,400);assert.equal(b.calls.length,0);});
test('database tenant rejection is not hidden as success',async()=>{const a=api({error:{code:'42501',message:'Conversation is not accessible.'}});assert.equal((await a.post({})).status,403);});
