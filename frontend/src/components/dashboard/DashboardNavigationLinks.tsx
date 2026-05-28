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
  community: "Mock community",
  admin: "Admin",
  development: "Development",
};

function getVisibilityLabel(visibility: DashboardNavigationItem["visibility"]) {
  if (visibility === "real") {
    return null;
  }

  if (visibility === "mock") {
    return "Preview";
  }

  if (visibility === "coming_soon") {
    return "Soon";
  }

  return "Dev";
}

function isActivePath(pathname: string, href: string): boolean {
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
      <p className={variant === "mobile" ? "text-sm text-slate-400" : "px-3 text-sm text-slate-500"}>
        Loading role-aware navigation...
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
            key={item.href}
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
          <p className="px-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            {groupLabels[group as DashboardNavigationItem["group"]]}
          </p>
          {items?.map((item) => (
            <DashboardNavigationLink
              key={item.href}
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
  const isActive = isActivePath(pathname, item.href);
  const visibilityLabel = getVisibilityLabel(item.visibility);

  if (variant === "mobile") {
    return (
      <Link
        href={item.href}
        title={item.description}
        className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${
          isActive
            ? "bg-cyan-300 text-slate-950"
            : "border border-white/10 text-slate-300"
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
      className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
        isActive
          ? "bg-cyan-300 text-slate-950"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span>{item.label}</span>
      {visibilityLabel ? (
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
            isActive
              ? "border-slate-950/20 text-slate-800"
              : "border-white/10 text-slate-500"
          }`}
        >
          {visibilityLabel}
        </span>
      ) : null}
    </Link>
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
