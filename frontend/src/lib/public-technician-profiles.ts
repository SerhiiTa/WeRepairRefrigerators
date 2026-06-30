import { getPublicTechnicianBySlug, getPublicTechnicians } from "@/lib/public-seo-data";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicTechnicianProfileRow } from "@/lib/supabase/types";
import type { TechnicianProfilePreview } from "@/types/public-seo";

const PUBLIC_TECHNICIAN_PROFILE_COLUMNS = [
  "slug",
  "display_name",
  "business_name",
  "primary_city",
  "primary_state",
  "service_summary_public",
  "service_zip_codes",
  "service_cities",
  "appliance_categories",
  "brands_serviced",
  "specialties",
  "languages",
  "years_experience",
  "avatar_color",
  "technician_status",
  "public_profile_ready",
  "marketplace_enabled",
  "created_at",
].join(",");

type PublicTechnicianProfileSource = "supabase" | "mock";

export type PublicTechnicianProfile = TechnicianProfilePreview & {
  source: PublicTechnicianProfileSource;
  publicProfileReady: boolean;
  technicianStatus?: "verified";
  createdAt?: string;
};

function toTitleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function createServiceArea(row: PublicTechnicianProfileRow): string {
  const city = row.primary_city?.trim();
  const state = row.primary_state?.trim();

  if (city && state) {
    return `${city}, ${state}`;
  }

  if (city) {
    return city;
  }

  return "Houston service area";
}

function createSummary(row: PublicTechnicianProfileRow): string {
  if (row.service_summary_public?.trim()) {
    return row.service_summary_public.trim();
  }

  return "Public technician profile for refrigerator repair service. Live booking, reviews, and dispatch details are not connected yet.";
}

export function mapPublicTechnicianProfileRow(
  row: PublicTechnicianProfileRow,
): PublicTechnicianProfile {
  const name =
    row.display_name?.trim() ||
    row.business_name?.trim() ||
    "Houston refrigeration technician";
  const businessName = row.business_name?.trim();
  const specialties = row.specialties?.filter(Boolean) ?? [];
  const languages = row.languages?.filter(Boolean) ?? [];

  return {
    slug: row.slug,
    name,
    role: businessName
      ? `${businessName} public technician profile`
      : "Refrigeration technician",
    serviceArea: createServiceArea(row),
    city: row.primary_city ?? undefined,
    zipCodes: row.service_zip_codes ?? [],
    specialties: specialties.length > 0 ? specialties : ["Refrigerator repair"],
    summary: createSummary(row),
    verificationStatus: "Verified Technician",
    responseTime: "Availability preview coming soon",
    yearsExperience: row.years_experience ?? undefined,
    badges: [
      "Public Profile Ready",
      "Verified Technician",
      ...languages.map((language) => `${toTitleCase(language)} support`),
    ].slice(0, 5),
    brandFocus: [],
    repairCaseSlugs: [],
    source: "supabase",
    publicProfileReady: row.public_profile_ready,
    technicianStatus: row.technician_status,
    createdAt: row.created_at,
  };
}

function mapMockTechnicianProfile(
  technician: TechnicianProfilePreview,
): PublicTechnicianProfile {
  return {
    ...technician,
    source: "mock",
    publicProfileReady: true,
  };
}

export async function loadPublicTechnicianProfiles(): Promise<
  PublicTechnicianProfile[]
> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return getPublicTechnicians().map(mapMockTechnicianProfile);
  }

  const { data, error } = await supabase
    .from("public_technician_profiles")
    .select(PUBLIC_TECHNICIAN_PROFILE_COLUMNS)
    .order("display_name", { ascending: true, nullsFirst: false });

  if (error || !data || data.length === 0) {
    return getPublicTechnicians().map(mapMockTechnicianProfile);
  }

  return (data as unknown as PublicTechnicianProfileRow[]).map(
    mapPublicTechnicianProfileRow,
  );
}

export async function loadPublicTechnicianProfileBySlug(
  slug: string,
): Promise<PublicTechnicianProfile | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("public_technician_profiles")
      .select(PUBLIC_TECHNICIAN_PROFILE_COLUMNS)
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (!error && data) {
      return mapPublicTechnicianProfileRow(data as unknown as PublicTechnicianProfileRow);
    }
  }

  const mockTechnician = getPublicTechnicianBySlug(normalizedSlug);

  return mockTechnician ? mapMockTechnicianProfile(mockTechnician) : null;
}
