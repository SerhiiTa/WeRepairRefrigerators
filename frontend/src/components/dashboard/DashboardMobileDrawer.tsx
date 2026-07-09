"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type DashboardMobileDrawerProps = {
  trigger: "dashboard-shortcut" | "hamburger";
};

const drawerMenuItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/leads", label: "Jobs" },
  { href: "/dashboard/intake", label: "Intake" },
  { href: "/dashboard/technician-schedule", label: "Schedule" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/leads", label: "Estimates" },
  { href: "/dashboard/leads", label: "Invoices" },
  { href: "/dashboard/leads", label: "Parts & Inventory" },
  { href: "/dashboard/ai-articles", label: "Manuals Library" },
  { href: "/dashboard/communications", label: "Calls & Messages" },
  { href: "/dashboard/community", label: "Community" },
  { href: "/dashboard/settings", label: "Vendors" },
  { href: "/dashboard/technicians", label: "Technicians" },
  { href: "/dashboard/technician-profile", label: "Marketplace Profile" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardMobileDrawer({ trigger }: DashboardMobileDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  function open() {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    setIsMounted(true);
    animationFrameRef.current = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }

  function close() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsVisible(false);
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsMounted(false);
      closeTimeoutRef.current = null;
    }, 320);
  }

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {trigger === "hamburger" ? (
        <button
          aria-label="Open dashboard menu"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white text-[#0F172A]"
          onClick={open}
          type="button"
        >
          <span className="block h-0.5 w-4 rounded bg-current" />
          <span className="absolute block h-0.5 w-4 -translate-y-1.5 rounded bg-current" />
          <span className="absolute block h-0.5 w-4 translate-y-1.5 rounded bg-current" />
        </button>
      ) : (
        <button
          aria-label="Menu"
          className="group/menu flex min-w-0 flex-col items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-2 text-center text-[#334155] transition hover:border-[#0F6BFF] hover:bg-white hover:text-[#0F6BFF] xl:hidden"
          data-testid="dashboard-mobile-menu-button"
          onClick={open}
          type="button"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
            <MenuIcon />
          </span>
          <span className="max-w-full truncate text-[11px] font-black leading-4 text-[#334155] group-hover/menu:text-[#0F6BFF]">
            Menu
          </span>
        </button>
      )}
      {isMounted ? (
        <div className="fixed inset-0 z-50 xl:hidden" data-testid="dashboard-mobile-menu-drawer">
          <button
            aria-label="Close menu"
            className={`absolute inset-0 bg-[#071D36]/45 transition-opacity duration-[200ms] ease-out ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            data-testid="dashboard-mobile-menu-overlay"
            onClick={close}
            type="button"
          />
          <aside
            className={`relative flex h-full w-[min(84vw,340px)] transform-gpu flex-col overflow-hidden rounded-r-[28px] border-r border-[#E5E7EB] bg-white shadow-[24px_0_60px_rgba(15,23,42,0.22)] transition-transform duration-[300ms] ease-out ${
              isVisible ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="border-b border-[#E5E7EB] bg-[#F7F9FC] p-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  className="flex min-w-0 items-center gap-3"
                  href="/dashboard/technician-profile"
                  onClick={close}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#071D36] text-sm font-black text-white">
                    S
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-black text-[#0F172A]">
                      Serhii
                    </span>
                    <span className="mt-0.5 block text-xs font-bold text-[#64748B]">
                      Open profile
                    </span>
                  </span>
                </Link>
                <button
                  aria-label="Close menu"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                  data-testid="dashboard-mobile-menu-close"
                  onClick={close}
                  type="button"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <nav
              aria-label="Dashboard menu"
              className="grid flex-1 content-start gap-1 overflow-y-auto p-3"
            >
              {drawerMenuItems.map((item) => (
                <Link
                  className="block rounded-2xl px-4 py-3 text-sm font-black text-[#334155] transition hover:bg-[#F8FAFC] hover:text-[#0F6BFF]"
                  href={item.href}
                  key={`${item.label}-${item.href}`}
                  onClick={close}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
