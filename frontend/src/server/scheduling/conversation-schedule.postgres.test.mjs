// Run the existing converted-retry/concurrency suite with the new wrapper,
// keeping its explicit auth/ensure/conversion test-double boundaries.
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('new wrapper retains existing conversion integration contracts',{skip:process.env.RUN_SCHEDULE_PG!=='1'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'schedule-wrapper-'));
 try {
 const migration=readFileSync(new URL('../../../../supabase/migrations/0152_independent_manual_dispatch_apply_ready.sql',import.meta.url),'utf8');
 const start=migration.indexOf('create or replace function public.save_conversation_job_rpc');
 const wrapper=migration.slice(start,migration.indexOf('$$;',start)+3);
 const file=join(dir,'wrapper.sql');writeFileSync(file,wrapper);
 const fixture=readFileSync(new URL('../communications/conversation-job-contract.fixture.sql',import.meta.url),'utf8').replace('create role anon; create role authenticated;','');
 const fixtureFile=join(dir,'fixture.sql');writeFileSync(fixtureFile,fixture);
 let suite=readFileSync(new URL('../communications/conversation-job-contract.postgres.test.mjs',import.meta.url),'utf8');
 suite=suite.replace('communications-save-contract-qa','schedule-02-disposable').replace('"psql","-U","postgres"','"psql","-d","schedule_wrapper","-U","postgres"');
 suite=suite.replace("new URL('./conversation-job-contract.fixture.sql',import.meta.url)",JSON.stringify(fixtureFile));
 suite=suite.replace("new URL('../../../../supabase/migrations/0146_communication_job_save_contract_apply_ready.sql',import.meta.url)",JSON.stringify(file));
 // Additional Schedule Now case with optional technician.
 suite=suite.replace(" await t.test('canonical IDs", " await t.test('Now without technician preserves complete window',()=>{reset();sql(call({schedule_mode:'now',assigned_technician_id:null}));assert.equal(sql('select linked_appointment_id is not null,assigned_technician_id is null from intake_requests'),'t|t');});\n await t.test('canonical IDs");
 const script=join(dir,'suite.mjs');writeFileSync(script,suite);
 execFileSync('docker',['exec','schedule-02-disposable','dropdb','-U','postgres','--if-exists','schedule_wrapper']);
 execFileSync('docker',['exec','schedule-02-disposable','createdb','-U','postgres','schedule_wrapper']);
 const env={...process.env,RUN_DISPOSABLE_CONVERSATION_PG:'1'};delete env.NODE_TEST_CONTEXT;
 process.stdout.write(execFileSync(process.execPath,['--test',script],{env,encoding:'utf8'}));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
