"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getVisibleDashboardNavigationItems,
  type DashboardNavigationItem,
} from "@/config/dashboard-navigation";
import { loadDashboardIdentity } from "@/lib/dashboard/identity";
import type {
  DatabaseOnboardingStatus,
} from "@/lib/supabase/types";
import type { AppRole, AuthProfileStatus } from "@/lib/auth/types";

type DashboardNavigationLinksProps = {
  variant: "sidebar" | "mobile";
};

type NavigationIdentityState =
  | {
      status: "loading";
      role: null;
      profileStatus: null;
      onboardingStatus: null;
    }
  | {
      status: "ready";
      role: AppRole | null;
      profileStatus: AuthProfileStatus | null;
      onboardingStatus: DatabaseOnboardingStatus | null;
    }
  | {
      status: "error";
      role: null;
      profileStatus: null;
      onboardingStatus: null;
    };

const NAV_LOAD_TIMEOUT_MS = 8000;

const groupLabels: Record<DashboardNavigationItem["group"], string> = {
  account: "Account",
  crm: "CRM",
  marketplace: "Marketplace",
  operations: "Operations",
  content: "Content",
  community: "Community",
  admin: "Admin",
  development: "Tools",
};

function getVisibilityLabel(visibility: DashboardNavigationItem["visibility"]) {
  void visibility;
  return null;
}

function isActivePath(
  pathname: string,
  item: Pick<DashboardNavigationItem, "href" | "label">,
): boolean {
  const { href, label } = item;

  if (
    href === "/dashboard/leads" &&
    !["Jobs"].includes(label)
  ) {
    return false;
  }

  if (
    href === "/dashboard/customers" &&
    label !== "Customers"
  ) {
    return false;
  }

  if (
    href === "/dashboard/settings" &&
    label !== "Settings"
  ) {
    return false;
  }

  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function DashboardNavigationLinks({
  variant,
}: DashboardNavigationLinksProps) {
  const pathname = usePathname();
  const [identityState, setIdentityState] =
    useState<NavigationIdentityState>({
      status: "loading",
      role: null,
      profileStatus: null,
      onboardingStatus: null,
    });

  useEffect(() => {
    let isMounted = true;

    async function refreshNavigationIdentity() {
      try {
        const result = await withTimeout(
          loadDashboardIdentity(),
          NAV_LOAD_TIMEOUT_MS,
        );

        if (!isMounted) {
          return;
        }

        setIdentityState({
          status: "ready",
          role: result.profile?.role ?? null,
          profileStatus: result.profile?.status ?? null,
          onboardingStatus: result.profile?.onboarding_status ?? null,
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setIdentityState({
          status: "error",
          role: null,
          profileStatus: null,
          onboardingStatus: null,
        });
      }
    }

    void refreshNavigationIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleItems = getVisibleDashboardNavigationItems({
    identity: {
      role: identityState.role,
      status: identityState.profileStatus,
      onboardingStatus: identityState.onboardingStatus,
    },
    pathname,
  });

  if (identityState.status === "loading") {
    return (
      <p className={variant === "mobile" ? "text-sm text-slate-400" : "px-3 text-sm text-slate-400"}>
        Loading navigation...
      </p>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <p className={variant === "mobile" ? "text-sm text-slate-400" : "px-3 text-sm leading-6 text-slate-500"}>
        No dashboard navigation is available for this account state.
      </p>
    );
  }

  if (variant === "mobile") {
    return (
      <>
        {visibleItems.map((item) => (
          <DashboardNavigationLink
            key={`${item.label}-${item.href}`}
            item={item}
            pathname={pathname}
            variant="mobile"
          />
        ))}
      </>
    );
  }

  const groupedItems = visibleItems.reduce<
    Partial<Record<DashboardNavigationItem["group"], DashboardNavigationItem[]>>
  >((groups, item) => {
    groups[item.group] = [...(groups[item.group] ?? []), item];
    return groups;
  }, {});

  return (
    <>
      {Object.entries(groupedItems).map(([group, items]) => (
        <div key={group} className="space-y-2">
          <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400/80">
            {groupLabels[group as DashboardNavigationItem["group"]]}
          </p>
          {items?.map((item) => (
            <DashboardNavigationLink
              key={`${item.label}-${item.href}`}
              item={item}
              pathname={pathname}
              variant="sidebar"
            />
          ))}
        </div>
      ))}
    </>
  );
}

function DashboardNavigationLink({
  item,
  pathname,
  variant,
}: {
  item: DashboardNavigationItem;
  pathname: string;
  variant: "sidebar" | "mobile";
}) {
  const isActive = isActivePath(pathname, item);
  const visibilityLabel = getVisibilityLabel(item.visibility);

  if (variant === "mobile") {
    return (
      <Link
        href={item.href}
        title={item.description}
        className={`shrink-0 rounded-[10px] px-3 py-2 text-sm font-semibold ${
          isActive
            ? "bg-[#0F6BFF] text-white"
            : "border border-[#E5E7EB] bg-white text-[#334155]"
        }`}
      >
        {item.label}
        {visibilityLabel ? (
          <span className="ml-2 text-[10px] uppercase opacity-70">
            {visibilityLabel}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.description}
      className={`group flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
        isActive
          ? "bg-[#0F6BFF] text-white shadow-[0_10px_24px_rgba(15,107,255,0.25)]"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            isActive
              ? "bg-white/20 text-white"
              : "bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-white"
          }`}
        >
          <NavigationIcon label={item.label} />
        </span>
        <span className="truncate">{item.label}</span>
      </span>
      {visibilityLabel ? (
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
            isActive
              ? "border-white/30 text-white/80"
              : "border-white/10 text-slate-500"
          }`}
        >
          {visibilityLabel}
        </span>
      ) : null}
    </Link>
  );
}

function NavigationIcon({ label }: { label: string }) {
  const pathByLabel: Record<string, string> = {
    Dashboard: "M4 11.5 12 4l8 7.5M6 10.5V20h5v-5h2v5h5v-9.5",
    Jobs: "M7 7h10M7 12h10M7 17h6M5 3h14v18H5z",
    Schedule: "M7 3v4M17 3v4M4 9h16M5 5h14v16H5z",
    Customers: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21a6 6 0 0 1 12 0M14 21a5 5 0 0 1 8 0",
    Estimates: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h4",
    Invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
    "Parts & Inventory": "M4 7h16v13H4zM7 4h10v3H7zM8 12h8",
    "Manuals Library": "M5 4h7a3 3 0 0 1 3 3v17a3 3 0 0 0-3-3H5zM15 7h4v17a3 3 0 0 0-3-3h-1",
    "Calls & Messages": "M5 5h14v10H8l-3 3zM8 8h8M8 12h5",
    Community: "M12 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21a8 8 0 0 1 16 0",
    Vendors: "M4 9h16l-2-5H6zM5 9v12h14V9M9 13h6",
    Technicians: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
    Reports: "M5 19V5M5 19h16M9 16V9M13 16V7M17 16v-5",
    Settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1",
  };

  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={pathByLabel[label] ?? "M5 12h14M12 5v14"} />
    </svg>
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Dashboard navigation identity loading timed out."));
      }, timeoutMs);
    }),
  ]);
}
