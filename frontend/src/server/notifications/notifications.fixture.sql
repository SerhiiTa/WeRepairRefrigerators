-- Disposable schema only. Never run against local QA or Production.
create role anon;create role authenticated;create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;
create table companies(id uuid primary key);
create table profiles(id uuid primary key,status text default 'active');
create table company_members(company_id uuid,profile_id uuid,member_role text,member_status text default 'active');
create table technician_profiles(id uuid primary key,company_id uuid,profile_id uuid,archived_at timestamptz);
create table service_requests(id uuid primary key,company_id uuid,assigned_technician_profile_id uuid,updated_at timestamptz default clock_timestamp());
create table communication_conversations(id uuid primary key,company_id uuid,primary_source_type text default 'phone',call_status text,call_started_at timestamptz default clock_timestamp(),ai_state text default 'idle',updated_at timestamptz default clock_timestamp());
create table communication_messages(id uuid primary key,conversation_id uuid,source_type text,direction text,sender_role text);
create table communication_timeline_events(id uuid primary key,conversation_id uuid,event_type text,intake_request_id uuid);
create table appointments(id uuid primary key,company_id uuid,service_request_id uuid,technician_profile_id uuid,appointment_date date,window_start_time time,window_end_time time,status text,updated_at timestamptz default clock_timestamp());
create table service_request_estimates(id uuid primary key,service_request_id uuid,estimate_status text,source_system text default 'native');
create table service_request_payments(id uuid primary key,company_id uuid,service_request_id uuid,payment_status text,source_system text default 'native');
create table service_request_payment_refunds(id uuid primary key,company_id uuid,service_request_id uuid,refund_status text);
