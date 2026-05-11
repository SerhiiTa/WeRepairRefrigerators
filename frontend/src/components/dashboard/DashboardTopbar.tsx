"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/BrandLogo";
import { dashboardNavigationItems } from "@/config/dashboard-navigation";

import { DashboardAuthStatus } from "./DashboardAuthStatus";

export function DashboardTopbar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/10 bg-slate-950/95 px-5 py-4 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-4 lg:hidden">
        <BrandLogo variant="dark" compact />
        <Link
          href="/"
          className="rounded-md border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
        >
          View Public Site
        </Link>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
            Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Technician command center
          </h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/"
            className="hidden items-center justify-center rounded-md border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-cyan-300/40 hover:bg-white/5 hover:text-white lg:inline-flex"
          >
            View Public Site
          </Link>
          <Link
            href="/dashboard/repair-cases/new"
            className="inline-flex items-center justify-center rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            New Repair Case
          </Link>
          <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-200">
            Houston MVP
          </span>
        </div>
      </div>

      <div className="mt-4">
        <DashboardAuthStatus />
      </div>

      <nav aria-label="Mobile dashboard navigation" className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
        {dashboardNavigationItems.map((item) => {
          const isActive =
            item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${
                isActive ? "bg-cyan-300 text-slate-950" : "border border-white/10 text-slate-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
