import { generateAvailabilitySlots } from "./availability";
import type {
  AppointmentDuration,
  AvailabilitySlot,
  BusyTimeBlock,
  TechnicianWorkBlock,
  TravelBuffer,
} from "./types";

export type TechnicianServiceArea = {
  zipCodes: string[];
  primaryZipCode?: string;
};

export type TechnicianAvailabilityProfile = {
  technicianId: string;
  displayName?: string;
  serviceArea: TechnicianServiceArea;
  workBlocks: TechnicianWorkBlock[];
  busyBlocks?: BusyTimeBlock[];
};

export type TechnicianAvailabilityRequest = {
  requestedZipCode: string;
  technicians: TechnicianAvailabilityProfile[];
  appointmentDuration: AppointmentDuration;
  travelBuffer?: TravelBuffer;
  slotStepMinutes?: number;
  maxSlotsPerTechnician?: number;
  maxCandidates?: number;
};

export type TechnicianAvailabilityCandidate = {
  technicianId: string;
  displayName?: string;
  slot: AvailabilitySlot;
  conflictCount: number;
  serviceAreaMatch: "primary_zip" | "service_zip";
};

export type TechnicianAvailabilityResponse = {
  requestedZipCode: string;
  candidates: TechnicianAvailabilityCandidate[];
  techniciansEvaluated: number;
  techniciansSupportingZip: number;
};

function normalizeZip(zipCode: string): string {
  return zipCode.trim().toLowerCase();
}

export function technicianSupportsZip(
  technician: TechnicianAvailabilityProfile,
  requestedZipCode: string,
): boolean {
  const requestedZip = normalizeZip(requestedZipCode);

  if (!requestedZip) {
    return false;
  }

  return technician.serviceArea.zipCodes.some((zipCode) => normalizeZip(zipCode) === requestedZip);
}

export function filterTechniciansByZip(
  technicians: TechnicianAvailabilityProfile[],
  requestedZipCode: string,
): TechnicianAvailabilityProfile[] {
  return technicians.filter((technician) => technicianSupportsZip(technician, requestedZipCode));
}

function getServiceAreaMatch(
  technician: TechnicianAvailabilityProfile,
  requestedZipCode: string,
): TechnicianAvailabilityCandidate["serviceAreaMatch"] {
  return normalizeZip(technician.serviceArea.primaryZipCode ?? "") === normalizeZip(requestedZipCode)
    ? "primary_zip"
    : "service_zip";
}

/**
 * Builds provider-free availability candidates for each technician that services
 * the requested ZIP. Future Google Calendar, CRM appointment, Maps/travel, and
 * AI Dispatcher inputs should be normalized into the profile shape before this
 * engine runs.
 */
export function buildAvailabilityCandidates(
  request: TechnicianAvailabilityRequest,
): TechnicianAvailabilityCandidate[] {
  const technicians = filterTechniciansByZip(request.technicians, request.requestedZipCode);
  const candidates: TechnicianAvailabilityCandidate[] = [];

  for (const technician of technicians) {
    const availability = generateAvailabilitySlots({
      workBlocks: technician.workBlocks,
      busyBlocks: technician.busyBlocks ?? [],
      appointmentDuration: request.appointmentDuration,
      travelBuffer: request.travelBuffer,
      slotStepMinutes: request.slotStepMinutes,
    });
    const slots = availability.slots.slice(0, request.maxSlotsPerTechnician);

    for (const slot of slots) {
      candidates.push({
        technicianId: technician.technicianId,
        displayName: technician.displayName,
        slot,
        conflictCount: availability.normalizedBusyBlocks.length,
        serviceAreaMatch: getServiceAreaMatch(technician, request.requestedZipCode),
      });
    }
  }

  return candidates;
}

export function rankAvailabilityCandidates(
  candidates: TechnicianAvailabilityCandidate[],
): TechnicianAvailabilityCandidate[] {
  return [...candidates].sort((first, second) => {
    const firstStartMs = Date.parse(first.slot.startsAt);
    const secondStartMs = Date.parse(second.slot.startsAt);

    return (
      firstStartMs - secondStartMs ||
      first.conflictCount - second.conflictCount ||
      first.technicianId.localeCompare(second.technicianId)
    );
  });
}

export function generateAvailabilityResponse(
  request: TechnicianAvailabilityRequest,
): TechnicianAvailabilityResponse {
  const supportingTechnicians = filterTechniciansByZip(request.technicians, request.requestedZipCode);
  const rankedCandidates = rankAvailabilityCandidates(buildAvailabilityCandidates(request));
  const candidates =
    typeof request.maxCandidates === "number" && request.maxCandidates >= 0
      ? rankedCandidates.slice(0, request.maxCandidates)
      : rankedCandidates;

  return {
    requestedZipCode: request.requestedZipCode,
    candidates,
    techniciansEvaluated: request.technicians.length,
    techniciansSupportingZip: supportingTechnicians.length,
  };
}
