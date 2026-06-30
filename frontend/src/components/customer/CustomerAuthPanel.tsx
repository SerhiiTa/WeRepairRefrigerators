"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { resolveAuthenticatedWorkspace } from "@/lib/auth/account-routing";
import {
  navigateAfterBrowserLogin,
  sanitizeLocalRedirectPath,
  waitForBrowserSessionReadiness,
} from "@/lib/auth/browser-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CustomerAuthMode = "login" | "register";

export function CustomerAuthPanel({ mode }: { mode: CustomerAuthMode }) {
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestedNext = sanitizeLocalRedirectPath(
    searchParams.get("next"),
    "/customer/dashboard",
  );
  const next = requestedNext.startsWith("/customer")
    ? requestedNext
    : "/customer/dashboard";
  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setStatus("Customer accounts are not configured in this environment yet.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
              role_intent: "customer",
            },
          },
        });

        if (error) {
          setStatus(error.message);
          return;
        }

        if (data.session) {
          const readiness = await waitForBrowserSessionReadiness({
            supabase,
            session: data.session,
          });

          if (!readiness.ok) {
            setStatus(readiness.message);
            return;
          }

          const workspace = await resolveAuthenticatedWorkspace({
            supabase,
            session: data.session,
            roleIntent: "customer",
          });
          navigateAfterBrowserLogin(
            workspace.path === "/dashboard" ? "/dashboard" : next,
          );
          return;
        }

        setStatus("Account created. Check your email to confirm the account, then sign in.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      if (data.session) {
        const readiness = await waitForBrowserSessionReadiness({
          supabase,
          session: data.session,
        });

        if (!readiness.ok) {
          setStatus(readiness.message);
          return;
        }

        const workspace = await resolveAuthenticatedWorkspace({
          supabase,
          session: data.session,
          roleIntent: "customer",
        });
        navigateAfterBrowserLogin(
          workspace.path === "/dashboard" ? "/dashboard" : next,
        );
        return;
      }

      const readiness = await waitForBrowserSessionReadiness({
        supabase,
        session: null,
      });

      if (readiness.ok) {
        const sessionResult = await supabase.auth.getSession();
        const workspace = await resolveAuthenticatedWorkspace({
          supabase,
          session: sessionResult.data.session,
          roleIntent: "customer",
        });
        navigateAfterBrowserLogin(
          workspace.path === "/dashboard" ? "/dashboard" : next,
        );
        return;
      }

      setStatus(readiness.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7"
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BrandLogo compact />
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
        >
          Back to Marketplace
        </Link>
      </div>

      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
          Customer Account
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">
          {isRegister ? "Create your repair account" : "Sign in to your repairs"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Save appliances, review estimates, and keep repair history in one place.
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        {isRegister ? (
          <>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Full name
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-12 rounded-xl border border-slate-200 px-3 text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Phone
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="h-12 rounded-xl border border-slate-200 px-3 text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </>
        ) : null}
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 rounded-xl border border-slate-200 px-3 text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 rounded-xl border border-slate-200 px-3 text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            required
          />
        </label>
      </div>

      {status ? (
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-slate-700">
          {status}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 h-12 w-full rounded-xl bg-[#0F6BFF] px-4 text-base font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting
          ? "Working..."
          : isRegister
            ? "Create account"
            : "Sign in"}
      </button>

      <p className="mt-5 text-center text-sm text-slate-600">
        {isRegister ? "Already have an account?" : "New customer?"}{" "}
        <Link
          href={isRegister ? `/customer/login?next=${encodeURIComponent(next)}` : `/customer/register?next=${encodeURIComponent(next)}`}
          className="font-bold text-[#0F6BFF]"
        >
          {isRegister ? "Sign in" : "Create account"}
        </Link>
      </p>

      <p className="mt-3 text-center text-sm font-bold text-slate-600">
        Technician or company?{" "}
        <Link
          href="/login?intent=technician"
          className="text-[#0F6BFF] hover:text-[#0057D9]"
        >
          Sign in here
        </Link>
      </p>
    </form>
  );
}
