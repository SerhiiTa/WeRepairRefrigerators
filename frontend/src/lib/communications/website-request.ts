// Use the same canonical intake row as the existing Create Job prefill.
export type WebsiteRequest = {
  id: string;
  provider_event_id?: string | null;
  provider_lead_id?: string | null;
  customer_name?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  serial_number?: string | null;
  extracted_data?: unknown;
  appliance_type?: string | null;
  brand?: string | null;
  model_number?: string | null;
  problem_description?: string | null;
  service_address?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  appointment_date?: string | null;
  window_start_time?: string | null;
  window_end_time?: string | null;
  preferred_appointment_window?: string | null;
  raw_message?: string | null;
};
export type WebsiteEvent = {
  id: string; type: string; conversationId?: string; intakeRequestId?: string | null;
  body: string | null; eventTime: string;
};
type Message = {source_type: string; conversation_id: string; external_message_id: string | null; occurred_at: string; body: string | null};
export function canonicalWebsiteEvents<T extends WebsiteEvent, M extends Message>(events: T[], messages: M[], requests: WebsiteRequest[]) {
  const seen = new Set<string>();
  const timeline = events.filter(event => {
    if (event.type !== 'website_request' || !event.intakeRequestId) return true;
    const key = `${event.conversationId}:${event.intakeRequestId}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const byId = new Map(requests.map(request => [request.id, request]));
  return {timeline, messages: messages.filter(message => {
    if (message.source_type !== 'website_form') return true;
    const candidates = timeline.filter(event => event.type === 'website_request' && event.conversationId === message.conversation_id);
    // Match the writer's exact submission identity, never customer/phone/description alone.
    if (message.external_message_id && candidates.some(event => {
      const request = byId.get(event.intakeRequestId ?? '');
      return request && [request.provider_event_id, request.provider_lead_id].includes(message.external_message_id);
    })) return false;
    // Older submissions can use a separate externalMessageId. Pair only an unambiguous
    // representation with the identical persisted event time AND body in this conversation.
    const matches = candidates.filter(event => Date.parse(event.eventTime) === Date.parse(message.occurred_at) && event.body === message.body);
    const twins = messages.filter(other => other.source_type === "website_form" && other.conversation_id === message.conversation_id && Date.parse(other.occurred_at) === Date.parse(message.occurred_at) && other.body === message.body);
    return matches.length !== 1 || twins.length !== 1;
  })};
}
export function websiteRequestFields(request?: WebsiteRequest | null, fallbackBody?: string | null) {
  const r = request ?? {id: ''};
  const name = r.customer_name || [r.customer_first_name,r.customer_last_name].filter(Boolean).join(' ');
  const address = [r.service_address, ...[r.unit && `Unit ${r.unit}`,r.city,r.state,r.zip_code].filter(part => part && !r.service_address?.toLowerCase().includes(part.toLowerCase()))].filter(Boolean).join(', ');
  const time = [r.window_start_time?.slice(0,5),r.window_end_time?.slice(0,5)].filter(Boolean).join(' – ');
  const extracted = r.extracted_data && typeof r.extracted_data === 'object' ? r.extracted_data as Record<string, unknown> : {};
  const appointment = extracted.requested_appointment && typeof extracted.requested_appointment === 'object' ? extracted.requested_appointment as Record<string, unknown> : {};
  const timezone = typeof appointment.timezone === 'string' ? appointment.timezone : null;
  return [
    ['Customer',name],['Phone',r.customer_phone],['Email',r.customer_email],['Appliance',r.appliance_type],['Brand',r.brand],['Model',r.model_number],['Serial number',r.serial_number],
    ['Problem',r.problem_description || fallbackBody],['Service address',address],
    ['Requested date',r.appointment_date],['Requested time',time],['Requested window',r.preferred_appointment_window],['Requested timezone',timezone],
    ['Additional notes',r.raw_message && r.raw_message !== r.problem_description && r.raw_message !== fallbackBody ? r.raw_message : null],
  ].filter((field): field is [string,string] => Boolean(field[1]?.trim()));
}
