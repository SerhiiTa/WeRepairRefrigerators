"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  createDashboardIdentityState,
  DASHBOARD_IDENTITY_LOADING,
  type DashboardIdentityState,
} from "@/lib/auth/dashboard-identity";
import {
  getCurrentUserProfile,
  mapProfileToDashboardIdentity,
} from "@/lib/auth/profile";
import {
  getSupabaseBrowserClient,
  isSupabaseBrowserConfigured,
} from "@/lib/supabase/client";

type ProfileSyncState =
  | {
      status: "not_checked";
      label: string;
    }
  | {
      status: "profile_found";
      label: string;
    }
  | {
      status: "profile_missing";
      label: string;
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

export function DashboardAuthStatus() {
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
      });
    }

    void refreshIdentity();

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange(() => {
      setIdentityState(DASHBOARD_IDENTITY_LOADING);
      setProfileSyncState({
        status: "not_checked",
        label: "Profile not checked",
      });
      void refreshIdentity();
    }).data.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const copy = modeCopy[identityState.mode];
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
            {accessHighlights.length > 0 ? ` | Preview: ${accessHighlights.join(", ")}` : ""}
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
    </aside>
  );
}
