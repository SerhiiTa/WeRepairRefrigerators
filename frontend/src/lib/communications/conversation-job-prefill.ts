type Row = Record<string, unknown>;
const text = (...values: unknown[]): string => values.find(v => typeof v === "string" && v.trim()) as string || "";
function requestedSnapshot(request: Row): Row | null {
  const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  const extracted = object(object(request.extracted_data).requested_appointment);
  const raw = object(object(request.raw_payload).requested_appointment);
  const snapshot = Object.keys(extracted).length ? extracted : Object.keys(raw).length ? raw : null;
  return snapshot;
}
export function parseRequestedTime(value: unknown): string {
  const input = text(value).trim();
  const twelve = /^(0?[1-9]|1[0-2])(?::([0-5]\d))?\s*(AM|PM)$/i.exec(input);
  if (twelve) return `${String(Number(twelve[1]) % 12 + (twelve[3].toUpperCase() === "PM" ? 12 : 0)).padStart(2,"0")}:${twelve[2] || "00"}`;
  const clock = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(input);
  return clock ? `${clock[1].padStart(2,"0")}:${clock[2]}` : "";
}
function requestedSchedule(request: Row) {
  const snapshot = requestedSnapshot(request);
  const date = text(snapshot ? snapshot.date : request.appointment_date);
  const start = parseRequestedTime(snapshot ? snapshot.windowStartTime : request.window_start_time)
    || parseRequestedTime(snapshot ? snapshot.preferredWindow : request.preferred_appointment_window);
  const suppliedEnd = text(snapshot ? snapshot.windowEndTime : request.window_end_time);
  let end = parseRequestedTime(suppliedEnd);
  let scheduleSuggestion = "";
  if (start && !suppliedEnd) {
    const [hour, minute] = start.split(":").map(Number);
    // Existing booking contract requires end > start on the same date.
    if (hour + 2 < 24) {
      end = `${String(hour + 2).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
      scheduleSuggestion = "End time is a suggested 2-hour window, not selected by the customer.";
    } else {
      scheduleSuggestion = "A 2-hour window would end the next day. Choose a valid same-day window or Schedule Later.";
    }
  }
  return {
    appointmentDate: /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date ? date : "",
    windowStartTime: start, windowEndTime: end, scheduleSuggestion,
  };
}
// Keep the submitted preference separate from editable booking fields.
export function requestedAppointmentReference(request: Row): string {
  const snapshot = requestedSnapshot(request);
  const date = text(snapshot ? snapshot.date : request.appointment_date);
  const preferred = text(snapshot ? snapshot.preferredWindow : request.preferred_appointment_window);
  const timeLabel = (value: unknown) => {
    const time = text(value);
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return time;
    const [hour, minute] = time.split(":");
    return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? "AM" : "PM"}`;
  };
  const window = [snapshot ? snapshot.windowStartTime : request.window_start_time, snapshot ? snapshot.windowEndTime : request.window_end_time].map(timeLabel).filter(Boolean).join(" – ");
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
    ? new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(date)) : date;
  return [dateLabel, preferred || window, text(snapshot?.timezone)].filter(Boolean).join(" · ");
}
export function validateConversationSchedule(form: Record<string, string>): string | null {
  if (form.scheduleMode !== "now") return null;
  const date = form.appointmentDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return "Choose a valid appointment date.";
  if (![form.windowStartTime, form.windowEndTime].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return "Choose a valid start and end time.";
  if (form.windowEndTime <= form.windowStartTime) return "End time must be after start time.";
  return null;
}
export function buildConversationJobPrefill(conversation: Row, request: Row = {}, lead: Row = {}, customer: Row = {}, asset: Row = {}) {
  const name = text(customer.full_name, request.customer_name, lead.customer_name, conversation.customer_display_name);
  const parts = name.trim().split(/\s+/);
  return {
    selectedCustomerId: text(customer.id), selectedAssetId: text(asset.id),
    customerFirstName: customer.id ? text(customer.first_name, parts[0]) : text(request.customer_first_name, lead.customer_first_name, parts[0]),
    customerLastName: customer.id ? text(customer.last_name, parts.slice(1).join(" ")) : text(request.customer_last_name, lead.customer_last_name, parts.slice(1).join(" ")),
    customerPhone: text(customer.phone, request.customer_phone, lead.customer_phone, conversation.customer_phone),
    customerEmail: text(customer.email, request.customer_email, lead.customer_email, conversation.customer_email),
    customerSearch: name,
    serviceAddress: text(request.service_address, lead.service_address, conversation.service_address, customer.street_address),
    unit: text(request.unit, lead.unit, customer.unit), city: text(request.city, lead.city, customer.city),
    state: text(request.state, lead.state, customer.state, "TX"), zipCode: text(request.zip_code, lead.zip_code, customer.zip_code),
    applianceType: text(asset.appliance_type, request.appliance_type, lead.appliance_type, "Refrigerator"),
    brand: text(asset.brand, request.brand, lead.brand), modelNumber: text(asset.model_number, request.model_number),
    serialNumber: text(asset.serial_number, request.serial_number),
    problemDescription: text(request.problem_description, lead.problem_description, conversation.summary),
    requestedAppointmentReference: requestedAppointmentReference(request),
    ...requestedSchedule(request),
    assignedTechnicianId: "", scheduleMode: "later" as const,
  };
}
export function mergeConversationPrefill<T extends object>(current: T, incoming: Partial<T>, edited: ReadonlySet<keyof T>): T {
  const next = {...current};
  for (const key of Object.keys(incoming) as (keyof T)[]) if (!edited.has(key) && incoming[key] !== undefined) next[key] = incoming[key]!;
  return next;
}
export function conversationWizardPayload(form: Record<string,string>, canonicalCustomerId: string | null) {
  const result: Record<string,string|null> = {};
  for (const key of ["customerFirstName","customerLastName","customerPhone","customerEmail","serviceAddress","unit","city","state","zipCode","applianceType","brand","modelNumber","serialNumber","problemDescription"]) result[key]=form[key]?.trim() || null;
  result.customerName=[form.customerFirstName,form.customerLastName].filter(Boolean).join(" ").trim();
  result.customerId=canonicalCustomerId || form.selectedCustomerId || null;
  result.scheduleMode=form.scheduleMode;
  for (const key of ["appointmentDate","windowStartTime","windowEndTime","assignedTechnicianId"]) result[key]=form.scheduleMode==='now' ? form[key] || null : null;
  return result;
}
