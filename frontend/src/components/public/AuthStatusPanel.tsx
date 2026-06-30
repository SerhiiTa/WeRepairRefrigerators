"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { getCurrentUserProfile } from "@/lib/auth/profile";
import type { AuthProfileStatus } from "@/lib/auth/types";
import { getSupabaseBrowserClientResult } from "@/lib/supabase/client";
import type { Database, DatabaseAppRole } from "@/lib/supabase/types";

type AuthRequestResult = "not attempted" | "success" | "error";

type AuthStatusPanelProps = {
  authRequestResult?: AuthRequestResult;
  className?: string;
};

type AuthStatusState =
  | {
      status: "loading";
      session: "loading";
      email: null;
      role: null;
      profileStatus: null;
      message: string;
    }
  | {
      status: "supabase_unavailable";
      session: "no";
      email: null;
      role: null;
      profileStatus: null;
      message: string;
    }
  | {
      status: "logged_out";
      session: "no";
      email: null;
      role: null;
      profileStatus: null;
      message: string;
    }
  | {
      status: "profile_missing";
      session: "yes";
      email: string | null;
      role: null;
      profileStatus: null;
      message: string;
    }
  | {
      status: "profile_ready";
      session: "yes";
      email: string | null;
      role: DatabaseAppRole;
      profileStatus: AuthProfileStatus;
      message: string;
    }
  | {
      status: "error";
      session: "error";
      email: null;
      role: null;
      profileStatus: null;
      message: string;
    };

type SupabaseClientCheckResult = {
  status: "ready" | "unavailable" | "error" | "timeout";
  client: SupabaseClient<Database> | null;
  error: string | null;
};

const SUPABASE_CLIENT_CHECK_TIMEOUT_MS = 4000;
const SESSION_CHECK_TIMEOUT_MS = 5000;
const PROFILE_LOAD_TIMEOUT_MS = 8000;

const statusToneClasses: Record<AuthStatusState["status"], string> = {
  loading: "border-blue-100 bg-blue-50 text-blue-900",
  supabase_unavailable: "border-amber-100 bg-amber-50 text-amber-900",
  logged_out: "border-slate-200 bg-slate-50 text-slate-800",
  profile_missing: "border-amber-100 bg-amber-50 text-amber-900",
  profile_ready: "border-emerald-100 bg-emerald-50 text-emerald-900",
  error: "border-red-100 bg-red-50 text-red-900",
};

const initialAuthStatus: AuthStatusState = {
  status: "loading",
  session: "loading",
  email: null,
  role: null,
  profileStatus: null,
  message: "Checking Supabase session...",
};

export function AuthStatusPanel({
  authRequestResult = "not attempted",
  className = "",
}: AuthStatusPanelProps) {
  const [authStatus, setAuthStatus] =
    useState<AuthStatusState>(initialAuthStatus);
  const authStatusRef = useRef<AuthStatusState>(initialAuthStatus);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    authStatusRef.current = authStatus;
  }, [authStatus]);

  useEffect(() => {
    let isMounted = true;
    const loadingFallback = window.setTimeout(() => {
      if (!isMounted || authStatusRef.current.status !== "loading") {
        return;
      }

      setAuthStatus({
        status: "error",
        session: "error",
        email: null,
        role: null,
        profileStatus: null,
        message:
          "Supabase auth check timed out. Refresh the status and confirm the local server is reachable.",
      });
    }, SESSION_CHECK_TIMEOUT_MS + 1000);

    async function refreshAuthStatus() {
      setAuthStatus(initialAuthStatus);
      const clientResult = await getTimedSupabaseClientResult();

      if (!isMounted) {
        return;
      }

      const supabase = clientResult.client;

      if (!supabase) {
        const message =
          clientResult.error ??
          "Supabase browser client is unavailable. Confirm local env vars are configured and restart the server.";

        if (clientResult.status === "unavailable") {
          setAuthStatus({
            status: "supabase_unavailable",
            session: "no",
            email: null,
            role: null,
            profileStatus: null,
            message,
          });
          return;
        }

        setAuthStatus({
          status: "error",
          session: "error",
          email: null,
          role: null,
          profileStatus: null,
          message,
        });
        return;
      }

      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          SESSION_CHECK_TIMEOUT_MS,
          "Supabase auth check timed out.",
        );

        if (!isMounted) {
          return;
        }

        if (sessionResult.error) {
          setAuthStatus({
            status: "error",
            session: "error",
            email: null,
            role: null,
            profileStatus: null,
            message: getAuthStatusErrorMessage(sessionResult.error.message),
          });
          return;
        }

        if (!sessionResult.data.session) {
          setAuthStatus({
            status: "logged_out",
            session: "no",
            email: null,
            role: null,
            profileStatus: null,
            message:
              "Supabase is connected, but no active session exists in this browser.",
          });
          return;
        }

        const profileResult = await withTimeout(
          getCurrentUserProfile({ client: supabase }),
          PROFILE_LOAD_TIMEOUT_MS,
          "Supabase profile load timed out.",
        );

        if (!isMounted) {
          return;
        }

        if (profileResult.status === "profile_ready") {
          setAuthStatus({
            status: "profile_ready",
            session: "yes",
            email:
              profileResult.profile.email ??
              profileResult.session.user.email,
            role: profileResult.profile.role,
            profileStatus: profileResult.profile.status,
            message: "Session and profile row found.",
          });
          return;
        }

        if (profileResult.status === "profile_unavailable") {
          setAuthStatus({
            status: "profile_missing",
            session: "yes",
            email: profileResult.session.user.email,
            role: null,
            profileStatus: null,
            message:
              profileResult.error ??
              "Session exists, but no matching public.profiles row was found.",
          });
          return;
        }

        setAuthStatus({
          status: "logged_out",
          session: "no",
          email: null,
          role: null,
          profileStatus: null,
          message: "Session was not available when the profile check ran.",
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAuthStatus({
          status: "error",
          session: "error",
          email: null,
          role: null,
          profileStatus: null,
          message: getAuthStatusErrorMessage(error),
        });
      }
    }

    void refreshAuthStatus();

    return () => {
      isMounted = false;
      window.clearTimeout(loadingFallback);
    };
  }, [authRequestResult, refreshKey]);

  async function handleLogout() {
    const clientResult = await getTimedSupabaseClientResult();
    const supabase = clientResult.client;

    if (!supabase) {
      setAuthStatus({
        status: "supabase_unavailable",
        session: "no",
        email: null,
        role: null,
        profileStatus: null,
        message:
          clientResult.error ??
          "Supabase client is unavailable, so logout could not run.",
      });
      return;
    }

    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (error) {
      setAuthStatus({
        status: "error",
        session: "error",
        email: null,
        role: null,
        profileStatus: null,
        message: getAuthStatusErrorMessage(error.message),
      });
      return;
    }

    setAuthStatus({
      status: "logged_out",
      session: "no",
      email: null,
      role: null,
      profileStatus: null,
      message: "Logged out in this browser.",
    });
  }

  return (
    <section
      className={`rounded-2xl border px-4 py-4 text-sm ${statusToneClasses[authStatus.status]} ${className}`}
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em]">
            Auth status
          </p>
          <dl className="mt-3 grid gap-2">
            <StatusRow label="Session" value={authStatus.session} />
            <StatusRow label="Email" value={authStatus.email ?? "Not logged in"} />
            <StatusRow label="Role" value={authStatus.role ?? "Not available"} />
            <StatusRow
              label="Profile status"
              value={authStatus.profileStatus ?? "Not available"}
            />
          </dl>
          <p className="mt-3 leading-6">{authStatus.message}</p>
          {authStatus.status === "profile_missing" ? (
            <p className="mt-2 font-bold">
              The profile trigger may not have created a row for this user. Do
              not auto-create it from the frontend.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={() => setRefreshKey((currentKey) => currentKey + 1)}
            className="inline-flex items-center justify-center rounded-full border border-current/20 bg-white/70 px-4 py-2 text-xs font-black transition hover:bg-white"
          >
            Refresh status
          </button>
          {authStatus.session === "yes" ? (
            <button
              type="button"
              onClick={handleLogout}
              disabled={isSigningOut}
              className="inline-flex items-center justify-center rounded-full border border-current/20 bg-white/70 px-4 py-2 text-xs font-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut ? "Logging out..." : "Log out"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 font-bold opacity-75">{label}</dt>
      <dd className="break-all text-right font-black">{value}</dd>
    </div>
  );
}

async function getTimedSupabaseClientResult(): Promise<SupabaseClientCheckResult> {
  let timeoutId: number | undefined;
  const clientCheck = Promise.resolve()
    .then(() => {
      try {
        const result = getSupabaseBrowserClientResult();

        return {
          status: result.status,
          client: result.client,
          error: result.error,
        };
      } catch (error) {
        return {
          status: "error",
          client: null,
          error: getShortErrorMessage(error),
        } satisfies SupabaseClientCheckResult;
      }
    })
    .finally(() => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    });

  const timeoutCheck = new Promise<SupabaseClientCheckResult>((resolve) => {
    timeoutId = window.setTimeout(() => {
      resolve({
        status: "timeout",
        client: null,
        error:
          "Supabase client check timed out before returning ready or unavailable.",
      });
    }, SUPABASE_CLIENT_CHECK_TIMEOUT_MS);
  });

  return Promise.race([clientCheck, timeoutCheck]);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = "Auth check timeout",
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getShortErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Supabase client check failed.";
}

function getAuthStatusErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unable to read auth state.";

  if (message.toLowerCase().includes("auth check timeout")) {
    return "Supabase auth check timed out. Refresh the status and confirm the local server is reachable.";
  }

  if (
    message.toLowerCase().includes("failed to fetch") ||
    message.toLowerCase().includes("network")
  ) {
    return "Network or Supabase error while reading auth state. Confirm the phone and computer are on the same network.";
  }

  return message;
}
