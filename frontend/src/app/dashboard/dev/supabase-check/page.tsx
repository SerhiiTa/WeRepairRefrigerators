"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getCurrentUserProfile } from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMissingSupabaseEnvVars } from "@/lib/supabase/env";
import type { ProfileRow } from "@/lib/supabase/types";

type CheckStatus = "checking" | "ready";

type SupabaseCheckState = {
  status: CheckStatus;
  missingEnvVars: string[];
  clientCanInitialize: boolean;
  sessionStatus: "checking" | "supabase_unavailable" | "logged_out" | "logged_in";
  userEmail: string | null;
  userId: string | null;
  profileStatus:
    | "not_checked"
    | "profile_ready"
    | "profile_missing_or_unavailable";
  profile: ProfileRow | null;
  profileError: string | null;
};

const initialCheckState: SupabaseCheckState = {
  status: "checking",
  missingEnvVars: [],
  clientCanInitialize: false,
  sessionStatus: "checking",
  userEmail: null,
  userId: null,
  profileStatus: "not_checked",
  profile: null,
  profileError: null,
};

function StatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning";
  children: React.ReactNode;
}) {
  const toneClasses = {
    neutral: "border-slate-700 bg-slate-900 text-slate-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

function CheckRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-800 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm font-medium text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-100">
        <StatusPill tone={tone}>{value}</StatusPill>
      </dd>
    </div>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm text-slate-100">
        {value || "Not available"}
      </dd>
    </div>
  );
}

export default function SupabaseCheckPage() {
  const [checkState, setCheckState] =
    useState<SupabaseCheckState>(initialCheckState);

  useEffect(() => {
    let isMounted = true;

    async function runCheck() {
      const missingEnvVars = getMissingSupabaseEnvVars();
      const envReady = missingEnvVars.length === 0;
      const client = envReady ? getSupabaseBrowserClient() : null;

      if (!envReady || !client) {
        if (!isMounted) {
          return;
        }

        setCheckState({
          status: "ready",
          missingEnvVars,
          clientCanInitialize: Boolean(client),
          sessionStatus: "supabase_unavailable",
          userEmail: null,
          userId: null,
          profileStatus: "not_checked",
          profile: null,
          profileError: null,
        });
        return;
      }

      const result = await getCurrentUserProfile({ client });

      if (!isMounted) {
        return;
      }

      if (result.status === "profile_ready") {
        setCheckState({
          status: "ready",
          missingEnvVars,
          clientCanInitialize: true,
          sessionStatus: "logged_in",
          userEmail: result.session.user.email,
          userId: result.session.user.id,
          profileStatus: "profile_ready",
          profile: result.profile,
          profileError: null,
        });
        return;
      }

      if (result.status === "profile_unavailable") {
        setCheckState({
          status: "ready",
          missingEnvVars,
          clientCanInitialize: true,
          sessionStatus: "logged_in",
          userEmail: result.session.user.email,
          userId: result.session.user.id,
          profileStatus: "profile_missing_or_unavailable",
          profile: null,
          profileError: result.error,
        });
        return;
      }

      setCheckState({
        status: "ready",
        missingEnvVars,
        clientCanInitialize: true,
        sessionStatus:
          result.status === "supabase_unavailable"
            ? "supabase_unavailable"
            : "logged_out",
        userEmail: null,
        userId: null,
        profileStatus: "not_checked",
        profile: null,
        profileError: null,
      });
    }

    void runCheck();

    return () => {
      isMounted = false;
    };
  }, []);

  const envReady = checkState.missingEnvVars.length === 0;
  const isLoggedIn = checkState.sessionStatus === "logged_in";
  const profileReady = checkState.profileStatus === "profile_ready";

  return (
    <main className="space-y-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-slate-950/40 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Local development helper
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Supabase profiles migration check
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Use this page after configuring local Supabase env vars and
              manually applying the reviewed profiles migration. It uses only
              the browser anon client and does not create, update, or protect
              any data.
            </p>
          </div>
          <StatusPill tone={checkState.status === "ready" ? "success" : "neutral"}>
            {checkState.status === "ready" ? "Check complete" : "Checking"}
          </StatusPill>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h2 className="text-lg font-semibold text-white">
            Connection checklist
          </h2>
          <dl className="mt-4">
            <CheckRow
              label="Supabase env vars"
              value={envReady ? "Present" : "Missing"}
              tone={envReady ? "success" : "warning"}
            />
            <CheckRow
              label="Missing env var names"
              value={envReady ? "None" : checkState.missingEnvVars.join(", ")}
              tone={envReady ? "success" : "warning"}
            />
            <CheckRow
              label="Browser Supabase client"
              value={
                checkState.clientCanInitialize
                  ? "Initialized"
                  : "Unavailable"
              }
              tone={checkState.clientCanInitialize ? "success" : "warning"}
            />
            <CheckRow
              label="Auth session"
              value={
                isLoggedIn
                  ? "Logged in"
                  : checkState.sessionStatus === "logged_out"
                    ? "Logged out"
                    : checkState.sessionStatus === "supabase_unavailable"
                      ? "Supabase unavailable"
                      : "Checking"
              }
              tone={isLoggedIn ? "success" : "warning"}
            />
            <CheckRow
              label="Matching profile row"
              value={
                profileReady
                  ? "Found"
                  : isLoggedIn
                    ? "Missing or unavailable"
                    : "Not checked"
              }
              tone={profileReady ? "success" : isLoggedIn ? "warning" : "neutral"}
            />
          </dl>
        </div>

        <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-6">
          <h2 className="text-lg font-semibold text-cyan-100">Safe usage</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-cyan-50/80">
            <li>This page is intentionally reachable by direct URL only.</li>
            <li>It does not use or request a service-role key.</li>
            <li>It does not apply migrations or create missing profiles.</li>
            <li>It does not add route protection or replace mock data.</li>
          </ul>
        </div>
      </section>

      {!envReady ? (
        <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
          <h2 className="text-lg font-semibold text-amber-100">
            Local setup needed
          </h2>
          <p className="mt-3 text-sm leading-6 text-amber-50/80">
            Add `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `frontend/.env.local`, then
            restart the local dev server. Do not print or commit real values.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex rounded-full border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:border-amber-200 hover:bg-amber-300/10"
          >
            Go to login
          </Link>
        </section>
      ) : null}

      {envReady && !isLoggedIn ? (
        <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
          <h2 className="text-lg font-semibold text-amber-100">
            Auth session required
          </h2>
          <p className="mt-3 text-sm leading-6 text-amber-50/80">
            Log in or sign up first, then return to this page.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-full bg-amber-200 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-100"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:border-amber-200 hover:bg-amber-300/10"
            >
              Sign up
            </Link>
          </div>
        </section>
      ) : null}

      {isLoggedIn ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h2 className="text-lg font-semibold text-white">
            Current auth session
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ProfileField label="User email" value={checkState.userEmail} />
            <ProfileField label="User id" value={checkState.userId} />
          </div>
        </section>
      ) : null}

      {profileReady && checkState.profile ? (
        <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
          <h2 className="text-lg font-semibold text-emerald-100">
            Profile row found
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ProfileField label="Profile id" value={checkState.profile.id} />
            <ProfileField label="Email" value={checkState.profile.email} />
            <ProfileField label="Role" value={checkState.profile.role} />
            <ProfileField
              label="Full name"
              value={checkState.profile.full_name}
            />
            <ProfileField
              label="Company name"
              value="Not modeled yet; company_id placeholder exists only"
            />
            <ProfileField
              label="Created at"
              value={checkState.profile.created_at}
            />
          </div>
        </section>
      ) : null}

      {isLoggedIn && !profileReady ? (
        <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
          <h2 className="text-lg font-semibold text-amber-100">
            Profile row missing or unavailable
          </h2>
          <p className="mt-3 text-sm leading-6 text-amber-50/80">
            The profiles migration trigger may not have created a matching
            profile row, or the migration may not have been applied yet. This
            page will not auto-create a profile. Review the migration and the
            Supabase setup guide before making database changes.
          </p>
          {checkState.profileError ? (
            <p className="mt-4 rounded-2xl border border-amber-300/20 bg-slate-950/60 p-4 text-xs leading-5 text-amber-50/80">
              {checkState.profileError}
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
