import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync,spawn} from 'node:child_process';import {readFileSync} from 'node:fs';
const args=['exec','-i','notifications-pilot-disposable','psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8'}).trim();
test('pilot SQL isolation and real concurrent single-attempt claim',{skip:process.env.RUN_DISPOSABLE_PILOT_PG!=='1'},async()=>{
 sql(readFileSync(new URL('./pilot.postgres.sql',import.meta.url),'utf8'));
 const co='00000000-0000-4000-8000-000000000010',u='00000000-0000-4000-8000-000000000001';
 sql(`insert into companies values('${co}');insert into profiles(id) values('${u}');insert into company_members(company_id,profile_id,member_role) values('${co}','${u}','owner');select set_config('request.jwt.claim.sub','${u}',false);select save_staff_push_subscription('${co}','https://web.push.apple.com/concurrent',repeat('A',87),repeat('A',22),array['ai_needs_attention']);`);
 const sub=sql('select id from staff_push_subscriptions');const n=sql(`select create_staff_push_pilot('${co}','${u}','${sub}',gen_random_uuid())`);
 const claim=`claim_staff_push_pilot('${n}','${u}','${sub}','${co}')`;
 const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='',error='';
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(error)));});
 const locked=new Promise((resolve,reject)=>{child.stdout.on('data',c=>{output+=c;if(output.includes('LOCKED:'))resolve();});child.on('exit',()=>{if(!output.includes('LOCKED:'))reject(new Error('No claim'));});});
 child.stderr.on('data',c=>{error+=c;});
 child.stdin.end(`begin;set local role service_role;select 'LOCKED:'||(${claim}->'claim'->>'id');select pg_sleep(2);commit;`);
 await locked;assert.equal(sql(`begin;set local role service_role;select coalesce(${claim}::text,'none');commit;`),'none');await done;
 assert.equal(sql('select attempt_count from staff_notification_deliveries'),'1');
});
