import type {Claim,DeliveryStore,Outcome,Recipient,Channel} from './delivery-worker';
// Narrow RPC port keeps the worker testable without credentials or provider calls.
export type DeliveryRpc = (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;
export function createDeliveryStore(rpc:DeliveryRpc):DeliveryStore {
 async function call(name:string,args:Record<string,unknown>){
  const result=await rpc(name,args);
  if(result.error) throw new Error('Notification delivery storage unavailable');
  return result.data;
 }
 return {
  async claim(channels:Channel[],limit:number){return await call('claim_staff_notification_deliveries',{p_channels:channels,p_limit:limit}) as Claim[];},
  async authorize(claim:Claim){return await call('authorize_staff_notification_delivery',{p_id:claim.id,p_lease:claim.lease_token}) as Recipient|null;},
  async finish(claim:Claim,outcome:Outcome){return await call('finish_staff_notification_delivery',{
   p_id:claim.id,p_lease:claim.lease_token,p_outcome:outcome.kind,p_reference:outcome.reference??null,
   p_provider_status:outcome.providerStatus??null,p_error:outcome.errorCode??null,p_retry_seconds:outcome.retrySeconds??null,
  })===true;},
 };
}
