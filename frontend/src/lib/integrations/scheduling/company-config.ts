import type { AppointmentDuration, TravelBuffer } from "./types";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CompanyBusinessHours = {
  startTime: string;
  endTime: string;
  workingDays: Weekday[];
  timezone: string;
};

export type CompanyServiceArea = {
  allowedZipCodes: string[];
  primaryZipCodes: string[];
  secondaryZipCodes: string[];
};

export type CompanyAppointmentDefaults = {
  defaultAppointmentDuration: AppointmentDuration;
  defaultTravelBuffer: TravelBuffer;
  defaultSchedulingWindowDays: number;
  slotStepMinutes: number;
};

export type CompanySchedulingRules = {
  sameDaySchedulingEnabled: boolean;
  sameDayCutoffTime: string;
  nextDaySchedulingEnabled: boolean;
  maximumSchedulingHorizonDays: number;
};

export type CompanyEmergencyRules = {
  afterHoursSchedulingEnabled: boolean;
  weekendSchedulingEnabled: boolean;
  emergencyDispatchEnabled: boolean;
};

export type CompanySchedulingConfig = {
  businessHours: CompanyBusinessHours;
  serviceArea: CompanyServiceArea;
  appointmentDefaults: CompanyAppointmentDefaults;
  schedulingRules: CompanySchedulingRules;
  emergencyRules: CompanyEmergencyRules;
};

export type SchedulingConfigValidationResult = {
  valid: boolean;
  errors: string[];
};

const DEFAULT_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

function isValidClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function clockTimeToMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function normalizeZip(zipCode: string): string {
  return zipCode.trim();
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeZip).filter(Boolean)));
}

function mergeValidationResults(
  ...results: SchedulingConfigValidationResult[]
): SchedulingConfigValidationResult {
  const errors = results.flatMap((result) => result.errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Default Houston-area business hours for provider-free scheduling. Future CRM
 * booking, AI Dispatcher, and Google Calendar sync tasks can use this as a
 * bootstrap config before company-specific settings are persisted.
 */
export function createDefaultBusinessHours(): CompanyBusinessHours {
  return {
    startTime: "08:00",
    endTime: "17:00",
    workingDays: DEFAULT_WEEKDAYS,
    timezone: "America/Chicago",
  };
}

export function createDefaultSchedulingConfig(): CompanySchedulingConfig {
  return {
    businessHours: createDefaultBusinessHours(),
    serviceArea: {
      allowedZipCodes: [],
      primaryZipCodes: [],
      secondaryZipCodes: [],
    },
    appointmentDefaults: {
      defaultAppointmentDuration: { minutes: 90 },
      defaultTravelBuffer: { beforeMinutes: 15, afterMinutes: 15 },
      defaultSchedulingWindowDays: 14,
      slotStepMinutes: 30,
    },
    schedulingRules: {
      sameDaySchedulingEnabled: true,
      sameDayCutoffTime: "12:00",
      nextDaySchedulingEnabled: true,
      maximumSchedulingHorizonDays: 30,
    },
    emergencyRules: {
      afterHoursSchedulingEnabled: false,
      weekendSchedulingEnabled: false,
      emergencyDispatchEnabled: false,
    },
  };
}

export function validateBusinessHours(
  businessHours: CompanyBusinessHours,
): SchedulingConfigValidationResult {
  const errors: string[] = [];

  if (!isValidClockTime(businessHours.startTime)) {
    errors.push("Business hours startTime must use HH:mm 24-hour format.");
  }

  if (!isValidClockTime(businessHours.endTime)) {
    errors.push("Business hours endTime must use HH:mm 24-hour format.");
  }

  if (
    isValidClockTime(businessHours.startTime) &&
    isValidClockTime(businessHours.endTime) &&
    clockTimeToMinutes(businessHours.endTime) <= clockTimeToMinutes(businessHours.startTime)
  ) {
    errors.push("Business hours endTime must be later than startTime.");
  }

  if (businessHours.workingDays.length === 0) {
    errors.push("Business hours must include at least one working day.");
  }

  if (businessHours.workingDays.some((day) => day < 0 || day > 6)) {
    errors.push("Business hours workingDays must be numbers from 0 to 6.");
  }

  if (!businessHours.timezone.trim()) {
    errors.push("Business hours timezone is required.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateServiceArea(
  serviceArea: CompanyServiceArea,
): SchedulingConfigValidationResult {
  const errors: string[] = [];
  const allowedZipCodes = uniqueValues(serviceArea.allowedZipCodes);
  const primaryZipCodes = uniqueValues(serviceArea.primaryZipCodes);
  const secondaryZipCodes = uniqueValues(serviceArea.secondaryZipCodes);
  const allowedSet = new Set(allowedZipCodes);

  if (allowedZipCodes.length === 0) {
    errors.push("Service area must include at least one allowed ZIP code.");
  }

  for (const zipCode of [...primaryZipCodes, ...secondaryZipCodes]) {
    if (!allowedSet.has(zipCode)) {
      errors.push(`Service area ZIP ${zipCode} must also appear in allowedZipCodes.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateSchedulingRules(
  schedulingRules: CompanySchedulingRules,
): SchedulingConfigValidationResult {
  const errors: string[] = [];

  if (!isValidClockTime(schedulingRules.sameDayCutoffTime)) {
    errors.push("Scheduling rules sameDayCutoffTime must use HH:mm 24-hour format.");
  }

  if (schedulingRules.maximumSchedulingHorizonDays < 1) {
    errors.push("Scheduling rules maximumSchedulingHorizonDays must be at least 1.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateAppointmentDefaults(
  appointmentDefaults: CompanyAppointmentDefaults,
): SchedulingConfigValidationResult {
  const errors: string[] = [];

  if (appointmentDefaults.defaultAppointmentDuration.minutes < 1) {
    errors.push("Appointment default duration must be at least 1 minute.");
  }

  if ((appointmentDefaults.defaultTravelBuffer.beforeMinutes ?? 0) < 0) {
    errors.push("Appointment default travel buffer beforeMinutes cannot be negative.");
  }

  if ((appointmentDefaults.defaultTravelBuffer.afterMinutes ?? 0) < 0) {
    errors.push("Appointment default travel buffer afterMinutes cannot be negative.");
  }

  if (appointmentDefaults.defaultSchedulingWindowDays < 1) {
    errors.push("Appointment default scheduling window must be at least 1 day.");
  }

  if (appointmentDefaults.slotStepMinutes < 1) {
    errors.push("Appointment default slot step must be at least 1 minute.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateSchedulingConfig(
  config: CompanySchedulingConfig,
): SchedulingConfigValidationResult {
  return mergeValidationResults(
    validateBusinessHours(config.businessHours),
    validateServiceArea(config.serviceArea),
    validateSchedulingRules(config.schedulingRules),
    validateAppointmentDefaults(config.appointmentDefaults),
  );
}
