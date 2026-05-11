"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { evaluateAccessDecision } from "@/lib/auth/access-decisions";
import {
  createDashboardIdentityState,
  DASHBOARD_IDENTITY_LOADING,
  type DashboardIdentityState,
} from "@/lib/auth/dashboard-identity";
import {
  getCurrentUserProfile,
  mapProfileToDashboardIdentity,
} from "@/lib/auth/profile";
import { isActiveProfile } from "@/lib/auth/permissions";
import type { AuthProfileStatus } from "@/lib/auth/types";
import {
  getSupabaseBrowserClient,
  isSupabaseBrowserConfigured,
} from "@/lib/supabase/client";

type ProfileSyncState =
  | {
      status: "not_checked";
      label: string;
      profileStatus: null;
    }
  | {
      status: "profile_found";
      label: string;
      profileStatus: AuthProfileStatus;
    }
  | {
      status: "profile_missing";
      label: string;
      profileStatus: null;
    };

type RouteProtectionNotice = {
  tone: "info" | "warning" | "danger";
  title: string;
  description: string;
};

const modeCopy: Record<
  DashboardIdentityState["mode"],
  { label: string; helper: string; classes: string }
> = {
  loading: {
    label: "Checking session",
    helper: "Loading auth state...",
    classes: "border-slate-700 bg-slate-900/80 text-slate-300",
  },
  supabase_unavailable: {
    label: "Demo mode",
    helper: "Supabase env vars are not configured.",
    classes: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  },
  guest_demo: {
    label: "Guest demo",
    helper: "Log in or sign up when you want to test Supabase Auth.",
    classes: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
  },
  authenticated: {
    label: "Authenticated",
    helper: "Profile role is shown when the profiles row is available.",
    classes: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  },
};

function formatProfileStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAccessLevel(level: string): string {
  return level
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function DashboardAuthStatus() {
  const pathname = usePathname();
  const [identityState, setIdentityState] = useState<DashboardIdentityState>(() =>
    isSupabaseBrowserConfigured()
      ? DASHBOARD_IDENTITY_LOADING
      : createDashboardIdentityState({
          session: null,
          supabaseAvailable: false,
        }),
  );
  const [profileSyncState, setProfileSyncState] =
    useState<ProfileSyncState>({
      status: "not_checked",
      label: "Profile not checked",
      profileStatus: null,
    });

  useEffect(() => {
    let isMounted = true;
    const supabaseAvailable = isSupabaseBrowserConfigured();

    if (!supabaseAvailable) {
      return;
    }

    async function refreshIdentity() {
      const result = await getCurrentUserProfile();

      if (!isMounted) {
        return;
      }

      if (result.status === "profile_ready") {
        setIdentityState(
          mapProfileToDashboardIdentity({
            profile: result.profile,
            session: result.session,
            supabaseAvailable: true,
          }),
        );
        setProfileSyncState({
          status: "profile_found",
          label: `Profile status: ${formatProfileStatus(result.profile.status)}`,
          profileStatus: result.profile.status,
        });
        return;
      }

      if (result.status === "profile_unavailable") {
        setIdentityState(
          createDashboardIdentityState({
            session: result.session,
            supabaseAvailable: true,
          }),
        );
        setProfileSyncState({
          status: "profile_missing",
          label: "Profile not found",
          profileStatus: null,
        });
        return;
      }

      setIdentityState(
        createDashboardIdentityState({
          session: null,
          supabaseAvailable: result.status !== "supabase_unavailable",
        }),
      );
      setProfileSyncState({
        status: "not_checked",
        label:
          result.status === "supabase_unavailable"
            ? "Profile not checked"
            : "Profile not checked until login",
        profileStatus: null,
      });
    }

    void refreshIdentity();

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange(() => {
      setIdentityState(DASHBOARD_IDENTITY_LOADING);
      setProfileSyncState({
        status: "not_checked",
        label: "Profile not checked",
        profileStatus: null,
      });
      void refreshIdentity();
    }).data.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const copy = modeCopy[identityState.mode];
  const routeProtectionNotice = getRouteProtectionNotice(
    identityState,
    profileSyncState,
  );
  const accessDecision = evaluateAccessDecision({
    pathname,
    isAuthenticated: identityState.mode === "authenticated",
    profilePresent: profileSyncState.status === "profile_found",
    role: identityState.role,
    status: profileSyncState.profileStatus,
    isLoading: identityState.mode === "loading",
  });
  const accessHighlights = [
    identityState.accessPreview.canAccessOpenJobs ? "Open jobs" : null,
    identityState.accessPreview.canAccessPrivateCommunity ? "Community" : null,
    identityState.accessPreview.canAccessAdmin ? "Admin" : null,
  ].filter(Boolean);

  return (
    <aside className={`rounded-md border px-3 py-2 ${copy.classes}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em]">
            {copy.label}
          </p>
          <p className="mt-1 text-sm font-bold">
            {identityState.email ?? copy.helper}
          </p>
          <p className="mt-1 text-xs text-current/70">
            Role: {identityState.roleLabel}
            {accessHighlights.length > 0
              ? ` | Preview: ${accessHighlights.join(", ")}`
              : ""}
          </p>
          {identityState.mode === "authenticated" ? (
            <p className="mt-1 text-xs text-current/70">
              {profileSyncState.label}
            </p>
          ) : null}
        </div>

        {identityState.mode === "authenticated" ? null : (
          <div className="flex shrink-0 gap-2">
            <Link
              href="/login"
              className="rounded-md border border-current/20 px-3 py-2 text-xs font-black transition hover:bg-white/10"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-white px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-slate-100"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>

      {routeProtectionNotice ? (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            routeProtectionNotice.tone === "danger"
              ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
              : routeProtectionNotice.tone === "warning"
                ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
          }`}
        >
          <p className="font-black uppercase tracking-[0.16em]">
            {routeProtectionNotice.title}
          </p>
          <p className="mt-1 text-current/75">
            {routeProtectionNotice.description}
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-white/10 bg-slate-950/35 px-3 py-2 text-xs text-slate-300">
        <p className="font-black uppercase tracking-[0.16em] text-slate-100">
          Auth guard dry run
        </p>
        <p className="mt-1 text-slate-400">
          Allowed now:{" "}
          <span className="font-bold text-slate-200">
            {accessDecision.allowedNow ? "Yes" : "No"}
          </span>
          {" | "}
          Required later:{" "}
          <span className="font-bold text-slate-200">
            {formatAccessLevel(accessDecision.requiredAccessLevel)}
          </span>
          {" | "}
          {accessDecision.wouldRedirectLater
            ? `Would redirect to ${accessDecision.recommendedRedirectTarget}`
            : "No redirect expected"}
        </p>
        <p className="mt-1 text-slate-500">
          {accessDecision.reason} Current dashboard access is still
          non-blocking.
        </p>
      </div>
    </aside>
  );
}

function getRouteProtectionNotice(
  identityState: DashboardIdentityState,
  profileSyncState: ProfileSyncState,
): RouteProtectionNotice | null {
  if (identityState.mode === "guest_demo") {
    return {
      tone: "info",
      title: "Demo access",
      description:
        "Dashboard routes remain open in this mock-safe phase. Log in to test role and profile-aware UI before route protection is enforced.",
    };
  }

  if (identityState.mode === "authenticated") {
    if (profileSyncState.status === "profile_missing") {
      return {
        tone: "warning",
        title: "Profile missing",
        description:
          "A session exists, but no matching profile row was found. The dashboard stays available for now; production access will require a valid profile.",
      };
    }

    if (
      profileSyncState.status === "profile_found" &&
      !isActiveProfile({ status: profileSyncState.profileStatus })
    ) {
      const isSuspendedOrRejected =
        profileSyncState.profileStatus === "suspended" ||
        profileSyncState.profileStatus === "rejected";

      return {
        tone: isSuspendedOrRejected ? "danger" : "warning",
        title: `${formatProfileStatus(profileSyncState.profileStatus)} profile`,
        description:
          profileSyncState.profileStatus === "pending"
            ? "This profile is pending. Future protected dashboard access may be limited until approval or verification is complete."
            : "This profile status should not receive production dashboard access until reviewed. Current access is still mock-safe and non-blocking.",
      };
    }
  }

  return null;
}
