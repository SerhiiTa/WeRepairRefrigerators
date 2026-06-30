import type {
  CustomerPreferredTimeWindow,
  DispatcherRecommendation,
  DispatcherRecommendationReason,
  DispatcherRecommendationResponse,
} from "./dispatcher-recommendations";

export type DispatcherResponseTone = "friendly" | "concise";

export type DispatcherResponseChannel = "phone" | "sms" | "internal";

export type DispatcherNoAvailabilityReason =
  | "invalid_request"
  | "unsupported_zip"
  | "no_slots"
  | "outside_rules";

export type DispatcherResponseRequest = {
  recommendations: DispatcherRecommendationResponse;
  requestedZipCode: string;
  requestedDate: string;
  preferredTimeWindow?: CustomerPreferredTimeWindow;
  emergency?: boolean;
  companyDisplayName?: string;
  showTechnicianDisplayName?: boolean;
  tone?: DispatcherResponseTone;
  channel?: DispatcherResponseChannel;
};

export type DispatcherResponseOption = {
  text: string;
  reasonCodes: DispatcherRecommendationReason[];
};

export type DispatcherResponseResult = {
  primaryResponseText: string;
  backupResponseText: string | null;
  noAvailabilityResponseText: string | null;
  internalSummary: string;
  reasonCodes: DispatcherRecommendationReason[];
  noAvailabilityReason?: DispatcherNoAvailabilityReason;
};

function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  }).format(new Date(isoDate));
}

export function formatCustomerDateLabel(isoOrDate: string): string {
  const date = isoOrDate.includes("T")
    ? new Date(isoOrDate)
    : new Date(`${isoOrDate}T12:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  }).format(date);
}

export function formatCustomerWindowLabel(recommendation: DispatcherRecommendation): string {
  return `${formatTime(recommendation.startsAt)} - ${formatTime(recommendation.endsAt)}`;
}

function getTechnicianPhrase(
  recommendation: DispatcherRecommendation,
  showTechnicianDisplayName: boolean,
): string {
  if (!showTechnicianDisplayName || !recommendation.technicianDisplayName) {
    return "one of our technicians";
  }

  return recommendation.technicianDisplayName;
}

function getNoAvailabilityReason(
  request: DispatcherResponseRequest,
): DispatcherNoAvailabilityReason {
  const firstError = request.recommendations.errors[0]?.toLowerCase() ?? "";

  if (firstError.includes("zip")) {
    return "unsupported_zip";
  }

  if (firstError.includes("date") || firstError.includes("rule")) {
    return "outside_rules";
  }

  if (request.recommendations.errors.length > 0) {
    return "invalid_request";
  }

  return "no_slots";
}

export function buildPrimaryRecommendationText(
  recommendation: DispatcherRecommendation,
  request: DispatcherResponseRequest,
): DispatcherResponseOption {
  const companyPrefix = request.companyDisplayName
    ? `${request.companyDisplayName} has`
    : "We have";
  const dateLabel = formatCustomerDateLabel(recommendation.startsAt);
  const windowLabel = formatCustomerWindowLabel(recommendation);
  const technicianPhrase = getTechnicianPhrase(
    recommendation,
    Boolean(request.showTechnicianDisplayName),
  );
  const emergencyNote = request.emergency
    ? " Since this is marked urgent, we can treat this as a priority option, but it is not confirmed until you choose it."
    : "";

  return {
    text: `${companyPrefix} an available ${recommendation.timeWindowLabel.toLowerCase()} window on ${dateLabel}, between ${windowLabel}, with ${technicianPhrase}. Would that work for you?${emergencyNote}`,
    reasonCodes: recommendation.reasonCodes,
  };
}

export function buildBackupRecommendationText(
  recommendation: DispatcherRecommendation | null,
  request: DispatcherResponseRequest,
): DispatcherResponseOption | null {
  if (!recommendation) {
    return null;
  }

  const dateLabel = formatCustomerDateLabel(recommendation.startsAt);
  const windowLabel = formatCustomerWindowLabel(recommendation);
  const technicianPhrase = getTechnicianPhrase(
    recommendation,
    Boolean(request.showTechnicianDisplayName),
  );

  return {
    text: `Another option is ${dateLabel} in the ${recommendation.timeWindowLabel.toLowerCase()}, between ${windowLabel}, with ${technicianPhrase}.`,
    reasonCodes: recommendation.reasonCodes,
  };
}

export function buildNoAvailabilityText(
  request: DispatcherResponseRequest,
): { text: string; reason: DispatcherNoAvailabilityReason } {
  const reason = getNoAvailabilityReason(request);

  if (reason === "unsupported_zip") {
    return {
      reason,
      text: `I do not see an available appointment window for ZIP code ${request.requestedZipCode}. I can check another nearby ZIP code or the next available service day.`,
    };
  }

  if (reason === "outside_rules") {
    return {
      reason,
      text: "I do not see an available appointment window for that date. I can check the next available business day.",
    };
  }

  return {
    reason,
    text: "I do not see an available appointment window for that ZIP code and date. I can check the next available day.",
  };
}

/**
 * Builds safe customer-facing scheduling message drafts from deterministic
 * dispatcher recommendations. Future AI phone dispatcher, SMS reply, CRM
 * booking, calendar confirmation, and technician contact masking flows should
 * use this output as draft language only; it never sends messages or confirms
 * an appointment.
 */
export function buildDispatcherSchedulingResponse(
  request: DispatcherResponseRequest,
): DispatcherResponseResult {
  const bestRecommendation = request.recommendations.bestRecommendation;
  const backupRecommendation = request.recommendations.backupRecommendations[0] ?? null;

  if (!bestRecommendation) {
    const noAvailability = buildNoAvailabilityText(request);

    return {
      primaryResponseText: noAvailability.text,
      backupResponseText: null,
      noAvailabilityResponseText: noAvailability.text,
      internalSummary: `No scheduling recommendation for ${request.requestedZipCode} on ${request.requestedDate}: ${noAvailability.reason}.`,
      reasonCodes: [],
      noAvailabilityReason: noAvailability.reason,
    };
  }

  const primary = buildPrimaryRecommendationText(bestRecommendation, request);
  const backup = buildBackupRecommendationText(backupRecommendation, request);

  return {
    primaryResponseText: primary.text,
    backupResponseText: backup?.text ?? null,
    noAvailabilityResponseText: null,
    internalSummary: `Best recommendation: ${bestRecommendation.technicianId} on ${formatCustomerDateLabel(bestRecommendation.startsAt)} ${formatCustomerWindowLabel(bestRecommendation)}. Backups: ${request.recommendations.backupRecommendations.length}.`,
    reasonCodes: primary.reasonCodes,
  };
}
