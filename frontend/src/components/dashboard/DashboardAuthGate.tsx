"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  evaluateDashboardAccess,
  isDashboardDevPath,
  type DashboardAccessDecision,
} from "@/lib/auth/dashboard-access";
import { canAccessDashboard } from "@/lib/auth/permissions";
import {
  getCurrentUserProfile,
  type CurrentUserProfileStep,
} from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type DashboardAuthGateProps = {
  children: React.ReactNode;
};

type GateState =
  | { status: "checking"; decision: DashboardAccessDecision | null }
  | { status: "allowed"; decision: DashboardAccessDecision }
  | { status: "redirecting"; decision: DashboardAccessDecision }
  | { status: "blocked"; decision: DashboardAccessDecision };

type DashboardGateStep =
  | CurrentUserProfileStep
  | {
      name: "evaluating_access" | "final_decision";
      status: "checking" | "success" | "warning" | "error";
      message: string;
    };

const PROFILE_STEP_TIMEOUT_MS = 6000;

export function DashboardAuthGate({ children }: DashboardAuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isDevBypassRoute = isDashboardDevPath(pathname);
  const devBypassDecision = isDevBypassRoute
    ? evaluateDashboardAccess({ pathname, profileResult: null })
    : null;
  const [gateState, setGateState] = useState<GateState>({
    status: "checking",
    decision: null,
  });
  const [diagnosticSteps, setDiagnosticSteps] = useState<DashboardGateStep[]>(
    [],
  );

  useEffect(() => {
    let isMounted = true;

    if (isDevBypassRoute) {
      return () => {
        isMounted = false;
      };
    }

    const initialDecision = evaluateDashboardAccess({
      pathname,
      profileResult: null,
    });

    async function checkDashboardAccess() {
      let recordedSteps: DashboardGateStep[] = [];
      const recordStep = (step: DashboardGateStep) => {
        recordedSteps = [...recordedSteps, step];

        if (isMounted) {
          setDiagnosticSteps(recordedSteps);
        }
      };

      setGateState({
        status: "checking",
        decision: initialDecision,
      });
      setDiagnosticSteps([]);

      try {
        const profileResult = await getCurrentUserProfile({
          onStep: recordStep,
          stepTimeoutMs: PROFILE_STEP_TIMEOUT_MS,
          throwOnSessionError: true,
          throwOnProfileError: true,
        });

        if (profileResult.status === "profile_ready") {
          let shouldUseCustomerPortal =
            profileResult.profile.role === "customer" &&
            !canAccessDashboard(profileResult.session.user);

          if (
            !shouldUseCustomerPortal &&
            !canAccessDashboard(profileResult.session.user)
          ) {
            const supabase = getSupabaseBrowserClient();
            const customerResult = supabase
              ? await supabase
                  .from("customers")
                  .select("id")
                  .eq("auth_user_id", profileResult.session.user.id)
                  .maybeSingle()
              : null;

            shouldUseCustomerPortal = Boolean(
              customerResult && !customerResult.error && customerResult.data,
            );
          }

          if (shouldUseCustomerPortal) {
            const customerRedirectDecision: DashboardAccessDecision = {
              allowed: false,
              reason: "role_not_allowed",
              redirectTo: "/customer/dashboard",
              title: "Opening customer dashboard",
              description:
                "Customer accounts use the customer portal instead of the technician dashboard.",
            };

            if (isMounted) {
              setGateState({
                status: "redirecting",
                decision: customerRedirectDecision,
              });
              router.replace("/customer/dashboard");
            }
            return;
          }
        }

        recordStep({
          name: "evaluating_access",
          status: "checking",
          message: "Evaluating dashboard role, status, and onboarding access.",
        });

        const decision = evaluateDashboardAccess({ pathname, profileResult });
        recordStep({
          name: "final_decision",
          status: decision.allowed ? "success" : "warning",
          message: decision.allowed
            ? "Dashboard access granted."
            : `Dashboard access blocked: ${decision.reason}.`,
        });

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
          description: formatGateErrorDescription(error, recordedSteps),
        };

        setGateState({ status: "blocked", decision: fallbackDecision });
      }
    }

    void checkDashboardAccess();

    return () => {
      isMounted = false;
    };
  }, [isDevBypassRoute, pathname, router]);

  if (devBypassDecision?.allowed || gateState.status === "allowed") {
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
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm font-bold text-cyan-100">
            Checking authenticated session, profile status, role, and
            onboarding completion.
          </div>
        ) : null}
        {diagnosticSteps.length > 0 ? (
          <div className="mt-4 rounded-md border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Auth check steps
            </p>
            <ol className="mt-3 space-y-2 text-sm text-slate-200">
              {diagnosticSteps.map((step, index) => (
                <li
                  key={`${step.name}-${index}`}
                  className="flex gap-2 leading-6"
                >
                  <span
                    className={
                      step.status === "success"
                        ? "text-emerald-300"
                        : step.status === "error"
                          ? "text-red-300"
                          : step.status === "warning"
                            ? "text-amber-300"
                            : "text-cyan-300"
                    }
                  >
                    {step.status === "success"
                      ? "OK"
                      : step.status === "error"
                        ? "ERR"
                        : step.status === "warning"
                          ? "WARN"
                          : "..."}
                  </span>
                  <span>{step.message}</span>
                </li>
              ))}
            </ol>
          </div>
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

function formatGateErrorDescription(
  error: unknown,
  steps: DashboardGateStep[],
): string {
  const lastStep = steps[steps.length - 1];
  const errorMessage =
    error instanceof Error
      ? error.message
      : "The dashboard session/profile check failed before access could be verified.";

  if (!lastStep) {
    return errorMessage;
  }

  return `${errorMessage} Last completed step: ${lastStep.message}`;
}
