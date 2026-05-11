import type { CommunityLanguage } from "@/types/community";

export type ExpertLevel = "rising" | "trusted" | "expert" | "master";

export type ExpertBadgeRarity = "common" | "advanced" | "elite";

export type ReputationVisibility = "private_technician_network";

export type ExpertBadge = {
  id: string;
  label: string;
  category: string;
  iconLabel: string;
  description: string;
  rarity: ExpertBadgeRarity;
  earnedAt: string;
};

export type TechnicianReputation = {
  id: string;
  technicianName: string;
  role: string;
  serviceAreas: string[];
  specialties: string[];
  reputationScore: number;
  helpfulPoints: number;
  acceptedSolutions: number;
  discussionsStarted: number;
  helpfulReplies: number;
  expertLevel: ExpertLevel;
  badges: ExpertBadge[];
  languages: CommunityLanguage[];
  joinedAt: string;
  lastActiveAt: string;
  solvedBrands: string[];
  solvedApplianceTypes: string[];
  visibility: ReputationVisibility;
};

export type ReputationFilters = {
  specialty: string;
  expertLevel: "All levels" | ExpertLevel;
  language: "All languages" | CommunityLanguage;
  applianceType: string;
  brand: string;
  sortBy: "Reputation score" | "Accepted solutions" | "Helpful replies" | "Helpful points";
};
