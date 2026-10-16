import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
const enabled=process.env.RUN_SCHEDULE_PG==='1', container='schedule-02-disposable';
const args=['exec','-i',container,'psql','-d','schedule_core','-U','postgres','-v','ON_ERROR_STOP=1','-At'];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function sql(s){return execFileSync('docker',args,{input:`set qa.actor='${id(1)}';\n${s}`,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim().split('\n').filter(x=>x!=='SET').join('\n');}
const call=(job,op,tech=null,date='2026-10-19',start='10:00',end='12:00',override=false)=>`select manual_dispatch_rpc('${id(job)}','${op}',${tech?`'${id(tech)}'`:'null'},'${date}','${start}','${end}',null,${override},${override?"'Owner-approved emergency'":'null'});`;
function setup(){sql(`truncate manual_dispatch_overrides,appointments,service_requests,technician_profiles,company_members,profiles,companies cascade;
insert into companies(id) values('${id(10)}'),('${id(20)}');
insert into profiles(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');
insert into company_members(company_id,profile_id,member_role) values('${id(10)}','${id(1)}','dispatcher'),('${id(10)}','${id(2)}','technician'),('${id(10)}','${id(3)}','technician');
insert into technician_profiles(id,company_id,profile_id) values('${id(200)}','${id(10)}','${id(2)}'),('${id(300)}','${id(10)}','${id(3)}');
insert into service_requests(id,company_id) values('${id(100)}','${id(10)}'),('${id(101)}','${id(10)}');`);}
function parallel(s){return new Promise((resolve,reject)=>{const p=spawn('docker',args);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('exit',code=>code?reject(Error(err)):resolve(out));p.stdin.end(`set qa.actor='${id(1)}';${s}`);});}
test('isolated manual dispatch PostgreSQL',{skip:!enabled},async t=>{
 execFileSync('docker',['exec',container,'dropdb','-U','postgres','--if-exists','schedule_core']);
 execFileSync('docker',['exec',container,'createdb','-U','postgres','schedule_core']);
 sql(readFileSync(new URL('./manual-dispatch.fixture.sql',import.meta.url),'utf8'));
 const migration=readFileSync(new URL('../../../../supabase/migrations/0152_independent_manual_dispatch_apply_ready.sql',import.meta.url),'utf8');
 // Install the full forward migration on synthetic schema; conversion wrapper has separate dependency-double tests.
 sql(migration);
 await t.test('existing booking signature delegates manual unassigned booking',()=>{setup();sql(`select book_service_request_appointment_rpc('${id(100)}',null,'2026-10-19','10:00','12:00',null,'manual');`);assert.equal(sql('select count(*) from appointments'),'1');});
 await t.test('unassigned booking, assignment, change, removal and independent reschedule',()=>{
 setup();sql(call(100,'schedule'));assert.equal(sql('select technician_profile_id is null from appointments'),'t');
 sql(call(100,'assign',200));sql(call(100,'schedule',null,'2026-10-20','13:00','15:00'));assert.equal(sql('select technician_profile_id,appointment_date from appointments'),`${id(200)}|2026-10-20`);
 sql(call(100,'assign',300));assert.equal(sql('select window_start_time from appointments'),'13:00:00');sql(`update service_requests set selected_technician_slug='old-public-slug' where id='${id(100)}'`);sql(call(100,'assign'));assert.equal(sql('select selected_technician_slug is null from service_requests where appointment_id is not null'),'t');assert.equal(sql('select technician_profile_id is null from appointments'),'t');assert.equal(sql('select assigned_technician_profile_id is null from service_requests where appointment_id is not null'),'t');
 });
 await t.test('manual ZIP mismatch, no marketplace verification and outside availability allowed',()=>{setup();sql(call(100,'book',200,'2026-10-18','20:00','22:00'));assert.equal(sql('select count(*) from appointments'),'1');});
 await t.test('suspended and foreign technician, foreign Job, nonstaff rejected',()=>{setup();sql(`update technician_profiles set suspended_at=now() where id='${id(200)}'`);assert.throws(()=>sql(call(100,'book',200)));sql(`update technician_profiles set suspended_at=null,company_id='${id(20)}' where id='${id(200)}'`);assert.throws(()=>sql(call(100,'book',200)));sql(`update service_requests set company_id='${id(20)}' where id='${id(100)}'`);assert.throws(()=>sql(call(100,'schedule')));sql(`update company_members set member_role='technician' where profile_id='${id(1)}'`);assert.throws(()=>sql(call(101,'schedule')));});
 await t.test('invalid window and duplicate active booking rejected',()=>{setup();assert.throws(()=>sql(call(100,'schedule',null,'2026-10-19','12:00','10:00')));sql(call(100,'book'));assert.throws(()=>sql(call(100,'book')));sql(call(100,'schedule'));assert.equal(sql('select count(*) from appointments'),'1');});
 await t.test('conflict requires explicit override; audit and mirrors atomic',()=>{setup();sql(call(100,'book',200));const conflict=JSON.parse(sql(call(101,'book',200)));assert.equal(conflict.conflict,true);assert.equal(sql('select count(*) from appointments'),'1');sql(call(101,'book',200,'2026-10-19','10:00','12:00',true));assert.equal(sql('select count(*) from manual_dispatch_overrides'),'1');assert.equal(sql("select count(*) from service_requests j join appointments a on a.id=j.appointment_id where j.assigned_technician_profile_id=a.technician_profile_id"),'2');});
 await t.test('concurrent assignment/reschedule preserve both changes',async()=>{setup();sql(call(100,'schedule'));await Promise.all([parallel('begin;'+call(100,'assign',200)+'select pg_sleep(0.2);commit;'),parallel(call(100,'schedule',null,'2026-10-20','14:00','16:00'))]);assert.equal(sql('select technician_profile_id,appointment_date from appointments'),`${id(200)}|2026-10-20`);});
 await t.test('concurrent same-technician bookings cannot silently overlap',async()=>{setup();const results=await Promise.all([parallel(call(100,'book',200)),parallel(call(101,'book',200))]);assert.equal(results.filter(x=>x.includes('"conflict": true')).length,1);assert.equal(sql('select count(*) from appointments'),'1');});
 await t.test('transaction rollback leaves no synthetic bookings',()=>{setup();sql('begin;'+call(100,'schedule')+'rollback;');assert.equal(sql('select count(*) from appointments'),'0');});
 await t.test('removal clears names/slug, preserves dates and unrelated Job fields',()=>{
  for(const scheduled of [false,true]) {
   setup();if(scheduled)sql(call(100,'schedule'));
   sql(call(100,'assign',200));sql(`update service_requests set selected_technician_slug='stale',selected_technician_business_name='Stale name' where id='${id(100)}'`);
   const before=sql(`select to_jsonb(j)-array['assigned_technician_profile_id','selected_technician_slug','selected_technician_business_name','updated_at'] from service_requests j where id='${id(100)}'`);
   const window=sql('select appointment_date,window_start_time,window_end_time from appointments');
   sql(call(100,'assign'));
   assert.equal(sql(`select assigned_technician_profile_id is null,selected_technician_slug is null,selected_technician_business_name is null from service_requests where id='${id(100)}'`),'t|t|t');
   assert.equal(sql(`select to_jsonb(j)-array['assigned_technician_profile_id','selected_technician_slug','selected_technician_business_name','updated_at'] from service_requests j where id='${id(100)}'`),before);
   assert.equal(sql('select appointment_date,window_start_time,window_end_time from appointments'),window);
   if(scheduled)assert.equal(sql('select technician_profile_id is null from appointments'),'t');
  }
 });
 await t.test('assign without Appointment does not schedule; later schedule retains technician',()=>{
  setup();const result=JSON.parse(sql(call(100,'assign',200)));assert.equal(result.appointment,null);
  assert.equal(sql(`select status,appointment_id is null,assigned_technician_profile_id from service_requests where id='${id(100)}'`),`new|t|${id(200)}`);
  assert.equal(sql('select count(*) from appointments'),'0');sql(call(100,'schedule'));
  assert.equal(sql('select technician_profile_id from appointments'),id(200));
 });
 await t.test('audit contains persisted snapshots, actor, conflicts and reason; rollback removes audit',()=>{
  setup();const first=JSON.parse(sql(call(100,'book',200))).appointment;
  const second=JSON.parse(sql(call(101,'schedule',null,'2026-10-19','14:00','16:00'))).appointment;
  sql(call(101,'assign',200));const before=JSON.parse(sql(`select to_jsonb(a) from appointments a where id='${second.id}'`));
  sql(call(101,'schedule',null,'2026-10-19','10:00','12:00',true));
  const audit=JSON.parse(sql('select to_jsonb(x) from manual_dispatch_overrides x'));
  assert.deepEqual(audit.before_state,before);assert.deepEqual(audit.after_state,JSON.parse(sql(`select to_jsonb(a) from appointments a where id='${second.id}'`)));
  assert.equal(audit.actor_id,id(1));assert.deepEqual(audit.conflicting_appointment_ids,[first.id]);assert.equal(audit.reason,'Owner-approved emergency');
  const snapshot=sql('select jsonb_agg(to_jsonb(a) order by id) from appointments a');
  assert.throws(()=>sql('begin;'+call(101,'schedule',null,'2026-10-19','11:00','13:00',true)+"select 1/0;commit;"));
  assert.equal(sql('select count(*) from manual_dispatch_overrides'),'1');assert.equal(sql('select jsonb_agg(to_jsonb(a) order by id) from appointments a'),snapshot);
 });
 await t.test('new conflicting booking has no previous persisted Appointment',()=>{
  setup();sql(call(100,'book',200));sql(call(101,'book',200,'2026-10-19','10:00','12:00',true));
  assert.equal(sql('select before_state is null from manual_dispatch_overrides'),'t');
 });
 await t.test('two sessions swapping technicians use stable lock order without deadlock',async()=>{
  setup();sql(call(100,'book',200));sql(call(101,'book',300,'2026-10-19','14:00','16:00'));
  await Promise.all([parallel("begin;set local lock_timeout='3s';"+call(100,'assign',300)+'select pg_sleep(0.2);commit;'),parallel("begin;set local lock_timeout='3s';"+call(101,'assign',200)+'commit;')]);
  assert.equal(sql('select technician_profile_id from appointments order by service_request_id'),`${id(300)}\n${id(200)}`);
 });
 await t.test('two sessions cannot book duplicate active Appointments for one Job',async()=>{
  setup();const results=await Promise.allSettled([parallel(call(100,'book')),parallel(call(100,'book'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(sql('select count(*) from appointments'),'1');
 });
 await t.test('manual booking JSON and conflict failure preserve caller contract',()=>{
  setup();const result=JSON.parse(sql(`select book_service_request_appointment_rpc('${id(100)}','${id(200)}','2026-10-19','10:00','12:00',null,'manual');`));
  for(const key of ['id','company_id','service_request_id','technician_profile_id','appointment_date','window_start_time','window_end_time','status'])assert.ok(result[key]);
  assert.throws(()=>sql(`select book_service_request_appointment_rpc('${id(101)}','${id(200)}','2026-10-19','10:00','12:00',null,'manual');`));
  assert.equal(sql('select count(*) from appointments'),'1');assert.equal(sql('select count(*) from manual_dispatch_overrides'),'0');
 });
 await t.test('RPC/grants and override audit RLS remain restricted',()=>{
  assert.equal(sql("select has_function_privilege('anon','public.manual_dispatch_rpc(uuid,text,uuid,date,time,time,uuid,boolean,text)','execute'),has_function_privilege('authenticated','public.manual_dispatch_rpc(uuid,text,uuid,date,time,time,uuid,boolean,text)','execute')"),'f|t');
  assert.equal(sql("select relrowsecurity from pg_class where oid='public.manual_dispatch_overrides'::regclass"),'t');
  assert.equal(sql("select has_table_privilege('authenticated','public.manual_dispatch_overrides','INSERT'),has_table_privilege('authenticated','public.manual_dispatch_overrides','UPDATE'),has_table_privilege('authenticated','public.manual_dispatch_overrides','DELETE')"),'f|f|f');
 });

});
