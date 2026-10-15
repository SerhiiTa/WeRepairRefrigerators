-- Disposable test double boundaries: auth/ensure/conversion only.
-- The production wrapper itself is loaded verbatim from migration 0146.
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
create table public.communication_conversations(id uuid primary key,company_id uuid,customer_id uuid,intake_request_id uuid,service_request_id uuid);
create table public.customers(id uuid primary key,company_id uuid);
create table public.technician_profiles(id uuid primary key,company_id uuid,archived_at timestamptz);
create table public.service_requests(id uuid primary key default gen_random_uuid(),company_id uuid,customer_id uuid,sync_updates integer default 0);
create table public.intake_requests(id uuid primary key,company_id uuid,linked_customer_id uuid,linked_service_request_id uuid,linked_appointment_id uuid,status text default 'new',updated_by uuid,source_type text default 'website_form',
customer_first_name text,customer_last_name text,customer_name text,customer_phone text,customer_email text,service_address text,unit text,city text,state text,zip_code text,appliance_type text,brand text,model_number text,serial_number text,problem_description text,appointment_date date,window_start_time time,window_end_time time,assigned_technician_id uuid);
create table public.communication_leads(id uuid primary key,company_id uuid,conversation_id uuid,intake_request_id uuid,customer_id uuid,service_request_id uuid,status text default 'open',updated_by uuid);
create function public.user_can_access_company(uuid) returns boolean language sql as $$select $1='00000000-0000-4000-8000-000000000010'::uuid$$;
create function public.can_access_communication_conversation(uuid) returns boolean language sql as $$select exists(select 1 from communication_conversations where id=$1 and user_can_access_company(company_id))$$;
create function public.can_access_intake_request(uuid) returns boolean language sql as $$select exists(select 1 from intake_requests where id=$1 and user_can_access_company(company_id))$$;
-- Model the dangerous synchronization side effect without touching real Jobs.
create function public.fixture_sync_job() returns trigger language plpgsql as $$begin
 update service_requests set sync_updates=sync_updates+1 where id=new.linked_service_request_id;
 return new;
end;$$;
create trigger intake_requests_sync_converted_service_request_context after update on intake_requests
for each row when (new.linked_service_request_id is not null) execute function public.fixture_sync_job();
create table fixture_ensure_calls(id uuid);
create function public.ensure_communication_job_intake_rpc(uuid) returns jsonb language plpgsql as $$
declare c communication_conversations; rid uuid;
begin
 select * into c from communication_conversations where id=$1 for update;
 insert into fixture_ensure_calls values(c.id);
 rid:=c.intake_request_id;
 update intake_requests set window_start_time=null,window_end_time=null,updated_by=auth.uid() where id=rid and source_type in ('phone','retell_ai') and (window_start_time is not null or window_end_time is not null);
 if rid is null then
 rid:=gen_random_uuid(); insert into intake_requests(id,company_id,linked_customer_id) values(rid,c.company_id,c.customer_id);
 update communication_conversations set intake_request_id=rid where id=c.id;
 end if;
 return jsonb_build_object('intake_request_id',rid);
end;$$;
create function public.convert_intake_request_rpc(uuid,boolean) returns jsonb language plpgsql as $$
declare r intake_requests; jid uuid;
begin
 select * into r from intake_requests where id=$1 for update;
 if r.linked_service_request_id is not null then return jsonb_build_object('service_request_id',r.linked_service_request_id,'already_converted',true);end if;
 if r.problem_description='FAIL' then raise exception 'fixture conversion failure'; end if;
 if r.problem_description='SLOW' then perform pg_sleep(0.3);end if;
 insert into service_requests(company_id,customer_id) values(r.company_id,r.linked_customer_id) returning id into jid;
 update intake_requests set linked_service_request_id=jid,status='converted',linked_appointment_id=case when appointment_date is null then null else gen_random_uuid() end where id=r.id;
 return jsonb_build_object('service_request_id',jid,'intake_request_id',r.id,'already_converted',false);
end;$$;
