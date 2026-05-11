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
      allowedNow: true,
      wouldRedirectLater: true,
      reason:
        "Dashboard access is open now, but future enforcement would require login.",
      recommendedRedirectTarget: getLoginRedirectTarget(pathname),
      requiredAccessLevel,
    };
  }

  if (!profilePresent) {
    return {
      allowedNow: true,
      wouldRedirectLater: true,
      reason:
        "A session exists, but future enforcement would require a matching profile row.",
      recommendedRedirectTarget: "/dashboard/dev/supabase-check",
      requiredAccessLevel,
    };
  }

  if (status === "suspended") {
    return {
      allowedNow: true,
      wouldRedirectLater: true,
      reason:
        "Suspended profiles should not receive production dashboard access.",
      recommendedRedirectTarget: "/account/suspended",
      requiredAccessLevel,
    };
  }

  if (status === "rejected") {
    return {
      allowedNow: true,
      wouldRedirectLater: true,
      reason:
        "Rejected profiles should not receive marketplace or dashboard access.",
      recommendedRedirectTarget: "/account/rejected",
      requiredAccessLevel,
    };
  }

  if (requiredAccessLevel === "dashboard-auth") {
    return {
      allowedNow: true,
      wouldRedirectLater: false,
      reason:
        "Authenticated profile was found. Future dashboard-auth guard would pass.",
      recommendedRedirectTarget: null,
      requiredAccessLevel,
    };
  }

  if (!isActiveProfile({ status: status ?? "pending" })) {
    return {
      allowedNow: true,
      wouldRedirectLater: true,
      reason:
        "This route will require an active or verified profile when enforcement begins.",
      recommendedRedirectTarget: "/dashboard/settings",
      requiredAccessLevel,
    };
  }

  if (
    requiredAccessLevel === "verified-technician" &&
    !hasRole(role, VERIFIED_TECHNICIAN_ROLES)
  ) {
    return {
      allowedNow: true,
      wouldRedirectLater: true,
      reason:
        "This route will require verified technician, expert technician, company owner, or admin access.",
      recommendedRedirectTarget: "/dashboard/unauthorized",
      requiredAccessLevel,
    };
  }

  if (
    requiredAccessLevel === "company-owner" &&
    !hasRole(role, COMPANY_OWNER_ROLES)
  ) {
    return {
      allowedNow: true,
      wouldRedirectLater: true,
      reason:
        "This route will require company owner or admin access when enforcement begins.",
      recommendedRedirectTarget: "/dashboard/unauthorized",
      requiredAccessLevel,
    };
  }

  if (requiredAccessLevel === "admin" && !hasRole(role, "admin")) {
    return {
      allowedNow: true,
      wouldRedirectLater: true,
      reason: "This route will require admin access when enforcement begins.",
      recommendedRedirectTarget: "/dashboard/unauthorized",
      requiredAccessLevel,
    };
  }

  return {
    allowedNow: true,
    wouldRedirectLater: false,
    reason: "Future guard would allow this route for the current profile.",
    recommendedRedirectTarget: null,
    requiredAccessLevel,
  };
}
