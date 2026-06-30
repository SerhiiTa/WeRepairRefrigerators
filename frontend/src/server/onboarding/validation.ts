import type {
  CreateCompanyAndOwnerMembershipInput,
  OnboardingActionError,
  UpdateTechnicianProfileInput,
} from "./types";

const MAX_SHORT_TEXT_LENGTH = 120;
const MAX_LONG_TEXT_LENGTH = 1200;

export function createOnboardingError(
  code: OnboardingActionError["code"],
  message: string,
  details?: string,
): OnboardingActionError {
  return { code, message, details };
}

export function normalizeOptionalText(
  value: string | undefined,
  maxLength = MAX_SHORT_TEXT_LENGTH,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

export function normalizeLongText(value: string | undefined): string | null {
  return normalizeOptionalText(value, MAX_LONG_TEXT_LENGTH);
}

export function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function normalizeStringList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeOptionalText(value, 40))
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 20);
}

function normalizeAvatarColor(value: string | undefined): string {
  if (typeof value !== "string") {
    return "#0F6BFF";
  }

  const normalized = value.trim();

  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : "#0F6BFF";
}

export function validateCompanyInput(
  input: CreateCompanyAndOwnerMembershipInput,
):
  | {
      ok: true;
      data: {
        companyName: string;
        slug: string;
        primaryCity: string | null;
        primaryState: string;
        businessEmail: string | null;
        businessPhone: string | null;
        websiteUrl: string | null;
      };
    }
  | { ok: false; error: OnboardingActionError } {
  const companyName = normalizeOptionalText(input.companyName);

  if (!companyName || companyName.length < 2) {
    return {
      ok: false,
      error: createOnboardingError(
        "invalid_input",
        "Company name is required.",
      ),
    };
  }

  const slug = createSlug(input.slug ?? companyName);

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return {
      ok: false,
      error: createOnboardingError(
        "invalid_input",
        "Company slug must contain lowercase letters, numbers, and hyphens only.",
      ),
    };
  }

  const primaryState =
    normalizeOptionalText(input.primaryState, 2)?.toUpperCase() ?? "TX";

  if (!/^[A-Z]{2}$/.test(primaryState)) {
    return {
      ok: false,
      error: createOnboardingError(
        "invalid_input",
        "Primary state must be a two-letter state code.",
      ),
    };
  }

  const businessEmail = normalizeOptionalText(input.businessEmail, 180);

  if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
    return {
      ok: false,
      error: createOnboardingError(
        "invalid_input",
        "Business email is not valid.",
      ),
    };
  }

  return {
    ok: true,
    data: {
      companyName,
      slug,
      primaryCity: normalizeOptionalText(input.primaryCity),
      primaryState,
      businessEmail,
      businessPhone: normalizeOptionalText(input.businessPhone, 40),
      websiteUrl: normalizeOptionalText(input.websiteUrl, 240),
    },
  };
}

export function normalizeTechnicianProfileInput(
  input: UpdateTechnicianProfileInput,
) {
  const yearsExperience =
    typeof input.yearsExperience === "number" &&
    Number.isFinite(input.yearsExperience)
      ? Math.max(0, Math.min(80, Math.trunc(input.yearsExperience)))
      : null;

  return {
    display_name: normalizeOptionalText(input.displayName),
    business_name: normalizeOptionalText(input.businessName),
    years_experience: yearsExperience,
    service_summary_public: normalizeLongText(input.serviceSummaryPublic),
    bio_private: normalizeLongText(input.bioPrivate),
    primary_city: normalizeOptionalText(input.primaryCity),
    primary_state:
      normalizeOptionalText(input.primaryState, 2)?.toUpperCase() ?? "TX",
    service_zip_codes: normalizeStringList(input.serviceZipCodes),
    service_cities: normalizeStringList(input.serviceCities),
    appliance_categories: normalizeStringList(input.applianceCategories),
    brands_serviced: normalizeStringList(input.brandsServiced),
    specialties: normalizeStringList(input.specialties),
    languages: normalizeStringList(input.languages),
    avatar_color: normalizeAvatarColor(input.avatarColor),
    marketplace_enabled:
      typeof input.marketplaceEnabled === "boolean"
        ? input.marketplaceEnabled
        : null,
  };
}
