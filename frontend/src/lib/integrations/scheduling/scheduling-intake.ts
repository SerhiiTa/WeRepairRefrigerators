import type { CustomerPreferredTimeWindow } from "./dispatcher-recommendations";

export type SchedulingIntakeSource =
  | "phone_call"
  | "sms"
  | "website_form"
  | "ai_chat"
  | "manual_admin"
  | "unknown";

export type SchedulingCustomerInfo = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type SchedulingServiceInfo = {
  applianceType?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  issueDescription?: string | null;
};

export type SchedulingLocationInfo = {
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

export type SchedulingPreferenceInfo = {
  requestedDate?: string | null;
  preferredTimeWindow?: CustomerPreferredTimeWindow | string | null;
  emergency?: boolean | null;
};

export type SchedulingIntakeRequest = {
  source?: SchedulingIntakeSource | string | null;
  customer?: SchedulingCustomerInfo;
  service?: SchedulingServiceInfo;
  location?: SchedulingLocationInfo;
  preferences?: SchedulingPreferenceInfo;
};

export type NormalizedSchedulingIntake = {
  source: SchedulingIntakeSource;
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  service: {
    applianceType: string | null;
    brand: string | null;
    modelNumber: string | null;
    issueDescription: string | null;
  };
  location: {
    streetAddress: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
  preferences: {
    requestedDate: string | null;
    preferredTimeWindow: CustomerPreferredTimeWindow | null;
    emergency: boolean;
  };
};

export type SchedulingIntakeValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalized: NormalizedSchedulingIntake;
};

const intakeSources: SchedulingIntakeSource[] = [
  "phone_call",
  "sms",
  "website_form",
  "ai_chat",
  "manual_admin",
  "unknown",
];

const preferredWindowAliases: Record<string, CustomerPreferredTimeWindow> = {
  am: "morning",
  morning: "morning",
  mid_day: "midday",
  midday: "midday",
  noon: "midday",
  afternoon: "afternoon",
  late: "late_afternoon",
  late_afternoon: "late_afternoon",
  "late afternoon": "late_afternoon",
  evening: "evening",
  pm: "afternoon",
};

function cleanText(value?: string | null): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeState(value?: string | null): string | null {
  const cleaned = cleanText(value);

  return cleaned ? cleaned.toUpperCase() : null;
}

function normalizeEmail(value?: string | null): string | null {
  const cleaned = cleanText(value);

  return cleaned ? cleaned.toLowerCase() : null;
}

export function normalizeZipCode(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (digits.length < 5) {
    return null;
  }

  if (digits.length >= 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  }

  return digits.slice(0, 5);
}

export function normalizePhoneNumberForDisplay(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  const normalizedDigits =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (normalizedDigits.length !== 10) {
    return cleanText(value);
  }

  return `(${normalizedDigits.slice(0, 3)}) ${normalizedDigits.slice(
    3,
    6,
  )}-${normalizedDigits.slice(6)}`;
}

export function normalizeRequestedDate(value?: string | null): string | null {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const parsedDate = new Date(`${cleaned}T12:00:00`);

    return Number.isNaN(parsedDate.getTime()) ? null : cleaned;
  }

  const parsedDate = new Date(cleaned);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().slice(0, 10);
}

export function normalizePreferredWindow(
  value?: CustomerPreferredTimeWindow | string | null,
): CustomerPreferredTimeWindow | null {
  const cleaned = cleanText(value)?.toLowerCase().replace(/[-\s]+/g, "_") ?? "";

  return preferredWindowAliases[cleaned] ?? null;
}

export function normalizeIntakeSource(
  value?: SchedulingIntakeSource | string | null,
): SchedulingIntakeSource {
  const cleaned = cleanText(value)?.toLowerCase().replace(/[-\s]+/g, "_") ?? "";

  return intakeSources.includes(cleaned as SchedulingIntakeSource)
    ? (cleaned as SchedulingIntakeSource)
    : "unknown";
}

/**
 * Normalizes customer scheduling intake from future AI Dispatcher calls, SMS,
 * website forms, CRM service request creation, and manual admin entry before
 * availability matching or technician dispatch recommendation. This function
 * is provider-free and storage-free.
 */
export function normalizeSchedulingIntake(
  request: SchedulingIntakeRequest,
): NormalizedSchedulingIntake {
  return {
    source: normalizeIntakeSource(request.source),
    customer: {
      name: cleanText(request.customer?.name),
      phone: normalizePhoneNumberForDisplay(request.customer?.phone),
      email: normalizeEmail(request.customer?.email),
    },
    service: {
      applianceType: cleanText(request.service?.applianceType),
      brand: cleanText(request.service?.brand),
      modelNumber: cleanText(request.service?.modelNumber),
      issueDescription: cleanText(request.service?.issueDescription),
    },
    location: {
      streetAddress: cleanText(request.location?.streetAddress),
      city: cleanText(request.location?.city),
      state: normalizeState(request.location?.state),
      zipCode: normalizeZipCode(request.location?.zipCode),
    },
    preferences: {
      requestedDate: normalizeRequestedDate(request.preferences?.requestedDate),
      preferredTimeWindow: normalizePreferredWindow(
        request.preferences?.preferredTimeWindow,
      ),
      emergency: Boolean(request.preferences?.emergency),
    },
  };
}

export function validateSchedulingLocation(
  location: NormalizedSchedulingIntake["location"],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!location.zipCode) {
    errors.push("A valid ZIP code is required for scheduling availability.");
  }

  if (!location.streetAddress) {
    warnings.push("Street address is missing; routing and travel-time logic will be limited.");
  }

  if (!location.city || !location.state) {
    warnings.push("City or state is missing; future dispatcher scripts may need confirmation.");
  }

  return { errors, warnings };
}

export function validateSchedulingServiceInfo(
  service: NormalizedSchedulingIntake["service"],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!service.applianceType) {
    errors.push("Appliance type is required before matching service availability.");
  }

  if (!service.issueDescription) {
    errors.push("Issue description is required before creating a scheduling recommendation.");
  }

  if (!service.brand) {
    warnings.push("Brand is missing; technician preparation may be less precise.");
  }

  return { errors, warnings };
}

export function validateSchedulingPreferences(
  preferences: NormalizedSchedulingIntake["preferences"],
): { errors: string[]; warnings: string[] } {
  const warnings: string[] = [];

  if (!preferences.requestedDate) {
    warnings.push("Requested date is missing; availability should default to the next allowed day.");
  }

  if (!preferences.preferredTimeWindow) {
    warnings.push("Preferred time window is missing; dispatcher recommendations can use earliest available.");
  }

  return { errors: [], warnings };
}

export function validateSchedulingIntake(
  request: SchedulingIntakeRequest,
): SchedulingIntakeValidationResult {
  const normalized = normalizeSchedulingIntake(request);
  const locationValidation = validateSchedulingLocation(normalized.location);
  const serviceValidation = validateSchedulingServiceInfo(normalized.service);
  const preferenceValidation = validateSchedulingPreferences(normalized.preferences);
  const warnings = [
    ...locationValidation.warnings,
    ...serviceValidation.warnings,
    ...preferenceValidation.warnings,
  ];
  const errors = [
    ...locationValidation.errors,
    ...serviceValidation.errors,
    ...preferenceValidation.errors,
  ];

  if (!normalized.customer.phone && !normalized.customer.email) {
    warnings.push("Customer phone or email is missing; follow-up contact may be limited.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}
