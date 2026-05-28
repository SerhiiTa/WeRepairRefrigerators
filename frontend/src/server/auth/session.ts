import {
  evaluateDashboardAccess,
  type DashboardAccessDecision,
} from "@/lib/auth/dashboard-access";
import type { CurrentUserProfileResult } from "@/lib/auth/profile";
import { isVerifiedTechnicianRole } from "@/lib/auth/roles";
import type { Database } from "@/lib/supabase/types";
import {
  createUserScopedServerClient,
  requireOnboardingSession,
} from "@/server/onboarding/supabase";

export type ServerDashboardAuthState = {
  profileResult: CurrentUserProfileResult;
  decision: DashboardAccessDecision;
};

export async function loadUserScopedProfile(
  accessToken: string,
): Promise<CurrentUserProfileResult> {
  const result = await requireOnboardingSession(accessToken);

  if (!result.ok) {
    if (result.error.code === "supabase_unavailable") {
      return {
        status: "supabase_unavailable",
        profile: null,
        session: null,
        error: null,
      };
    }

    if (result.error.code === "unauthenticated") {
      return {
        status: "logged_out",
        profile: null,
        session: null,
        error: null,
      };
    }

    return {
      status: "profile_unavailable",
      profile: null,
      session: {
        user: {
          id: "",
          email: null,
          role: "public_visitor",
          status: "pending",
          companyId: null,
          isVerifiedTechnician: false,
        },
        expiresAt: null,
      },
      error: result.error.message,
    };
  }

  const { profile } = result.data;

  return {
    status: "profile_ready",
    profile,
    session: {
      user: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        status: profile.status,
        companyId: profile.company_id,
        isVerifiedTechnician:
          isVerifiedTechnicianRole(profile.role) || profile.status === "verified",
      },
      expiresAt: null,
    },
    error: null,
  };
}

export async function loadServerDashboardAuthState({
  accessToken,
  pathname,
}: {
  accessToken: string;
  pathname: string;
}): Promise<ServerDashboardAuthState> {
  const profileResult = await loadUserScopedProfile(accessToken);

  return {
    profileResult,
    decision: evaluateDashboardAccess({ pathname, profileResult }),
  };
}

export type UserScopedSupabaseClient = NonNullable<
  ReturnType<typeof createUserScopedServerClient>
>;

export type ServerDatabase = Database;
