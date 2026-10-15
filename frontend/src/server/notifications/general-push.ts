import webPush from 'web-push';
import {getSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {pushConfiguration} from './push-security';
import {createPushAdapter} from './push-adapter';
import {createDeliveryStore,type DeliveryRpc} from './delivery-store';
import {runDeliveryBatch} from './delivery-worker';
// Shared by post-commit wake-up and secret-authenticated recovery. Never browser-driven.
export async function processGeneralPush(source:'event'|'recovery'){
 if(process.env.WRA_DISABLE_PROVIDER_CALLS==='1')throw new Error('Push disabled');
 const config=pushConfiguration(process.env),db=getSupabaseServiceRoleClient();
 if(!config||!db)throw new Error('Push unavailable');
 const rpc:DeliveryRpc=async(name,args)=>{
  if(name==='claim_staff_notification_deliveries'){name='claim_general_staff_push';args={p_limit:args.p_limit};}
  if(name==='prepare_staff_push_devices')name='prepare_general_staff_push';
  return await db.rpc(name as never,args as never).abortSignal(AbortSignal.timeout(3000));
 };
 const adapter=createPushAdapter(rpc,async(subscription,payload,signal)=>{
  const details=webPush.generateRequestDetails(subscription,payload,{vapidDetails:config,TTL:300});
  const response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:new Uint8Array(details.body),signal:AbortSignal.any([signal,AbortSignal.timeout(7000)]),redirect:'error'});
  await response.body?.cancel();return {statusCode:response.status,headers:{'retry-after':response.headers.get('retry-after')}};
 });
 const result=await runDeliveryBatch(createDeliveryStore(rpc),{push:adapter},{maxClaims:20,budgetMs:5000});
 // Aggregate metadata only; no customer content, device endpoints, keys or staff IDs.
 if(source==='recovery'){
  const metrics=await rpc('staff_push_delivery_metrics',{});
  console.info('[staff-push-recovery]',{...result,metrics:metrics.error?'unavailable':metrics.data});
 }else console.info('[staff-push-event]',result);
 return result;
}
