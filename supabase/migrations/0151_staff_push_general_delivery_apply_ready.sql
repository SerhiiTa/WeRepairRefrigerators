-- NOTIFICATIONS-04.2. Forward-only after 0150; no sends/backfill/business writes.
begin;
create index staff_delivery_notification_attempt on public.staff_notification_deliveries(notification_id,last_attempt_at desc);
create or replace function public.staff_delivery_policy(p_notification uuid,p_channel text) returns text
language plpgsql stable security definer set search_path=public as $$
declare n staff_notifications; p staff_notification_preferences; local_time time; enabled boolean;
begin
 select * into n from staff_notifications where id=p_notification;
 if not found then return 'unauthorized'; end if;
 if not staff_push_member(n.company_id,n.recipient_profile_id) then return 'unauthorized'; end if;
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

-- Dedicated Push-only general claim: pilot RPCs and their revoked predecessors remain intact.
create function public.claim_general_staff_push(p_limit integer default 1) returns setof public.staff_notification_deliveries
language plpgsql security definer set search_path=public as $$
begin
 -- Bounded recovery. Unknown acceptance is terminal, never a blind retry.
 with stale as (
 select d.id from staff_notification_deliveries d join staff_notifications n on n.id=d.notification_id
 where d.channel='push' and n.source_type<>'staff_push_pilot'
 and not exists(select 1 from staff_push_pilots p where p.notification_id=n.id)
 and ((d.status='processing' and d.lease_until<clock_timestamp()) or (d.status in ('queued','failed') and (d.attempt_count>=5 or staff_delivery_policy(n.id,'push') in ('unauthorized','opted_out','invalid_timezone'))))
 order by d.updated_at limit 100 for update of d skip locked)
 update staff_notification_deliveries d set status='permanently_failed',error_code=case when d.status='processing' then 'delivery_outcome_unknown' when d.attempt_count>=5 then 'attempts_exhausted' else staff_delivery_policy(d.notification_id,'push') end,lease_token=null,lease_until=null,updated_at=clock_timestamp() from stale where d.id=stale.id;
 return query
 with eligible as materialized (
 select d.id,n.company_id,d.next_attempt_at,d.created_at,
 row_number() over(partition by n.company_id order by d.next_attempt_at,d.created_at,d.id) as company_rank
 from staff_notification_deliveries d join staff_notifications n on n.id=d.notification_id
 where d.channel='push' and d.status in ('queued','failed') and d.attempt_count<5 and d.next_attempt_at<=clock_timestamp()
 and n.source_type<>'staff_push_pilot' and not exists(select 1 from staff_push_pilots p where p.notification_id=n.id)
 and staff_delivery_policy(n.id,'push')='allowed'),
 fairness as (
 select e.company_id,max(d.last_attempt_at) as last_claim from (select distinct company_id from eligible) e
 left join staff_notifications n on n.company_id=e.company_id
 left join staff_notification_deliveries d on d.notification_id=n.id and d.channel='push'
 group by e.company_id),
 picked as (
 select d.id from eligible e join fairness f on f.company_id=e.company_id join staff_notification_deliveries d on d.id=e.id
 -- Recheck under row locking: another invocation may have claimed a candidate.
 where d.status in ('queued','failed') and d.next_attempt_at<=clock_timestamp() and d.attempt_count<5
 order by e.company_rank,f.last_claim nulls first,e.next_attempt_at,e.created_at,d.id
 limit greatest(0,least(coalesce(p_limit,1),20)) for update of d skip locked)
 update staff_notification_deliveries d set status='processing',attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
 from picked where d.id=picked.id returning d.*;
end$$;
create function public.prepare_general_staff_push(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from staff_notification_deliveries d join staff_notifications n on n.id=d.notification_id
 where d.id=p_id and d.lease_token=p_lease and d.channel='push' and d.status='processing'
 and n.source_type<>'staff_push_pilot' and not exists(select 1 from staff_push_pilots p where p.notification_id=n.id) for update of d;
 if not found then return '[]'::jsonb;end if;
 return prepare_staff_push_devices(p_id,p_lease);
end$$;
create function public.staff_push_delivery_metrics() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
 'pending',(select count(*) from staff_notification_deliveries where channel='push' and status in ('queued','failed')),
 'oldest_pending_seconds',(select greatest(0,extract(epoch from statement_timestamp()-min(created_at))) from staff_notification_deliveries where channel='push' and status in ('queued','failed')),
 'accepted_devices',(select count(*) from staff_push_delivery_devices where status='accepted'),
 'failed',(select count(*) from staff_notification_deliveries where channel='push' and status='permanently_failed'),
 'retry_attempts',(select coalesce(sum(greatest(attempt_count-1,0)),0) from staff_notification_deliveries where channel='push'),
 'expired_devices',(select count(*) from staff_push_subscriptions where status='expired'),
 'revoked_devices',(select count(*) from staff_push_subscriptions where status='revoked'));
$$;
revoke all on function public.claim_general_staff_push(integer),public.prepare_general_staff_push(uuid,uuid),public.staff_push_delivery_metrics() from public,anon,authenticated,service_role;
grant execute on function public.claim_general_staff_push(integer),public.prepare_general_staff_push(uuid,uuid),public.staff_push_delivery_metrics() to service_role;
commit;
