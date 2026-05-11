export type DashboardNavigationItem = {
  label: string;
  href: string;
};

export const dashboardNavigationItems: DashboardNavigationItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
  },
  {
    label: "Repair Cases",
    href: "/dashboard/repair-cases",
  },
  {
    label: "Leads",
    href: "/dashboard/leads",
  },
  {
    label: "Open Jobs",
    href: "/dashboard/open-jobs",
  },
  {
    label: "Coverage",
    href: "/dashboard/coverage",
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
  },
  {
    label: "Community",
    href: "/dashboard/community",
  },
  {
    label: "Reputation",
    href: "/dashboard/community/reputation",
  },
  {
    label: "AI Articles",
    href: "/dashboard/ai-articles",
  },
  {
    label: "Technicians",
    href: "/dashboard/technicians",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
  },
];
