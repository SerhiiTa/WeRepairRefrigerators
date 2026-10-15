import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
function load(file,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,AbortController,setTimeout,clearTimeout,...extra});return exports;}
const {runDeliveryBatch}=load('./delivery-worker.ts');
const recipient={companyId:'company',recipientProfileId:'staff',eventType:'inbound_sms',priority:'normal',conversationId:null,jobId:null};
function fixture(count=1){const outcomes=[];let next=0;return {outcomes,store:{claim:async()=>next++<count?[{id:String(next),channel:'sms',dedupe_key:`event-${next}:sms`,lease_token:'lease'}]:[],authorize:async()=>recipient,finish:async(c,o)=>{outcomes.push(o);return true;}}};}
test('no adapters means no claims or external delivery',async()=>{const f=fixture();f.store.claim=()=>assert.fail('claimed');assert.equal((await runDeliveryBatch(f.store,{})).claimed,0);});
test('staff recipient and stable dedupe passed; bounded batch',async()=>{const f=fixture(9);let calls=0;const result=await runDeliveryBatch(f.store,{sms:async(r,key,signal)=>{assert.equal(r,recipient);assert.match(key,/event-\d:sms/);assert.equal(signal.aborted,false);calls++;return {kind:'sent'};}});assert.equal(calls,3);assert.equal(result.finished,3);});
test('revoked consent/authorization blocks provider',async()=>{const f=fixture();f.store.authorize=async()=>null;await runDeliveryBatch(f.store,{sms:()=>assert.fail('sent')});assert.equal(f.outcomes.length,0);});
test('accepted is preserved, not called sent',async()=>{const f=fixture();await runDeliveryBatch(f.store,{sms:async()=>({kind:'accepted',reference:'provider-id'})});assert.equal(f.outcomes[0].kind,'accepted');});
test('provider exceptions are ambiguous and sanitized',async()=>{const f=fixture();await runDeliveryBatch(f.store,{sms:async()=>{throw new Error('secret-token phone');}});assert.equal(f.outcomes[0].kind,'unknown');assert.doesNotMatch(JSON.stringify(f.outcomes),/secret-token|phone/);});
test('provider timeout aborts and cannot be retried as a rejection',async()=>{const f=fixture();const fast=load('./delivery-worker.ts',{setTimeout:fn=>setTimeout(fn,1)});await fast.runDeliveryBatch(f.store,{sms:async()=>new Promise(()=>{})});assert.equal(f.outcomes[0].kind,'unknown');});
test('explicit transient and permanent provider results preserved',async()=>{for(const kind of ['retryable','permanent']){const f=fixture();await runDeliveryBatch(f.store,{sms:async()=>({kind,errorCode:'safe_code',retrySeconds:120})});assert.equal(f.outcomes[0].kind,kind);}});
test('storage failure never resubmits provider request',async()=>{const f=fixture();let sent=0;f.store.finish=async()=>{throw new Error('database down');};await assert.rejects(runDeliveryBatch(f.store,{sms:async()=>{sent++;return {kind:'sent'};}}));assert.equal(sent,1);});
test('RPC store retains lease and status with sanitized storage error',async()=>{const {createDeliveryStore}=load('./delivery-store.ts');const calls=[];const store=createDeliveryStore(async(name,args)=>{calls.push({name,args});return {data:true,error:null};});assert.equal(await store.finish({id:'id',lease_token:'token'},{kind:'accepted'}),true);assert.equal(calls[0].args.p_lease,'token');assert.equal(calls[0].args.p_outcome,'accepted');await assert.rejects(createDeliveryStore(async()=>({error:{message:'credentials'},data:null})).claim(['push'],1),/storage unavailable/);});
