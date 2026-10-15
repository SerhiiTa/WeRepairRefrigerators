import type {DeliveryRpc} from './delivery-store';
import {createDeliveryStore} from './delivery-store';
import type {Adapter,Claim,Recipient,Outcome} from './delivery-worker';
export type PilotRequest={mode:'create-pilot'|'send-pilot';recipientId:string;subscriptionId:string;requestId?:string;notificationId?:string};
export function parsePilotRequest(value:unknown):PilotRequest {
 const p=value as PilotRequest;const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!p || !['create-pilot','send-pilot'].includes(p.mode) || !uuid.test(p.recipientId) || !uuid.test(p.subscriptionId) || !uuid.test((p.mode==='create-pilot'?p.requestId:p.notificationId)??''))throw new Error('Exact pilot IDs required');
 return p;
}
export async function runPushPilot(rpc:DeliveryRpc,adapter:Adapter,p:PilotRequest,companyId:string){
 const r=await rpc('claim_staff_push_pilot',{p_notification:p.notificationId,p_staff:p.recipientId,p_subscription:p.subscriptionId,p_company:companyId});
 if(r.error)throw new Error('Pilot eligibility rejected');
 if(!r.data)return {claimed:0,reason:'already_attempted'};
 const {claim,recipient}=r.data as {claim:Claim;recipient:Recipient};
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let outcome:Outcome;
 try{outcome=await Promise.race([adapter(recipient,claim.dedupe_key,controller.signal,claim),new Promise<Outcome>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({kind:'unknown',errorCode:'pilot_outcome_unknown'});},10_000);})]);}
 catch{outcome={kind:'unknown',errorCode:'pilot_outcome_unknown'};}finally{clearTimeout(timer);}
 // Even explicit provider rejection consumes this pilot's single attempt. A new pilot
 // requires a separate authorized create request; there is no automatic retry path.
 if(outcome.kind==='retryable')outcome={...outcome,kind:'permanent',errorCode:'pilot_retry_requires_authorization'};
 const recorded=await createDeliveryStore(rpc).finish(claim,outcome);
 return {claimed:1,recorded,outcome:outcome.kind};
}
