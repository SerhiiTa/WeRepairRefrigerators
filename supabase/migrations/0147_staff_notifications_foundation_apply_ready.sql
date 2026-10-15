-- NOTIFICATIONS-01. Forward-only preparation; no historical backfill or external sends.
begin;
create table public.staff_notifications (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
 event_type text not null check(event_type in ('missed_call','inbound_sms','website_request','customer_reply','ai_needs_attention','technician_assigned','appointment_created','appointment_changed','estimate_approved','payment_confirmed','refund_confirmed')),
 source_type text not null, source_id uuid not null,
 conversation_id uuid references public.communication_conversations(id) on delete set null,
 service_request_id uuid references public.service_requests(id) on delete set null,
 title text not null, summary text not null default '', priority text not null default 'normal' check(priority in ('normal','high')),
 created_at timestamptz not null default clock_timestamp(), read_at timestamptz,
 in_app_enabled boolean not null default true, dedupe_key text not null,
 unique(company_id,recipient_profile_id,dedupe_key)
);
create index staff_notifications_inbox on public.staff_notifications(company_id,recipient_profile_id,created_at desc);
create table public.staff_notification_preferences (
 company_id uuid not null references public.companies(id) on delete cascade, recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
 event_type text not null check(event_type in ('missed_call','inbound_sms','website_request','customer_reply','ai_needs_attention','technician_assigned','appointment_created','appointment_changed','estimate_approved','payment_confirmed','refund_confirmed')),
 in_app_enabled boolean not null default true, push_enabled boolean not null default false,
 telegram_enabled boolean not null default false, sms_enabled boolean not null default false,
 quiet_start time, quiet_end time, timezone text not null default 'UTC',
 high_priority_bypass boolean not null default false,
 primary key(company_id,recipient_profile_id,event_type),
 check((quiet_start is null)=(quiet_end is null))
);
-- Membership checks use the existing authoritative relationship, not Customer identity.
create function public.can_read_staff_notifications(p_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.company_members m join public.profiles p on p.id=m.profile_id
 where m.company_id=p_company and m.profile_id=auth.uid() and m.member_status='active' and p.status='active');
$$;
alter table public.staff_notifications enable row level security;
alter table public.staff_notification_preferences enable row level security;
create policy staff_notifications_read on public.staff_notifications for select to authenticated
 using(recipient_profile_id=auth.uid() and public.can_read_staff_notifications(company_id));
create policy staff_preferences_own on public.staff_notification_preferences for all to authenticated
 using(recipient_profile_id=auth.uid() and public.can_read_staff_notifications(company_id))
 with check(recipient_profile_id=auth.uid() and public.can_read_staff_notifications(company_id));
revoke all on public.staff_notifications,public.staff_notification_preferences from public,anon,authenticated;
grant select on public.staff_notifications to authenticated;
grant select,insert,update,delete on public.staff_notification_preferences to authenticated;

-- Trigger-only emitter. Never callable by a browser/service-role RPC.
create function public.emit_staff_notification(p_company uuid,p_event text,p_source text,p_source_id uuid,p_conversation uuid,p_job uuid,p_key text,p_title text,p_technician uuid default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_company is null then return; end if;
 if p_conversation is not null and not exists(select 1 from communication_conversations where id=p_conversation and company_id=p_company) then raise exception 'Notification company mismatch'; end if;
 if p_job is not null and not exists(select 1 from service_requests where id=p_job and company_id=p_company) then raise exception 'Notification Job mismatch'; end if;
 insert into staff_notifications(company_id,recipient_profile_id,event_type,source_type,source_id,conversation_id,service_request_id,title,priority,dedupe_key,in_app_enabled)
 select p_company,m.profile_id,p_event,p_source,p_source_id,p_conversation,p_job,p_title,
 case when p_event in ('missed_call','ai_needs_attention') then 'high' else 'normal' end,p_key,coalesce(pref.in_app_enabled,true)
 from company_members m join profiles p on p.id=m.profile_id
 left join staff_notification_preferences pref on pref.company_id=m.company_id and pref.recipient_profile_id=m.profile_id and pref.event_type=p_event
 where m.company_id=p_company and m.member_status='active' and p.status='active' and (
 (p_technician is not null and exists(select 1 from technician_profiles t where t.id=p_technician and t.company_id=p_company and t.profile_id=m.profile_id and t.archived_at is null))
 or (p_technician is null and p_event in ('payment_confirmed','refund_confirmed') and m.member_role='owner')
 or (p_technician is null and p_event not in ('payment_confirmed','refund_confirmed') and (m.member_role='dispatcher' or (m.member_role='owner' and not exists(select 1 from company_members dm join profiles dp on dp.id=dm.profile_id where dm.company_id=p_company and dm.member_status='active' and dm.member_role='dispatcher' and dp.status='active')))))
 on conflict(company_id,recipient_profile_id,dedupe_key) do nothing;
end;$$;
revoke all on function public.emit_staff_notification(uuid,text,text,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;

create function public.notify_persisted_communication() returns trigger language plpgsql security definer set search_path=public as $$
declare c communication_conversations; kind text;
begin
 if tg_table_name='communication_messages' then
  if new.direction<>'inbound' or new.sender_role<>'customer' then return new; end if;
  if new.source_type not in ('sms','email','facebook_messenger','whatsapp','google_business_messages') then return new; end if;
  select * into c from communication_conversations where id=new.conversation_id;
  kind:=case when new.source_type='sms' then 'inbound_sms' else 'customer_reply' end;
  perform emit_staff_notification(c.company_id,kind,new.source_type,new.id,c.id,null,'message:'||new.id,'New customer message');
 elsif tg_table_name='communication_timeline_events' then
  if new.event_type<>'website_request' then return new; end if;
  select * into c from communication_conversations where id=new.conversation_id;
  perform emit_staff_notification(c.company_id,'website_request','website_form',new.id,c.id,null,'website:'||coalesce(new.intake_request_id,new.id),'New website request');
 else
  c:=new;
  if new.call_status='missed' and (tg_op='INSERT' or old.call_status is distinct from new.call_status) then
   perform emit_staff_notification(c.company_id,'missed_call','phone',c.id,c.id,null,'missed:'||c.id||':'||coalesce(c.call_started_at::text,'unknown'),'Missed call');
  end if;
  if new.ai_state='needs_approval' and (tg_op='INSERT' or old.ai_state is distinct from new.ai_state) then
   perform emit_staff_notification(c.company_id,'ai_needs_attention',c.primary_source_type,c.id,c.id,null,'ai:'||c.id||':'||c.updated_at::text,'AI needs attention');
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.notify_persisted_communication() from public,anon,authenticated,service_role;
create trigger staff_notification_message after insert on public.communication_messages for each row execute function public.notify_persisted_communication();
create trigger staff_notification_website after insert on public.communication_timeline_events for each row execute function public.notify_persisted_communication();
create trigger staff_notification_attention after insert or update of call_status,ai_state on public.communication_conversations for each row execute function public.notify_persisted_communication();

create function public.notify_persisted_appointment() returns trigger language plpgsql security definer set search_path=public as $$
declare kind text;
begin
 if tg_op='UPDATE' and (new.appointment_date,new.window_start_time,new.window_end_time,new.technician_profile_id,new.status) is not distinct from (old.appointment_date,old.window_start_time,old.window_end_time,old.technician_profile_id,old.status) then return new; end if;
 kind:=case when tg_op='INSERT' then 'appointment_created' else 'appointment_changed' end;
 perform emit_staff_notification(new.company_id,kind,'other',new.id,null,new.service_request_id,'appointment:'||new.id||':'||kind||':'||new.updated_at::text,'Appointment '||case when tg_op='INSERT' then 'created' else 'changed' end);
 perform emit_staff_notification(new.company_id,kind,'other',new.id,null,new.service_request_id,'appointment:'||new.id||':'||kind||':'||new.updated_at::text,'Appointment '||case when tg_op='INSERT' then 'created' else 'changed' end,new.technician_profile_id);
 if tg_op='UPDATE' and old.technician_profile_id is distinct from new.technician_profile_id and old.technician_profile_id is not null then
  perform emit_staff_notification(new.company_id,kind,'other',new.id,null,new.service_request_id,'appointment:'||new.id||':'||kind||':'||new.updated_at::text,'Appointment assignment changed',old.technician_profile_id);
 end if;
 return new;
end;$$;
revoke all on function public.notify_persisted_appointment() from public,anon,authenticated,service_role;
create trigger staff_notification_appointment after insert or update on public.appointments for each row execute function public.notify_persisted_appointment();

-- Observe final persisted state only; do not alter posting/approval/refund functions.
create function public.notify_persisted_job_event() returns trigger language plpgsql security definer set search_path=public as $$
declare company uuid; job uuid; kind text; technician uuid; key text;
begin
 if tg_table_name='service_requests' then
  if new.assigned_technician_profile_id is null then return new; end if;
  if tg_op='UPDATE' and old.assigned_technician_profile_id is not distinct from new.assigned_technician_profile_id then return new; end if;
  company:=new.company_id;job:=new.id;kind:='technician_assigned';technician:=new.assigned_technician_profile_id;
  key:='assignment:'||new.id||':'||technician||':'||new.updated_at::text;
 elsif tg_table_name='service_request_estimates' then
  if new.estimate_status<>'approved' or new.source_system is distinct from 'native' then return new; end if;
  if tg_op='UPDATE' and old.estimate_status='approved' then return new; end if;
  job:=new.service_request_id;select company_id into company from service_requests where id=job;
  kind:='estimate_approved';key:='estimate-approved:'||new.id;
 elsif tg_table_name='service_request_payments' then
  if new.payment_status not in ('paid','succeeded') or new.source_system is distinct from 'native' then return new; end if;
  if tg_op='UPDATE' and old.payment_status in ('paid','succeeded') then return new; end if;
  company:=new.company_id;job:=new.service_request_id;kind:='payment_confirmed';key:='payment:'||new.id;
 else
  if new.refund_status<>'succeeded' then return new; end if;
  if tg_op='UPDATE' and old.refund_status='succeeded' then return new; end if;
  company:=new.company_id;job:=new.service_request_id;kind:='refund_confirmed';key:='refund:'||new.id;
 end if;
 perform emit_staff_notification(company,kind,'other',new.id,null,job,key,replace(initcap(replace(kind,'_',' ')),'  ',' '),technician);
 return new;
end;$$;
revoke all on function public.notify_persisted_job_event() from public,anon,authenticated,service_role;
create trigger staff_notification_assignment after insert or update of assigned_technician_profile_id on public.service_requests for each row execute function public.notify_persisted_job_event();
create trigger staff_notification_estimate after insert or update of estimate_status on public.service_request_estimates for each row execute function public.notify_persisted_job_event();
create trigger staff_notification_payment after insert or update of payment_status on public.service_request_payments for each row execute function public.notify_persisted_job_event();
create trigger staff_notification_refund after insert or update of refund_status on public.service_request_payment_refunds for each row execute function public.notify_persisted_job_event();

create function public.list_staff_notifications(p_company uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; cutoff timestamptz:=clock_timestamp();
begin
 if not public.can_read_staff_notifications(p_company) then raise exception 'Not authorized' using errcode='42501'; end if;
 select jsonb_build_object('as_of',cutoff,'unread_count',(select count(*) from staff_notifications where company_id=p_company and recipient_profile_id=auth.uid() and in_app_enabled and read_at is null),
 'items',coalesce((select jsonb_agg(to_jsonb(n) order by created_at desc,id desc) from (select * from staff_notifications where company_id=p_company and recipient_profile_id=auth.uid() and in_app_enabled order by created_at desc,id desc limit 100) n),'[]'::jsonb)) into result;
 return result;
end;$$;
create function public.read_staff_notifications(p_company uuid,p_id uuid default null,p_before timestamptz default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.can_read_staff_notifications(p_company) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_id is null and p_before is null then raise exception 'Read cutoff required'; end if;
 update staff_notifications set read_at=coalesce(read_at,clock_timestamp()) where company_id=p_company and recipient_profile_id=auth.uid() and in_app_enabled
 and ((p_id is not null and id=p_id) or (p_id is null and created_at<=least(p_before,clock_timestamp())));
 if p_id is not null and not found then raise exception 'Notification unavailable' using errcode='42501'; end if;
end;$$;
revoke all on function public.can_read_staff_notifications(uuid),public.list_staff_notifications(uuid),public.read_staff_notifications(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.can_read_staff_notifications(uuid),public.list_staff_notifications(uuid),public.read_staff_notifications(uuid,uuid,timestamptz) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='staff_notifications') then
 alter publication supabase_realtime add table public.staff_notifications;
 end if;
end$$;
commit;
