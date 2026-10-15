"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {getSupabaseBrowserClient} from '@/lib/supabase/client';
import {useCommunicationsAttention} from '../communications/CommunicationsAttentionProvider';
import {CommunicationSourceIcon} from '../communications/CommunicationSourceIcon';
import {notificationHref,type NotificationInbox,type StaffNotification} from '@/lib/notifications/contracts';
const empty:NotificationInbox={items:[],unread_count:0,as_of:''};
type State={inbox:NotificationInbox;error:string|null;loading:boolean;refresh:()=>void;read:(id?:string)=>Promise<boolean>};
const Context=createContext<State>({inbox:empty,error:null,loading:true,refresh:()=>{},read:async()=>false});
export function NotificationProvider({children}:{children:ReactNode}) {
 const {companyId}=useCommunicationsAttention();
 const [userId,setUserId]=useState<string|null>(null);
 const [inbox,setInbox]=useState(empty);const [error,setError]=useState<string|null>(null);const [loading,setLoading]=useState(true);
 const refreshRef=useRef<()=>void>(()=>{});
 const scopeRef=useRef('');
 useEffect(()=>{
  const db=getSupabaseBrowserClient();if(!db)return;
  let live=true;let currentId:string|null|undefined;
  const apply=(id:string|null)=>{if(live && currentId!==id){currentId=id;setUserId(id);setInbox(empty);}};
  void db.auth.getSession().then(({data})=>apply(data.session?.user.id??null));
  const {data}=db.auth.onAuthStateChange((_event,session)=>apply(session?.user.id??null));
  return()=>{live=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  const db=getSupabaseBrowserClient();if(!db || !companyId || !userId)return;
  let live=true,request=0;let timer:ReturnType<typeof setTimeout>|undefined;
  const scope=`${companyId}:${userId}`;scopeRef.current=scope;
  async function load(){
   const version=++request;setLoading(true);
   const result=await db!.rpc('list_staff_notifications',{p_company:companyId!});
   if(!live || version!==request)return;
   setLoading(false);
   if(result.error){setInbox(empty);setError('Notifications are unavailable. The database update may be required.');return;}
   setInbox(result.data as unknown as NotificationInbox);setError(null);
  }
  const refresh=()=>{if(!live)return;clearTimeout(timer);timer=setTimeout(()=>void load(),150);};
  refreshRef.current=refresh;refresh();
  const channel=db.channel(`staff-notifications:${scope}`).on('postgres_changes',{event:'*',schema:'public',table:'staff_notifications',filter:`recipient_profile_id=eq.${userId}`},refresh).subscribe(status=>{
   if(!live)return;
   if(status==='SUBSCRIBED')refresh();
   if(status==='CHANNEL_ERROR' || status==='TIMED_OUT')setError('Live updates disconnected. Refresh to check notifications.');
  });
  const foreground=()=>{if(document.visibilityState==='visible')refresh();};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',foreground);
  return()=>{live=false;scopeRef.current='';refreshRef.current=()=>{};clearTimeout(timer);void db.removeChannel(channel);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',foreground);};
 },[companyId,userId]);
 async function read(id?:string){
  const db=getSupabaseBrowserClient();if(!db || !companyId || !userId || (!id && !inbox.as_of))return false;
  const scope=scopeRef.current;
  const result=await db.rpc('read_staff_notifications',{p_company:companyId,p_id:id??null,p_before:id?null:inbox.as_of});
  if(scope!==scopeRef.current)return false;
  if(result.error){setError('Could not mark notifications read. Please retry.');return false;}
  refreshRef.current();return true;
 }
 const scopedInbox=inbox.items.some(n=>n.company_id!==companyId || n.recipient_profile_id!==userId)?empty:inbox;
 return <Context.Provider value={{inbox:scopedInbox,error,loading,refresh:()=>refreshRef.current(),read}}>{children}</Context.Provider>;
}
export function NotificationBell(){
 const {inbox,error,loading,refresh,read}=useContext(Context);const router=useRouter();
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const button=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[open]);
 async function acknowledge(n?:StaffNotification,navigate=false){if(busy)return;setBusy(true);try{if(await read(n?.id)){const href=n && notificationHref(n);if(navigate && href){setOpen(false);router.push(href);}}}finally{setBusy(false);}}
 return <div className="relative">
  <button ref={button} type="button" aria-label={`Notifications, ${inbox.unread_count} unread`} aria-expanded={open} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-blue-500 hover:bg-blue-50" onClick={()=>{setOpen(!open);if(!open)refresh();}}>
   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6" /></svg>
   {inbox.unread_count>0?<span className="absolute right-0 top-0 rounded-full bg-blue-600 px-1.5 text-xs text-white">{inbox.unread_count>99?'99+':inbox.unread_count}</span>:null}
  </button>
  {open?<section aria-label="Notification center" className="fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[100] max-h-[calc(100dvh-24px-env(safe-area-inset-bottom))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg sm:left-auto sm:right-5 sm:w-96">
   <div className="flex items-center justify-between"><h2 className="font-bold">Notifications</h2><button autoFocus className="min-h-11 min-w-11" aria-label="Close notifications" onClick={()=>{setOpen(false);button.current?.focus();}}>×</button></div>
   <div className="flex justify-between"><button className="min-h-11 text-sm text-blue-600 disabled:opacity-50" disabled={busy || !inbox.unread_count} onClick={()=>void acknowledge()}>Mark all as read</button><button className="min-h-11 px-3 text-sm text-blue-600" onClick={refresh}>Refresh</button></div>
   {error?<p role="status" className="text-sm text-amber-700">{error}</p>:null}
   {loading?<p role="status" className="text-sm text-slate-500">Updating…</p>:null}
   {!loading && !error && !inbox.items.length?<p className="py-4 text-sm text-slate-500">No notifications yet.</p>:null}
   <ul>{inbox.items.map(n=><li key={n.id} className={`border-t border-slate-100 py-2 ${n.read_at?'':'bg-blue-50/50'}`}>
    <div className="flex gap-2"><CommunicationSourceIcon source={n.source_type}/><div className="min-w-0 flex-1">
     <button disabled={busy || !notificationHref(n)} onClick={()=>void acknowledge(n,true)} className={`min-h-11 w-full break-words text-left text-sm ${n.read_at?'font-medium':'font-bold'}`}>{n.title}{!n.read_at?<span className="sr-only">, unread</span>:null}</button>
     {n.summary?<p className="text-sm text-slate-500">{n.summary}</p>:null}<time className="text-xs text-slate-500" dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time>
     {!n.read_at?<button disabled={busy} className="block min-h-11 text-xs text-blue-600" onClick={()=>void acknowledge(n)}>Mark as read</button>:null}
    </div></div>
   </li>)}</ul><p className="mt-2 text-xs text-slate-400">Latest 100 notifications. Staff Push is managed in Settings. Telegram and SMS delivery are not enabled.</p>
  </section>:null}
 </div>;
}
