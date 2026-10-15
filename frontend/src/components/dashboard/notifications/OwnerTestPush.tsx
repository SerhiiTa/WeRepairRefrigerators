'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabaseBrowserClient} from '@/lib/supabase/client';
type Device={id:string};
async function call(method='GET',body?:unknown){
 const session=await getSupabaseBrowserClient()?.auth.getSession();const token=session?.data.session?.access_token;
 if(!token)throw new Error('Sign in as the HomeFix owner.');
 const response=await fetch('/api/notifications/test-push',{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await response.json();if(!response.ok)throw new Error(data.message??data.error??'Test unavailable.');return data;
}
export function OwnerTestPush({userId}:{userId:string|null}){
 const [devices,setDevices]=useState<Device[]|null>(null),[device,setDevice]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [state,setState]=useState<'idle'|'sending'|'accepted'|'failed'>('idle'),[message,setMessage]=useState('');
 const pending=useRef(false);
 useEffect(()=>{
  let live=true;
  if(userId)void call().then(data=>{if(live){setDevices(data.devices);setDevice(data.devices.length===1?data.devices[0].id:'');}}).catch(()=>{if(live)setDevices(null);});
  return()=>{live=false;};
 },[userId]);
 async function send(){
  if(pending.current||!device||!confirmed||state!=='idle')return;
  pending.current=true;setState('sending');setMessage('Sending one synthetic test…');
  try{const result=await call('POST',{subscriptionId:device,confirmIPhone:true});setState('accepted');setMessage(result.message);}
  catch(e){setState('failed');setMessage(e instanceof Error?e.message:'Outcome uncertain. No automatic retry.');}
  finally{pending.current=false;}
 }
 if(!devices)return null;
 return <div className="mt-4 border-t border-slate-100 pt-3">
  {devices.length===0?<p className="text-sm text-slate-600">Enable Push on your iPhone Home Screen app first, then reload these settings.</p>:<>
   <p className="text-sm text-slate-600">Lock your iPhone before sending. One test per five-minute window. Apple subscriptions do not include a device model; select only a subscription you recognize.</p>
   <label className="mt-2 block text-sm">Target Apple subscription<select className="mt-1 block max-w-full rounded-lg border border-slate-300 p-2" value={device} disabled={state!=='idle'} onChange={e=>{setDevice(e.target.value);setConfirmed(false);}}><option value="">Select a device</option>{devices.map(d=><option key={d.id} value={d.id}>Apple device · {d.id}</option>)}</select></label>
   <label className="my-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={state!=='idle'} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this subscription belongs to my iPhone.</label>
   <button type="button" onClick={()=>void send()} disabled={!device||!confirmed||state!=='idle'} className="min-h-11 rounded-xl border border-blue-600 px-4 text-blue-700 disabled:opacity-50">{state==='sending'?'Sending…':state==='accepted'?'Accepted':state==='failed'?'Failed':'Send Test Push to My iPhone'}</button>
   <p role="status" aria-live="polite" className="mt-2 text-sm text-slate-600">{message}</p>
  </>}
 </div>;
}
