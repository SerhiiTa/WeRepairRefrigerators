import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/public/AuthForm";
import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";

export const metadata: Metadata = {
  title: "Login | WeRepairRefrigerators",
  description:
    "Log in to test Supabase Auth and dashboard role visibility for WeRepairRefrigerators.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicSiteHeader />
      <section className="relative overflow-hidden px-5 pb-16 pt-8 sm:px-6 lg:pb-24">
        <RefrigerationBackground />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_30rem] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Account access
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Log in and confirm your dashboard session clearly.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Supabase Auth is connected for local QA. After login, the dashboard
              checks your session, profile role, profile status, and onboarding
              completion before showing protected tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
              >
                Go to dashboard
              </Link>
              <Link
                href="/schedule-service"
                className="rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
              >
                Schedule service
              </Link>
            </div>
          </div>
          <AuthForm mode="login" />
        </div>
      </section>
    </main>
  );
}
