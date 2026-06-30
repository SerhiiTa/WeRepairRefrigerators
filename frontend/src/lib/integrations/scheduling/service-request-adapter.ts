import {
  createDefaultSchedulingConfig,
  type CompanySchedulingConfig,
} from "./company-config";
import type {
  SchedulingIntakeRequest,
  SchedulingPreferenceInfo,
} from "./scheduling-intake";
import type { DashboardServiceRequest } from "@/lib/service-request-records";

function mapPreferredWindow(
  preferredTimeWindow: string | null,
): SchedulingPreferenceInfo["preferredTimeWindow"] {
  const normalized = preferredTimeWindow?.toLowerCase() ?? "";

  if (normalized.includes("morning") || normalized.includes("am")) {
    return "morning";
  }

  if (normalized.includes("midday") || normalized.includes("noon")) {
    return "midday";
  }

  if (normalized.includes("late")) {
    return "late_afternoon";
  }

  if (normalized.includes("evening")) {
    return "evening";
  }

  if (normalized.includes("afternoon") || normalized.includes("pm")) {
    return "afternoon";
  }

  return null;
}

/**
 * Adapts the current CRM service request shape into provider-free scheduling
 * intake. This is read-only: it does not persist dispatcher output, create
 * appointments, book slots, call providers, or send messages.
 */
export function buildSchedulingIntakeFromServiceRequest(
  request: DashboardServiceRequest,
): SchedulingIntakeRequest {
  return {
    source: request.requestSource,
    customer: {
      name: request.customerName,
      phone: request.customerPhone,
      email: request.customerEmail,
    },
    service: {
      applianceType: request.applianceType,
      brand: request.applianceBrand,
      modelNumber: request.applianceModel,
      issueDescription: request.issueDescription,
    },
    location: {
      streetAddress: request.streetAddress,
      city: request.city,
      state: request.state,
      zipCode: request.zipCode,
    },
    preferences: {
      requestedDate: null,
      preferredTimeWindow: mapPreferredWindow(request.preferredTimeWindow),
      emergency: false,
    },
  };
}

/**
 * Temporary static Houston-area scheduling rules for the read-only CRM preview.
 * Replace with persisted company scheduling settings after reviewed schema/RLS
 * exists.
 */
export function getStaticDispatcherCompanyConfig(): CompanySchedulingConfig {
  return {
    ...createDefaultSchedulingConfig(),
    serviceArea: {
      allowedZipCodes: [
        "77002",
        "77024",
        "77064",
        "77084",
        "77095",
        "77407",
        "77433",
        "77449",
        "77494",
      ],
      primaryZipCodes: ["77494", "77095"],
      secondaryZipCodes: ["77449", "77084", "77064", "77433", "77407"],
    },
  };
}
