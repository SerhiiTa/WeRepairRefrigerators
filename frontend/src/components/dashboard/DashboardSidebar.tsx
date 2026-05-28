"use client";

import { BrandLogo } from "@/components/BrandLogo";

import { DashboardNavigationLinks } from "./DashboardNavigationLinks";

export function DashboardSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-slate-950 px-5 py-6 lg:block">
      <BrandLogo variant="dark" />

      <nav aria-label="Dashboard navigation" className="mt-8 space-y-2">
        <DashboardNavigationLinks variant="sidebar" />
      </nav>
    </aside>
  );
}
