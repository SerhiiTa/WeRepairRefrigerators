"use client";

import Link from "next/link";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";
type RoleIntent = "customer" | "technician";
type AuthStatusTone = "info" | "success" | "error";

type AuthFormProps = {
  mode: AuthMode;
};

type AuthStatus = {
  tone: AuthStatusTone;
  message: string;
};

const roleIntentOptions: Array<{
  label: string;
  value: RoleIntent;
  description: string;
}> = [
  {
    label: "Customer",
    value: "customer",
    description: "Request refrigerator repair and track future service updates.",
  },
  {
    label: "Technician",
    value: "technician",
    description: "Prepare for future technician dashboard and community access.",
  },
];

const statusToneClasses: Record<AuthStatusTone, string> = {
  info: "border-blue-100 bg-blue-50 text-blue-800",
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  error: "border-red-100 bg-red-50 text-red-800",
};

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleIntent, setRoleIntent] = useState<RoleIntent>("customer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<AuthStatus>({
    tone: "info",
    message:
      "This auth screen is mock-safe. Dashboard routes are still open demo pages until route protection and profiles are implemented.",
  });

  const isSignup = mode === "signup";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setStatus({
        tone: "info",
        message:
          "Demo mode: Supabase env vars are not configured, so no auth request was sent.",
      });
      setIsSubmitting(false);
      return;
    }

    if (isSignup) {
      // Role persistence is intentionally not implemented until the profiles table exists.
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      setStatus(
        error
          ? {
              tone: "error",
              message: error.message,
            }
          : {
              tone: "success",
              message: `Signup request sent. ${roleIntent} role intent is UI-only until profile persistence is added.`,
            },
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      setStatus(
        error
          ? {
              tone: "error",
              message: error.message,
            }
          : {
              tone: "success",
              message:
                "Login request completed. Dashboard access is not gated yet in this mock-safe phase.",
            },
      );
    }

    setIsSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-8"
    >
      <div>
        <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
          {isSignup ? "Create account" : "Welcome back"}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          {isSignup ? "Start your WeRepairRefrigerators account." : "Log in to your account."}
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          Auth UI is ready for Supabase, but profile records, roles, route protection,
          and dashboard gating are intentionally not active yet.
        </p>
      </div>

      <div className="mt-8 grid gap-5">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="Enter your password"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-bold text-slate-800">Role intent</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {roleIntentOptions.map((option) => (
              <label
                key={option.value}
                className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 hover:border-blue-200"
              >
                <input
                  type="radio"
                  name="roleIntent"
                  value={option.value}
                  checked={roleIntent === option.value}
                  onChange={() => setRoleIntent(option.value)}
                  className="mt-1 h-4 w-4 accent-blue-700"
                />
                <span>
                  <span className="block text-sm font-black text-slate-950">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-bold ${statusToneClasses[status.tone]}`}>
        {status.message}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-blue-700 px-5 py-3 text-base font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSubmitting
          ? "Checking..."
          : isSignup
            ? "Create account"
            : "Log in"}
      </button>

      <p className="mt-5 text-center text-sm font-bold text-slate-600">
        {isSignup ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="text-blue-700 hover:text-blue-900"
        >
          {isSignup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </form>
  );
}
