import {NextResponse} from 'next/server';
import {requireHomeFixPrivateAccess} from '@/server/security/homefix-private-access';
import {HOMEFIX_PRIVATE_COMPANY_ID} from '@/lib/auth/homefix-private-access';
import {pushConfiguration,validPushSubscription} from '@/server/notifications/push-security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const access=await requireHomeFixPrivateAccess(request);if(!access.ok)return access.response;
 const {data,error}=await access.context.supabase.rpc('staff_push_settings' as never,{p_company:HOMEFIX_PRIVATE_COMPANY_ID} as never);
 if(error)return NextResponse.json({error:'Push settings unavailable or staff access denied'},{status:403});
 return NextResponse.json({settings:data,publicKey:pushConfiguration(process.env)?.publicKey??null},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const access=await requireHomeFixPrivateAccess(request);if(!access.ok)return access.response;
 if(Number(request.headers.get('content-length')??0)>12000)return NextResponse.json({error:'Request too large'},{status:413});
 try {
  const raw=await request.text();if(raw.length>12000)throw new Error('Invalid payload');
  const body=JSON.parse(raw);let name:string;let args:Record<string,unknown>;
  if(body.action==='disable' && typeof body.endpoint==='string' && body.endpoint.length<=2048){
   name='revoke_staff_push_subscription';args={p_company:HOMEFIX_PRIVATE_COMPANY_ID,p_endpoint:body.endpoint};
  }else{
   if(body.action!=='enable' || !pushConfiguration(process.env) || !validPushSubscription(body.subscription) || !Array.isArray(body.events) || body.events.length>11 || body.events.some((e:unknown)=>typeof e!=='string'))throw new Error('Invalid subscription');
   name='save_staff_push_subscription';args={p_company:HOMEFIX_PRIVATE_COMPANY_ID,p_endpoint:body.subscription.endpoint,p_p256dh:body.subscription.keys.p256dh,p_auth:body.subscription.keys.auth,p_events:body.events};
  }
  const {error}=await access.context.supabase.rpc(name as never,args as never);
  if(error)return NextResponse.json({error:'Push update rejected; check staff access and device limit'},{status:400});
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Invalid or unavailable Push configuration'},{status:400});}
}
