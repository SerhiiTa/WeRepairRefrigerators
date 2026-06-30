"use client";

import Link from "next/link";
import { useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { DashboardNavigationLinks } from "./DashboardNavigationLinks";

export function DashboardTopbar() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();

    setIsSigningOut(true);

    if (supabase) {
      await supabase.auth.signOut();
    }

    window.location.assign("/login");
  }

  return (
    <header className="border-b border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-4 lg:hidden">
        <BrandLogo compact />
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-[10px] border border-[#E5E7EB] px-3 py-2 text-sm font-bold text-[#0F172A] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
          >
            Public Site
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
            Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0F172A]">
            Jobs command center
          </h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/"
            className="hidden items-center justify-center rounded-[10px] border border-[#E5E7EB] px-4 py-2.5 text-sm font-bold text-[#0F172A] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] lg:inline-flex"
          >
            View Public Site
          </Link>
          <Link
            href="/dashboard/leads"
            className="inline-flex items-center justify-center rounded-[10px] bg-[#0F6BFF] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0057D9]"
          >
            Open Jobs
          </Link>
          <Link
            href="/dashboard/technician-profile"
            className="inline-flex items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-bold text-[#0F172A] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
          >
            Marketplace Profile
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="inline-flex items-center justify-center rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
          <span className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            Houston MVP
          </span>
        </div>
      </div>

      <nav aria-label="Mobile dashboard navigation" className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
        <DashboardNavigationLinks variant="mobile" />
      </nav>
    </header>
  );
}
