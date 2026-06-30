import type {
  CompanyConfiguredAvailabilityResponse,
} from "./company-availability";
import type { TechnicianAvailabilityCandidate } from "./availability-engine";

export type DispatcherRecommendationPriority = "best" | "backup";

export type DispatcherTimeWindowLabel =
  | "Morning"
  | "Midday"
  | "Afternoon"
  | "Late Afternoon"
  | "Evening";

export type DispatcherRecommendationReason =
  | "earliest_available"
  | "matches_requested_zip"
  | "same_day_available"
  | "next_day_available"
  | "fewer_conflicts"
  | "within_business_hours"
  | "emergency_candidate"
  | "preferred_window_match";

export type CustomerPreferredTimeWindow =
  | "morning"
  | "midday"
  | "afternoon"
  | "late_afternoon"
  | "evening";

export type DispatcherRecommendationRequest = {
  availability: CompanyConfiguredAvailabilityResponse;
  requestedZipCode: string;
  requestedDate: string;
  preferredTimeWindow?: CustomerPreferredTimeWindow;
  emergency?: boolean;
  maxRecommendations?: number;
};

export type DispatcherRecommendation = {
  priority: DispatcherRecommendationPriority;
  technicianId: string;
  technicianDisplayName?: string;
  startsAt: string;
  endsAt: string;
  timeWindowLabel: DispatcherTimeWindowLabel;
  customerWindowLabel: string;
  conflictCount: number;
  reasonCodes: DispatcherRecommendationReason[];
};

export type DispatcherRecommendationResponse = {
  bestRecommendation: DispatcherRecommendation | null;
  backupRecommendations: DispatcherRecommendation[];
  recommendations: DispatcherRecommendation[];
  errors: string[];
};

function getHourInChicago(isoDate: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoDate));

  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

function getDateKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function addReason(
  reasons: DispatcherRecommendationReason[],
  reason: DispatcherRecommendationReason,
): DispatcherRecommendationReason[] {
  return reasons.includes(reason) ? reasons : [...reasons, reason];
}

export function labelServiceWindow(startsAt: string): {
  label: DispatcherTimeWindowLabel;
  customerWindowLabel: string;
  preferredWindow: CustomerPreferredTimeWindow;
} {
  const hour = getHourInChicago(startsAt);

  if (hour < 12) {
    return {
      label: "Morning",
      customerWindowLabel: "Morning window, 9 AM - 12 PM",
      preferredWindow: "morning",
    };
  }

  if (hour < 15) {
    return {
      label: "Afternoon",
      customerWindowLabel: "Afternoon window, 12 PM - 3 PM",
      preferredWindow: "afternoon",
    };
  }

  if (hour < 18) {
    return {
      label: "Late Afternoon",
      customerWindowLabel: "Late afternoon window, 3 PM - 6 PM",
      preferredWindow: "late_afternoon",
    };
  }

  return {
    label: "Evening",
    customerWindowLabel: "Evening window, after 6 PM",
    preferredWindow: "evening",
  };
}

export function getRecommendationReasons(
  candidate: TechnicianAvailabilityCandidate,
  request: DispatcherRecommendationRequest,
): DispatcherRecommendationReason[] {
  const serviceWindow = labelServiceWindow(candidate.slot.startsAt);
  let reasons: DispatcherRecommendationReason[] = [
    "within_business_hours",
    "matches_requested_zip",
  ];

  if (getDateKey(candidate.slot.startsAt) === request.requestedDate) {
    reasons = addReason(reasons, "same_day_available");
  } else {
    reasons = addReason(reasons, "next_day_available");
  }

  if (candidate.conflictCount === 0) {
    reasons = addReason(reasons, "fewer_conflicts");
  }

  if (request.preferredTimeWindow === serviceWindow.preferredWindow) {
    reasons = addReason(reasons, "preferred_window_match");
  }

  if (request.emergency) {
    reasons = addReason(reasons, "emergency_candidate");
  }

  return reasons;
}

function scorePreferredWindow(
  recommendation: DispatcherRecommendation,
  preferredTimeWindow?: CustomerPreferredTimeWindow,
): number {
  if (!preferredTimeWindow) {
    return 0;
  }

  return recommendation.reasonCodes.includes("preferred_window_match") ? -1 : 1;
}

/**
 * Converts raw provider-free availability candidates into customer-friendly
 * dispatcher recommendations. Future AI Dispatcher scripts, SMS/call copy,
 * CRM booking, Google Calendar confirmation, and maps-based routing can use
 * these deterministic recommendations before adding provider-specific steps.
 */
export function createDispatcherRecommendations(
  request: DispatcherRecommendationRequest,
): DispatcherRecommendation[] {
  return request.availability.candidates.map((candidate) => {
    const serviceWindow = labelServiceWindow(candidate.slot.startsAt);

    return {
      priority: "backup",
      technicianId: candidate.technicianId,
      technicianDisplayName: candidate.displayName,
      startsAt: candidate.slot.startsAt,
      endsAt: candidate.slot.endsAt,
      timeWindowLabel: serviceWindow.label,
      customerWindowLabel: serviceWindow.customerWindowLabel,
      conflictCount: candidate.conflictCount,
      reasonCodes: getRecommendationReasons(candidate, request),
    };
  });
}

export function rankDispatcherRecommendations(
  recommendations: DispatcherRecommendation[],
  request: DispatcherRecommendationRequest,
): DispatcherRecommendation[] {
  return [...recommendations].sort((first, second) => {
    const firstStartMs = Date.parse(first.startsAt);
    const secondStartMs = Date.parse(second.startsAt);
    const emergencyRank = request.emergency
      ? Number(!first.reasonCodes.includes("emergency_candidate")) -
        Number(!second.reasonCodes.includes("emergency_candidate"))
      : 0;

    return (
      emergencyRank ||
      firstStartMs - secondStartMs ||
      scorePreferredWindow(first, request.preferredTimeWindow) -
        scorePreferredWindow(second, request.preferredTimeWindow) ||
      first.conflictCount - second.conflictCount ||
      first.technicianId.localeCompare(second.technicianId)
    );
  });
}

export function selectBestRecommendation(
  recommendations: DispatcherRecommendation[],
): DispatcherRecommendation | null {
  return recommendations[0] ?? null;
}

export function generateDispatcherRecommendationResponse(
  request: DispatcherRecommendationRequest,
): DispatcherRecommendationResponse {
  if (!request.availability.valid) {
    return {
      bestRecommendation: null,
      backupRecommendations: [],
      recommendations: [],
      errors: request.availability.errors,
    };
  }

  const rankedRecommendations = rankDispatcherRecommendations(
    createDispatcherRecommendations(request),
    request,
  )
    .slice(0, request.maxRecommendations ?? 3)
    .map((recommendation, index) => ({
      ...recommendation,
      priority: (index === 0 ? "best" : "backup") as DispatcherRecommendationPriority,
      reasonCodes:
        index === 0
          ? addReason(recommendation.reasonCodes, "earliest_available")
          : recommendation.reasonCodes,
    }));
  const bestRecommendation = selectBestRecommendation(rankedRecommendations);

  return {
    bestRecommendation,
    backupRecommendations: rankedRecommendations.slice(1),
    recommendations: rankedRecommendations,
    errors: [],
  };
}
