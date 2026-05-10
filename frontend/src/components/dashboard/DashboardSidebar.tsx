"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/BrandLogo";
import { dashboardNavigationItems } from "@/config/dashboard-navigation";

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-slate-950 px-5 py-6 lg:block">
      <BrandLogo variant="dark" />

      <nav aria-label="Dashboard navigation" className="mt-8 space-y-2">
        {dashboardNavigationItems.map((item) => {
          const isActive =
            item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-cyan-300 text-slate-950"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
