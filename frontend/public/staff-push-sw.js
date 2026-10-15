/* Push only. No fetch interception, asset cache or background polling. */
function safePushPath(value) {
 if(typeof value!=='string')return '/dashboard';
 const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
 if(value==='/dashboard' || new RegExp('^/dashboard/leads/'+uuid+'$').test(value) || new RegExp('^/dashboard/communications\\?conversation='+uuid+'&view=detail$').test(value))return value;
 return '/dashboard';
}
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()??{};}catch{/* Generic notification remains visible. */}
 event.waitUntil(self.registration.showNotification('HomeFixOS',{
  body:data.kind==='staff_push_pilot'?'Synthetic staff Push pilot.':'A staff update is available.',icon:'/icons/icon-192.png',
  tag:typeof data.tag==='string'?data.tag.slice(0,120):'homefix-staff',
  data:{href:safePushPath(data.href)},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(safePushPath(event.notification.data?.href),self.location.origin).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){const navigated=await existing.navigate(target);if(navigated){await navigated.focus();return;}}
  await self.clients.openWindow(target);
 })());
});
