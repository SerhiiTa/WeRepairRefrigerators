import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const read=p=>readFileSync('supabase/migrations/'+p,'utf8');
const base=read('0119_estimate_customer_revision_approval_apply_ready.sql');
const newer=read('0127_finance_v2_estimate_invoice_revision_lifecycle_apply_ready.sql');
const ddl=base.slice(base.indexOf('create table'),base.indexOf('create or replace function public.create_service_request_estimate_revision_snapshot'));
const approval=newer.slice(newer.indexOf('create or replace function public.respond_to_public_estimate_rpc'),newer.indexOf('create or replace function public.create_invoice_from_estimate_rpc'));
const sql=`
do $$begin create role anon;exception when duplicate_object then null;end$$;do $$begin create role authenticated;exception when duplicate_object then null;end$$;do $$begin create role service_role;exception when duplicate_object then null;end$$;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.actor',true),'')::uuid$$;
create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
create function can_view_service_request(uuid) returns boolean language sql as $$select auth.uid()='11111111-1111-4111-8111-111111111111'::uuid$$;
create function estimate_approval_token_hash(text) returns text language sql as $$select md5($1)||md5($1)$$;
create table companies(id uuid primary key);create table profiles(id uuid primary key);create table communication_messages(id uuid primary key);create table pricing_catalog_items(id uuid primary key);
create table service_requests(id uuid primary key,company_id uuid,customer_id uuid,customer_name text,status text,job_number text,appliance_type text,appliance_brand text,appliance_model text,issue_description text,city text,state text,zip_code text,selected_technician_business_name text,updated_at timestamptz);
create table service_request_estimates(id uuid primary key,service_request_id uuid,estimate_status text,estimate_number text,subtotal numeric,discount_type text,discount_value numeric,discount_amount numeric,tax_rate numeric,taxable_amount numeric,non_taxable_amount numeric,tax numeric,total numeric,warranty_text text,disclaimer_text text,customer_preview_notes text,public_approval_token_hash text,sent_at timestamptz,updated_at timestamptz,logical_estimate_id uuid,revision_status text,superseded_by_estimate_id uuid,superseded_at timestamptz,customer_responded_at timestamptz,approval_source text,approval_method text,approved_revision_at timestamptz,approved_revision_total numeric,revision_number integer);
create table service_request_estimate_items(id uuid primary key,estimate_id uuid,pricing_catalog_item_id uuid,item_title text,quantity integer,unit_price numeric,line_total numeric,notes text,technician_cost numeric,internal_cost numeric,taxable boolean,warranty_text text,created_at timestamptz);
create table service_request_notes(service_request_id uuid,created_by_profile_id uuid,note_type text,body text);
create table service_request_invoices(estimate_id uuid,invoice_status text);
create table service_request_invoice_estimates(estimate_id uuid,membership_status text);
create table service_request_estimate_lifecycle_events(estimate_id uuid,event_type text,from_status text,to_status text,created_by_profile_id uuid,event_metadata jsonb);
create table communication_conversations(id uuid,service_request_id uuid,company_id uuid,customer_id uuid,updated_at timestamptz);
create table communication_timeline_events(conversation_id uuid,event_type text,title text,body text,event_time timestamptz,service_request_id uuid,estimate_id uuid);
${ddl}
${read('0154_estimate_email_safe_send_apply_ready.sql')}
${approval}
begin;
insert into companies values('22222222-2222-4222-8222-222222222222');insert into profiles values('11111111-1111-4111-8111-111111111111');
insert into service_requests(id,company_id,status) values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','new');
insert into service_request_estimates(id,service_request_id,estimate_status,estimate_number,subtotal,total,tax,revision_number) values('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','draft','QA-1',50,50,0,1);
insert into service_request_estimate_items(id,estimate_id,item_title,quantity,unit_price,line_total) values(gen_random_uuid(),'44444444-4444-4444-8444-444444444444','Synthetic item',1,50,50);
select set_config('qa.actor','11111111-1111-4111-8111-111111111111',true);
do $$declare r jsonb;again jsonb;d uuid;token text;prior uuid;begin
 r:=reserve_estimate_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-001',repeat('a',64));d:=(r->>'delivery_id')::uuid;token:=r->>'approval_token';prior:=(r->>'revision_id')::uuid;
 if (select estimate_status from service_request_estimates)<>'draft' then raise exception 'Premature SENT';end if;
 if (select token_revoked_at from service_request_estimate_revisions where id=prior) is null then raise exception 'Pending link active';end if;
 again:=reserve_estimate_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-001',repeat('a',64));
 if (again->>'claimed')::boolean or (select count(*) from service_request_estimate_revisions)<>1 then raise exception 'Duplicate revision';end if;
 update service_request_estimate_revision_deliveries set provider_status='sending' where id=d;
 perform finalize_estimate_email_delivery_rpc(d,'accepted','synthetic-provider-1');
 if (select estimate_status from service_request_estimates)<>'sent' then raise exception 'Acceptance not SENT';end if;
 -- New attempt may prepare a revision, but must preserve the existing active link.
 r:=reserve_estimate_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-002',repeat('a',64));d:=(r->>'delivery_id')::uuid;
 if (select token_revoked_at from service_request_estimate_revisions where id=prior) is not null then raise exception 'Prior link revoked during preparation';end if;
 update service_request_estimate_revision_deliveries set provider_status='sending' where id=d;
 perform finalize_estimate_email_delivery_rpc(d,'failed');
 if (select token_revoked_at from service_request_estimate_revisions where id=prior) is not null then raise exception 'Failure revoked prior link';end if;
 -- Exercise the unchanged CURRENT public approval RPC against the emailed token.
 again:=respond_to_public_estimate_rpc(token,'approved');
 if again->>'estimate_status'<>'approved' then raise exception 'Approval failed';end if;
 -- A concurrent edit must leave the newly emailed link inactive.
 r:=reserve_estimate_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-edit',repeat('a',64));d:=(r->>'delivery_id')::uuid;
 update service_request_estimates set customer_preview_notes='Synthetic concurrent edit';
 update service_request_estimate_revision_deliveries set provider_status='sending' where id=d;
 again:=finalize_estimate_email_delivery_rpc(d,'accepted','synthetic-provider-edit');
 if (again->>'active')::boolean then raise exception 'Stale snapshot activated';end if;
 -- An uncertain provider outcome cannot be bypassed with another browser key.
 r:=reserve_estimate_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-timeout',repeat('a',64));d:=(r->>'delivery_id')::uuid;
 update service_request_estimate_revision_deliveries set provider_status='sending' where id=d;
 perform finalize_estimate_email_delivery_rpc(d,'unknown');
 begin perform reserve_estimate_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-new',repeat('a',64));raise exception 'Unknown outcome bypass';exception when sqlstate '55000' then null;end;
 perform set_config('qa.actor','55555555-5555-4555-8555-555555555555',true);
 begin perform reserve_estimate_email_delivery_rpc('44444444-4444-4444-8444-444444444444','qa@example.com','synthetic-key-003',repeat('a',64));raise exception 'Unauthorized';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','finalize_estimate_email_delivery_rpc(uuid,text,text)','EXECUTE') then raise exception 'Unsafe grant';end if;
 raise notice 'PASS: draft preservation, inactive pending link, one revision per key, acceptance, previous link preservation, rejection, existing customer approval, authorization, grants';
end$$;
rollback;
do $$begin if exists(select 1 from service_request_estimates) then raise exception 'Fixture leak';end if;end$$;
`;
process.stdout.write(execFileSync('docker',['exec','-i','homefix-email-03-2-test','psql','-U','postgres','-d',process.env.EMAIL_QA_TEST_DATABASE??'postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'}));
