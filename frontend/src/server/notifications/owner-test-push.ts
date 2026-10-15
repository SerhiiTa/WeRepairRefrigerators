import {createHash} from 'node:crypto';
export const TEST_WINDOW_MS=5*60*1000;
export function pilotWindowRequestId(company:string,user:string,now:number){
 const hex=createHash('sha256').update(`owner-test-push:${company}:${user}:${Math.floor(now/TEST_WINDOW_MS)}`).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function appleTestDevices(value:unknown):{id:string}[]{
 if(!Array.isArray(value))return [];
 return value.filter((d):d is {id:string;endpoint:string;status:string}=>{
  try {const u=new URL(d.endpoint);return d.status==='active' && /^[0-9a-f-]{36}$/i.test(d.id) && u.protocol==='https:' && /^[a-z0-9-]+\.push\.apple\.com$/.test(u.hostname);}catch{return false;}
 }).map(d=>({id:d.id}));
}
// A deterministic request ID is serialized by create_staff_push_pilot's existing
// advisory lock and UNIQUE(request_id). Its atomic claim allows only one attempt.
// The fixed window is account-wide, independent of selected device or server instance.
export async function runOwnerTestPush(input:{companyId:string;userId:string;subscriptionId:string;now:number},invoke:(body:Record<string,string>)=>Promise<Response>){
 const recipientId=input.userId,subscriptionId=input.subscriptionId;
 const created=await invoke({mode:'create-pilot',recipientId,subscriptionId,requestId:pilotWindowRequestId(input.companyId,input.userId,input.now)});
 if(!created.ok)return {status:409,body:{state:'failed',message:'Test blocked. Check AI needs attention opt-in, device ownership, and the five-minute test limit.'}};
 const pilot=await created.json();
 if(pilot.synthetic!==true || pilot.sendAttempted!==false || !/^[0-9a-f-]{36}$/i.test(pilot.notificationId))return {status:502,body:{state:'failed',message:'Invalid pilot response. No send requested.'}};
 const sent=await invoke({mode:'send-pilot',recipientId,subscriptionId,notificationId:pilot.notificationId});
 const result=await sent.json();
 if(sent.ok && result.claimed===0)return {status:429,body:{state:'failed',message:'This five-minute test window was already used. No additional send attempted.'}};
 if(sent.ok && result.claimed===1 && result.recorded===true && result.outcome==='accepted')return {status:200,body:{state:'accepted',message:'Accepted by the Push service. Check your iPhone lock screen; display is not yet confirmed.'}};
 return {status:409,body:{state:'failed',message:'Failed or outcome uncertain. No automatic retry. Check your iPhone before requesting another test.'}};
}
