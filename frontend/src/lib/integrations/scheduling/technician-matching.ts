import type { CompanyAvailabilityTechnicianInput } from "./company-availability";
import type { NormalizedSchedulingIntake } from "./scheduling-intake";
import type { TechnicianProfileRow } from "@/lib/supabase/types";

export type TechnicianMatchReasonCode =
  | "zip_coverage"
  | "primary_market_zip"
  | "appliance_specialty"
  | "brand_experience"
  | "years_experience"
  | "profile_complete";

export type TechnicianMatchReason = {
  code: TechnicianMatchReasonCode;
  label: string;
  points: number;
};

export type TechnicianMatchConfidence = "high" | "medium" | "low";

export type TechnicianMatch = {
  technicianProfileId: string;
  profileId: string;
  displayName: string;
  businessName: string | null;
  yearsExperience: number | null;
  serviceZipCodes: string[];
  specialties: string[];
  languages: string[];
  score: number;
  confidence: TechnicianMatchConfidence;
  reasons: TechnicianMatchReason[];
  schedulingInput: CompanyAvailabilityTechnicianInput;
};

export type TechnicianMatchingResult = {
  requestedZip: string | null;
  requestedAppliance: string | null;
  requestedBrand: string | null;
  matches: TechnicianMatch[];
  bestMatch: TechnicianMatch | null;
  backupMatches: TechnicianMatch[];
  eligibleTechnicians: number;
  techniciansEvaluated: number;
};

const APPLIANCE_SPECIALTY_ALIASES: Record<string, string[]> = {
  "built-in refrigerator": [
    "built in",
    "built-in",
    "built-in refrigeration",
    "built in refrigeration",
    "sub-zero",
    "sealed system",
    "refrigerator",
    "refrigeration",
  ],
  "built in refrigerator": [
    "built in",
    "built-in",
    "built-in refrigeration",
    "built in refrigeration",
    "sub-zero",
    "sealed system",
    "refrigerator",
    "refrigeration",
  ],
  refrigerator: ["refrigerator", "refrigeration", "sealed system", "ice maker"],
  freezer: ["freezer", "refrigeration", "sealed system"],
  "ice maker": ["ice maker", "refrigerator", "refrigeration"],
  washer: ["washer", "laundry", "drain pump"],
  dryer: ["dryer", "laundry", "heating element"],
  dishwasher: ["dishwasher", "drain pump"],
  oven: ["oven", "range", "bake element"],
  range: ["range", "oven", "cooktop"],
};

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeToken(value: string | null | undefined): string {
  return cleanText(value).toLowerCase();
}

function normalizeZip(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getDisplayName(profile: TechnicianProfileRow): string {
  return (
    cleanText(profile.display_name) ||
    cleanText(profile.business_name) ||
    "Technician"
  );
}

function profileIsEligible(profile: TechnicianProfileRow, requestedZip: string | null): boolean {
  if (profile.technician_status !== "verified") {
    return false;
  }

  if (!profile.marketplace_enabled) {
    return false;
  }

  if (profile.archived_at || profile.rejected_at || profile.suspended_at) {
    return false;
  }

  if (!requestedZip) {
    return false;
  }

  return profile.service_zip_codes.some(
    (zipCode) => normalizeZip(zipCode) === requestedZip,
  );
}

function getApplianceTerms(appliance: string | null): string[] {
  const normalized = normalizeToken(appliance);
  const aliases = APPLIANCE_SPECIALTY_ALIASES[normalized] ?? [];

  return uniqueValues([normalized, ...aliases]);
}

function specialtyMatches(specialty: string, terms: string[]): boolean {
  const normalizedSpecialty = normalizeToken(specialty);

  return terms.some(
    (term) =>
      term.length > 0 &&
      (normalizedSpecialty.includes(term) || term.includes(normalizedSpecialty)),
  );
}

function buildMatchReasons(
  profile: TechnicianProfileRow,
  intake: NormalizedSchedulingIntake,
  requestedZip: string,
): TechnicianMatchReason[] {
  const reasons: TechnicianMatchReason[] = [
    {
      code: "zip_coverage",
      label: `Covers ZIP ${requestedZip}`,
      points: 60,
    },
  ];
  const primaryZip = normalizeZip(profile.service_zip_codes[0] ?? null);

  if (primaryZip === requestedZip) {
    reasons.push({
      code: "primary_market_zip",
      label: `Primary service ZIP matches ${requestedZip}`,
      points: 5,
    });
  }

  const applianceTerms = getApplianceTerms(intake.service.applianceType);
  const applianceSpecialty = profile.specialties.find((specialty) =>
    specialtyMatches(specialty, applianceTerms),
  );

  if (applianceSpecialty) {
    reasons.push({
      code: "appliance_specialty",
      label: `${applianceSpecialty} specialty matches the appliance`,
      points: 25,
    });
  }

  const requestedBrand = normalizeToken(intake.service.brand);
  const brandSpecialty =
    requestedBrand.length > 0
      ? profile.specialties.find((specialty) =>
          normalizeToken(specialty).includes(requestedBrand),
        )
      : null;

  if (brandSpecialty) {
    reasons.push({
      code: "brand_experience",
      label: `${brandSpecialty} experience matches the brand`,
      points: 15,
    });
  }

  if (typeof profile.years_experience === "number" && profile.years_experience > 0) {
    reasons.push({
      code: "years_experience",
      label: `${profile.years_experience} years experience`,
      points: Math.min(12, Math.max(1, Math.floor(profile.years_experience / 2))),
    });
  }

  const completenessSignals = [
    profile.display_name,
    profile.business_name,
    profile.service_summary_public,
    profile.primary_city,
    profile.primary_state,
    profile.specialties.length > 0 ? "specialties" : null,
    profile.languages.length > 0 ? "languages" : null,
  ].filter(Boolean).length;

  if (completenessSignals >= 5) {
    reasons.push({
      code: "profile_complete",
      label: "Profile has strong public service details",
      points: 8,
    });
  }

  return reasons;
}

function getConfidence(score: number): TechnicianMatchConfidence {
  if (score >= 95) {
    return "high";
  }

  if (score >= 75) {
    return "medium";
  }

  return "low";
}

export function matchTechnicianProfilesForScheduling(
  profiles: TechnicianProfileRow[],
  intake: NormalizedSchedulingIntake,
): TechnicianMatchingResult {
  const requestedZip = normalizeZip(intake.location.zipCode);
  const eligibleProfiles = profiles.filter((profile) =>
    profileIsEligible(profile, requestedZip),
  );
  const matches = eligibleProfiles
    .map((profile) => {
      const zip = requestedZip ?? "";
      const reasons = buildMatchReasons(profile, intake, zip);
      const score = reasons.reduce((total, reason) => total + reason.points, 0);
      const displayName = getDisplayName(profile);
      const serviceZipCodes = uniqueValues(profile.service_zip_codes);
      const specialties = uniqueValues(profile.specialties);

      return {
        technicianProfileId: profile.id,
        profileId: profile.profile_id,
        displayName,
        businessName: cleanText(profile.business_name) || null,
        yearsExperience: profile.years_experience,
        serviceZipCodes,
        specialties,
        languages: uniqueValues(profile.languages),
        score,
        confidence: getConfidence(score),
        reasons,
        schedulingInput: {
          technicianId: profile.id,
          displayName,
          primaryZipCode: serviceZipCodes[0],
          serviceZipCodes,
        },
      };
    })
    .sort(
      (first, second) =>
        second.score - first.score ||
        (second.yearsExperience ?? 0) - (first.yearsExperience ?? 0) ||
        first.displayName.localeCompare(second.displayName),
    );

  return {
    requestedZip,
    requestedAppliance: intake.service.applianceType,
    requestedBrand: intake.service.brand,
    matches,
    bestMatch: matches[0] ?? null,
    backupMatches: matches.slice(1),
    eligibleTechnicians: eligibleProfiles.length,
    techniciansEvaluated: profiles.length,
  };
}
