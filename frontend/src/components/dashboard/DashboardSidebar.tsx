"use client";

import { BrandLogo } from "@/components/BrandLogo";

import { DashboardNavigationLinks } from "./DashboardNavigationLinks";

export function DashboardSidebar() {
  return (
    <aside className="hidden w-[264px] shrink-0 bg-[#071D36] px-3 py-4 text-white shadow-[8px_0_24px_rgba(15,23,42,0.08)] lg:block">
      <div className="rounded-[20px] border border-white/10 bg-white/[0.06] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <BrandLogo variant="dark" />
      </div>

      <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.04] px-3 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
          Technician
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0F6BFF] text-sm font-black text-white">
            S
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">Serhii</p>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Available
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="Dashboard navigation" className="mt-5 space-y-4">
        <DashboardNavigationLinks variant="sidebar" />
      </nav>
    </aside>
  );
}
