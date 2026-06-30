import type {
  DatabaseAppRole,
  DatabaseCompanyStatus,
  DatabaseOnboardingStatus,
  DatabaseProfileStatus,
  ProfileRow,
  PublicSchema,
} from "@/lib/supabase/types";

export type OnboardingActionErrorCode =
  | "supabase_unavailable"
  | "unauthenticated"
  | "profile_missing"
  | "profile_inactive"
  | "unauthorized_role"
  | "invalid_input"
  | "trusted_mutation_required"
  | "database_error";

export type OnboardingActionError = {
  code: OnboardingActionErrorCode;
  message: string;
  details?: string;
};

export type OnboardingActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: OnboardingActionError;
    };

export type AuthenticatedOnboardingInput = {
  accessToken: string;
};

export type CreateCompanyAndOwnerMembershipInput =
  AuthenticatedOnboardingInput & {
    companyName: string;
    slug?: string;
    primaryCity?: string;
    primaryState?: string;
    businessEmail?: string;
    businessPhone?: string;
    websiteUrl?: string;
  };

export type UpdateBasicProfileInput = AuthenticatedOnboardingInput & {
  fullName: string;
};

export type UpdateTechnicianProfileInput = AuthenticatedOnboardingInput & {
  displayName?: string;
  businessName?: string;
  yearsExperience?: number;
  serviceSummaryPublic?: string;
  bioPrivate?: string;
  primaryCity?: string;
  primaryState?: string;
  serviceZipCodes?: string[];
  serviceCities?: string[];
  applianceCategories?: string[];
  brandsServiced?: string[];
  specialties?: string[];
  languages?: string[];
  avatarColor?: string;
  marketplaceEnabled?: boolean;
};

export type CompleteOnboardingInput = AuthenticatedOnboardingInput;

export type CompanyCreationReadiness = {
  profileId: string;
  role: DatabaseAppRole;
  status: DatabaseProfileStatus;
  companyName: string;
  slug: string;
  reason: "requires_transactional_trusted_mutation";
};

export type TechnicianProfileActionData = {
  profile: PublicSchema["Tables"]["technician_profiles"]["Row"];
  auditStatus: "not_written_no_trusted_audit_path";
};

export type BasicProfileActionData = {
  profile: Pick<
    ProfileRow,
    | "id"
    | "email"
    | "full_name"
    | "role"
    | "status"
    | "company_id"
    | "onboarding_status"
  >;
  phoneStorage: "not_stored_no_profile_phone_column";
};

export type CompanyCreationData = {
  companyId: string;
  membershipId: string;
  profileId: string;
  companyStatus: DatabaseCompanyStatus;
  onboardingStatus: DatabaseOnboardingStatus;
  auditStatus: "written";
};

export type OnboardingCompletionData = {
  profileId: string;
  companyId: string | null;
  technicianProfileId: string | null;
  onboardingStatus: DatabaseOnboardingStatus;
  onboardingCompletedAt: string | null;
  auditStatus: "written_if_transitioned" | "not_written_not_complete";
};

export type OnboardingCompletionReadiness = {
  profile: Pick<
    ProfileRow,
    "id" | "email" | "role" | "status" | "company_id" | "onboarding_status"
  >;
  technicianProfileId: string | null;
  readyForTrustedCompletion: boolean;
  reason:
    | "customer_profile_ready"
    | "technician_profile_exists"
    | "company_owner_requires_company_membership"
    | "unsupported_role"
    | "profile_not_active";
};
