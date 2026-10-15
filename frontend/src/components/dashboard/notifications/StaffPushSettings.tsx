'use client';
import {useEffect,useState} from 'react';
import {OwnerTestPush} from './OwnerTestPush';
import {getSupabaseBrowserClient} from '@/lib/supabase/client';
const events=['missed_call','inbound_sms','website_request','customer_reply','ai_needs_attention','technician_assigned','appointment_created','appointment_changed','estimate_approved','payment_confirmed','refund_confirmed'];
const recommended=['missed_call','inbound_sms','ai_needs_attention'];
type Device={endpoint:string;status:string};
export function StaffPushSettings(){
 const [publicKey,setPublicKey]=useState<string|null>(null),[selected,setSelected]=useState<string[]>(recommended);
 const [registration,setRegistration]=useState<ServiceWorkerRegistration|null>(null);
 const [status,setStatus]=useState('Loading Push settings…'),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false);
 const [supported,setSupported]=useState(false),[userId,setUserId]=useState<string|null>(null);
 async function api(method='GET',body?:unknown){
  const db=getSupabaseBrowserClient();const session=await db?.auth.getSession();const token=session?.data.session?.access_token;
  if(!token)throw new Error('Sign in to manage staff Push.');
  const response=await fetch('/api/notifications/push',{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const value=await response.json();if(!response.ok)throw new Error(value.error??'Push settings unavailable.');return value;
 }
 useEffect(()=>{
  const db=getSupabaseBrowserClient();if(!db)return;
  let live=true;
  void db.auth.getSession().then(({data})=>{if(live)setUserId(data.session?.user.id??null);});
  const {data}=db.auth.onAuthStateChange((_e,session)=>setUserId(session?.user.id??null));
  return()=>{live=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  let live=true;
  async function load(){
   const iphone=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
   const standalone=window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
   if(!window.isSecureContext){if(live){setSupported(false);setStatus('Push requires HTTPS. A LAN HTTP address cannot enable iPhone Push.');}return;}
   if(iphone&&!standalone){if(live){setSupported(false);setStatus('On iOS 16.4 or later, add HomeFixOS to the Home Screen and open it there to enable Push.');}return;}
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){if(live){setSupported(false);setStatus('This browser does not support Web Push.');}return;}
   try{
    const result=await api();
    const devices=result.settings.devices as Device[];
    if(!live)return;
    setPublicKey(result.publicKey);setSelected(result.settings.events.length||devices.length?result.settings.events:recommended);
    if(!result.publicKey){
     const existing=await navigator.serviceWorker.getRegistration('/');
     const subscription=await existing?.pushManager.getSubscription();
     if(!live)return;
     setRegistration(existing??null);setEnabled(Boolean(subscription&&devices.some(d=>d.endpoint===subscription.endpoint)));
     setSupported(false);setStatus('Push awaits server configuration. Existing device subscriptions can still be disabled.');return;
    }
    const reg=await navigator.serviceWorker.register('/staff-push-sw.js',{scope:'/',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    const subscription=await reg.pushManager.getSubscription();
    if(!live)return;
    const active=Boolean(subscription&&devices.some(d=>d.endpoint===subscription.endpoint&&d.status==='active'));
    setRegistration(reg);setSupported(true);setEnabled(active);
    setStatus(Notification.permission==='denied'?'Permission denied. Allow notifications in device/browser settings, then reload.':active?'Push enabled on this device.':'Push disabled on this device.');
   }catch(e){if(live){setSupported(false);setStatus(e instanceof Error?e.message:'Push unavailable.');}}
  }
  if(userId)void load();
  return()=>{live=false;};
 },[userId]);
 async function enable(){
  if(busy||!registration||!publicKey)return;setBusy(true);
  try{
   // Permission only in this explicit button handler, never during load/login.
   const permission=await Notification.requestPermission();
   if(permission!=='granted'){setStatus('Permission denied. Allow notifications in device/browser settings, then reload.');return;}
   const decoded=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));
   const key=Uint8Array.from(decoded,c=>c.charCodeAt(0));
   const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   await api('POST',{action:'enable',subscription:subscription.toJSON(),events:selected});
   setEnabled(true);setStatus('Push enabled on this device. Event preferences saved for your staff account.');
  }catch(e){setStatus(e instanceof Error?e.message:'Could not enable Push.');}finally{setBusy(false);}
 }
 async function disable(){
  if(busy||!registration)return;setBusy(true);
  try{
   const subscription=await registration.pushManager.getSubscription();
   if(subscription){await api('POST',{action:'disable',endpoint:subscription.endpoint});await subscription.unsubscribe();}
   setEnabled(false);setStatus('Push disabled on this device. Other devices are unchanged.');
  }catch(e){setStatus(e instanceof Error?e.message:'Could not disable Push.');}finally{setBusy(false);}
 }
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
  <h2 className="text-lg font-semibold">Staff Push notifications</h2>
  <p className="mt-2 text-sm text-slate-600" role="status">{status}</p>
  <p className="mt-2 text-sm text-slate-600">Choose events for your account. Existing quiet hours apply. Push service acceptance does not confirm that a notification was seen.</p>
  <fieldset disabled={!supported||busy} className="mt-3 grid gap-1 sm:grid-cols-2"><legend className="sr-only">Push events</legend>{events.map(event=><label key={event} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(event)} onChange={e=>setSelected(old=>e.target.checked?[...old,event]:old.filter(v=>v!==event))}/>{event.replaceAll('_',' ')}</label>)}</fieldset>
  <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={!supported||busy} onClick={()=>void enable()} className="min-h-11 rounded-xl bg-blue-600 px-4 text-white disabled:opacity-50">{enabled?'Save Push preferences':'Enable Push'}</button><button type="button" disabled={!enabled||busy} onClick={()=>void disable()} className="min-h-11 rounded-xl border border-slate-300 px-4 disabled:opacity-50">Disable Push</button></div>
  <OwnerTestPush key={userId} userId={userId}/>
 </section>;
}
