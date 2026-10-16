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
  raw_payload?: unknown;
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
  const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const extracted = object(object(r.extracted_data).requested_appointment);
  const raw = object(object(r.raw_payload).requested_appointment);
  // Submission snapshots survive Schedule Later and later scheduling edits. Never
  // combine a submitted window with a different, subsequently scheduled window.
  const snapshot = Object.keys(extracted).length ? extracted : Object.keys(raw).length ? raw : null;
  const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
  const date = snapshot ? text(snapshot.date) : r.appointment_date;
  const start = snapshot ? text(snapshot.windowStartTime) : r.window_start_time;
  const end = snapshot ? text(snapshot.windowEndTime) : r.window_end_time;
  const preferred = snapshot ? text(snapshot.preferredWindow) : r.preferred_appointment_window;
  const timezone = snapshot ? text(snapshot.timezone) : null;
  // Date-only and wall-clock input must not shift across browser timezones.
  const dateLabel = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
    ? new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(date)) : date;
  const timeLabel = (value?: string | null) => {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return value;
    const [hour,minute] = value.split(':');
    return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'AM' : 'PM'}`;
  };
  const time = [timeLabel(start),timeLabel(end)].filter(Boolean).join(' – ');
  return [
    ['Customer',name],['Phone',r.customer_phone],['Email',r.customer_email],['Appliance',r.appliance_type],['Brand',r.brand],['Model',r.model_number],['Serial number',r.serial_number],
    ['Problem',r.problem_description || fallbackBody],['Service address',address],
    ['Requested date',dateLabel],['Requested time',time],['Requested window',preferred],['Requested timezone',timezone],
    ['Additional notes',r.raw_message && r.raw_message !== r.problem_description && r.raw_message !== fallbackBody ? r.raw_message : null],
  ].filter((field): field is [string,string] => Boolean(field[1]?.trim()));
}
