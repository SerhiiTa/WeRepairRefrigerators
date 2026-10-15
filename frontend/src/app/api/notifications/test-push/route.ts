import {NextResponse} from 'next/server';
import {requireHomeFixPrivateAccess} from '@/server/security/homefix-private-access';
import {HOMEFIX_PRIVATE_COMPANY_ID} from '@/lib/auth/homefix-private-access';
import {appleTestDevices,runOwnerTestPush} from '@/server/notifications/owner-test-push';
import {POST as pilotWorker} from '../worker/route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function ownerContext(request:Request){
 const access=await requireHomeFixPrivateAccess(request);
 if(!access.ok)return {response:access.response} as const;
 const {data,error}=await access.context.supabase.from('company_members').select('id')
  .eq('company_id',HOMEFIX_PRIVATE_COMPANY_ID).eq('profile_id',access.context.userId)
  .eq('member_role','owner').eq('member_status','active')
  .is('archived_at',null).is('removed_at',null).is('suspended_at',null).maybeSingle();
 if(error||!data)return {response:NextResponse.json({error:'Active HomeFix owner access required.'},{status:403})} as const;
 const settings=await access.context.supabase.rpc('staff_push_settings' as never,{p_company:HOMEFIX_PRIVATE_COMPANY_ID} as never);
 if(settings.error)return {response:NextResponse.json({error:'Active staff Push access required.'},{status:403})} as const;
 const value=settings.data as unknown as {devices:unknown};
 return {context:access.context,devices:appleTestDevices(value?.devices)} as const;
}
export async function GET(request:Request){
 const owner=await ownerContext(request);if(owner.response)return owner.response;
 return NextResponse.json({devices:owner.devices},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const owner=await ownerContext(request);if(owner.response)return owner.response;
 let subscriptionId:string;
 try{
  if(Number(request.headers.get('content-length')??0)>1024)throw Error();
  const raw=await request.text();if(raw.length>1024)throw Error();const body=JSON.parse(raw);
  if(body.confirmIPhone!==true || typeof body.subscriptionId!=='string' || !owner.devices.some(d=>d.id===body.subscriptionId))throw Error();
  subscriptionId=body.subscriptionId;
 }catch{return NextResponse.json({state:'failed',message:'Select and confirm your active iPhone subscription.'},{status:400});}
 const secret=process.env.CRON_SECRET;
 if(!secret || secret.length<32 || process.env.WRA_DISABLE_PROVIDER_CALLS==='1')return NextResponse.json({state:'failed',message:'Test Push is unavailable.'},{status:503});
 try{
  const result=await runOwnerTestPush({companyId:HOMEFIX_PRIVATE_COMPANY_ID,userId:owner.context.userId,subscriptionId,now:Date.now()},body=>pilotWorker(new Request(request.url,{method:'POST',headers:{authorization:`Bearer ${secret}`,'x-homefix-staff-token':owner.context.accessToken,'content-type':'application/json'},body:JSON.stringify(body)})));
  return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({state:'failed',message:'Outcome uncertain. No automatic retry. Check your iPhone before requesting another test.'},{status:409});}
}
