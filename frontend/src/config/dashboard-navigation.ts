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
    label: "Coverage",
    href: "/dashboard/coverage",
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
