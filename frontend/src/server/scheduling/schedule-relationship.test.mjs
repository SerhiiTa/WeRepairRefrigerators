import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function load(source,require=()=>({})){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require,Map});return exports;}
const records=load(read('../../lib/service-request-records.ts'));
const data=load(read('../../components/dashboard/schedule/data.ts'),name=>name.includes('service-request-records')?records:{HOMEFIX_PRIVATE_COMPANY_ID:'authorized-company'});
function client(pages){const calls=[];let index=0;return {calls,from(table){const q={table,ops:[]};calls.push(q);const builder={then(resolve){return Promise.resolve(pages[index++]).then(resolve);}};for(const name of ['select','eq','gte','lte','order','range','is','in'])builder[name]=(...args)=>{q.ops.push([name,...args]);return builder;};return builder;}};}
test('explicit verified FK, left embed, company and range filters preserve assigned/unassigned rows',async()=>{
 const c=client([{data:[{id:'a',service_request_id:'job-a',technician_profile_id:'tech',service_requests:{id:'job-a',customer_phone:'555'}},{id:'b',service_request_id:'job-b',technician_profile_id:null,service_requests:null}],error:null}]);
 const rows=await data.loadAppointments(c,'2026-10-19','2026-10-25',['qa-company','authorized-company']);assert.equal(rows.length,2);assert.equal(rows[0].request.id,'job-a');assert.equal(rows[1].technicianProfileId,null);assert.equal(rows[1].request,null);
 assert.match(data.SCHEDULE_SELECT,/service_requests!appointments_service_request_id_fkey\(/);assert.doesNotMatch(data.SCHEDULE_SELECT,/service_requests\(|!inner/);assert.equal((data.SCHEDULE_SELECT.match(/\(/g)||[]).length,1);
 assert.ok(c.calls[0].ops.some(x=>x[0]==='in'&&x[1]==='company_id'&&x[2].includes('qa-company')));assert.ok(c.calls[0].ops.some(x=>x.join('|')==='gte|appointment_date|2026-10-19'));assert.ok(c.calls[0].ops.some(x=>x.join('|')==='lte|appointment_date|2026-10-25'));
});
test('pagination uses stable ordering and does not duplicate records',async()=>{const page=Array.from({length:1000},(_,i)=>({id:String(i),service_requests:null}));const c=client([{data:page,error:null},{data:[page[0]],error:null}]);const rows=await data.loadAppointments(c,'2026-10-19','2026-10-25',['qa-company','authorized-company']);assert.equal(rows.length,1000);assert.ok(c.calls[1].ops.some(x=>x.join('|')==='range|1000|1999'));});
test('technicians without appointments are loaded with company scope',async()=>{const c=client([{data:[{id:'t',display_name:'Staff'}],error:null}]);assert.equal((await data.loadTechnicians(c,['qa-company'])).length,1);assert.equal(c.calls[0].table,'technician_profiles');assert.ok(c.calls[0].ops.some(x=>x[0]==='in'&&x[1]==='company_id'&&x[2].includes('qa-company')));});
test('authorization errors remain errors, never unscoped fallback',async()=>{const c=client([{data:null,error:{message:'denied'}}]);await assert.rejects(data.loadAppointments(c,'2026-10-19','2026-10-25',['qa-company','authorized-company']),/denied/);assert.equal(c.calls.length,1);});

test('empty company membership never produces an unscoped read',async()=>{const c=client([]);assert.equal((await data.loadAppointments(c,'2026-10-19','2026-10-25',[])).length,0);assert.equal((await data.loadTechnicians(c,[])).length,0);assert.equal(c.calls.length,0);});
test('company scope comes from authenticated active memberships',async()=>{const c=client([{data:[{company_id:'qa-company'},{company_id:'homefix-company'}],error:null}]);c.auth={getUser:async()=>({data:{user:{id:'qa-user'}},error:null})};assert.equal((await data.loadScheduleCompanies(c)).length,2);for(const field of ['archived_at','removed_at','suspended_at'])assert.ok(c.calls[0].ops.some(x=>x[0]==='is'&&x[1]===field&&x[2]===null));assert.ok(c.calls[0].ops.some(x=>x.join('|')==='eq|profile_id|qa-user'));});
