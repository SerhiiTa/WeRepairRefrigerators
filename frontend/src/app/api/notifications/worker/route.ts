import {NextResponse} from 'next/server';
import webPush from 'web-push';
import {getSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {workerAuthorized,pushConfiguration} from '@/server/notifications/push-security';
import type {DeliveryRpc} from '@/server/notifications/delivery-store';
import {createPushAdapter} from '@/server/notifications/push-adapter';
import {parsePilotRequest,runPushPilot} from '@/server/notifications/push-pilot';
import {requireHomeFixPrivateAccess} from '@/server/security/homefix-private-access';
import {HOMEFIX_PRIVATE_COMPANY_ID} from '@/lib/auth/homefix-private-access';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
// General delivery is intentionally disabled. No scheduler or batch invocation path.
export async function POST(request:Request){
 if(!workerAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401});
 let pilot;
 try{
  if(Number(request.headers.get('content-length')??0)>2048)throw new Error('Oversized');
  const raw=await request.text();if(raw.length>2048)throw new Error('Oversized');pilot=parsePilotRequest(JSON.parse(raw));
 }catch{return NextResponse.json({error:'General worker disabled. Exact pilot mode and IDs required.'},{status:403});}
 const staffToken=request.headers.get('x-homefix-staff-token');
 if(!staffToken)return NextResponse.json({error:'Staff session required'},{status:401});
 const access=await requireHomeFixPrivateAccess(new Request(request.url,{headers:{authorization:`Bearer ${staffToken}`}}));
 if(!access.ok)return access.response;
 if(access.context.userId!==pilot.recipientId)return NextResponse.json({error:'Pilot must target the authorized staff user'},{status:403});
 const db=getSupabaseServiceRoleClient();if(!db)return NextResponse.json({error:'Pilot storage unavailable'},{status:503});
 const rpc:DeliveryRpc=async(name,args)=>await db.rpc(name as never,args as never);
 if(pilot.mode==='create-pilot'){
  const result=await rpc('create_staff_push_pilot',{p_company:HOMEFIX_PRIVATE_COMPANY_ID,p_staff:access.context.userId,p_subscription:pilot.subscriptionId,p_request:pilot.requestId});
  if(result.error)return NextResponse.json({error:'Pilot creation rejected; verify ownership and explicit AI-needs-attention Push opt-in'},{status:403});
  return NextResponse.json({notificationId:result.data,synthetic:true,sendAttempted:false});
 }
 if(process.env.WRA_DISABLE_PROVIDER_CALLS==='1')return NextResponse.json({error:'Provider calls disabled'},{status:503});
 const config=pushConfiguration(process.env);if(!config)return NextResponse.json({error:'Push delivery is not configured'},{status:503});
 // The pilot-only prepare RPC returns the registered device, never all recipient devices.
 const pilotRpc:DeliveryRpc=(name,args)=>rpc(name==='prepare_staff_push_devices'?'prepare_staff_push_pilot':name,args);
 try{
  const adapter=createPushAdapter(pilotRpc,async(subscription,payload,signal)=>{
   if(signal.aborted)throw new Error('Aborted');
   const details=webPush.generateRequestDetails(subscription,payload,{vapidDetails:config,TTL:300});
   const response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:new Uint8Array(details.body),signal:AbortSignal.any([signal,AbortSignal.timeout(7000)]),redirect:'error'});
   await response.body?.cancel();
   return {statusCode:response.status,headers:{'retry-after':response.headers.get('retry-after')}};
  },pilot.subscriptionId);
  return NextResponse.json(await runPushPilot(rpc,adapter,pilot,HOMEFIX_PRIVATE_COMPANY_ID));
 }catch{return NextResponse.json({error:'Pilot rejected or outcome uncertain. Do not automatically retry.'},{status:409});}
}
