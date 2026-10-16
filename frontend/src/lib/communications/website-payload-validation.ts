// Validate before the existing string normalizer can silently discard input.
function validateAllExtras(payload: {requestedAppointment?: unknown; formFields?: unknown}): string[] {
  const errors: string[] = [];
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (payload.formFields !== undefined) {
    if (!record(payload.formFields)) errors.push('formFields must be an object keyed by original field ID.');
    else for (const [id, field] of Object.entries(payload.formFields)) {
      if (!id || !record(field) || typeof field.label !== 'string' || !Object.hasOwn(field, 'value')) {
        errors.push('Each formFields entry must preserve its field ID, label and value.'); break;
      }
    }
  }
  const a = payload.requestedAppointment;
  if (a === undefined) return errors;
  if (!record(a)) return [...errors, 'requestedAppointment must be an object.'];
  for (const [key, max] of Object.entries({date:32,windowStartTime:32,windowEndTime:32,preferredWindow:255,timezone:120})) {
    if (a[key] !== undefined && (typeof a[key] !== 'string' || (a[key] as string).length > max)) errors.push(`requestedAppointment.${key} must be a string of at most ${max} characters.`);
  }
  const text = (key: string) => typeof a[key] === 'string' ? (a[key] as string).trim() : '';
  const date = text('date');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) errors.push('requestedAppointment.date must be a valid YYYY-MM-DD date.');
  const start = text('windowStartTime'), end = text('windowEndTime');
  if ((start || end) && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end)) errors.push('Requested window requires valid HH:mm start/end times with end after start.');
  // preferredWindow is a preference, not an operational booking window. Preserve
  // free text; validate clock-shaped selections without inventing a duration.
  const preferred = text('preferredWindow');
  if (/^\d{1,2}:\d{2}(?:\s*[ap]m)?$/i.test(preferred) && !/^(?:(?:[01]?\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2]):[0-5]\d\s*[ap]m)$/i.test(preferred)) errors.push('requestedAppointment.preferredWindow contains an invalid selected time.');
  const zone = text('timezone');
  if (zone) { try { new Intl.DateTimeFormat('en-US',{timeZone:zone}); } catch { errors.push('requestedAppointment.timezone must be a valid timezone.'); } }
  return errors;
}

// Appointment mistakes must not discard an otherwise legitimate intake. Original
// input and warnings are retained in provider metadata, and formFields is untouched.
export function normalizeWebsiteAppointment(input: unknown): {
  appointment: {date?: string; windowStartTime?: string; windowEndTime?: string; preferredWindow?: string; timezone?: string}; warnings: string[];
} {
  const warnings = validateAllExtras({requestedAppointment: input});
  const appointment: {date?: string; windowStartTime?: string; windowEndTime?: string; preferredWindow?: string; timezone?: string} = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {appointment,warnings};
  const a = input as Record<string,unknown>;
  for (const key of ['date','preferredWindow','timezone'] as const) {
    const value = a[key];
    if (typeof value === 'string' && value.trim() && validateAllExtras({requestedAppointment:{[key]:value}}).length === 0) appointment[key] = value.trim();
  }
  if (validateAllExtras({requestedAppointment:{windowStartTime:a.windowStartTime,windowEndTime:a.windowEndTime}}).length === 0) {
    if (typeof a.windowStartTime === 'string' && a.windowStartTime.trim()) appointment.windowStartTime = a.windowStartTime.trim();
    if (typeof a.windowEndTime === 'string' && a.windowEndTime.trim()) appointment.windowEndTime = a.windowEndTime.trim();
  }
  return {appointment,warnings};
}
export function validateWebsiteSubmissionExtras(payload: {requestedAppointment?: unknown; formFields?: unknown}): string[] {
  return validateAllExtras({formFields:payload.formFields});
}
