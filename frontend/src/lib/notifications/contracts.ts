export type StaffNotification = {
 id:string; company_id:string; recipient_profile_id:string; event_type:string; source_type:string;
 source_id:string; conversation_id:string|null; service_request_id:string|null;
 title:string; summary:string; priority:'normal'|'high'; created_at:string; read_at:string|null;
};
export type NotificationInbox = {items:StaffNotification[]; unread_count:number; as_of:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationHref(n:Pick<StaffNotification,'conversation_id'|'service_request_id'>):string|null {
 if(n.service_request_id && uuid.test(n.service_request_id)) return `/dashboard/leads/${n.service_request_id}`;
 if(n.conversation_id && uuid.test(n.conversation_id)) return `/dashboard/communications?${new URLSearchParams({conversation:n.conversation_id,view:'detail'})}`;
 return null;
}
// NOTIFICATIONS-02A: dormant queue/worker contract; no external adapters are enabled.
export type ExternalDelivery = {
 notificationId:string; recipientProfileId:string; companyId:string;
 channel:'push'|'telegram'|'sms'; dedupeKey:string;
 status:'queued'|'processing'|'sent'|'failed'|'permanently_failed';
 attempt:number; nextAttemptAt:string|null; lastErrorCode:string|null;
};
export type DeliveryPreference = {enabled:boolean; quietStart:string|null; quietEnd:string|null; timezone:string; highPriorityBypass:boolean};
export function externalDeliveryAllowed(preference:DeliveryPreference, priority:string, withinQuietHours:boolean) {
 return preference.enabled && (!withinQuietHours || (priority==='high' && preference.highPriorityBypass));
}
