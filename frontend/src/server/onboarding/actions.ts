"use server";

import type {
  DatabaseOnboardingStatus,
  Json,
} from "@/lib/supabase/types";

import { requireOnboardingSession } from "./supabase";
import type {
  BasicProfileActionData,
  CompanyCreationData,
  CompleteOnboardingInput,
  CreateCompanyAndOwnerMembershipInput,
  OnboardingActionResult,
  OnboardingCompletionData,
  TechnicianProfileActionData,
  UpdateBasicProfileInput,
  UpdateTechnicianProfileInput,
} from "./types";
import {
  createOnboardingError,
  normalizeOptionalText,
  normalizeTechnicianProfileInput,
  validateCompanyInput,
} from "./validation";

const ACTIVE_PROFILE_STATUSES = ["active", "verified"] as const;
const TECHNICIAN_PROFILE_ROLES = [
  "technician",
  "verified_technician",
  "expert_technician",
  "company_owner",
  "admin",
] as const;

function isActiveProfileStatus(status: string): boolean {
  return ACTIVE_PROFILE_STATUSES.some((activeStatus) => activeStatus === status);
}

function canCreateCompany(role: string): boolean {
  return role === "company_owner" || role === "admin";
}

function canCreateTechnicianProfile(role: string): boolean {
  return TECHNICIAN_PROFILE_ROLES.some(
    (technicianRole) => technicianRole === role,
  );
}

const ONBOARDING_STATUSES = [
  "not_started",
  "profile_required",
  "customer_ready",
  "technician_profile_required",
  "technician_verification_pending",
  "company_required",
  "company_pending_review",
  "company_ready",
  "complete",
] as const satisfies readonly DatabaseOnboardingStatus[];

function isDatabaseOnboardingStatus(
  value: string,
): value is DatabaseOnboardingStatus {
  return ONBOARDING_STATUSES.some((status) => status === value);
}

function isJsonRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  value: Json,
  field: string,
): { ok: true; value: string } | { ok: false } {
  if (!isJsonRecord(value)) {
    return { ok: false };
  }

  const fieldValue = value[field];

  if (typeof fieldValue !== "string") {
    return { ok: false };
  }

  return { ok: true, value: fieldValue };
}

function readNullableStringField(
  value: Json,
  field: string,
): { ok: true; value: string | null } | { ok: false } {
  if (!isJsonRecord(value)) {
    return { ok: false };
  }

  const fieldValue = value[field];

  if (fieldValue === null) {
    return { ok: true, value: null };
  }

  if (typeof fieldValue !== "string") {
    return { ok: false };
  }

  return { ok: true, value: fieldValue };
}

function parseCompanyCreationResult(
  value: Json,
): CompanyCreationData | null {
  const companyId = readStringField(value, "company_id");
  const membershipId = readStringField(value, "membership_id");
  const profileId = readStringField(value, "profile_id");
  const companyStatus = readStringField(value, "company_status");
  const onboardingStatus = readStringField(value, "onboarding_status");
  const auditStatus = readStringField(value, "audit_status");

  if (
    !companyId.ok ||
    !membershipId.ok ||
    !profileId.ok ||
    !companyStatus.ok ||
    companyStatus.value !== "active" ||
    !onboardingStatus.ok ||
    onboardingStatus.value !== "complete" ||
    !auditStatus.ok ||
    auditStatus.value !== "written"
  ) {
    return null;
  }

  return {
    companyId: companyId.value,
    membershipId: membershipId.value,
    profileId: profileId.value,
    companyStatus: companyStatus.value,
    onboardingStatus: onboardingStatus.value,
    auditStatus: auditStatus.value,
  };
}

function parseOnboardingCompletionResult(
  value: Json,
): OnboardingCompletionData | null {
  const profileId = readStringField(value, "profile_id");
  const companyId = readNullableStringField(value, "company_id");
  const technicianProfileId = readNullableStringField(
    value,
    "technician_profile_id",
  );
  const onboardingStatus = readStringField(value, "onboarding_status");
  const onboardingCompletedAt = readNullableStringField(
    value,
    "onboarding_completed_at",
  );
  const auditStatus = readStringField(value, "audit_status");

  if (
    !profileId.ok ||
    !companyId.ok ||
    !technicianProfileId.ok ||
    !onboardingStatus.ok ||
    !isDatabaseOnboardingStatus(onboardingStatus.value) ||
    !onboardingCompletedAt.ok ||
    !auditStatus.ok ||
    (auditStatus.value !== "written_if_transitioned" &&
      auditStatus.value !== "not_written_not_complete")
  ) {
    return null;
  }

  return {
    profileId: profileId.value,
    companyId: companyId.value,
    technicianProfileId: technicianProfileId.value,
    onboardingStatus: onboardingStatus.value,
    onboardingCompletedAt: onboardingCompletedAt.value,
    auditStatus: auditStatus.value,
  };
}

function parseTechnicianProfileResult(
  value: Json,
  expectedProfileId: string,
): TechnicianProfileActionData["profile"] | null {
  const id = readStringField(value, "id");
  const profileId = readStringField(value, "profile_id");
  const technicianStatus = readStringField(value, "technician_status");
  const updatedAt = readStringField(value, "updated_at");

  if (
    !id.ok ||
    !profileId.ok ||
    profileId.value !== expectedProfileId ||
    !technicianStatus.ok ||
    !updatedAt.ok ||
    !isJsonRecord(value)
  ) {
    return null;
  }

  return value as TechnicianProfileActionData["profile"];
}

export async function createCompanyAndOwnerMembership(
  input: CreateCompanyAndOwnerMembershipInput,
): Promise<OnboardingActionResult<CompanyCreationData>> {
  const session = await requireOnboardingSession(input.accessToken);

  if (!session.ok) {
    return session;
  }

  const { profile, supabase } = session.data;
  const validated = validateCompanyInput(input);

  if (!validated.ok) {
    return validated;
  }

  if (!isActiveProfileStatus(profile.status)) {
    return {
      ok: false,
      error: createOnboardingError(
        "profile_inactive",
        "Company creation requires an active profile.",
      ),
    };
  }

  if (!canCreateCompany(profile.role)) {
    return {
      ok: false,
      error: createOnboardingError(
        "unauthorized_role",
        "Only active company owners or admins can create a company.",
      ),
    };
  }

  const { data, error } = await supabase.rpc(
    "create_company_and_owner_membership_rpc",
    {
      p_business_email: validated.data.businessEmail,
      p_business_phone: validated.data.businessPhone,
      p_company_name: validated.data.companyName,
      p_primary_city: validated.data.primaryCity,
      p_primary_state: validated.data.primaryState,
      p_slug: validated.data.slug,
      p_website_url: validated.data.websiteUrl,
    },
  );

  if (error) {
    return {
      ok: false,
      error: createOnboardingError(
        "database_error",
        "Unable to create the company onboarding transaction.",
        error.message,
      ),
    };
  }

  const parsed = parseCompanyCreationResult(data);

  if (!parsed) {
    return {
      ok: false,
      error: createOnboardingError(
        "database_error",
        "The company onboarding RPC returned an unexpected response.",
      ),
    };
  }

  return {
    ok: true,
    data: parsed,
  };
}

export async function updateBasicProfile(
  input: UpdateBasicProfileInput,
): Promise<OnboardingActionResult<BasicProfileActionData>> {
  const session = await requireOnboardingSession(input.accessToken);

  if (!session.ok) {
    return session;
  }

  const fullName = normalizeOptionalText(input.fullName);

  if (!fullName || fullName.length < 2) {
    return {
      ok: false,
      error: createOnboardingError(
        "invalid_input",
        "Full name is required.",
      ),
    };
  }

  const { data, error } = await session.data.supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", session.data.userId)
    .select(
      "id,email,full_name,role,status,company_id,onboarding_status",
    )
    .single();

  if (error) {
    return {
      ok: false,
      error: createOnboardingError(
        "database_error",
        "Unable to update the basic profile.",
        error.message,
      ),
    };
  }

  return {
    ok: true,
    data: {
      profile: data,
      phoneStorage: "not_stored_no_profile_phone_column",
    },
  };
}

export async function updateTechnicianProfile(
  input: UpdateTechnicianProfileInput,
): Promise<OnboardingActionResult<TechnicianProfileActionData>> {
  const session = await requireOnboardingSession(input.accessToken);

  if (!session.ok) {
    return session;
  }

  const { profile, supabase } = session.data;

  if (!isActiveProfileStatus(profile.status)) {
    return {
      ok: false,
      error: createOnboardingError(
        "profile_inactive",
        "Technician profile changes currently require an active profile because the applied RLS helper excludes pending profiles.",
      ),
    };
  }

  if (!canCreateTechnicianProfile(profile.role)) {
    return {
      ok: false,
      error: createOnboardingError(
        "unauthorized_role",
        "This account role cannot create a technician profile.",
      ),
    };
  }

  const updatePayload = normalizeTechnicianProfileInput(input);
  const { data, error } = await supabase.rpc(
    "upsert_own_technician_profile_rpc",
    {
      p_bio_private: updatePayload.bio_private,
      p_business_name: updatePayload.business_name,
      p_display_name: updatePayload.display_name,
      p_languages: updatePayload.languages,
      p_primary_city: updatePayload.primary_city,
      p_primary_state: updatePayload.primary_state,
      p_service_summary_public: updatePayload.service_summary_public,
      p_service_zip_codes: updatePayload.service_zip_codes,
      p_specialties: updatePayload.specialties,
      p_years_experience: updatePayload.years_experience,
    },
  );

  if (error) {
    return {
      ok: false,
      error: createOnboardingError(
        "trusted_mutation_required",
        "Technician profile onboarding requires the Task 84 safe create/update RPC to be applied in Supabase.",
        error.message,
      ),
    };
  }

  const parsed = parseTechnicianProfileResult(data, profile.id);

  if (!parsed) {
    return {
      ok: false,
      error: createOnboardingError(
        "database_error",
        "The technician profile upsert RPC returned an unexpected response.",
      ),
    };
  }

  return {
    ok: true,
    data: {
      profile: parsed,
      auditStatus: "not_written_no_trusted_audit_path",
    },
  };
}

export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<OnboardingActionResult<OnboardingCompletionData>> {
  const session = await requireOnboardingSession(input.accessToken);

  if (!session.ok) {
    return session;
  }

  const { data, error } = await session.data.supabase.rpc(
    "complete_onboarding_rpc",
  );

  if (error) {
    return {
      ok: false,
      error: createOnboardingError(
        "database_error",
        "Unable to complete onboarding.",
        error.message,
      ),
    };
  }

  const parsed = parseOnboardingCompletionResult(data);

  if (!parsed) {
    return {
      ok: false,
      error: createOnboardingError(
        "database_error",
        "The onboarding completion RPC returned an unexpected response.",
      ),
    };
  }

  return { ok: true, data: parsed };
}
