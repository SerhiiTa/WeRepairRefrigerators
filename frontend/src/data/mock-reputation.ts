import type {
  ExpertBadge,
  ReputationFilters,
  TechnicianReputation,
} from "@/types/reputation";

const sealedSystemExpert: ExpertBadge = {
  id: "badge-sealed-system-expert",
  label: "Sealed System Expert",
  category: "Specialty",
  iconLabel: "SS",
  description: "Consistently accepted answers on compressor, refrigerant, and restriction cases.",
  rarity: "elite",
  earnedAt: "2026-04-18",
};

const subZeroSpecialist: ExpertBadge = {
  id: "badge-sub-zero-specialist",
  label: "Sub-Zero Specialist",
  category: "Brand",
  iconLabel: "SZ",
  description: "Trusted private-community help for premium built-in Sub-Zero service.",
  rarity: "elite",
  earnedAt: "2026-04-24",
};

const samsungRefrigeration: ExpertBadge = {
  id: "badge-samsung-refrigeration",
  label: "Samsung Refrigeration",
  category: "Brand",
  iconLabel: "SG",
  description: "Helpful troubleshooting on Samsung cooling, defrost, and ice maker issues.",
  rarity: "advanced",
  earnedAt: "2026-04-12",
};

const scotsmanIceSystems: ExpertBadge = {
  id: "badge-scotsman-ice-systems",
  label: "Scotsman Ice Systems",
  category: "Specialty",
  iconLabel: "IC",
  description: "Accepted solutions for residential clear ice and water-flow diagnostics.",
  rarity: "advanced",
  earnedAt: "2026-05-03",
};

const boardLevelDiagnostics: ExpertBadge = {
  id: "badge-board-level-diagnostics",
  label: "Board-Level Diagnostics",
  category: "Diagnostics",
  iconLabel: "BD",
  description: "Recognized for control, sensor, and electrical diagnostic clarity.",
  rarity: "advanced",
  earnedAt: "2026-04-30",
};

const multilingualSupport: ExpertBadge = {
  id: "badge-multilingual-support",
  label: "Multilingual Support",
  category: "Community",
  iconLabel: "ML",
  description: "Provides helpful technician replies across multiple language contexts.",
  rarity: "common",
  earnedAt: "2026-04-08",
};

const fastestHelpfulReply: ExpertBadge = {
  id: "badge-fastest-helpful-reply",
  label: "Fastest Helpful Reply",
  category: "Community",
  iconLabel: "FR",
  description: "Frequently adds useful field guidance quickly on urgent threads.",
  rarity: "common",
  earnedAt: "2026-05-05",
};

const topContributor: ExpertBadge = {
  id: "badge-top-community-contributor",
  label: "Top Community Contributor",
  category: "Community",
  iconLabel: "TC",
  description: "High helpfulness and accepted-solution activity in private discussions.",
  rarity: "elite",
  earnedAt: "2026-05-08",
};

export const mockTechnicianReputation: TechnicianReputation[] = [
  {
    id: "rep-andre-lewis",
    technicianName: "Andre Lewis",
    role: "Sealed-system technician",
    serviceAreas: ["Houston", "Midtown", "Memorial"],
    specialties: ["Sealed systems", "Compressor diagnostics", "Built-in refrigerators"],
    reputationScore: 96,
    helpfulPoints: 1280,
    acceptedSolutions: 34,
    discussionsStarted: 18,
    helpfulReplies: 112,
    expertLevel: "master",
    badges: [sealedSystemExpert, subZeroSpecialist, boardLevelDiagnostics, topContributor],
    languages: ["en"],
    joinedAt: "2026-01-12",
    lastActiveAt: "Today, 9:20 AM",
    solvedBrands: ["Sub-Zero", "LG", "Thermador"],
    solvedApplianceTypes: ["Built-in refrigerator", "Column refrigerator", "French door refrigerator"],
    visibility: "private_technician_network",
  },
  {
    id: "rep-nina-patel",
    technicianName: "Nina Patel",
    role: "Premium appliance technician",
    serviceAreas: ["Katy", "Richmond", "Sugar Land"],
    specialties: ["Premium brands", "Scotsman ice machines", "Thermador"],
    reputationScore: 91,
    helpfulPoints: 1045,
    acceptedSolutions: 28,
    discussionsStarted: 24,
    helpfulReplies: 96,
    expertLevel: "expert",
    badges: [scotsmanIceSystems, subZeroSpecialist, multilingualSupport, topContributor],
    languages: ["en", "uk"],
    joinedAt: "2026-01-25",
    lastActiveAt: "Today, 8:45 AM",
    solvedBrands: ["Scotsman", "Thermador", "Sub-Zero"],
    solvedApplianceTypes: ["Ice machine", "Built-in refrigerator", "Wine cooler"],
    visibility: "private_technician_network",
  },
  {
    id: "rep-marisol-reyes",
    technicianName: "Marisol Reyes",
    role: "Refrigeration technician",
    serviceAreas: ["Houston Heights", "Central Houston", "Spring Branch"],
    specialties: ["Ice maker repair", "Water leaks", "French door refrigerators"],
    reputationScore: 84,
    helpfulPoints: 810,
    acceptedSolutions: 19,
    discussionsStarted: 31,
    helpfulReplies: 88,
    expertLevel: "trusted",
    badges: [samsungRefrigeration, multilingualSupport, fastestHelpfulReply],
    languages: ["en", "es"],
    joinedAt: "2026-02-02",
    lastActiveAt: "Yesterday, 5:10 PM",
    solvedBrands: ["Samsung", "Whirlpool", "KitchenAid"],
    solvedApplianceTypes: ["French door refrigerator", "Refrigerator ice maker"],
    visibility: "private_technician_network",
  },
  {
    id: "rep-oleh-melnyk",
    technicianName: "Oleh Melnyk",
    role: "Electrical diagnostics technician",
    serviceAreas: ["West Houston", "Energy Corridor"],
    specialties: ["Board diagnostics", "Sensors", "Control faults"],
    reputationScore: 72,
    helpfulPoints: 520,
    acceptedSolutions: 11,
    discussionsStarted: 9,
    helpfulReplies: 54,
    expertLevel: "rising",
    badges: [boardLevelDiagnostics, multilingualSupport],
    languages: ["en", "uk", "ru"],
    joinedAt: "2026-03-16",
    lastActiveAt: "Today, 7:55 AM",
    solvedBrands: ["LG", "Samsung", "Bosch"],
    solvedApplianceTypes: ["French door refrigerator", "Column refrigerator"],
    visibility: "private_technician_network",
  },
];

export function getTechnicianReputation() {
  return mockTechnicianReputation;
}

export function getAllExpertBadges() {
  const badgeMap = new Map<string, ExpertBadge>();

  mockTechnicianReputation.forEach((technician) => {
    technician.badges.forEach((badge) => badgeMap.set(badge.id, badge));
  });

  return Array.from(badgeMap.values());
}

export function filterTechnicianReputation(
  technicians: TechnicianReputation[],
  filters: ReputationFilters,
) {
  const filteredTechnicians = technicians.filter((technician) => {
    const matchesSpecialty =
      filters.specialty === "All specialties" ||
      technician.specialties.includes(filters.specialty);
    const matchesLevel =
      filters.expertLevel === "All levels" || technician.expertLevel === filters.expertLevel;
    const matchesLanguage =
      filters.language === "All languages" || technician.languages.includes(filters.language);
    const matchesAppliance =
      filters.applianceType === "All appliance types" ||
      technician.solvedApplianceTypes.includes(filters.applianceType);
    const matchesBrand =
      filters.brand === "All brands" || technician.solvedBrands.includes(filters.brand);

    return matchesSpecialty && matchesLevel && matchesLanguage && matchesAppliance && matchesBrand;
  });

  return [...filteredTechnicians].sort((first, second) => {
    if (filters.sortBy === "Accepted solutions") {
      return second.acceptedSolutions - first.acceptedSolutions;
    }

    if (filters.sortBy === "Helpful replies") {
      return second.helpfulReplies - first.helpfulReplies;
    }

    if (filters.sortBy === "Helpful points") {
      return second.helpfulPoints - first.helpfulPoints;
    }

    return second.reputationScore - first.reputationScore;
  });
}
