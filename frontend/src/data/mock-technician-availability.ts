import { getPublicTechnicians, getPublicTechnicianBySlug } from "@/lib/public-seo-data";
import type { TechnicianProfilePreview } from "@/types/public-seo";
import type {
  CoverageMatch,
  TechnicianAvailability,
  TechnicianAvailabilityContext,
  TechnicianCoverageProfile,
  WorkloadLevel,
} from "@/types/technician-availability";

export const mockTechnicianAvailability: TechnicianAvailability[] = [
  {
    technicianSlug: "marisol-reyes",
    nextAvailableWindow: "Today, 2:00-5:00 PM",
    availabilityStatus: "Available Today",
    workloadLevel: "Moderate",
    mockDailyJobCount: 4,
    coverageStatus: "Strong central Houston coverage",
    extendedAreaZips: ["77024", "77055"],
  },
  {
    technicianSlug: "andre-lewis",
    nextAvailableWindow: "Tomorrow, 9:00 AM-12:00 PM",
    availabilityStatus: "Available Tomorrow",
    workloadLevel: "Heavy",
    mockDailyJobCount: 6,
    coverageStatus: "Priority sealed-system coverage",
    extendedAreaZips: ["77008", "77080"],
  },
  {
    technicianSlug: "nina-patel",
    nextAvailableWindow: "Today, 12:00-3:00 PM",
    availabilityStatus: "Limited Availability",
    workloadLevel: "Light",
    mockDailyJobCount: 3,
    coverageStatus: "West Houston premium appliance coverage",
    extendedAreaZips: ["77450", "77478", "77079"],
  },
];

export function getTechnicianAvailability(slug: string) {
  return mockTechnicianAvailability.find((availability) => availability.technicianSlug === slug);
}

export function getCoverageMatch(
  technician: TechnicianProfilePreview,
  searchedZip: string,
): CoverageMatch {
  const normalizedZip = searchedZip.trim();
  const availability = getTechnicianAvailability(technician.slug);

  if (normalizedZip && technician.zipCodes?.includes(normalizedZip)) {
    return "Exact ZIP";
  }

  if (normalizedZip && availability?.extendedAreaZips.includes(normalizedZip)) {
    return "Extended Area";
  }

  return "Nearby ZIP";
}

export function getTechnicianAvailabilityContext(
  technician: TechnicianProfilePreview,
  searchedZip: string,
): TechnicianAvailabilityContext | null {
  const availability = getTechnicianAvailability(technician.slug);

  if (!availability) {
    return null;
  }

  return {
    ...availability,
    coverageMatch: getCoverageMatch(technician, searchedZip),
  };
}

export function getTechnicianCoverageProfiles(): TechnicianCoverageProfile[] {
  return getPublicTechnicians()
    .map((technician) => {
      const availability = getTechnicianAvailability(technician.slug);

      if (!availability) {
        return null;
      }

      return {
        ...technician,
        availability,
      };
    })
    .filter((technician): technician is TechnicianCoverageProfile => Boolean(technician));
}

export function getCoverageProfilesByZip(zipCode: string) {
  const normalizedZip = zipCode.trim();
  const coverageProfiles = getTechnicianCoverageProfiles();

  if (!normalizedZip || normalizedZip === "All ZIP codes") {
    return coverageProfiles;
  }

  return coverageProfiles.filter((profile) => {
    const directZips = profile.zipCodes ?? [];
    const extendedZips = profile.availability.extendedAreaZips;

    return directZips.includes(normalizedZip) || extendedZips.includes(normalizedZip);
  });
}

export function getCoverageProfilesByWorkload(
  workloadLevel: WorkloadLevel | "All workloads",
  profiles = getTechnicianCoverageProfiles(),
) {
  if (workloadLevel === "All workloads") {
    return profiles;
  }

  return profiles.filter((profile) => profile.availability.workloadLevel === workloadLevel);
}

export function getPublicTechnicianAvailability(slug: string, searchedZip: string) {
  const technician = getPublicTechnicianBySlug(slug);

  if (!technician) {
    return null;
  }

  return getTechnicianAvailabilityContext(technician, searchedZip);
}
