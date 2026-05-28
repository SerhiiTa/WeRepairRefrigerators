import type { AppRole, AuthProfileStatus } from "@/lib/auth/types";
import type { DatabaseOnboardingStatus } from "@/lib/supabase/types";
import { isDashboardOnboardingStatusSatisfied } from "@/lib/auth/dashboard-access";

export type DashboardNavigationItem = {
  label: string;
  href: string;
  allowedRoles: readonly AppRole[];
  allowedStatuses?: readonly AuthProfileStatus[];
  requiresCompletedOnboarding?: boolean;
  visibility: "real" | "mock" | "coming_soon" | "dev_only";
  group:
    | "account"
    | "crm"
    | "marketplace"
    | "operations"
    | "content"
    | "community"
    | "admin"
    | "development";
  description: string;
};

type DashboardNavigationIdentity = {
  role: AppRole | null;
  status: AuthProfileStatus | null;
  onboardingStatus: DatabaseOnboardingStatus | null;
};

const DASHBOARD_ROLES = [
  "technician",
  "verified_technician",
  "expert_technician",
  "company_owner",
  "admin",
] as const satisfies readonly AppRole[];

const TECHNICIAN_ROLES = [
  "technician",
  "verified_technician",
  "expert_technician",
  "company_owner",
  "admin",
] as const satisfies readonly AppRole[];

const VERIFIED_TECHNICIAN_ROLES = [
  "verified_technician",
  "expert_technician",
  "company_owner",
  "admin",
] as const satisfies readonly AppRole[];

const COMPANY_OPERATIONS_ROLES = [
  "company_owner",
  "admin",
] as const satisfies readonly AppRole[];

const ACTIVE_PROFILE_STATUSES = [
  "active",
  "verified",
] as const satisfies readonly AuthProfileStatus[];

export const dashboardNavigationItems: DashboardNavigationItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    allowedRoles: DASHBOARD_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "account",
    description: "Real account, profile, onboarding, company, and technician context.",
  },
  {
    label: "Technician Profile",
    href: "/dashboard/technician-profile",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "account",
    description:
      "Real authenticated technician profile editing through Supabase RLS.",
  },
  {
    label: "Leads",
    href: "/dashboard/leads",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "crm",
    description:
      "Real Supabase service request inbox for public schedule-service submissions.",
  },
  {
    label: "Repair Cases",
    href: "/dashboard/repair-cases",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "operations",
    description: "Mock repair case workflow preview until repair case persistence is added.",
  },
  {
    label: "Open Jobs",
    href: "/dashboard/open-jobs",
    allowedRoles: VERIFIED_TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "marketplace",
    description: "Mock open jobs board; real claiming needs server-side locking.",
  },
  {
    label: "Coverage",
    href: "/dashboard/coverage",
    allowedRoles: COMPANY_OPERATIONS_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "operations",
    description: "Mock technician coverage and workload preview for company operations.",
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    allowedRoles: COMPANY_OPERATIONS_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "marketplace",
    description: "Mock marketplace analytics and lead source reporting.",
  },
  {
    label: "Community",
    href: "/dashboard/community",
    allowedRoles: VERIFIED_TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "community",
    description: "Mock private technician community preview for verified technicians.",
  },
  {
    label: "Reputation",
    href: "/dashboard/community/reputation",
    allowedRoles: VERIFIED_TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "community",
    description: "Mock private reputation and expert badge preview.",
  },
  {
    label: "AI Articles",
    href: "/dashboard/ai-articles",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "content",
    description: "Mock privacy-safe repair case to SEO article workflow.",
  },
  {
    label: "Technicians",
    href: "/dashboard/technicians",
    allowedRoles: COMPANY_OPERATIONS_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "coming_soon",
    group: "operations",
    description: "Company technician management placeholder until real team flows exist.",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    allowedRoles: DASHBOARD_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "coming_soon",
    group: "account",
    description: "Account and workspace settings placeholder.",
  },
  {
    label: "Supabase Check",
    href: "/dashboard/dev/supabase-check",
    allowedRoles: ["admin"],
    visibility: "dev_only",
    group: "development",
    description: "Local development-only Supabase verification helper.",
  },
];

export function isDashboardNavigationItemVisible({
  item,
  identity,
  pathname,
}: {
  item: DashboardNavigationItem;
  identity: DashboardNavigationIdentity;
  pathname: string;
}): boolean {
  if (item.visibility === "dev_only") {
    return pathname.startsWith("/dashboard/dev");
  }

  if (!identity.role || !item.allowedRoles.includes(identity.role)) {
    return false;
  }

  if (
    item.allowedStatuses &&
    (!identity.status || !item.allowedStatuses.includes(identity.status))
  ) {
    return false;
  }

  if (
    item.requiresCompletedOnboarding &&
    !isDashboardOnboardingStatusSatisfied({
      role: identity.role,
      onboardingStatus: identity.onboardingStatus,
    })
  ) {
    return false;
  }

  return true;
}

export function getVisibleDashboardNavigationItems({
  identity,
  pathname,
}: {
  identity: DashboardNavigationIdentity;
  pathname: string;
}): DashboardNavigationItem[] {
  return dashboardNavigationItems.filter((item) =>
    isDashboardNavigationItemVisible({ item, identity, pathname }),
  );
}
