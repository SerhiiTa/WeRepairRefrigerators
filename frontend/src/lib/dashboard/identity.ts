import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentUserProfile,
  type CurrentUserProfileResult,
} from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CompanyMemberRow,
  CompanyRow,
  Database,
  ProfileRow,
  TechnicianProfileRow,
} from "@/lib/supabase/types";

export type DashboardCompanyMembership = Omit<CompanyMemberRow, "notes">;

type RelatedRecordState<T> =
  | {
      status: "not_applicable";
      data: null;
      error: null;
    }
  | {
      status: "loaded";
      data: T;
      error: null;
    }
  | {
      status: "empty";
      data: null;
      error: null;
    }
  | {
      status: "rls_limited" | "error";
      data: null;
      error: string;
    };

export type DashboardIdentityLoadResult =
  | {
      status: "supabase_unavailable" | "logged_out";
      profileResult: CurrentUserProfileResult;
      profile: null;
      company: RelatedRecordState<CompanyRow>;
      companyMembership: RelatedRecordState<DashboardCompanyMembership>;
      technicianProfile: RelatedRecordState<TechnicianProfileRow>;
    }
  | {
      status: "profile_unavailable";
      profileResult: CurrentUserProfileResult;
      profile: null;
      company: RelatedRecordState<CompanyRow>;
      companyMembership: RelatedRecordState<DashboardCompanyMembership>;
      technicianProfile: RelatedRecordState<TechnicianProfileRow>;
    }
  | {
      status: "ready";
      profileResult: CurrentUserProfileResult;
      profile: ProfileRow;
      company: RelatedRecordState<CompanyRow>;
      companyMembership: RelatedRecordState<DashboardCompanyMembership>;
      technicianProfile: RelatedRecordState<TechnicianProfileRow>;
    };

const emptyRelatedState = <T>(): RelatedRecordState<T> => ({
  status: "empty",
  data: null,
  error: null,
});

const notApplicableRelatedState = <T>(): RelatedRecordState<T> => ({
  status: "not_applicable",
  data: null,
  error: null,
});

function getReadError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function createBaseResult(
  status: "supabase_unavailable" | "logged_out" | "profile_unavailable",
  profileResult: CurrentUserProfileResult,
): DashboardIdentityLoadResult {
  return {
    status,
    profileResult,
    profile: null,
    company: notApplicableRelatedState<CompanyRow>(),
    companyMembership: notApplicableRelatedState<DashboardCompanyMembership>(),
    technicianProfile: notApplicableRelatedState<TechnicianProfileRow>(),
  };
}

async function loadCompany({
  supabase,
  profile,
}: {
  supabase: SupabaseClient<Database>;
  profile: ProfileRow;
}): Promise<RelatedRecordState<CompanyRow>> {
  if (!profile.company_id) {
    return emptyRelatedState();
  }

  try {
    const { data, error } = await supabase
      .from("companies")
      .select(
        "id,owner_profile_id,name,slug,primary_city,primary_state,business_phone,business_email,website_url,status,onboarding_status,created_by_profile_id,reviewed_by_profile_id,archived_by_profile_id,reviewed_at,archived_at,created_at,updated_at",
      )
      .eq("id", profile.company_id)
      .maybeSingle();

    if (error) {
      return {
        status: "rls_limited",
        data: null,
        error: error.message,
      };
    }

    return data
      ? { status: "loaded", data, error: null }
      : emptyRelatedState();
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: getReadError(error, "Company read failed."),
    };
  }
}

async function loadCompanyMembership({
  supabase,
  profile,
}: {
  supabase: SupabaseClient<Database>;
  profile: ProfileRow;
}): Promise<RelatedRecordState<DashboardCompanyMembership>> {
  if (!profile.company_id) {
    return emptyRelatedState();
  }

  try {
    const { data, error } = await supabase
      .from("company_members")
      .select(
        "id,company_id,profile_id,member_role,member_status,invited_by_profile_id,removed_by_profile_id,archived_by_profile_id,invited_at,joined_at,removed_at,suspended_at,archived_at,created_at,updated_at",
      )
      .eq("profile_id", profile.id)
      .eq("company_id", profile.company_id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        status: "rls_limited",
        data: null,
        error: error.message,
      };
    }

    return data
      ? { status: "loaded", data, error: null }
      : {
          status: "rls_limited",
          data: null,
          error:
            "Raw company membership rows are restricted by RLS unless the account can manage company members.",
        };
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: getReadError(error, "Company membership read failed."),
    };
  }
}

async function loadTechnicianProfile({
  supabase,
  profile,
}: {
  supabase: SupabaseClient<Database>;
  profile: ProfileRow;
}): Promise<RelatedRecordState<TechnicianProfileRow>> {
  try {
    const { data, error } = await supabase
      .from("technician_profiles")
      .select(
        "id,profile_id,company_id,affiliation_type,display_name,business_name,years_experience,service_summary_public,bio_private,primary_city,primary_state,service_zip_codes,service_cities,appliance_categories,brands_serviced,specialties,languages,avatar_color,technician_status,marketplace_enabled,public_profile_ready,verification_submitted_at,verified_at,verified_by_profile_id,rejected_at,suspended_at,archived_by_profile_id,archived_at,created_at,updated_at",
      )
      .eq("profile_id", profile.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        status: "rls_limited",
        data: null,
        error: error.message,
      };
    }

    return data
      ? { status: "loaded", data, error: null }
      : emptyRelatedState();
  } catch (error) {
    return {
      status: "error",
      data: null,
      error: getReadError(error, "Technician profile read failed."),
    };
  }
}

export async function loadDashboardIdentity(): Promise<DashboardIdentityLoadResult> {
  const supabase = getSupabaseBrowserClient();
  const profileResult = await getCurrentUserProfile({ client: supabase });

  if (profileResult.status !== "profile_ready") {
    return createBaseResult(profileResult.status, profileResult);
  }

  if (!supabase) {
    return createBaseResult("supabase_unavailable", profileResult);
  }

  const [company, companyMembership, technicianProfile] = await Promise.all([
    loadCompany({ supabase, profile: profileResult.profile }),
    loadCompanyMembership({ supabase, profile: profileResult.profile }),
    loadTechnicianProfile({ supabase, profile: profileResult.profile }),
  ]);

  return {
    status: "ready",
    profileResult,
    profile: profileResult.profile,
    company,
    companyMembership,
    technicianProfile,
  };
}

export function formatDashboardIdentityLabel(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
