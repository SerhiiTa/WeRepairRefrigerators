import {
  validateSchedulingConfig,
  type CompanySchedulingConfig,
  type SchedulingConfigValidationResult,
  type Weekday,
} from "./company-config";
import {
  generateAvailabilityResponse,
  type TechnicianAvailabilityProfile,
  type TechnicianAvailabilityRequest,
  type TechnicianAvailabilityResponse,
} from "./availability-engine";
import type { BusyTimeBlock, TechnicianWorkBlock } from "./types";

export type CompanyAvailabilityTechnicianInput = {
  technicianId: string;
  displayName?: string;
  serviceZipCodes?: string[];
  primaryZipCode?: string;
  workBlocks?: TechnicianWorkBlock[];
  busyBlocks?: BusyTimeBlock[];
};

export type CompanyConfiguredAvailabilityRequest = {
  config: CompanySchedulingConfig;
  requestedZipCode: string;
  requestedDate: string;
  technicians: CompanyAvailabilityTechnicianInput[];
  now?: Date;
  maxSlotsPerTechnician?: number;
  maxCandidates?: number;
};

export type CompanyConfiguredAvailabilityResponse = TechnicianAvailabilityResponse & {
  valid: boolean;
  errors: string[];
};

function normalizeZip(zipCode: string): string {
  return zipCode.trim();
}

function uniqueZipCodes(zipCodes: string[]): string[] {
  return Array.from(new Set(zipCodes.map(normalizeZip).filter(Boolean)));
}

function getWeekdayInTimezone(date: Date, timezone: string): Weekday | null {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(date);
    const weekdays: Record<string, Weekday> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return weekdays[weekday] ?? null;
  } catch {
    return null;
  }
}

function getDateKeyInTimezone(date: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function getClockMinutesInTimezone(date: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

function clockTimeToMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");

  return Number(hours) * 60 + Number(minutes);
}

function emptyCompanyResponse(
  requestedZipCode: string,
  techniciansEvaluated: number,
  errors: string[],
): CompanyConfiguredAvailabilityResponse {
  return {
    requestedZipCode,
    candidates: [],
    techniciansEvaluated,
    techniciansSupportingZip: 0,
    valid: errors.length === 0,
    errors,
  };
}

function buildWorkBlockForDate(
  technicianId: string,
  requestedDate: string,
  config: CompanySchedulingConfig,
): TechnicianWorkBlock {
  // Provider-free scheduling uses plain JavaScript dates. Future Google
  // Calendar sync can replace these work blocks with provider-normalized UTC
  // events while preserving the same availability engine contract.
  const startsAt = new Date(`${requestedDate}T${config.businessHours.startTime}:00`).toISOString();
  const endsAt = new Date(`${requestedDate}T${config.businessHours.endTime}:00`).toISOString();

  return {
    technicianId,
    startsAt,
    endsAt,
    source: "manual",
    label: "Company business hours",
  };
}

function mergeServiceAreaWithCompanyRules(
  technician: CompanyAvailabilityTechnicianInput,
  config: CompanySchedulingConfig,
): { zipCodes: string[]; primaryZipCode?: string } {
  const allowedZipCodes = new Set(uniqueZipCodes(config.serviceArea.allowedZipCodes));
  const technicianZipCodes = uniqueZipCodes(
    technician.serviceZipCodes && technician.serviceZipCodes.length > 0
      ? technician.serviceZipCodes
      : config.serviceArea.allowedZipCodes,
  );
  const zipCodes = technicianZipCodes.filter((zipCode) => allowedZipCodes.has(zipCode));
  const primaryZipCode =
    technician.primaryZipCode && zipCodes.includes(technician.primaryZipCode)
      ? technician.primaryZipCode
      : config.serviceArea.primaryZipCodes.find((zipCode) => zipCodes.includes(zipCode));

  return {
    zipCodes,
    primaryZipCode,
  };
}

export function isSameDaySchedulingAllowed(
  config: CompanySchedulingConfig,
  requestedDate: string,
  now: Date = new Date(),
): boolean {
  if (!config.schedulingRules.sameDaySchedulingEnabled) {
    return false;
  }

  const today = getDateKeyInTimezone(now, config.businessHours.timezone);
  const currentMinutes = getClockMinutesInTimezone(now, config.businessHours.timezone);

  if (today !== requestedDate || currentMinutes === null) {
    return true;
  }

  return currentMinutes <= clockTimeToMinutes(config.schedulingRules.sameDayCutoffTime);
}

export function isSchedulingDateAllowed(
  config: CompanySchedulingConfig,
  requestedDate: string,
  now: Date = new Date(),
): boolean {
  const requestedDateValue = new Date(`${requestedDate}T00:00:00`);
  const requestedWeekday = getWeekdayInTimezone(
    requestedDateValue,
    config.businessHours.timezone,
  );
  const today = getDateKeyInTimezone(now, config.businessHours.timezone);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = getDateKeyInTimezone(tomorrow, config.businessHours.timezone);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + config.schedulingRules.maximumSchedulingHorizonDays);

  if (requestedWeekday === null || !config.businessHours.workingDays.includes(requestedWeekday)) {
    return false;
  }

  if (today === requestedDate && !isSameDaySchedulingAllowed(config, requestedDate, now)) {
    return false;
  }

  if (tomorrowKey === requestedDate && !config.schedulingRules.nextDaySchedulingEnabled) {
    return false;
  }

  return requestedDateValue <= maxDate;
}

export function applyCompanyServiceAreaRules(
  config: CompanySchedulingConfig,
  technicians: CompanyAvailabilityTechnicianInput[],
): TechnicianAvailabilityProfile[] {
  return technicians
    .map((technician) => ({
      technicianId: technician.technicianId,
      displayName: technician.displayName,
      serviceArea: mergeServiceAreaWithCompanyRules(technician, config),
      workBlocks: [],
      busyBlocks: technician.busyBlocks,
    }))
    .filter((technician) => technician.serviceArea.zipCodes.length > 0);
}

export function technicianProfileFromCompanyDefaults(
  config: CompanySchedulingConfig,
  technician: CompanyAvailabilityTechnicianInput,
  requestedDate: string,
): TechnicianAvailabilityProfile {
  const serviceArea = mergeServiceAreaWithCompanyRules(technician, config);

  return {
    technicianId: technician.technicianId,
    displayName: technician.displayName,
    serviceArea,
    workBlocks: [
      ...(technician.workBlocks !== undefined
        ? technician.workBlocks
        : [buildWorkBlockForDate(technician.technicianId, requestedDate, config)]),
    ],
    busyBlocks: technician.busyBlocks,
  };
}

/**
 * Converts company-level scheduling policy into the provider-free availability
 * engine request. Future company admin settings, CRM appointments, AI
 * Dispatcher booking suggestions, and Google Calendar sync can all produce the
 * same plain TypeScript request without coupling the engine to a provider.
 */
export function buildAvailabilityRequestFromCompanyConfig(
  request: CompanyConfiguredAvailabilityRequest,
): { request: TechnicianAvailabilityRequest | null; validation: SchedulingConfigValidationResult } {
  const validation = validateSchedulingConfig(request.config);
  const errors = [...validation.errors];

  if (!isSchedulingDateAllowed(request.config, request.requestedDate, request.now)) {
    errors.push("Requested date is not allowed by company scheduling rules.");
  }

  if (!request.config.serviceArea.allowedZipCodes.includes(request.requestedZipCode)) {
    errors.push("Requested ZIP code is not inside the company service area.");
  }

  if (errors.length > 0) {
    return {
      request: null,
      validation: { valid: false, errors },
    };
  }

  return {
    request: {
      requestedZipCode: request.requestedZipCode,
      technicians: request.technicians.map((technician) =>
        technicianProfileFromCompanyDefaults(
          request.config,
          technician,
          request.requestedDate,
        ),
      ),
      appointmentDuration: request.config.appointmentDefaults.defaultAppointmentDuration,
      travelBuffer: request.config.appointmentDefaults.defaultTravelBuffer,
      slotStepMinutes: request.config.appointmentDefaults.slotStepMinutes,
      maxSlotsPerTechnician: request.maxSlotsPerTechnician,
      maxCandidates: request.maxCandidates,
    },
    validation: { valid: true, errors: [] },
  };
}

export function generateCompanyAvailabilityResponse(
  request: CompanyConfiguredAvailabilityRequest,
): CompanyConfiguredAvailabilityResponse {
  const builtRequest = buildAvailabilityRequestFromCompanyConfig(request);

  if (!builtRequest.request) {
    return emptyCompanyResponse(
      request.requestedZipCode,
      request.technicians.length,
      builtRequest.validation.errors,
    );
  }

  return {
    ...generateAvailabilityResponse(builtRequest.request),
    valid: true,
    errors: [],
  };
}
