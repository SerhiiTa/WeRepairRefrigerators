import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function load(source,require){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,Date,Set,Map,Intl});return exports;}
const records=load(read('../../lib/service-request-records.ts'),()=>{throw Error('Unexpected runtime dependency');});
for(const fallback of [false,true])test(`Schedule loads assigned/unassigned Job joins; fallback=${fallback}`,async()=>{
 const rows=[{id:'a',service_request_id:'job-a',technician_profile_id:'tech-a',service_requests:{id:'job-a',job_number:101}},{id:'b',service_request_id:'job-b',technician_profile_id:null,service_requests:{id:'job-b',job_number:102}}];
 const effects=[],states=[],queries=[];
 const client={from(table){const q={table,orders:[]};queries.push(q);return {select(select){q.select=select;return this;},order(...args){q.orders.push(args);return this;},then(resolve){return Promise.resolve(fallback&&queries.length===1?{data:null,error:{message:'external_calendar missing'}}:{data:rows,error:null}).then(resolve);}};}};
 const component=load(read('../../components/dashboard/TechnicianSchedule.tsx'),name=>{
  if(name==='react')return {useState:v=>[typeof v==='function'?v():v,s=>states.push(s)],useEffect:f=>effects.push(f),useMemo:f=>f()};
  if(name==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};
  if(name==='@/lib/service-request-records')return records;
  if(name==='@/lib/supabase/client')return {getSupabaseBrowserClient:()=>client};
  if(name==='next/link'||name==='@/components/StatusBadge')return {};
  throw Error(name);
 });
 component.TechnicianSchedule();effects.forEach(f=>f());await new Promise(resolve=>setImmediate(resolve));
 assert.equal(queries.length,fallback?2:1);
 for(const q of queries){
  assert.equal(q.table,'appointments');
  assert.equal((q.select.match(/service_requests!appointments_service_request_id_fkey\(/g)||[]).length,1);
  assert.doesNotMatch(q.select,/service_requests\(|!inner/);
  assert.equal(JSON.stringify(q.orders),JSON.stringify([['appointment_date',{ascending:true}],['window_start_time',{ascending:true}]]));
 }
 const state=states.at(-1);assert.equal(state.status,'ready');assert.equal(state.appointments.length,2);
 assert.equal(new Set(state.appointments.map(a=>a.id)).size,2);
 assert.equal(state.appointments[0].request.id,'job-a');assert.equal(state.appointments[0].technicianProfileId,'tech-a');
 assert.equal(state.appointments[1].request.jobNumber,102);assert.equal(state.appointments[1].technicianProfileId,null);
});
