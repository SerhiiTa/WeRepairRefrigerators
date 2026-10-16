// Run explicitly against a disposable network-isolated container; never Local QA/Production.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const migration=readFileSync('supabase/migrations/0153_invoice_email_safe_send_apply_ready.sql','utf8');
const old=readFileSync('supabase/migrations/0125_invoice_delivery_public_payment_apply_ready.sql','utf8');
const schema=old.slice(old.indexOf('create table'),old.indexOf('create or replace function public.send_service_request_invoice_to_customer_rpc'));
const oldRpc=old.slice(old.indexOf('create or replace function public.send_service_request_invoice_to_customer_rpc'),old.indexOf('create or replace function public.get_public_invoice_by_token_rpc'));
const fixture=`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.actor',true),'')::uuid$$;
create table companies(id uuid primary key); create table profiles(id uuid primary key); create table communication_messages(id uuid primary key);
create table service_requests(id uuid primary key,company_id uuid,customer_name text,status text);
create table service_request_invoices(id uuid primary key,service_request_id uuid,source_system text,invoice_status text,invoice_number text,sent_at timestamptz);
create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
create function can_view_service_request(uuid) returns boolean language sql as $$select true$$;
create function can_record_service_request_payment(uuid) returns boolean language sql as $$select auth.uid()='11111111-1111-4111-8111-111111111111'::uuid$$;
create function estimate_approval_token_hash(text) returns text language sql as $$select md5($1)||md5($1)$$;
${schema}
${oldRpc}
${migration}
begin;
insert into companies values('22222222-2222-4222-8222-222222222222');
insert into profiles values('11111111-1111-4111-8111-111111111111');
insert into service_requests values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Synthetic QA','new');
insert into service_request_invoices values('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','native','draft','QA-1',null);
select set_config('qa.actor','11111111-1111-4111-8111-111111111111',true);
do $$declare prior uuid; r jsonb; r2 jsonb; d uuid; begin
-- Reproduce the exact existing RPC behavior with synthetic data.
r:=send_service_request_invoice_to_customer_rpc('44444444-4444-4444-8444-444444444444');
if (select invoice_status from service_request_invoices)<>'sent' then raise exception 'Legacy reproduction failed';end if;
prior:=(r->>'invoice_token_id')::uuid;
update service_request_invoices set invoice_status='draft',sent_at=null;
r:=reserve_invoice_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-001',repeat('a',64));d:=(r->>'delivery_id')::uuid;
if not (r->>'claimed')::boolean then raise exception 'Claim failed';end if;
if (select invoice_status from service_request_invoices)<>'draft' then raise exception 'Premature sent';end if;
if (select token_revoked_at from service_request_invoice_delivery_tokens where id=prior) is not null then raise exception 'Prior link revoked';end if;
r2:=reserve_invoice_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-001',repeat('a',64));
if (r2->>'claimed')::boolean or (select count(*) from service_request_invoice_deliveries)<>1 then raise exception 'Duplicate reservation';end if;
begin perform reserve_invoice_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-002',repeat('a',64));raise exception 'New key bypass';exception when sqlstate '55000' then null;end;
update service_request_invoice_deliveries set provider_status='sending' where id=d;
perform finalize_invoice_email_delivery_rpc(d,'failed');
if (select invoice_status from service_request_invoices)<>'draft' then raise exception 'Failure marked sent';end if;
if (select token_revoked_at from service_request_invoice_delivery_tokens where id=prior) is not null then raise exception 'Failure revoked prior link';end if;
r:=reserve_invoice_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-003',repeat('a',64));d:=(r->>'delivery_id')::uuid;
update service_request_invoice_deliveries set provider_status='sending' where id=d;
perform finalize_invoice_email_delivery_rpc(d,'accepted','synthetic-provider-id');
if (select invoice_status from service_request_invoices)<>'sent' then raise exception 'Accepted not sent';end if;
perform finalize_invoice_email_delivery_rpc(d,'failed');
if (select delivery_status from service_request_invoice_deliveries where id=d)<>'sent' then raise exception 'Finalizer not idempotent';end if;
perform set_config('qa.actor','55555555-5555-4555-8555-555555555555',true);
begin perform reserve_invoice_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-004',repeat('a',64));raise exception 'Authorization bypass';exception when insufficient_privilege then null;end;
if has_function_privilege('authenticated','finalize_invoice_email_delivery_rpc(uuid,text,text)','EXECUTE') then raise exception 'Unsafe finalizer grant';end if;
if has_function_privilege('anon','reserve_invoice_email_delivery_rpc(uuid,text,text,text)','EXECUTE') then raise exception 'Unsafe reservation grant';end if;
raise notice 'PASS: legacy reproduction, reservation, draft preservation, prior links, dedupe, new-key block, rejection, acceptance, finalizer replay, authorization, grants';
end$$;
rollback;
do $$begin if exists(select 1 from service_request_invoices) then raise exception 'Fixture leak';end if;end$$;
`;
process.stdout.write(execFileSync('docker',['exec','-i','homefix-email-03-1-test','psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:fixture,encoding:'utf8'}));
