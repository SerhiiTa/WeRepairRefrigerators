"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  evaluateDashboardAccess,
  type DashboardAccessDecision,
} from "@/lib/auth/dashboard-access";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type DashboardAuthGateProps = {
  children: React.ReactNode;
};

type GateState =
  | { status: "checking"; decision: DashboardAccessDecision | null }
  | { status: "allowed"; decision: DashboardAccessDecision }
  | { status: "redirecting"; decision: DashboardAccessDecision }
  | { status: "blocked"; decision: DashboardAccessDecision };

const PROFILE_CHECK_TIMEOUT_MS = 8000;

export function DashboardAuthGate({ children }: DashboardAuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [gateState, setGateState] = useState<GateState>({
    status: "checking",
    decision: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function checkDashboardAccess() {
      setGateState({
        status: "checking",
        decision: evaluateDashboardAccess({
          pathname,
          profileResult: null,
        }),
      });

      try {
        const profileResult = await withTimeout(
          getCurrentUserProfile(),
          PROFILE_CHECK_TIMEOUT_MS,
        );
        const decision = evaluateDashboardAccess({ pathname, profileResult });

        if (!isMounted) {
          return;
        }

        if (decision.allowed) {
          setGateState({ status: "allowed", decision });
          return;
        }

        if (decision.redirectTo) {
          setGateState({ status: "redirecting", decision });
          router.replace(decision.redirectTo);
          return;
        }

        setGateState({ status: "blocked", decision });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const fallbackDecision: DashboardAccessDecision = {
          allowed: false,
          reason: "checking",
          redirectTo: "/login",
          title: "Unable to verify dashboard access",
          description:
            error instanceof Error
              ? error.message
              : "The dashboard session/profile check failed before access could be verified.",
        };

        setGateState({ status: "blocked", decision: fallbackDecision });
      }
    }

    void checkDashboardAccess();

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange(() => {
      void checkDashboardAccess();
    }).data.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [pathname, router]);

  if (gateState.status === "allowed") {
    return <>{children}</>;
  }

  const decision =
    gateState.decision ??
    evaluateDashboardAccess({
      pathname,
      profileResult: null,
    });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
          Dashboard access
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-white">
          {gateState.status === "redirecting"
            ? "Redirecting..."
            : decision.title}
        </h1>
        <p className="mt-3 leading-7 text-slate-300">{decision.description}</p>
        {gateState.status === "checking" ? (
          <p className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm font-bold text-cyan-100">
            Checking authenticated session, profile status, role, and
            onboarding completion.
          </p>
        ) : null}
        {gateState.status === "redirecting" && decision.redirectTo ? (
          <p className="mt-4 rounded-md border border-blue-300/20 bg-blue-300/10 px-3 py-2 text-sm font-bold text-blue-100">
            Opening {decision.redirectTo}
          </p>
        ) : null}
        {gateState.status === "blocked" ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex justify-center rounded-md bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100"
            >
              Log in
            </Link>
            <Link
              href="/"
              className="inline-flex justify-center rounded-md border border-white/15 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10"
            >
              View public site
            </Link>
          </div>
        ) : null}
      </section>
    </main>
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
        reject(new Error("Dashboard auth check timed out. Try logging in again."));
      }, timeoutMs);
    }),
  ]);
}
