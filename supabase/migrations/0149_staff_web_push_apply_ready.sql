-- NOTIFICATIONS-02B. Forward-only; apply after 0148. No external calls/backfill/scheduler.
begin;
create table public.staff_push_subscriptions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048 and endpoint ~ '^https://(web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)/[^[:space:]#]+$'),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'), auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}$'),
 status text not null default 'active' check(status in ('active','revoked','expired')),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
-- Per-device outcomes extend the existing queue. There is no second independently claimed queue.
create table public.staff_push_delivery_devices (
 delivery_id uuid not null references public.staff_notification_deliveries(id) on delete cascade,
 subscription_id uuid not null references public.staff_push_subscriptions(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','accepted','retryable','permanent','unknown')),
 attempts integer not null default 0, provider_status integer, updated_at timestamptz not null default clock_timestamp(),
 primary key(delivery_id,subscription_id)
);
alter table public.staff_push_subscriptions enable row level security;
alter table public.staff_push_delivery_devices enable row level security;
revoke all on public.staff_push_subscriptions,public.staff_push_delivery_devices from public,anon,authenticated,service_role;
create function public.staff_push_member(p_company uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from company_members m join profiles p on p.id=m.profile_id where m.company_id=p_company and m.profile_id=p_user
 and m.member_role in ('owner','manager','dispatcher','technician') and m.member_status='active' and m.archived_at is null and m.removed_at is null and m.suspended_at is null and p.status='active');
$$;
create policy staff_push_own on public.staff_push_subscriptions for select to authenticated using(recipient_profile_id=auth.uid() and public.staff_push_member(company_id,auth.uid()));
-- Browser access goes through ownership-checked RPCs; no direct table writes or key enumeration.
create function public.staff_push_settings(p_company uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not staff_push_member(p_company,auth.uid()) then raise exception 'Staff access required' using errcode='42501';end if;
 return jsonb_build_object('devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'endpoint',endpoint,'status',status)) from staff_push_subscriptions where company_id=p_company and recipient_profile_id=auth.uid() and status='active'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(event_type) from staff_notification_preferences where company_id=p_company and recipient_profile_id=auth.uid() and push_enabled),'[]'::jsonb));
end$$;
create function public.save_staff_push_subscription(p_company uuid,p_endpoint text,p_p256dh text,p_auth text,p_events text[]) returns uuid language plpgsql security definer set search_path=public as $$
declare existing staff_push_subscriptions; result uuid; allowed text[]:=array['missed_call','inbound_sms','website_request','customer_reply','ai_needs_attention','technician_assigned','appointment_created','appointment_changed','estimate_approved','payment_confirmed','refund_confirmed'];
begin
 if not staff_push_member(p_company,auth.uid()) then raise exception 'Staff access required' using errcode='42501';end if;
 if p_events is null or not p_events<@allowed or array_position(p_events,null) is not null then raise exception 'Invalid event preferences';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||auth.uid()::text,149));
 select * into existing from staff_push_subscriptions where endpoint=p_endpoint for update;
 if found and (existing.company_id<>p_company or existing.recipient_profile_id<>auth.uid()) then raise exception 'Subscription unavailable' using errcode='42501';end if;
 if (existing.id is null or existing.status<>'active') and (select count(*) from staff_push_subscriptions where company_id=p_company and recipient_profile_id=auth.uid() and status='active')>=10 then raise exception 'Maximum ten active devices';end if;
 if existing.id is null then
 insert into staff_push_subscriptions(company_id,recipient_profile_id,endpoint,p256dh,auth) values(p_company,auth.uid(),p_endpoint,p_p256dh,p_auth) returning id into result;
 else
 update staff_push_subscriptions set p256dh=p_p256dh,auth=p_auth,status='active',created_at=case when status<>'active' then clock_timestamp() else created_at end,updated_at=clock_timestamp() where id=existing.id returning id into result;
 end if;
 update staff_notification_preferences set push_enabled=false where company_id=p_company and recipient_profile_id=auth.uid();
 insert into staff_notification_preferences(company_id,recipient_profile_id,event_type,push_enabled) select p_company,auth.uid(),e,true from (select distinct unnest(p_events) e) events
 on conflict(company_id,recipient_profile_id,event_type) do update set push_enabled=true;
 return result;
end$$;
create function public.revoke_staff_push_subscription(p_company uuid,p_endpoint text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not staff_push_member(p_company,auth.uid()) then raise exception 'Staff access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||auth.uid()::text,149));
 update staff_push_subscriptions set status='revoked',updated_at=clock_timestamp() where company_id=p_company and recipient_profile_id=auth.uid() and endpoint=p_endpoint;
 if not exists(select 1 from staff_push_subscriptions where company_id=p_company and recipient_profile_id=auth.uid() and status='active') then
 update staff_notification_preferences set push_enabled=false where company_id=p_company and recipient_profile_id=auth.uid();end if;
end$$;
create function public.prepare_staff_push_devices(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare d staff_notification_deliveries; n staff_notifications;
begin
 select * into d from staff_notification_deliveries where id=p_id and lease_token=p_lease and status='processing' and channel='push' and lease_until>clock_timestamp() for update;
 if not found then return '[]'::jsonb;end if;
 select * into n from staff_notifications where id=d.notification_id;
 if not staff_push_member(n.company_id,n.recipient_profile_id) or staff_delivery_policy(n.id,'push')<>'allowed' then return '[]'::jsonb;end if;
 insert into staff_push_delivery_devices(delivery_id,subscription_id)
 select d.id,s.id from staff_push_subscriptions s where s.company_id=n.company_id and s.recipient_profile_id=n.recipient_profile_id and s.status='active' and s.created_at<=n.created_at
 on conflict do nothing;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth),'status',x.status)) from staff_push_delivery_devices x join staff_push_subscriptions s on s.id=x.subscription_id where x.delivery_id=d.id and s.status='active' and s.created_at<=n.created_at and s.company_id=n.company_id and s.recipient_profile_id=n.recipient_profile_id),'[]'::jsonb);
end$$;
create function public.reserve_staff_push_device(p_id uuid,p_lease uuid,p_subscription uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare n staff_notifications;
begin
 select sn.* into n from staff_notification_deliveries d join staff_notifications sn on sn.id=d.notification_id
 where d.id=p_id and d.lease_token=p_lease and d.status='processing' and d.channel='push' and d.lease_until>clock_timestamp() for update of d;
 if not found or not staff_push_member(n.company_id,n.recipient_profile_id) or staff_delivery_policy(n.id,'push')<>'allowed' then return false;end if;
 perform 1 from staff_push_subscriptions where id=p_subscription and company_id=n.company_id and recipient_profile_id=n.recipient_profile_id and status='active' and created_at<=n.created_at for update;
 if not found then return false;end if;
 update staff_push_delivery_devices set status='processing',attempts=attempts+1,updated_at=clock_timestamp() where delivery_id=p_id and subscription_id=p_subscription and status in ('pending','retryable');
 return found;
end$$;
create function public.finish_staff_push_device(p_id uuid,p_lease uuid,p_subscription uuid,p_status text,p_http integer default null) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if p_status not in ('accepted','retryable','permanent','unknown') or p_status is null then raise exception 'Invalid device outcome';end if;
 perform 1 from staff_notification_deliveries where id=p_id and lease_token=p_lease and status='processing' and channel='push' and lease_until>clock_timestamp() for update;
 if not found then return false;end if;
 update staff_push_delivery_devices set status=p_status,provider_status=p_http,updated_at=clock_timestamp() where delivery_id=p_id and subscription_id=p_subscription and status='processing';
 if not found then return false;end if;
 if p_http in (404,410) then update staff_push_subscriptions set status='expired',updated_at=clock_timestamp() where id=p_subscription;end if;
 return true;
end$$;
revoke all on function public.staff_push_member(uuid,uuid),public.staff_push_settings(uuid),public.save_staff_push_subscription(uuid,text,text,text,text[]),public.revoke_staff_push_subscription(uuid,text),public.prepare_staff_push_devices(uuid,uuid),public.reserve_staff_push_device(uuid,uuid,uuid),public.finish_staff_push_device(uuid,uuid,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.staff_push_member(uuid,uuid),public.staff_push_settings(uuid),public.save_staff_push_subscription(uuid,text,text,text,text[]),public.revoke_staff_push_subscription(uuid,text) to authenticated;
grant execute on function public.prepare_staff_push_devices(uuid,uuid),public.reserve_staff_push_device(uuid,uuid,uuid),public.finish_staff_push_device(uuid,uuid,uuid,text,integer) to service_role;
commit;
