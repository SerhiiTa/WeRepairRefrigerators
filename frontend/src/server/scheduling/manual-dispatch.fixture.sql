do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('qa.actor',true),'')::uuid $$;
create table companies(id uuid primary key,status text default 'active',archived_at timestamptz);
create table profiles(id uuid primary key,status text default 'active');
create table company_members(company_id uuid,profile_id uuid,member_role text,member_status text default 'active',archived_at timestamptz);
create table technician_profiles(id uuid primary key,company_id uuid,profile_id uuid,archived_at timestamptz,suspended_at timestamptz,rejected_at timestamptz,display_name text,business_name text,avatar_color text,technician_status text default 'pending',marketplace_enabled boolean default false,service_zip_codes text[] default '{}');
create table service_requests(id uuid primary key,company_id uuid,assigned_technician_profile_id uuid,appointment_id uuid,selected_technician_slug text,selected_technician_business_name text,scheduled_date date,scheduled_window_start_time time,scheduled_window_end_time time,status text default 'new',updated_at timestamptz);
create table appointments(id uuid primary key default gen_random_uuid(),company_id uuid,service_request_id uuid references service_requests(id),technician_profile_id uuid not null references technician_profiles(id),appointment_date date not null,window_start_time time not null,window_end_time time not null,status text default 'scheduled',source text,created_by uuid,updated_at timestamptz,check(window_start_time<window_end_time));
create unique index appointments_one_active_per_request_idx on appointments(service_request_id) where status in ('scheduled','confirmed','en_route');
create function user_can_access_company(uuid) returns boolean language sql as $$select exists(select 1 from company_members where company_id=$1 and profile_id=auth.uid() and member_status='active')$$;
create function can_view_service_request(uuid) returns boolean language sql as $$select exists(select 1 from service_requests where id=$1 and user_can_access_company(company_id))$$;

create table public.communication_conversations(id uuid primary key,company_id uuid,customer_id uuid,intake_request_id uuid,service_request_id uuid);

create table public.customers(id uuid primary key,company_id uuid);

create table public.intake_requests(id uuid primary key,company_id uuid,linked_customer_id uuid,linked_service_request_id uuid,linked_appointment_id uuid,status text default 'new',updated_by uuid,source_type text default 'website_form',
customer_first_name text,customer_last_name text,customer_name text,customer_phone text,customer_email text,service_address text,unit text,city text,state text,zip_code text,appliance_type text,brand text,model_number text,serial_number text,problem_description text,appointment_date date,window_start_time time,window_end_time time,assigned_technician_id uuid);

create table public.communication_leads(id uuid primary key,company_id uuid,conversation_id uuid,intake_request_id uuid,customer_id uuid,service_request_id uuid,status text default 'open',updated_by uuid);
