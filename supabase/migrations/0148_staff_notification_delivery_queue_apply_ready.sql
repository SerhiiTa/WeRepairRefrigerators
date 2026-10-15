-- NOTIFICATIONS-02A: dormant delivery foundation. No scheduler, provider calls or backfill.
-- Apply after 0147, separately reviewed. Never modify already-applied 0147.
begin;
create table public.staff_notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.staff_notifications(id) on delete cascade,
 channel text not null check(channel in ('push','telegram','sms')),
 dedupe_key text not null unique,
 status text not null default 'queued' check(status in ('queued','processing','sent','failed','permanently_failed')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 5),
 next_attempt_at timestamptz not null default clock_timestamp(),
 last_attempt_at timestamptz,
 lease_token uuid, lease_until timestamptz,
 provider_reference text, provider_status text, error_code text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(notification_id,channel)
);
create index staff_notification_delivery_due on public.staff_notification_deliveries(next_attempt_at) where status in ('queued','failed');
alter table public.staff_notification_deliveries enable row level security;
create policy staff_delivery_own on public.staff_notification_deliveries for select to authenticated using (
 exists(select 1 from public.staff_notifications n where n.id=notification_id and n.recipient_profile_id=auth.uid() and public.can_read_staff_notifications(n.company_id))
);
revoke all on public.staff_notification_deliveries from public,anon,authenticated,service_role;
grant select on public.staff_notification_deliveries to authenticated;

-- Current consent and active membership are checked at claim and immediately before dispatch.
-- Quiet hours defer rather than override consent. Unknown timezones fail closed.
create function public.staff_delivery_policy(p_notification uuid,p_channel text) returns text
language plpgsql stable security definer set search_path=public as $$
declare n staff_notifications; p staff_notification_preferences; local_time time; enabled boolean;
begin
 select * into n from staff_notifications where id=p_notification;
 if not found then return 'unauthorized'; end if;
 if not exists(select 1 from company_members m join profiles u on u.id=m.profile_id where m.company_id=n.company_id and m.profile_id=n.recipient_profile_id and m.member_status='active' and u.status='active') then return 'unauthorized'; end if;
 select * into p from staff_notification_preferences where company_id=n.company_id and recipient_profile_id=n.recipient_profile_id and event_type=n.event_type;
 if not found then return 'opted_out'; end if;
 enabled:=case p_channel when 'push' then p.push_enabled when 'telegram' then p.telegram_enabled when 'sms' then p.sms_enabled else false end;
 if not enabled then return 'opted_out'; end if;
 if not exists(select 1 from pg_timezone_names where name=p.timezone) then return 'invalid_timezone'; end if;
 local_time:=(statement_timestamp() at time zone p.timezone)::time;
 if p.quiet_start is not null and not(n.priority='high' and p.high_priority_bypass) and
 (p.quiet_start=p.quiet_end or (p.quiet_start<p.quiet_end and local_time>=p.quiet_start and local_time<p.quiet_end) or
 (p.quiet_start>p.quiet_end and (local_time>=p.quiet_start or local_time<p.quiet_end))) then return 'quiet_hours'; end if;
 return 'allowed';
end$$;
create function public.enqueue_staff_notification_delivery() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into staff_notification_deliveries(notification_id,channel,dedupe_key)
 select new.id,c.channel,new.id::text||':'||c.channel
 from staff_notification_preferences p cross join (values('push'),('telegram'),('sms')) c(channel)
 where p.company_id=new.company_id and p.recipient_profile_id=new.recipient_profile_id and p.event_type=new.event_type
 and case c.channel when 'push' then p.push_enabled when 'telegram' then p.telegram_enabled else p.sms_enabled end
 on conflict(notification_id,channel) do nothing;
 return new;
end$$;
create trigger staff_delivery_enqueue after insert on public.staff_notifications for each row execute function public.enqueue_staff_notification_delivery();

create function public.claim_staff_notification_deliveries(p_channels text[],p_limit integer default 10) returns setof public.staff_notification_deliveries
language plpgsql security definer set search_path=public as $$
begin
 update staff_notification_deliveries set status='permanently_failed',error_code='attempts_exhausted',updated_at=clock_timestamp() where status in ('queued','failed') and attempt_count>=5;
 -- A crashed worker might already have submitted externally. Never blindly resend an expired lease.
 update staff_notification_deliveries set status='permanently_failed',error_code='delivery_outcome_unknown',lease_token=null,lease_until=null,updated_at=clock_timestamp()
 where status='processing' and lease_until<clock_timestamp();
 update staff_notification_deliveries d set status='permanently_failed',error_code=staff_delivery_policy(d.notification_id,d.channel),updated_at=clock_timestamp()
 where d.status in ('queued','failed') and staff_delivery_policy(d.notification_id,d.channel) in ('unauthorized','opted_out','invalid_timezone');
 return query
 with candidates as (
 select d.id from staff_notification_deliveries d
 where d.channel=any(p_channels) and d.status in ('queued','failed') and d.attempt_count<5 and d.next_attempt_at<=clock_timestamp()
 and staff_delivery_policy(d.notification_id,d.channel)='allowed'
 order by d.next_attempt_at,d.id limit greatest(0,least(coalesce(p_limit,0),25)) for update skip locked
 )
 update staff_notification_deliveries d set status='processing',attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
 lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
 from candidates c where d.id=c.id returning d.*;
end$$;

create function public.authorize_staff_notification_delivery(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d staff_notification_deliveries; n staff_notifications; policy text;
begin
 select * into d from staff_notification_deliveries where id=p_id and lease_token=p_lease and status='processing' and lease_until>clock_timestamp() for update;
 if not found then return null; end if;
 policy:=staff_delivery_policy(d.notification_id,d.channel);
 if policy<>'allowed' then
 update staff_notification_deliveries set status=case when policy='quiet_hours' then 'failed' else 'permanently_failed' end,
 error_code=policy,next_attempt_at=clock_timestamp()+interval '5 minutes',lease_token=null,lease_until=null where id=d.id;
 return null;
 end if;
 select * into n from staff_notifications where id=d.notification_id;
 -- No customer contact details, transcript or monetary amount in the dispatch contract.
 return jsonb_build_object('companyId',n.company_id,'recipientProfileId',n.recipient_profile_id,'eventType',n.event_type,
 'priority',n.priority,'conversationId',n.conversation_id,'jobId',n.service_request_id);
end$$;

create function public.finish_staff_notification_delivery(p_id uuid,p_lease uuid,p_outcome text,p_reference text default null,p_provider_status text default null,p_error text default null,p_retry_seconds integer default null) returns boolean
language plpgsql security definer set search_path=public as $$
declare d staff_notification_deliveries;
begin
 if p_outcome not in ('sent','accepted','retryable','permanent','unknown') or p_outcome is null then raise exception 'Invalid outcome'; end if;
 if length(coalesce(p_reference,''))>200 or length(coalesce(p_provider_status,''))>80 or length(coalesce(p_error,''))>80 then raise exception 'Invalid metadata';end if;
 select * into d from staff_notification_deliveries where id=p_id and lease_token=p_lease and status='processing' and lease_until>clock_timestamp() for update;
 if not found then return false; end if;
 update staff_notification_deliveries set
 status=case when p_outcome='sent' then 'sent' when p_outcome='accepted' then 'processing' when p_outcome='retryable' and attempt_count<5 then 'failed' else 'permanently_failed' end,
 provider_reference=p_reference,provider_status=p_provider_status,
 error_code=case when p_outcome='unknown' then 'delivery_outcome_unknown' else p_error end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(30*power(2,d.attempt_count-1)::integer,least(86400,coalesce(p_retry_seconds,0)))),
 lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=d.id;
 -- accepted means awaiting a provider receipt, not confirmed delivery. No automatic resend.
 return true;
end$$;
revoke all on function public.staff_delivery_policy(uuid,text),public.enqueue_staff_notification_delivery(),public.claim_staff_notification_deliveries(text[],integer),public.authorize_staff_notification_delivery(uuid,uuid),public.finish_staff_notification_delivery(uuid,uuid,text,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_staff_notification_deliveries(text[],integer),public.authorize_staff_notification_delivery(uuid,uuid),public.finish_staff_notification_delivery(uuid,uuid,text,text,text,text,integer) to service_role;
commit;
