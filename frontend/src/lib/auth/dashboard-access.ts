import { canAccessDashboard, isActiveProfile } from "./permissions";
import type { CurrentUserProfileResult } from "./profile";
import type { AppRole } from "./types";
import type { DatabaseOnboardingStatus, ProfileRow } from "../supabase/types";

export type DashboardAccessBlockReason =
  | "checking"
  | "supabase_unavailable"
  | "logged_out"
  | "profile_missing"
  | "onboarding_required"
  | "inactive_profile"
  | "role_not_allowed"
  | "dev_bypass"
  | "allowed";

export type DashboardAccessDecision = {
  allowed: boolean;
  reason: DashboardAccessBlockReason;
  redirectTo: string | null;
  title: string;
  description: string;
};

const ACCOUNT_STATUS_PATH = "/account-status";

export function isDashboardDevPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/dev");
}

export function sanitizeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export function createLoginRedirect(pathname: string): string {
  return `/login?next=${encodeURIComponent(sanitizeRedirectPath(pathname))}`;
}

export function createOnboardingRedirect(pathname: string): string {
  return `/onboarding?next=${encodeURIComponent(sanitizeRedirectPath(pathname))}`;
}

function createAccountStatusRedirect(reason: string): string {
  return `${ACCOUNT_STATUS_PATH}?reason=${encodeURIComponent(reason)}`;
}

export function isDashboardOnboardingStatusSatisfied({
  role,
  onboardingStatus,
}: {
  role: AppRole | null;
  onboardingStatus: DatabaseOnboardingStatus | null;
}): boolean {
  if (onboardingStatus === "complete") {
    return true;
  }

  return (
    onboardingStatus === "technician_verification_pending" &&
    (role === "technician" ||
      role === "verified_technician" ||
      role === "expert_technician")
  );
}

export function isProfileOnboardingComplete(profile: ProfileRow): boolean {
  return isDashboardOnboardingStatusSatisfied({
    role: profile.role,
    onboardingStatus: profile.onboarding_status,
  });
}

export function evaluateDashboardAccess({
  pathname,
  profileResult,
}: {
  pathname: string;
  profileResult: CurrentUserProfileResult | null;
}): DashboardAccessDecision {
  if (isDashboardDevPath(pathname)) {
    return {
      allowed: true,
      reason: "dev_bypass",
      redirectTo: null,
      title: "Development route",
      description:
        "Dashboard development utilities remain directly reachable for local setup and verification.",
    };
  }

  if (!profileResult) {
    return {
      allowed: false,
      reason: "checking",
      redirectTo: null,
      title: "Checking dashboard access",
      description: "Loading the authenticated Supabase session and profile.",
    };
  }

  if (profileResult.status === "supabase_unavailable") {
    return {
      allowed: false,
      reason: "supabase_unavailable",
      redirectTo: createLoginRedirect(pathname),
      title: "Supabase is unavailable",
      description:
        "Dashboard routes now require Supabase Auth. Configure the local Supabase env vars and log in again.",
    };
  }

  if (profileResult.status === "logged_out") {
    return {
      allowed: false,
      reason: "logged_out",
      redirectTo: createLoginRedirect(pathname),
      title: "Login required",
      description: "Dashboard routes require an authenticated Supabase session.",
    };
  }

  if (profileResult.status === "profile_unavailable") {
    return {
      allowed: false,
      reason: "profile_missing",
      redirectTo: createAccountStatusRedirect("profile-missing"),
      title: "Profile required",
      description:
        "A session exists, but no matching profile row is available for dashboard access.",
    };
  }

  const { profile, session } = profileResult;

  if (!isActiveProfile({ status: profile.status })) {
    return {
      allowed: false,
      reason: "inactive_profile",
      redirectTo: createAccountStatusRedirect(profile.status),
      title: "Account review required",
      description:
        "This profile is not active or verified, so dashboard access is paused.",
    };
  }

  if (!isProfileOnboardingComplete(profile)) {
    return {
      allowed: false,
      reason: "onboarding_required",
      redirectTo: createOnboardingRedirect(pathname),
      title: "Onboarding required",
      description: "Complete account setup before opening dashboard tools.",
    };
  }

  if (!canAccessDashboard(session.user)) {
    return {
      allowed: false,
      reason: "role_not_allowed",
      redirectTo: createAccountStatusRedirect("dashboard-role"),
      title: "Dashboard role required",
      description:
        "This account does not have a technician, company owner, or admin dashboard role.",
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    redirectTo: null,
    title: "Dashboard access granted",
    description: "Authenticated profile, role, status, and onboarding checks passed.",
  };
}
