const LEADS = "/dashboard/communication-leads";

export function getLeadReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return LEADS;
  try {
    const url = new URL(value, "https://homefix.invalid");
    if (url.origin !== "https://homefix.invalid" || url.hash) return LEADS;
    if (url.pathname === LEADS) return url.pathname + url.search;
    if (url.pathname !== "/dashboard/communications") return LEADS;
    const id = url.searchParams.get("conversation");
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return LEADS;
    return url.pathname + url.search;
  } catch {
    return LEADS;
  }
}

export function getLeadConversationHref(conversationId: string | null): string | null {
  return conversationId
    ? `/dashboard/communications?${new URLSearchParams({ conversation: conversationId, view: "detail" })}`
    : null;
}
