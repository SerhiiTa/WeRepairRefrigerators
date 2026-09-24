"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { DashboardMobileDrawer } from "@/components/dashboard/DashboardMobileDrawer";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { DashboardNavigationLinks } from "./DashboardNavigationLinks";

export function DashboardTopbar() {
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const isJobsCenter = pathname === "/dashboard/leads";
  const isJobWorkspace = /^\/dashboard\/leads\/[^/]+$/.test(pathname);
  const isCommunicationsWorkspace = pathname === "/dashboard/communications";
  const isCustomersIndex = pathname === "/dashboard/customers";
  const isCustomerWorkspace = /^\/dashboard\/customers\/[^/]+$/.test(pathname);
  const usesCompactMobileAppBar =
    isJobsCenter || isCustomersIndex || isCommunicationsWorkspace;

  if (pathname === "/dashboard") {
    return null;
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();

    setIsSigningOut(true);

    if (supabase) {
      await supabase.auth.signOut();
    }

    window.location.assign("/login");
  }

  if (usesCompactMobileAppBar) {
    return (
      <header
        className={`border-b border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:px-6 lg:px-8 ${
          isCommunicationsWorkspace ? "lg:hidden" : ""
        }`}
      >
        {isCustomersIndex || isCommunicationsWorkspace ? (
          <div className="flex min-h-12 items-center justify-between gap-3 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <DashboardMobileDrawer trigger="hamburger" />
              <h1 className="truncate text-xl font-medium tracking-normal text-[#0F172A]">
                {isCustomersIndex ? "Customers" : "Communications"}
              </h1>
            </div>
            {isCustomersIndex ? (
              <div className="flex shrink-0 items-center gap-3">
                <button
                  aria-label="Create customer"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-4xl font-light leading-none text-[#0F6BFF] transition hover:bg-blue-50"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent("wra:create-customer"))
                  }
                  type="button"
                >
                  +
                </button>
                <button
                  aria-label="Open global search"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[#1E293B] transition hover:bg-slate-100"
                  onClick={() => setIsGlobalSearchOpen(true)}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="h-7 w-7"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="m20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <DashboardMobileDrawer trigger="hamburger" />
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo compact />
            </div>
          </div>
        )}

        <div className="hidden flex-col gap-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
              Dashboard
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0F172A]">
              {isCustomersIndex ? "Customers" : "Jobs command center"}
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
        {isGlobalSearchOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 px-3 py-4 backdrop-blur-sm sm:items-center lg:hidden">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-[#0F172A]">Search WRA</h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                    Global search is coming soon. Use the Customers search field below for now.
                  </p>
                </div>
                <button
                  aria-label="Close global search"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xl font-black text-slate-600"
                  onClick={() => setIsGlobalSearchOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>
              <label className="mt-4 block">
                <span className="sr-only">Future global search</span>
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500 outline-none"
                  disabled
                  placeholder="Customers, jobs, estimates, invoices..."
                />
              </label>
            </div>
          </div>
        ) : null}
      </header>
    );
  }

  return (
    <header
      className={`border-b border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:px-6 lg:px-8 ${
        isJobWorkspace || isCustomerWorkspace
          ? "hidden lg:block"
          : ""
      }`}
    >
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
