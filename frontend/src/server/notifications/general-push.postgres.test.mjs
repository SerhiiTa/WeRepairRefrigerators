import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync,spawn} from 'node:child_process';import {readFileSync} from 'node:fs';
const name='notifications-general-disposable',args=['exec','-i',name,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'];const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8'}).trim();
test('general Push SQL routing, fairness, policies and real concurrent claim',{skip:process.env.RUN_DISPOSABLE_GENERAL_PUSH_PG!=='1'},async()=>{
 sql(readFileSync(new URL('./general-push.postgres.sql',import.meta.url),'utf8'));
 const co='00000000-0000-4000-8000-000000000010',u='00000000-0000-4000-8000-000000000001',c='00000000-0000-4000-8000-000000000020';
 sql(`insert into companies values('${co}');insert into profiles(id) values('${u}');insert into company_members(company_id,profile_id,member_role) values('${co}','${u}','owner');insert into staff_notification_preferences(company_id,recipient_profile_id,event_type,push_enabled) values('${co}','${u}','inbound_sms',true);insert into communication_conversations(id,company_id) values('${c}','${co}');insert into communication_messages values(gen_random_uuid(),'${c}','sms','inbound','customer');`);
 const a=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
 const done=new Promise((resolve,reject)=>{a.on('error',reject);a.on('exit',code=>code===0?resolve():reject(Error(err)));});
 const locked=new Promise((resolve,reject)=>{a.stdout.on('data',d=>{out+=d;if(out.includes('LOCKED:'))resolve();});a.on('exit',()=>{if(!out.includes('LOCKED:'))reject(Error(err));});});a.stderr.on('data',d=>{err+=d;});
 a.stdin.end("begin;set local role service_role;select 'LOCKED:'||id from claim_general_staff_push(1);select pg_sleep(2);commit;");
 await locked;assert.equal(sql('begin;set local role service_role;select count(*) from claim_general_staff_push(1);commit;'),'0');await done;
 assert.equal(sql('select sum(attempt_count) from staff_notification_deliveries'),'1');
});
