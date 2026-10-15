-- Single-device pilot; no sends, no existing-record rewrite. Apply after 0149.
begin;
create table public.staff_push_pilots (
 notification_id uuid primary key references public.staff_notifications(id) on delete cascade,
 request_id uuid not null unique,
 company_id uuid not null references public.companies(id),
 recipient_profile_id uuid not null references public.profiles(id),
 subscription_id uuid not null references public.staff_push_subscriptions(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.staff_push_pilots enable row level security;
revoke all on public.staff_push_pilots from public,anon,authenticated,service_role;
-- Until a separately approved general rollout, neither the old HTTP worker nor service RPC
-- may pick arbitrary queued events or fan a pilot out to all recipient devices.
revoke execute on function public.claim_staff_notification_deliveries(text[],integer),public.prepare_staff_push_devices(uuid,uuid) from service_role;
create or replace function public.enqueue_staff_notification_delivery() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into staff_notification_deliveries(notification_id,channel,dedupe_key)
 select new.id,c.channel,new.id::text||':'||c.channel
 from staff_notification_preferences p cross join (values('push'),('telegram'),('sms')) c(channel)
 where p.company_id=new.company_id and p.recipient_profile_id=new.recipient_profile_id and p.event_type=new.event_type
 and (new.source_type<>'staff_push_pilot' or c.channel='push')
 and case c.channel when 'push' then p.push_enabled when 'telegram' then p.telegram_enabled else p.sms_enabled end
 on conflict(notification_id,channel) do nothing;
 return new;
end$$;
create function public.create_staff_push_pilot(p_company uuid,p_staff uuid,p_subscription uuid,p_request uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare pilot staff_push_pilots; n uuid:=gen_random_uuid();
begin
 if not staff_push_member(p_company,p_staff) then raise exception 'Authorized staff required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,150));
 select * into pilot from staff_push_pilots where request_id=p_request;
 if found then
 if (pilot.company_id,pilot.recipient_profile_id,pilot.subscription_id) is distinct from (p_company,p_staff,p_subscription) then raise exception 'Pilot request mismatch' using errcode='42501';end if;
 return pilot.notification_id;
 end if;
 perform 1 from staff_push_subscriptions where id=p_subscription and company_id=p_company and recipient_profile_id=p_staff and status='active' for update;
 if not found then raise exception 'Active owned subscription required' using errcode='42501';end if;
 if not exists(select 1 from staff_notification_preferences where company_id=p_company and recipient_profile_id=p_staff and event_type='ai_needs_attention' and push_enabled) then raise exception 'Explicit AI-needs-attention Push opt-in required' using errcode='42501';end if;
 -- Reuse an existing preference category only. No AI/customer business record is generated.
 insert into staff_notifications(id,company_id,recipient_profile_id,event_type,source_type,source_id,title,summary,priority,dedupe_key)
 values(n,p_company,p_staff,'ai_needs_attention','staff_push_pilot',p_request,'Synthetic staff Push pilot','Synthetic test only','normal','pilot:'||p_request);
 insert into staff_push_pilots(notification_id,request_id,company_id,recipient_profile_id,subscription_id) values(n,p_request,p_company,p_staff,p_subscription);
 return n;
end$$;
create function public.claim_staff_push_pilot(p_notification uuid,p_staff uuid,p_subscription uuid,p_company uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare n staff_notifications; d staff_notification_deliveries;
begin
 select sn.* into n from staff_notifications sn join staff_push_pilots p on p.notification_id=sn.id
 where sn.id=p_notification and p.company_id=p_company and sn.company_id=p_company and p.recipient_profile_id=p_staff and sn.recipient_profile_id=p_staff and p.subscription_id=p_subscription
 and sn.source_type='staff_push_pilot' and sn.source_id=p.request_id and sn.dedupe_key='pilot:'||p.request_id and sn.conversation_id is null and sn.service_request_id is null;
 if not found or not staff_push_member(p_company,p_staff) or staff_delivery_policy(n.id,'push')<>'allowed' then raise exception 'Pilot is not authorized or currently eligible' using errcode='42501';end if;
 perform 1 from staff_push_subscriptions where id=p_subscription and company_id=p_company and recipient_profile_id=p_staff and status='active' and created_at<=n.created_at;
 if not found then raise exception 'Pilot subscription unavailable' using errcode='42501';end if;
 update staff_notification_deliveries set status='processing',attempt_count=1,last_attempt_at=clock_timestamp(),lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
 where notification_id=n.id and channel='push' and status='queued' and attempt_count=0 returning * into d;
 if not found then return null;end if;
 return jsonb_build_object('claim',to_jsonb(d),'recipient',jsonb_build_object('companyId',p_company,'recipientProfileId',p_staff,'eventType',n.event_type,'priority',n.priority,'conversationId',null,'jobId',null));
end$$;
create function public.prepare_staff_push_pilot(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d staff_notification_deliveries; p staff_push_pilots; n staff_notifications; s staff_push_subscriptions;
begin
 select * into d from staff_notification_deliveries where id=p_id and lease_token=p_lease and status='processing' and channel='push' and attempt_count=1 and lease_until>clock_timestamp() for update;
 if not found then return '[]'::jsonb;end if;
 select * into p from staff_push_pilots where notification_id=d.notification_id;
 if not found then return '[]'::jsonb;end if;
 select * into n from staff_notifications where id=p.notification_id and company_id=p.company_id and recipient_profile_id=p.recipient_profile_id and source_type='staff_push_pilot' and source_id=p.request_id and conversation_id is null and service_request_id is null;
 if not found or not staff_push_member(p.company_id,p.recipient_profile_id) or staff_delivery_policy(n.id,'push')<>'allowed' then return '[]'::jsonb;end if;
 select * into s from staff_push_subscriptions where id=p.subscription_id and company_id=p.company_id and recipient_profile_id=p.recipient_profile_id and status='active' and created_at<=n.created_at;
 if not found then return '[]'::jsonb;end if;
 insert into staff_push_delivery_devices(delivery_id,subscription_id) values(d.id,s.id) on conflict do nothing;
 return (select jsonb_build_array(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth),'status',x.status)) from staff_push_delivery_devices x where x.delivery_id=d.id and x.subscription_id=s.id);
end$$;
revoke all on function public.create_staff_push_pilot(uuid,uuid,uuid,uuid),public.claim_staff_push_pilot(uuid,uuid,uuid,uuid),public.prepare_staff_push_pilot(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_staff_push_pilot(uuid,uuid,uuid,uuid),public.claim_staff_push_pilot(uuid,uuid,uuid,uuid),public.prepare_staff_push_pilot(uuid,uuid) to service_role;
commit;
