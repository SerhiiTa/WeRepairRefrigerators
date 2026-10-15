import type {Adapter,Outcome} from './delivery-worker';
import type {DeliveryRpc} from './delivery-store';
import {notificationHref} from '../../lib/notifications/contracts';
import {validPushSubscription,type PushSubscriptionInput} from './push-security';
type Device=PushSubscriptionInput & {id:string;status:string};
export type PushSend=(subscription:PushSubscriptionInput,payload:string,signal:AbortSignal)=>Promise<{statusCode:number;headers?:Record<string,unknown>}>;
export function createPushAdapter(rpc:DeliveryRpc,send:PushSend,pilotSubscriptionId?:string):Adapter {
 return async(recipient,dedupeKey,signal,claim)=>{
  async function call(name:string,extra:Record<string,unknown>={}){
   const r=await rpc(name,{p_id:claim.id,p_lease:claim.lease_token,...extra});if(r.error)throw new Error('Push storage unavailable');return r.data;
  }
  const devices=await call('prepare_staff_push_devices') as Device[];
  if(!Array.isArray(devices) || devices.length===0) return {kind:'permanent',errorCode:'no_active_staff_devices'};
  if(pilotSubscriptionId && (devices.length!==1 || devices[0].id!==pilotSubscriptionId))return {kind:'permanent',errorCode:'pilot_device_mismatch'};
  const payload=JSON.stringify({title:'HomeFixOS',kind:pilotSubscriptionId?'staff_push_pilot':undefined,body:pilotSubscriptionId?'Synthetic staff Push pilot.':'A staff update is available.',tag:dedupeKey,
   href:notificationHref({conversation_id:recipient.conversationId,service_request_id:recipient.jobId})??'/dashboard'});
  const results=await Promise.all(devices.map(async(device):Promise<Outcome>=>{
   if(device.status==='accepted')return {kind:'accepted'};
   if(device.status==='permanent')return {kind:'permanent'};
   if(!['pending','retryable'].includes(device.status))return {kind:'unknown'};
   if(signal.aborted)return {kind:'unknown'};
   if(await call('reserve_staff_push_device',{p_subscription:device.id})!==true)return {kind:'permanent',errorCode:'device_unavailable'};
   let status:number|undefined;let headers:Record<string,unknown>|undefined;
   let kind:Outcome['kind']='unknown';
   if(!validPushSubscription(device)){kind='permanent';}
   else if(!signal.aborted){
    try {const response=await send(device,payload,signal);status=response.statusCode;headers=response.headers;}
    catch(error){const e=error as {statusCode?:number;headers?:Record<string,unknown>};status=e?.statusCode;headers=e?.headers;}
    if(status && status>=200 && status<300)kind='accepted';
    else if(status===429)kind='retryable';
    else if(status && status>=400 && status<500 && status!==408)kind='permanent';
    // Timeout, network errors and 5xx may follow provider acceptance: never blind-retry.
   }
   const retryValue=headers?.['retry-after'];
   const retry=typeof retryValue==='string' && !/^\d+$/.test(retryValue)?Math.ceil((Date.parse(retryValue)-Date.now())/1000):Number(retryValue);
   const deviceStatus=kind==='retryable'?'retryable':kind==='permanent'?'permanent':kind==='accepted'?'accepted':'unknown';
   if(await call('finish_staff_push_device',{p_subscription:device.id,p_status:deviceStatus,p_http:status??null})!==true) return {kind:'unknown'};
   return {kind,providerStatus:status?String(status):undefined,retrySeconds:Number.isFinite(retry)?Math.max(0,Math.min(86400,Math.ceil(retry))):undefined};
  }));
  if(results.some(r=>r.kind==='unknown'))return {kind:'unknown',errorCode:'push_outcome_unknown'};
  if(results.some(r=>r.kind==='retryable'))return {kind:'retryable',errorCode:'push_rate_limited',retrySeconds:Math.max(...results.map(r=>r.retrySeconds??0))};
  if(results.some(r=>r.kind==='accepted'))return {kind:'accepted',providerStatus:'push_service_accepted'};
  return {kind:'permanent',errorCode:'no_deliverable_devices'};
 };
}
