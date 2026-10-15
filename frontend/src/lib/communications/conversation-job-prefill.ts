type Row = Record<string, unknown>;
const text = (...values: unknown[]): string => values.find(v => typeof v === "string" && v.trim()) as string || "";
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
    appointmentDate: text(request.appointment_date), windowStartTime: text(request.window_start_time).slice(0,5),
    windowEndTime: text(request.window_end_time).slice(0,5),
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
