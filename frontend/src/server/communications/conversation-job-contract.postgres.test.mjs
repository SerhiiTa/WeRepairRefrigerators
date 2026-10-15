import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {execFileSync,spawn} from "node:child_process";
const enabled=process.env.RUN_DISPOSABLE_CONVERSATION_PG==="1";
const container="communications-save-contract-qa";
const args=["exec","-i",container,"psql","-U","postgres","-v","ON_ERROR_STOP=1","-At"];
function sql(text){return execFileSync("docker",args,{input:text,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const c=id(100),r=id(200),company=id(10),customer=id(300),tech=id(400);
function reset(){sql(`truncate fixture_ensure_calls,communication_leads,communication_conversations,intake_requests,service_requests,customers,technician_profiles;
insert into customers values('${customer}','${company}');insert into technician_profiles values('${tech}','${company}',null);
insert into intake_requests(id,company_id,linked_customer_id,customer_name,brand,appointment_date,window_start_time,window_end_time,assigned_technician_id) values('${r}','${company}','${customer}','Original','Old','2026-10-20','09:00','11:00','${tech}');
insert into communication_conversations values('${c}','${company}','${customer}','${r}',null);
insert into communication_leads(id,company_id,conversation_id,intake_request_id,customer_id) values('${id(500)}','${company}','${c}','${r}','${customer}');`);}
const call=(fields={})=>`select save_conversation_job_rpc('${c}','${JSON.stringify(fields).replaceAll("'","''")}'::jsonb,false);`;
function fails(fields){assert.throws(()=>sql(call(fields)));assert.equal(sql('select count(*) from service_requests'),'0');}
test("disposable PostgreSQL atomic wrapper",{skip:!enabled},async t=>{
 // A dedicated container name, no production connection strings or credentials.
 sql(readFileSync(new URL('./conversation-job-contract.fixture.sql',import.meta.url),'utf8'));
 sql(readFileSync(new URL('../../../../supabase/migrations/0146_communication_job_save_contract_apply_ready.sql',import.meta.url),'utf8'));
 await t.test('omitted preserves, null clears, Later clears scheduling and technician',()=>{reset();sql(call({brand:null,schedule_mode:'later'}));assert.equal(sql(`select customer_name,brand is null,appointment_date is null,window_start_time is null,window_end_time is null,assigned_technician_id is null,linked_appointment_id is null from intake_requests`),'Original|t|t|t|t|t|t');});
 await t.test('Now validates complete schedule and ordering',()=>{reset();fails({schedule_mode:'now',window_end_time:null});fails({schedule_mode:'now',window_end_time:'08:00'});sql(call({schedule_mode:'now'}));assert.equal(sql('select linked_appointment_id is not null from intake_requests'),'t');});
 await t.test('canonical IDs and Lead lifecycle preserved; retry ignores edits',()=>{reset();const first=JSON.parse(sql(call({schedule_mode:'later'})));const second=JSON.parse(sql(call({customer_name:'must not change'})));assert.equal(first.service_request_id,second.service_request_id);assert.equal(second.already_converted,true);assert.equal(sql('select customer_name from intake_requests'),'Original');assert.equal(sql(`select conversation_id='${c}',intake_request_id='${r}',customer_id='${customer}',status from communication_leads`),'t|t|t|converted');});
 await t.test('Customer switch and cross-company access rejected',()=>{reset();fails({linked_customer_id:id(301)});sql(`update communication_conversations set company_id='${id(11)}'`);fails({});});
 await t.test('foreign technician rejected',()=>{reset();sql(`update technician_profiles set company_id='${id(11)}'`);fails({schedule_mode:'now'});});
 await t.test('shared source request rejected',()=>{reset();sql(`insert into communication_conversations values('${id(101)}','${company}',null,'${r}',null)`);fails({});});
 await t.test('read-only request not mutated',()=>{reset();sql("update intake_requests set status='converted'");fails({customer_name:'New'});assert.equal(sql('select customer_name from intake_requests'),'Original');});
 await t.test('failed conversion rolls back edited fields and schedule',()=>{reset();fails({problem_description:'FAIL',schedule_mode:'later',brand:'Changed'});assert.equal(sql("select brand,appointment_date,assigned_technician_id is not null from intake_requests"),'Old|2026-10-20|t');});
 await t.test('failed first conversion rolls back newly ensured request',()=>{reset();sql(`update communication_conversations set intake_request_id=null;delete from communication_leads;delete from intake_requests;`);fails({problem_description:'FAIL'});assert.equal(sql('select count(*) from intake_requests'),'0');assert.equal(sql('select intake_request_id is null from communication_conversations'),'t');});

 function recoveredFixture(source='phone') {
  reset();sql(`insert into service_requests(id,company_id,customer_id) values('${id(600)}','${company}','${customer}');
  update intake_requests set source_type='${source}',status='converted',linked_service_request_id='${id(600)}' where id='${r}';`);
 }
 function snapshot(){return sql(`select jsonb_build_object('request',(select to_jsonb(x) from intake_requests x),'job',(select to_jsonb(x) from service_requests x),'conversation',(select to_jsonb(x) from communication_conversations x),'lead',(select to_jsonb(x) from communication_leads x))`);}
 await t.test('converted phone/Retell source recovery bypasses ensure and all mutation triggers',()=>{
  for(const source of ['phone','retell_ai']) {
   recoveredFixture(source);const before=snapshot();
   for(let n=0;n<2;n++){const result=JSON.parse(sql(call({schedule_mode:'later',customer_name:'ignored'})));assert.equal(result.service_request_id,id(600));assert.equal(result.already_converted,true);}
   assert.equal(snapshot(),before);assert.equal(sql('select count(*) from fixture_ensure_calls'),'0');
  }
 });
 await t.test('fixture reproduces ensure-driven window and Job mutation',()=>{
  recoveredFixture();const before=snapshot();sql(`select ensure_communication_job_intake_rpc('${c}')`);
  assert.notEqual(snapshot(),before);assert.equal(sql('select window_start_time is null,window_end_time is null from intake_requests'),'t|t');assert.equal(sql('select sync_updates from service_requests'),'2');
 });
 await t.test('recovery rejects Customer/Lead/company conflicts without changes',()=>{
  for(const change of [
   `update communication_conversations set customer_id='${id(301)}'`,
   `update communication_leads set customer_id='${id(301)}'`,
   `update communication_leads set service_request_id='${id(601)}'`,
   `update communication_leads set company_id='${id(11)}'`,
   `update communication_leads set conversation_id='${id(101)}'`,
   `update communication_leads set intake_request_id='${id(201)}'`,
   `update service_requests set company_id='${id(11)}'`,
   `update service_requests set customer_id='${id(301)}'`,
   `update customers set company_id='${id(11)}'`,
   `update intake_requests set company_id='${id(11)}'`
  ]) {recoveredFixture();sql(change);const before=snapshot();assert.throws(()=>sql(call({})));assert.equal(snapshot(),before);assert.equal(sql('select count(*) from fixture_ensure_calls'),'0');}
 });
 await t.test('concurrent converted-source retries return same Job without ensure or updates',async()=>{
  recoveredFixture();const before=snapshot();
  function retry(){return new Promise((resolve,reject)=>{const p=spawn('docker',args);let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out.trim())));p.stdin.end(call({schedule_mode:'later'}));});}
  const results=await Promise.all([retry(),retry(),retry()]);for(const result of results)assert.equal(result.service_request_id,id(600));assert.equal(snapshot(),before);assert.equal(sql('select count(*) from fixture_ensure_calls'),'0');
 });
 await t.test('concurrent submissions return one Job',async()=>{reset();function run(){return new Promise((resolve,reject)=>{const p=spawn('docker',args);let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out.trim())));p.stdin.end(call({schedule_mode:'later',problem_description:'SLOW'}));});}const results=await Promise.all([run(),run()]);assert.equal(results[0].service_request_id,results[1].service_request_id);assert.equal(sql('select count(*) from service_requests'),'1');});
});
