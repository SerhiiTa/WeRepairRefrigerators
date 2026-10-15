// Presentation metadata only. Never derive acquisition source or handler from message text.
export type SourceGlyph = "phone" | "message" | "globe" | "mail" | "bot" | "generic";
type SourceIdentity = { label: string; glyph: SourceGlyph; color: string; fallback?: boolean };
export const communicationSources: Record<string, SourceIdentity> = {
  phone: { label: "Phone", glyph: "phone", color: "text-[#28A745]" },
  sms: { label: "SMS", glyph: "message", color: "text-[#007AFF]" },
  website_form: { label: "Website", glyph: "globe", color: "text-[#7C3AED]" },
  web_chat: { label: "Web Chat", glyph: "message", color: "text-[#0891B2]" },
  email: { label: "Email", glyph: "mail", color: "text-[#64748B]" },
  ai_chatbot: { label: "AI Chatbot", glyph: "bot", color: "text-[#0D9488]" },
  ...Object.fromEntries(Object.entries({instagram:"Instagram",facebook:"Facebook",facebook_messenger:"Messenger",yelp:"Yelp",thumbtack:"Thumbtack",whatsapp:"WhatsApp",telegram:"Telegram",google_business_messages:"Google",manual:"Manual",other:"Other"}).map(([key,label]) => [key,{label,glyph:"generic",color:"text-slate-500",fallback:true}])),
};
// Channel and source are independent; provider/handler is intentionally not an icon input.
// Current list supplies only its canonical sourceType. No acquisition source is inferred.
export function getCommunicationSource({channel, source}: {channel?: string | null; source?: string | null}) {
  const known = (key?: string | null) => key && Object.hasOwn(communicationSources,key) ? communicationSources[key] : undefined;
  return known(source) ?? known(channel) ?? communicationSources.other;
}
export function getConversationAttention(status: string, unreadCount: number) {
  if (status === "resolved" || status === "archived") return null;
  if (status === "needs_action") return {label:"Needs Action",tone:"amber" as const};
  if (status === "open") return {label:"Needs Review",tone:"amber" as const};
  return unreadCount > 0 ? {label:"New",tone:"blue" as const} : null;
}
export function isConversationVisible(desktop: boolean, mobileDetailOpen: boolean, visibility: string) {
  return visibility === "visible" && (desktop || mobileDetailOpen);
}

// Threads use their existing canonical (latest) sourceType, not message contents.
export function matchesInboxChannel(sourceType: string, channel: string, unreadCount = 0) {
  if (channel === "all") return true;
  if (channel === "unread") return unreadCount > 0; // Existing deep links / desktop tab.
  if (channel === "calls") return sourceType === "phone";
  if (channel === "texts") return sourceType === "sms"; // Existing desktop filter.
  if (channel === "messages") return ["sms", "instagram", "facebook_messenger", "whatsapp", "telegram", "google_business_messages"].includes(sourceType);
  if (channel === "web") return ["website_form", "web_chat"].includes(sourceType);
  return false;
}
export function matchesInboxWorkflow(status: string, unreadCount: number, workflow: string) {
  const archived = status === "resolved" || status === "archived";
  if (workflow === "archived") return archived;
  if (archived) return false;
  if (workflow === "unread") return unreadCount > 0;
  if (workflow === "needs_action") return status === "needs_action";
  return true; // Legacy box=assigned remains an active inbox, never a claimed ownership filter.
}
