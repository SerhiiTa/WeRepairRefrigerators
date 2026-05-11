import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/public/AuthForm";
import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";

export const metadata: Metadata = {
  title: "Sign Up | WeRepairRefrigerators",
  description:
    "Mock-safe signup page for future WeRepairRefrigerators customer and technician accounts.",
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicSiteHeader />
      <section className="relative overflow-hidden px-5 pb-16 pt-8 sm:px-6 lg:pb-24">
        <RefrigerationBackground />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_30rem] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Account preview
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Customer and technician accounts are being staged carefully.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Signup can call Supabase Auth when configured, but role intent is only a
              UI signal until the profiles table, verification workflow, and RLS policies
              are implemented.
            </p>
            <div className="mt-8 grid gap-3 text-sm font-bold text-slate-600 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                Public marketplace stays open.
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                Dashboard remains demo-accessible.
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                Profiles and roles come later.
              </div>
            </div>
            <Link
              href="/find-technician"
              className="mt-8 inline-flex rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
            >
              Browse technicians
            </Link>
          </div>
          <AuthForm mode="signup" />
        </div>
      </section>
    </main>
  );
}
