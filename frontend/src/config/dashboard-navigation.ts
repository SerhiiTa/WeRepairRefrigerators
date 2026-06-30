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
    label: "Dashboard",
    href: "/dashboard",
    allowedRoles: DASHBOARD_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Jobs-first operational dashboard with real account and CRM context.",
  },
  {
    label: "Jobs",
    href: "/dashboard/leads",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description:
      "Real Supabase service request inbox for public schedule-service submissions.",
  },
  {
    label: "Schedule",
    href: "/dashboard/technician-schedule",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description:
      "Real appointment schedule created from dispatcher booking recommendations.",
  },
  {
    label: "Customers",
    href: "/dashboard/customers",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "coming_soon",
    group: "operations",
    description: "Customer history placeholder until customer records are derived from jobs.",
  },
  {
    label: "Estimates",
    href: "/dashboard/leads",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Open jobs with estimate workflows.",
  },
  {
    label: "Invoices",
    href: "/dashboard/leads",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Open jobs with invoice workflows.",
  },
  {
    label: "Parts & Inventory",
    href: "/dashboard/leads",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Parts and inventory workspace.",
  },
  {
    label: "Manuals Library",
    href: "/dashboard/ai-articles",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Manuals and technical reference workspace.",
  },
  {
    label: "Calls & Messages",
    href: "/dashboard/customers",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Customer communication workspace.",
  },
  {
    label: "Community",
    href: "/dashboard/community",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Technician community discussions.",
  },
  {
    label: "Vendors",
    href: "/dashboard/settings",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Vendor and supplier workspace.",
  },
  {
    label: "Technicians",
    href: "/dashboard/technicians",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "coming_soon",
    group: "operations",
    description: "Team and technician management placeholder until real team flows exist.",
  },
  {
    label: "Marketplace Profile",
    href: "/dashboard/technician-profile",
    allowedRoles: TECHNICIAN_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "real",
    group: "operations",
    description: "Configure public booking eligibility, service areas, appliances, and brands.",
  },
  {
    label: "Reports",
    href: "/dashboard/analytics",
    allowedRoles: COMPANY_OPERATIONS_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "mock",
    group: "operations",
    description: "Mock marketplace reporting until real reporting persistence is added.",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    allowedRoles: DASHBOARD_ROLES,
    allowedStatuses: ACTIVE_PROFILE_STATUSES,
    requiresCompletedOnboarding: true,
    visibility: "coming_soon",
    group: "operations",
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
