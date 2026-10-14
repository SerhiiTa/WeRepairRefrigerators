-- Run via finance_v2_refund_events_concurrency_test.py in disposable PostgreSQL ONLY.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() <> 'refund112' THEN RAISE EXCEPTION 'Disposable refund112 database required'; END IF; END $$;
begin;
set local app.trusted_onboarding_mutation = 'on';
create schema refund_test;
create table refund_test.ids (name text primary key, id uuid not null);
insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','refund112@example.invalid');
insert into public.profiles(id,email,role,status) values('11111111-1111-4111-8111-111111111111','refund112@example.invalid','company_owner','active') on conflict(id) do update set role='company_owner',status='active';
insert into public.companies(id,owner_profile_id,name,slug,status,reviewed_by_profile_id,reviewed_at) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Refund test','refund112-test','active','11111111-1111-4111-8111-111111111111',now());
insert into public.company_members(company_id,profile_id,member_role,member_status,joined_at) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','owner','active',now());
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
create function refund_test.payment_fixture(label text, kind text default 'stripe', principal numeric default 100, shared_job uuid default null) returns uuid language plpgsql as $$
declare j uuid:=coalesce(shared_job,gen_random_uuid()); e uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
begin
 if shared_job is null then
 insert into public.service_requests(id,company_id,city,zip,appliance_type,issue_description)
 values(j,'22222222-2222-4222-8222-222222222222','Houston','77001','refrigerator','Refund fixture');
 end if;
 insert into public.service_request_estimates(id,service_request_id,estimate_number,subtotal,total,estimate_status,logical_estimate_id,revision_number)
 values(e,j,'TEST-'||e,principal,principal,'approved',e,1);
 insert into public.service_request_payments(id,company_id,service_request_id,payment_status,amount,tip_amount,payment_method,provider,provider_payment_id,reference_code)
 values(p,'22222222-2222-4222-8222-222222222222',j,'succeeded',principal,0,case when kind='stripe' then 'card' else 'cash' end,case when kind='stripe' then 'stripe' end,case when kind='stripe' then 'pi_'||p end,'reference-'||p);
 insert into public.service_request_payment_allocations(company_id,service_request_id,payment_id,estimate_id,allocation_amount)
 values('22222222-2222-4222-8222-222222222222',j,p,e,principal);
 insert into refund_test.ids values(label,p),(label||'_job',j);
 return p;
end $$;
create function refund_test.reserve(label text, amount numeric, key text, kind text default 'stripe') returns uuid language plpgsql as $$
declare result jsonb;
begin
 result:=public.reserve_service_request_payment_refund_rpc((select id from refund_test.ids where name=label||'_job'),(select id from refund_test.ids where name=label),kind,amount,'Customer requested refund',key,null,null);
 return (result->>'refund_id')::uuid;
end $$;
DO $$
declare r uuid; p uuid; kind text; historical_job uuid;
begin
 for i in 1..8 loop
  kind:=case when i%2=0 then 'manual' else 'stripe' end;
  p:=refund_test.payment_fixture('history_'||i,kind,100,historical_job);
  select id into historical_job from refund_test.ids where name='history_'||i||'_job';
  r:=refund_test.reserve('history_'||i,case when i<=4 then 100 else 25 end,'historical-key-'||i,kind);
  if kind='stripe' then
   perform public.confirm_stripe_service_request_payment_refund_rpc(r,'re_'||r,'evt_'||r);
  else perform public.confirm_service_request_payment_refund_rpc(r); end if;
 end loop;
 perform refund_test.payment_fixture('concurrent');
 r:=refund_test.reserve('concurrent',30,'concurrent-first');
 insert into refund_test.ids values('concurrent_refund',r);
 perform refund_test.payment_fixture('manual','manual');
 perform refund_test.payment_fixture('reservation_race');
 perform refund_test.payment_fixture('manual_race','manual');
 r:=refund_test.reserve('manual_race',30,'manual-race-first','manual');
 insert into refund_test.ids values('manual_race_refund',r);
 perform refund_test.payment_fixture('duplicate');
 r:=refund_test.reserve('duplicate',40,'duplicate-first');
 insert into refund_test.ids values('duplicate_refund',r);
end $$;
-- Full financial snapshots: applying and rerunning 0145 must leave these untouched.
create table refund_test.financial_before as
select 'payments' as source, to_jsonb(p) as row from public.service_request_payments p
union all select 'refunds',to_jsonb(r) from public.service_request_payment_refunds r
union all select 'allocations',to_jsonb(a) from public.service_request_payment_allocations a
union all select 'refund_allocations',to_jsonb(a) from public.service_request_payment_refund_allocations a
union all select 'invoices',to_jsonb(i) from public.service_request_invoices i
union all select 'estimates',to_jsonb(e) from public.service_request_estimates e;

commit;

-- APPLY MIGRATION AND CHECK HISTORY
-- No mutation of existing finance records, including eight historical successes.
DO $$
declare current_finance jsonb; before_finance jsonb;
begin
 select jsonb_agg(to_jsonb(t) order by source,row::text) into before_finance from refund_test.financial_before t;
 select jsonb_agg(to_jsonb(t) order by source,row::text) into current_finance from (
 select 'payments' as source,to_jsonb(p) as row from service_request_payments p
 union all select 'refunds',to_jsonb(r) from service_request_payment_refunds r
 union all select 'allocations',to_jsonb(a) from service_request_payment_allocations a
 union all select 'refund_allocations',to_jsonb(a) from service_request_payment_refund_allocations a
 union all select 'invoices',to_jsonb(i) from service_request_invoices i
 union all select 'estimates',to_jsonb(e) from service_request_estimates e) t;
 assert before_finance=current_finance, 'migration mutated financial rows';
 assert (select count(*) from communication_timeline_events where refund_id is not null)=8,'historical Communications count';
 assert (select count(*) from service_request_notes where refund_id is not null)=8,'historical Timeline count';
 assert not exists(select 1 from service_request_payment_refunds r join communication_timeline_events e on e.refund_id=r.id where e.event_time<>r.created_at or e.body not like '%Refund recorded at (exact confirmation time unavailable):%' or e.body like '%. Confirmed at:%'), 'historical timestamp claim';
 assert (select count(*) from communication_timeline_events where refund_id is not null and body like '%Full refund.%')=4,'historical full classification';
 assert (select count(*) from communication_timeline_events where refund_id is not null and body like '%Partial refund.%')=4,'historical partial classification';
 raise notice 'PASS: eight historical successes backfilled, exact financial snapshots unchanged';
end $$;

create table refund_test.events_before_repeat as select to_jsonb(e) as row from public.communication_timeline_events e;
create table refund_test.notes_before_repeat as select to_jsonb(n) as row from public.service_request_notes n;

-- REAPPLY MIGRATION
-- No mutation of existing finance records, including eight historical successes.
DO $$
declare current_finance jsonb; before_finance jsonb;
begin
 select jsonb_agg(to_jsonb(t) order by source,row::text) into before_finance from refund_test.financial_before t;
 select jsonb_agg(to_jsonb(t) order by source,row::text) into current_finance from (
 select 'payments' as source,to_jsonb(p) as row from service_request_payments p
 union all select 'refunds',to_jsonb(r) from service_request_payment_refunds r
 union all select 'allocations',to_jsonb(a) from service_request_payment_allocations a
 union all select 'refund_allocations',to_jsonb(a) from service_request_payment_refund_allocations a
 union all select 'invoices',to_jsonb(i) from service_request_invoices i
 union all select 'estimates',to_jsonb(e) from service_request_estimates e) t;
 assert before_finance=current_finance, 'migration mutated financial rows';
 assert (select count(*) from communication_timeline_events where refund_id is not null)=8,'historical Communications count';
 assert (select count(*) from service_request_notes where refund_id is not null)=8,'historical Timeline count';
 assert not exists(select 1 from service_request_payment_refunds r join communication_timeline_events e on e.refund_id=r.id where e.event_time<>r.created_at or e.body not like '%Refund recorded at (exact confirmation time unavailable):%' or e.body like '%. Confirmed at:%'), 'historical timestamp claim';
 assert (select count(*) from communication_timeline_events where refund_id is not null and body like '%Full refund.%')=4,'historical full classification';
 assert (select count(*) from communication_timeline_events where refund_id is not null and body like '%Partial refund.%')=4,'historical partial classification';
 raise notice 'PASS: eight historical successes backfilled, exact financial snapshots unchanged';
end $$;

DO $$ begin
 assert not exists((select row from refund_test.events_before_repeat except select to_jsonb(e) from public.communication_timeline_events e) union all (select to_jsonb(e) from public.communication_timeline_events e except select row from refund_test.events_before_repeat)), 'repeated backfill changed events';
 assert not exists((select row from refund_test.notes_before_repeat except select to_jsonb(n) from public.service_request_notes n) union all (select to_jsonb(n) from public.service_request_notes n except select row from refund_test.notes_before_repeat)), 'repeated backfill changed notes';
 raise notice 'PASS: repeated migration/backfill preserves event IDs, bodies and timestamps';
end $$;

-- CONCURRENCY BARRIER
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
declare r uuid; result jsonb; saved_body text; saved_time timestamptz;
begin
 -- Confirm a second partial from the concurrent reservation; original is already succeeded.
 select id into r from service_request_payment_refunds where idempotency_key='concurrent-second';
 perform confirm_stripe_service_request_payment_refund_rpc(r,'re_second','evt_second');
 assert (select count(*) from communication_timeline_events where service_request_id=(select id from refund_test.ids where name='concurrent_job'))=2,'multiple partials';
 assert (select sum(refund_amount) from service_request_payment_refunds where payment_id=(select id from refund_test.ids where name='concurrent') and refund_status='succeeded')=50,'confirmed refund principal';
 begin
  perform refund_test.reserve('concurrent',51,'over-refund-check');
  raise exception 'over-refund accepted';
 exception when check_violation then null; end;
 result:=record_manual_service_request_payment_refund_rpc((select id from refund_test.ids where name='manual_job'),(select id from refund_test.ids where name='manual'),100,'Full cash refund','manual-full-key',true);
 r:=(result->>'refund_id')::uuid;
 perform confirm_service_request_payment_refund_rpc(r);
 assert (select body like 'Manual%Full refund.%cash%reference-%Confirmed at:%' from communication_timeline_events where refund_id=r),'manual metadata';
 select body,event_time into saved_body,saved_time from communication_timeline_events where refund_id=r;
 -- Repair a missing counterpart using its original exact confirmation timestamp.
 delete from service_request_notes where refund_id=r;
 perform ensure_confirmed_refund_events(r);
 assert (select body=saved_body and created_at=saved_time from service_request_notes where refund_id=r),'counterpart repair timestamp';
 perform refund_test.payment_fixture('non_success','manual');
 r:=refund_test.reserve('non_success',10,'non-success-pending','manual');
 r:=refund_test.reserve('non_success',10,'non-success-failed','manual');
 perform record_failed_service_request_payment_refund_rpc(r,'failed','Test failure');
 r:=refund_test.reserve('non_success',10,'non-success-canceled','manual');
 perform record_failed_service_request_payment_refund_rpc(r,'canceled','Test cancellation');
 assert not exists(select 1 from communication_timeline_events where service_request_id=(select id from refund_test.ids where name='non_success_job')),'non-success event';
 -- Foreign tenant cannot reserve or confirm. The real authorization function runs.
 perform set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
 begin
  perform refund_test.reserve('concurrent',1,'foreign-tenant-key');
  raise exception 'foreign tenant reservation accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform confirm_service_request_payment_refund_rpc(r);
  raise exception 'foreign tenant confirmation accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 -- Every successful refund has one canonical event and note; each stays tenant/Job/payment scoped.
 assert not exists(select 1 from service_request_payment_refunds r where r.refund_status='succeeded' and ((select count(*) from communication_timeline_events e where e.refund_id=r.id)<>1 or (select count(*) from service_request_notes n where n.refund_id=r.id)<>1)), 'exactly-once invariant';
 assert not exists(select 1 from service_request_payment_refunds r join communication_timeline_events e on e.refund_id=r.id join communication_conversations c on c.id=e.conversation_id join service_request_notes n on n.refund_id=r.id where c.company_id<>r.company_id or c.service_request_id<>r.service_request_id or e.service_request_id<>r.service_request_id or n.service_request_id<>r.service_request_id or e.payment_reference<>r.payment_id::text or e.body<>n.body or e.event_time<>n.created_at),'scope/body/time mismatch';
 -- Principal and original allocations are unchanged by confirmation and event recording.
 assert not exists(select 1 from refund_test.financial_before b join service_request_payments p on p.id=(b.row->>'id')::uuid where b.source='payments' and (to_jsonb(p)-array['payment_status','payment_metadata','updated_at'])<>(b.row-array['payment_status','payment_metadata','updated_at'])),'original payment rewritten';
 assert not exists(select 1 from refund_test.financial_before b join service_request_payment_allocations a on a.id=(b.row->>'id')::uuid where b.source='allocations' and b.row<>to_jsonb(a)),'original allocation changed';
 assert active_service_request_net_paid_credit((select id from refund_test.ids where name='concurrent_job'))=50,'net paid regression';
 assert not has_function_privilege('authenticated','public.ensure_confirmed_refund_events(uuid,timestamptz)','EXECUTE'),'private helper exposed';
 assert not has_function_privilege('authenticated','public.confirm_stripe_service_request_payment_refund_rpc(uuid,text,text,jsonb)','EXECUTE'),'Stripe RPC exposed';
 assert has_function_privilege('service_role','public.confirm_stripe_service_request_payment_refund_rpc(uuid,text,text,jsonb)','EXECUTE'),'Stripe RPC denied';
 raise notice 'PASS: manual, multiple partials, over-refund rejection, non-success, tenant authorization, exactly-once and ledger invariants';
end $$;
-- Reconstitute original destination read grants omitted by the schema-only test dump.
grant usage on schema public, auth to authenticated;
grant select on public.service_request_notes,public.communication_timeline_events to authenticated;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
set role authenticated;
DO $$ begin
 assert (select count(*) from public.service_request_notes)=0,'foreign Timeline read';
 assert (select count(*) from public.communication_timeline_events)=0,'foreign Communications read';
 raise notice 'PASS: real destination RLS rejects foreign-tenant reads';
end $$;
reset role;
