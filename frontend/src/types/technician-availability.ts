import type { TechnicianProfilePreview } from "@/types/public-seo";

export type AvailabilityStatus =
  | "Available Today"
  | "Available Tomorrow"
  | "Limited Availability"
  | "Fully Booked";

export type CoverageMatch = "Exact ZIP" | "Nearby ZIP" | "Extended Area";

export type WorkloadLevel = "Light" | "Moderate" | "Heavy";

export type TechnicianAvailability = {
  technicianSlug: string;
  nextAvailableWindow: string;
  availabilityStatus: AvailabilityStatus;
  workloadLevel: WorkloadLevel;
  mockDailyJobCount: number;
  coverageStatus: string;
  extendedAreaZips: string[];
};

export type TechnicianAvailabilityContext = TechnicianAvailability & {
  coverageMatch: CoverageMatch;
};

export type TechnicianCoverageProfile = TechnicianProfilePreview & {
  availability: TechnicianAvailability;
};
