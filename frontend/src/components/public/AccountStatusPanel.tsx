"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type AccountStatusCopy = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
};

const statusCopy: Record<string, AccountStatusCopy> = {
  pending: {
    eyebrow: "Pending approval",
    title: "Your account is waiting for review.",
    description:
      "A pending profile cannot open dashboard tools yet. Company owner or admin approval will unlock the next step when the production workflow is ready.",
    actionLabel: "Back to public site",
    actionHref: "/",
  },
  suspended: {
    eyebrow: "Account suspended",
    title: "Dashboard access is paused.",
    description:
      "This profile status cannot access dashboard tools. Contact the platform owner before trying again.",
    actionLabel: "Log in with another account",
    actionHref: "/login",
  },
  rejected: {
    eyebrow: "Account not approved",
    title: "This profile is not eligible for dashboard access.",
    description:
      "Rejected profiles are kept out of dashboard and marketplace tools until reviewed by an owner or admin.",
    actionLabel: "Back to public site",
    actionHref: "/",
  },
  "profile-missing": {
    eyebrow: "Profile missing",
    title: "We could not find a profile row for this session.",
    description:
      "Log out and sign in again. If the issue continues, verify the profiles trigger and the Supabase migration setup.",
    actionLabel: "Go to login",
    actionHref: "/login",
  },
  "dashboard-role": {
    eyebrow: "Dashboard role required",
    title: "This account does not have dashboard access.",
    description:
      "Dashboard tools are reserved for technician, verified technician, company owner, and admin profiles. Customer-facing flows remain available on the public site.",
    actionLabel: "Schedule service",
    actionHref: "/schedule-service",
  },
};

const fallbackCopy: AccountStatusCopy = {
  eyebrow: "Account status",
  title: "Dashboard access is not available for this account.",
  description:
    "The profile did not pass the current dashboard access checks. Use the public site or log in with another verified account.",
  actionLabel: "Back to public site",
  actionHref: "/",
};

export function AccountStatusPanel() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") ?? "";
  const copy = statusCopy[reason] ?? fallbackCopy;

  return (
    <section className="relative z-10 mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-8">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
        {copy.eyebrow}
      </p>
      <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
        {copy.title}
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        {copy.description}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href={copy.actionHref}
          className="inline-flex justify-center rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
        >
          {copy.actionLabel}
        </Link>
        <Link
          href="/login"
          className="inline-flex justify-center rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          Use another login
        </Link>
      </div>
    </section>
  );
}
