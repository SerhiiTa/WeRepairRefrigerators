// Preserve key presence: omitted fields must never become implicit nulls.
const wizardFields = {"customerId": "linked_customer_id", "customerFirstName": "customer_first_name", "customerLastName": "customer_last_name", "customerName": "customer_name", "customerPhone": "customer_phone", "customerEmail": "customer_email", "serviceAddress": "service_address", "unit": "unit", "city": "city", "state": "state", "zipCode": "zip_code", "applianceType": "appliance_type", "brand": "brand", "modelNumber": "model_number", "serialNumber": "serial_number", "problemDescription": "problem_description", "appointmentDate": "appointment_date", "windowStartTime": "window_start_time", "windowEndTime": "window_end_time", "assignedTechnicianId": "assigned_technician_id", "scheduleMode": "schedule_mode"} as const;
export function validateConversationJobPayload(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Wizard fields must be an object.");
  const result: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!Object.hasOwn(wizardFields, key)) throw new Error(`Unsupported Wizard field: ${key}.`);
    if (raw !== null && typeof raw !== "string") throw new Error(`Invalid Wizard field: ${key}.`);
    if (typeof raw === "string" && raw.length > 2000) throw new Error(`Wizard field is too long: ${key}.`);
    const field = wizardFields[key as keyof typeof wizardFields];
    const text = typeof raw === "string" ? raw.trim() : null;
    if (field === "schedule_mode" && text !== "now" && text !== "later") throw new Error("Choose Schedule Now or Later.");
    if ((field === "linked_customer_id" || field === "assigned_technician_id") && text !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) throw new Error(`Invalid ID: ${key}.`);
    result[field] = text;
  }
  return result;
}
