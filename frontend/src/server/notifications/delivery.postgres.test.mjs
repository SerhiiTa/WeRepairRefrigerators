import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Explicit disposable target only. Never point this harness at Local QA/Production.
const args=['exec','-i','notifications-02a-disposable','psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8'}).trim();
test('disposable queue policy, RLS, retries and concurrent claims',{skip:process.env.RUN_DISPOSABLE_NOTIFICATIONS_02_PG!=='1'},async()=>{
 sql(readFileSync(new URL('./delivery.postgres.sql',import.meta.url),'utf8'));
 sql(`insert into companies values('00000000-0000-4000-8000-000000000010');
 insert into profiles(id) values('00000000-0000-4000-8000-000000000001');
 insert into company_members(company_id,profile_id,member_role) values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner');
 insert into staff_notification_preferences(company_id,recipient_profile_id,event_type,push_enabled) values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','inbound_sms',true);
 insert into communication_conversations(id,company_id) values('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010');
 insert into communication_messages values(gen_random_uuid(),'00000000-0000-4000-8000-000000000020','sms','inbound','customer');`);
 const a=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
 let output='',errors='';
 const complete=new Promise((resolve,reject)=>{a.on('error',reject);a.on('exit',code=>code===0?resolve():reject(new Error(errors)));});
 const locked=new Promise((resolve,reject)=>{a.stdout.on('data',chunk=>{output+=chunk;if(output.includes('CLAIMED'))resolve();});a.on('exit',()=>{if(!output.includes('CLAIMED'))reject(new Error('No claim acquired'));});});
 a.stderr.on('data',chunk=>{errors+=chunk;});
 a.stdin.end("begin;set local role service_role;select 'CLAIMED:'||id from claim_staff_notification_deliveries(array['push'],1);select pg_sleep(2);commit;");
 await locked;
 const second=sql("begin;set local role service_role;select count(*) from claim_staff_notification_deliveries(array['push'],1);commit;");
 assert.equal(second,'0');
 await complete;
 assert.equal(sql('select count(*) from staff_notification_deliveries where attempt_count=1'), '1');
});
