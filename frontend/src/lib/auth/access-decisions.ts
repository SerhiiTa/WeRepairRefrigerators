import { hasRole, isActiveProfile } from "./permissions";
import type { AppRole, AuthProfileStatus } from "./types";

export type RequiredAccessLevel =
  | "public"
  | "dashboard-auth"
  | "active-profile"
  | "verified-technician"
  | "company-owner"
  | "admin";

export type AuthAccessDecision = {
  allowedNow: boolean;
  wouldRedirectLater: boolean;
  reason: string;
  recommendedRedirectTarget: string | null;
  requiredAccessLevel: RequiredAccessLevel;
};

export type EvaluateAccessDecisionInput = {
  pathname: string;
  isAuthenticated: boolean;
  profilePresent: boolean;
  role: AppRole;
  status: AuthProfileStatus | null;
  isLoading?: boolean;
};

const VERIFIED_TECHNICIAN_ROLES = [
  "verified_technician",
  "expert_technician",
  "company_owner",
  "admin",
] as const satisfies readonly AppRole[];

const COMPANY_OWNER_ROLES = ["company_owner", "admin"] as const satisfies readonly AppRole[];

function getLoginRedirectTarget(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname)}`;
}

export function getRequiredAccessLevel(pathname: string): RequiredAccessLevel {
  if (!pathname.startsWith("/dashboard")) {
    return "public";
  }

  if (pathname.startsWith("/dashboard/dev/supabase-check")) {
    return "dashboard-auth";
  }

  if (pathname.startsWith("/dashboard/admin")) {
    return "admin";
  }

  if (
    pathname.startsWith("/dashboard/open-jobs") ||
    pathname.startsWith("/dashboard/community")
  ) {
    return "verified-technician";
  }

  if (
    pathname.startsWith("/dashboard/analytics") ||
    pathname.startsWith("/dashboard/coverage") ||
    pathname.startsWith("/dashboard/technicians")
  ) {
    return "company-owner";
  }

  return "active-profile";
}

export function evaluateAccessDecision({
  pathname,
  isAuthenticated,
  profilePresent,
  role,
  status,
  isLoading = false,
}: EvaluateAccessDecisionInput): AuthAccessDecision {
  const requiredAccessLevel = getRequiredAccessLevel(pathname);

  if (requiredAccessLevel === "public") {
    return {
      allowedNow: true,
      wouldRedirectLater: false,
      reason: "Public route. No dashboard auth guard is planned for this path.",
      recommendedRedirectTarget: null,
      requiredAccessLevel,
    };
  }

  if (isLoading) {
    return {
      allowedNow: true,
      wouldRedirectLater: false,
      reason:
        "Auth state is still loading. Future guards should wait before deciding.",
      recommendedRedirectTarget: null,
      requiredAccessLevel,
    };
  }

  if (!isAuthenticated) {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason:
        "Protected dashboard access requires login.",
      recommendedRedirectTarget: getLoginRedirectTarget(pathname),
      requiredAccessLevel,
    };
  }

  if (!profilePresent) {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason:
        "A session exists, but protected dashboard access requires a matching profile row.",
      recommendedRedirectTarget: "/account-status?reason=profile-missing",
      requiredAccessLevel,
    };
  }

  if (status === "suspended") {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason:
        "Suspended profiles cannot receive protected dashboard access.",
      recommendedRedirectTarget: "/account-status?reason=suspended",
      requiredAccessLevel,
    };
  }

  if (status === "rejected") {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason:
        "Rejected profiles cannot receive protected dashboard access.",
      recommendedRedirectTarget: "/account-status?reason=rejected",
      requiredAccessLevel,
    };
  }

  if (requiredAccessLevel === "dashboard-auth") {
    return {
      allowedNow: true,
      wouldRedirectLater: false,
      reason:
        "Authenticated profile was found. Dashboard auth guard passes.",
      recommendedRedirectTarget: null,
      requiredAccessLevel,
    };
  }

  if (!isActiveProfile({ status: status ?? "pending" })) {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason:
        "This route requires an active or verified profile.",
      recommendedRedirectTarget: "/account-status?reason=pending",
      requiredAccessLevel,
    };
  }

  if (
    requiredAccessLevel === "verified-technician" &&
    !hasRole(role, VERIFIED_TECHNICIAN_ROLES)
  ) {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason:
        "This route requires verified technician, expert technician, company owner, or admin access.",
      recommendedRedirectTarget: "/account-status?reason=dashboard-role",
      requiredAccessLevel,
    };
  }

  if (
    requiredAccessLevel === "company-owner" &&
    !hasRole(role, COMPANY_OWNER_ROLES)
  ) {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason:
        "This route requires company owner or admin access.",
      recommendedRedirectTarget: "/account-status?reason=dashboard-role",
      requiredAccessLevel,
    };
  }

  if (requiredAccessLevel === "admin" && !hasRole(role, "admin")) {
    return {
      allowedNow: false,
      wouldRedirectLater: true,
      reason: "This route requires admin access.",
      recommendedRedirectTarget: "/account-status?reason=dashboard-role",
      requiredAccessLevel,
    };
  }

  return {
    allowedNow: true,
    wouldRedirectLater: false,
    reason: "Dashboard guard allows this route for the current profile.",
    recommendedRedirectTarget: null,
    requiredAccessLevel,
  };
}
